import { getTableColumns, type Table } from "drizzle-orm";
import type { OpenAPIV3 } from "openapi-types";
import { dealContacts, savedViews, companies, contacts, deals, activities, fieldDefinitions, fieldOptions, fieldValues, FIELD_ENTITIES, DEAL_STAGES } from "@/lib/db/schema";
import { arrayOf, objectOf, reference, type Schema } from "./schema-helpers";
import { permissionCatalog } from "@/lib/auth/permissions";

function tableSchema(table: Table): OpenAPIV3.SchemaObject {
  const properties: Record<string, Schema> = {};
  for (const [name, column] of Object.entries(getTableColumns(table))) {
    let property: OpenAPIV3.SchemaObject;
    switch (column.dataType) {
      case "string": property = { type: "string" }; break;
      case "number": property = { type: "integer" }; break;
      case "boolean": property = { type: "boolean" }; break;
      case "json": property = { description: "JSON value, including null." }; break;
      default: throw new Error(`Unsupported response column type: ${column.dataType}`);
    }
    if (column.enumValues?.length) property.enum = [...column.enumValues];
    if (!column.notNull && property.type) property.nullable = true;
    if (name.endsWith("At") || name.endsWith("Date")) {
      property.description = "Timestamp or date string. Stored values can use SQL timestamp or ISO notation.";
    }
    properties[name] = property;
  }
  return objectOf(properties);
}

function extend(base: OpenAPIV3.SchemaObject, properties: Record<string, Schema>): OpenAPIV3.SchemaObject {
  return objectOf({ ...base.properties, ...properties });
}

const company = tableSchema(companies);
const contact = tableSchema(contacts);
const deal = tableSchema(deals);
deal.properties!.companyId = { ...deal.properties!.companyId, nullable: true, description: "Null when company read permission is unavailable." };
deal.properties!.amount = {
  type: "string", nullable: true, pattern: "^-?\\d+\\.\\d{2}$",
  description: "Decimal amount serialized from stored integer cents, with exactly two fractional digits.", example: "1250.00",
};
for (const name of ["baseAmount", "fxRate"]) {
  deal.properties![name] = { ...deal.properties![name], description: "Exact decimal text retained without conversion to a JavaScript number." };
}
const activity = tableSchema(activities);
const definition = tableSchema(fieldDefinitions);
const option = tableSchema(fieldOptions);
const fieldValue = tableSchema(fieldValues);
const nullableCompany = { ...company, nullable: true };
const nullableContact = { ...contact, nullable: true };
const nullableOption = { ...option, nullable: true };
const joinedFieldValue = extend(fieldValue, { field: reference("FieldDefinition"), option: nullableOption });
const resolvedValue: OpenAPIV3.SchemaObject = {
  anyOf: [{ type: "string", nullable: true }, { type: "boolean" }],
  description: "Typed field value. NUMBER is exact decimal text, CHECKBOX is boolean, and missing values are null.",
};
const definitionWithOptions = extend(definition, { options: arrayOf(reference("FieldOption")) });
const companyDetail = extend(company, {
  canCreateActivity: { type: "boolean", description: "Whether the current role may create an activity with this record and its inferred links." },
  primaryContact: nullableContact,
  contacts: arrayOf(reference("Contact")),
  deals: arrayOf(reference("Deal")),
  activities: { ...arrayOf(reference("Activity")), maxItems: 20 },
  fieldValues: arrayOf(reference("JoinedFieldValue")),
});
const contactDetail = extend(contact, {
  canCreateActivity: { type: "boolean" },
  company: nullableCompany,
  primaryOf: nullableCompany,
  deals: arrayOf(reference("DealWithRole")),
  activities: { ...arrayOf(reference("Activity")), maxItems: 20 },
  fieldValues: arrayOf(reference("JoinedFieldValue")),
});
const dealDetail = extend(deal, {
  canCreateActivity: { type: "boolean" },
  company: nullableCompany,
  contacts: arrayOf(reference("ContactWithRole")),
  activities: { ...arrayOf(reference("Activity")), maxItems: 30 },
  fieldValues: arrayOf(reference("JoinedFieldValue")),
});
const error = { ...objectOf({ message: { type: "string" }, code: { type: "string", description: "Optional stable code: UNAUTHENTICATED, INACTIVE_MEMBERSHIP, FORBIDDEN_ACTION, PERMISSION_REQUIRED." } }), required: ["message"] };
const ownerSummary = objectOf({ id: { type: "string" }, name: { type: "string" }, image: { type: "string", nullable: true } });
const companySummary = objectOf({ id: { type: "string" }, name: { type: "string" }, archivedAt: { type: "string", nullable: true } });
function listRow(base: OpenAPIV3.SchemaObject, withCompany = false, counts = false): OpenAPIV3.SchemaObject {
  return { ...extend(base, { fields: { type: "object", additionalProperties: resolvedValue, description: "Present only with includeFields=true. Active showOnTable definition keys map to typed values; absent values are null." }, owner: { ...ownerSummary, nullable: true }, ...(withCompany ? { company: { ...companySummary, nullable: true } } : {}),
    ...(counts ? { contactCount: { type: "integer", minimum: 0 }, openDealCount: { type: "integer", minimum: 0 } } as const : {}) }), required: base.required };
}
const savedView = extend(tableSchema(savedViews), { mine: { type: "boolean" }, filters: { type: "object", description: "Source-compatible saved query configuration. Unsupported legacy field references remain readable for deliberate repair." } });
const accountRole = objectOf({ id: { type: "string" }, name: { type: "string" }, isSystem: { type: "boolean" }, revision: { type: "integer", minimum: 0 } });
const permission: OpenAPIV3.SchemaObject = { oneOf: Object.entries(permissionCatalog).map(([entity, actions]) =>
  objectOf({ entity: { type: "string", enum: [entity] }, action: { type: "string", enum: [...actions] } })) };

export const responseSchemas = {
  Account: objectOf({ id: { type: "string" }, name: { type: "string" }, email: { type: "string", format: "email" },
    role: { ...accountRole, nullable: true }, permissions: arrayOf(permission),
    membershipRevision: { type: "integer", minimum: 0 }, accessVersion: { type: "integer", minimum: 0 } }),
  Role: extend(accountRole, { description: { type: "string", nullable: true }, permissions: arrayOf(permission),
    memberCount: { type: "integer", minimum: 0 }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } }),
  Assignee: ownerSummary,
  WorkspaceSettings: objectOf({
    reportingCurrency: { type: "string", pattern: "^[A-Z]{3}$", description: "Currency the workspace reports aggregated values in." },
    revision: { type: "integer", minimum: 0, description: "Optimistic-concurrency counter; send it back as expectedRevision." },
    updatedAt: { type: "string", format: "date-time" },
  }),
  SavedView: savedView,
  CompanyListRow: listRow(company, false, true),
  ContactListRow: listRow(contact, true),
  DealListRow: listRow(deal, true),
  RecordFacets: objectOf({
    facetCounts: { type: "object", additionalProperties: arrayOf(objectOf({ value: { type: "string" }, label: { type: "string" }, count: { type: "integer", minimum: 0 } })) },
    facetPages: { type: "object", additionalProperties: objectOf({ total: { type: "integer", minimum: 0 }, page: { type: "integer", minimum: 1 }, limit: { type: "integer", minimum: 1, maximum: 100 } }) },
  }),
  Member: objectOf({
    id: { type: "string" },
    name: { type: "string" },
    email: { type: "string", format: "email" },
    roleId: { type: "string", nullable: true },
    role: { ...accountRole, nullable: true },
    status: { type: "string", enum: ["active", "revoked"] },
    revision: { type: "integer", minimum: 0 },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    revokedAt: { type: "string", format: "date-time", nullable: true },
  }),
  Company: company,
  Contact: contact,
  Deal: deal,
  Activity: activity,
  ActivityLink: objectOf({ kind: { type: "string", enum: ["company", "contact", "deal"] }, id: { type: "string" }, name: { type: "string" }, archivedAt: { type: "string", nullable: true } }),
  ActivityListRow: { ...extend(activity, { links: { ...arrayOf(reference("ActivityLink")), maxItems: 3, description: "Present only with includeLinks=true. Page-batched company/contact/deal labels retain archived records and unavailable-name fallbacks for unresolved stored IDs. Null foreign IDs produce no entry." } }), required: activity.required },
  DealContact: tableSchema(dealContacts),
  ActivityCounts: objectOf({
    all: { type: "integer", minimum: 0 }, history: { type: "integer", minimum: 0 },
    notes: { type: "integer", minimum: 0 }, upcoming: { type: "integer", minimum: 0 },
    done: { type: "integer", minimum: 0 }, email: { type: "integer", minimum: 0 }, meetings: { type: "integer", minimum: 0 },
  }),
  FieldDefinition: definition,
  FieldOption: option,
  FieldValue: fieldValue,
  JoinedFieldValue: joinedFieldValue,
  CompanyDetail: companyDetail,
  ContactDetail: contactDetail,
  DealDetail: dealDetail,
  DealWithRole: extend(deal, { role: { type: "string", nullable: true } }),
  ContactWithRole: extend(contact, { role: { type: "string", nullable: true } }),
  DealUpdateResult: {
    ...dealDetail,
    required: deal.required,
    description: "A nonempty update returns the scalar deal. An empty update returns its detail, including related records.",
  },
  FieldDefinitionWithOptions: {
    ...definitionWithOptions,
    description: "A definition with active options only. Non-SELECT definitions have an empty options array; archived definitions can still be retrieved directly.",
  },
  FieldResolvedValue: {
    ...extend(definitionWithOptions, { value: resolvedValue }),
    description: "An active definition and its resolved value. Options also include the selected archived option, if any; missing values are null. Archived definitions are excluded.",
  },
  FieldValueResult: objectOf({ fieldId: { type: "string" }, entityType: { type: "string", enum: [...FIELD_ENTITIES] }, entityId: { type: "string" }, value: resolvedValue }),
  StageResult: objectOf({ id: { type: "string" }, stage: { type: "string", enum: [...DEAL_STAGES] }, changed: { type: "boolean" } }),
  Stats: objectOf({
    totalCompanies: { type: "integer", nullable: true, minimum: 0, description: "Active company count, or null without company read permission." },
    totalContacts: { type: "integer", nullable: true, minimum: 0, description: "Active contact count, or null without contact read permission." },
    totalDeals: { type: "integer", nullable: true, minimum: 0, description: "Active deal count across currencies, or null without deal read permission." },
    openDeals: { type: "integer", nullable: true, minimum: 0, description: "Active open-deal count across currencies, or null without deal read permission." },
    openDealValue: { type: "string", nullable: true, pattern: "^-?\\d+\\.\\d{2}$", description: "Exact open deal value in the requested currency, or null without deal read permission." },
    currency: { type: "string", pattern: "^[A-Z]{3}$" },
    pipeline: { ...arrayOf(objectOf({ stage: { type: "string", enum: [...DEAL_STAGES] }, count: { type: "integer", minimum: 0 }, value: { type: "string", pattern: "^-?\\d+\\.\\d{2}$" } })), nullable: true, minItems: DEAL_STAGES.length, maxItems: DEAL_STAGES.length,
      description: "All seven stages in canonical order, including zero buckets. Both count and exact value include only unarchived deals in the selected currency; null amounts contribute zero." },
    activitiesThisWeek: { type: "integer", nullable: true, minimum: 0, description: "Visible activities created this UTC week; null without activity read permission. All linked entities must be readable." },
  }),
  Error: error,
  ValidationError: {
    ...extend(error, {
      issues: arrayOf(objectOf({ path: arrayOf({ anyOf: [{ type: "string" }, { type: "integer" }] }), message: { type: "string" } })),
    }),
    required: ["message"],
    description: "Invalid requests can return message only, or include Zod validation issues with field paths.",
  },
} satisfies Record<string, OpenAPIV3.SchemaObject>;

export type ResponseSchemaName = keyof typeof responseSchemas;
