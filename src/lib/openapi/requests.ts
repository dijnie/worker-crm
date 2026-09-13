import { recordListInput, recordFacetInput, RECORD_SORTS, RECORD_FACETS } from "@/lib/record-list-contracts";
import { assigneeListInput } from "@services/assignee.service";
import { createSavedViewInput, updateSavedViewInput, savedViewListInput } from "@services/saved-view.service";
import type { OpenAPIV3 } from "openapi-types";
import { createCompanyInput, updateCompanyInput } from "@services/company.service";
import { contactListInput, createContactInput, updateContactInput } from "@services/contact.service";
import { createDealInput, updateDealInput, dealListInput } from "@services/deal.service";
import { activityListInput, completeTaskInput } from "@services/activity.service";
import { createFieldInput, updateFieldInput, createOptionInput, updateOptionInput } from "@services/field.service";
import { createActivityApiInput } from "@/lib/server/activity-api-inputs";
import { stageApiInput } from "@/lib/server/deal-api-inputs";
import { memberListInput, memberMutationInput } from "@services/member.service";
import { statsInput } from "@services/stats.service";
import { fieldListInput, optionListInput, fieldValuesInput, fieldValueInput } from "@/lib/server/field-api-inputs";
import { identifier, listInput } from "@/lib/utils/validation";
import { annotateProperty, inputSchema } from "./schema-helpers";

export const requestSchemas = {
  Identifier: inputSchema(identifier),
  CompanyQuery: inputSchema(recordListInput("company")),
  CompanyFacetQuery: inputSchema(recordFacetInput("company")),
  ContactFacetQuery: inputSchema(recordFacetInput("contact")),
  DealFacetQuery: inputSchema(recordFacetInput("deal")),
  AssigneeQuery: inputSchema(assigneeListInput),
  SavedViewQuery: inputSchema(savedViewListInput),
  CreateSavedView: inputSchema(createSavedViewInput),
  UpdateSavedView: inputSchema(updateSavedViewInput),
  ContactQuery: inputSchema(contactListInput),
  DealQuery: inputSchema(dealListInput),
  ActivityQuery: inputSchema(activityListInput),
  FieldQuery: inputSchema(fieldListInput),
  OptionQuery: inputSchema(optionListInput),
  FieldValuesQuery: inputSchema(fieldValuesInput),
  MemberQuery: inputSchema(memberListInput),
  MutateMember: inputSchema(memberMutationInput),
  StatsQuery: inputSchema(statsInput),
  CreateCompany: inputSchema(createCompanyInput),
  UpdateCompany: inputSchema(updateCompanyInput),
  CreateContact: inputSchema(createContactInput),
  UpdateContact: inputSchema(updateContactInput),
  CreateDeal: inputSchema(createDealInput),
  UpdateDeal: inputSchema(updateDealInput),
  ChangeStage: inputSchema(stageApiInput),
  CreateActivity: inputSchema(createActivityApiInput),
  CompleteTask: inputSchema(completeTaskInput),
  CreateField: inputSchema(createFieldInput),
  UpdateField: inputSchema(updateFieldInput),
  CreateOption: inputSchema(createOptionInput),
  UpdateOption: inputSchema(updateOptionInput),
  SetFieldValue: inputSchema(fieldValueInput),
} satisfies Record<string, OpenAPIV3.SchemaObject>;

const textNormalization = "Text is trimmed. Blank optional text becomes null; omit a property to preserve it in a partial update. Unknown and protected properties are rejected.";
for (const name of ["CreateCompany", "UpdateCompany", "CreateContact", "UpdateContact"] as const) {
  requestSchemas[name].description = textNormalization;
  annotateProperty(requestSchemas[name], "email", {
    description: "Optional email address. Blank text becomes null; nonblank text must be a valid email and is lowercased after trimming.",
  });
}
for (const name of ["CreateCompany", "UpdateCompany"] as const) {
  annotateProperty(requestSchemas[name], "domain", {
    description: "Accepts a domain or URL. Normalizes to the lowercase hostname without www.; blank text becomes null. Active companies must have unique non-null domains.",
  });
  annotateProperty(requestSchemas[name], "primaryContactId", {
    description: "An existing contact ID, or null to clear. A contact can be primary for only one company; its employer may be different.",
  });
}
annotateProperty(requestSchemas.CreateCompany, "website", {
  description: "When omitted, defaults to https:// followed by the normalized domain, or null when no domain exists. Explicit null is preserved.",
});
for (const name of ["CompanyQuery", "ContactQuery", "DealQuery"] as const) {
  annotateProperty(requestSchemas[name], "archived", { description: "False lists active records; true lists archived records only." });
}
for (const name of ["StatsQuery", "CreateDeal", "UpdateDeal"] as const) {
  annotateProperty(requestSchemas[name], "currency", {
    pattern: "^\\s*[A-Za-z]{3}\\s*$",
    description: "Three-letter currency code, trimmed and converted to uppercase before validation. Lowercase and mixed-case input are accepted; responses use uppercase.",
    example: "usd",
  });
}
for (const name of ["CreateDeal", "UpdateDeal"] as const) {
  annotateProperty(requestSchemas[name], "amount", {
    pattern: "^\\d+(?:\\.\\d{1,2})?$",
    description: "Nonnegative decimal string with at most two fractional digits after trimming. Maximum 90071992547409.91, enforced by safe-integer cent storage; null clears the amount. Responses use exactly two fractional digits.",
    example: "1250.00",
  });
  annotateProperty(requestSchemas[name], "expectedCloseDate", {
    description: "A valid calendar date (YYYY-MM-DD) or ISO timestamp with timezone, normalized to an ISO timestamp; null clears it.",
    example: "2026-10-01",
  });
}
// Zod's outer optional wrapper skips the inner create default on partial updates.
const updateCurrency = requestSchemas.UpdateDeal.properties?.currency;
if (updateCurrency && !("$ref" in updateCurrency)) delete updateCurrency.default;
requestSchemas.ChangeStage.description = "actorId is rejected; history attribution comes from the verified session. A changed CLOSED_LOST or UNQUALIFIED_TO_BUY stage requires a nonblank reason. A same-stage request is a no-op and may omit the reason. Reopening clears closed metadata.";
requestSchemas.CreateActivity.description = "Requires at least one existing companyId, contactId, or dealId. TASK requires a nonblank subject; only TASK permits a non-null dueAt. createdById is rejected; creator attribution comes from the verified session. A company can be derived from the deal or contact when omitted.";
annotateProperty(requestSchemas.CreateActivity, "occurredAt", {
  description: "A valid calendar date or ISO timestamp with timezone, normalized to ISO. Defaults to the creation time when omitted; null is not accepted.",
});
annotateProperty(requestSchemas.CreateActivity, "dueAt", {
  description: "Task due date: a valid calendar date or ISO timestamp with timezone, normalized to ISO. Non-task activities only permit null or omission.",
});
requestSchemas.CompleteTask.description = "Only TASK activities can be completed. True sets completedAt to the current time; false clears it.";
requestSchemas.CreateField.description = "SELECT requires at least one option; other types reject nonempty options. An omitted key is derived from the label and must remain unique within the entity, including archived definitions. Omitted position appends after existing definitions. Database defaults: agentFilled/showOnSheet true; required/showOnTable/showOnFilter false.";
requestSchemas.UpdateField.description = "Entity and key cannot be changed. Type changes fail with 409 when values exist. Converting another type to SELECT requires an explicit nonempty options array, even when historical options are retained. For SELECT, replacing options requires at least one option; existing IDs must belong to this field and cannot repeat. Omitted previous options are archived. Omit options to preserve them when keeping the current type.";
requestSchemas.CreateOption.description = "Requires an active SELECT field. Omitted position appends after existing options, including archived ones.";
requestSchemas.UpdateOption.description = "Requires an active SELECT field and an option belonging to it. archived=true retires the option; false restores it. An empty object preserves the option.";
requestSchemas.SetFieldValue.required = [...new Set([...(requestSchemas.SetFieldValue.required ?? []), "value"])];
annotateProperty(requestSchemas.SetFieldValue, "value", {
  anyOf: [{ type: "string", nullable: true }, { type: "boolean" }],
  description: "Must match the stored field type: NUMBER is an exact decimal string (up to 200 characters, no exponent); CHECKBOX is boolean; SELECT is an active option ID belonging to the field; USER is an external user ID; DATE accepts a valid calendar date or ISO timestamp with timezone. URL requires HTTP(S), EMAIL a valid address, PHONE nonblank text; other text types are strings. Null or blank text clears optional values; required fields cannot be cleared. The active definition must match the requested entity and existing target. Numeric JSON values are rejected.",
});
requestSchemas.SetFieldValue.description = "value must be present, including when clearing with null. The response names the entity property entityType. Archived definitions/options reject new values; concurrent definition or option changes can return 409.";

export type RequestSchemaName = keyof typeof requestSchemas;

requestSchemas.MutateMember.description = "Owner-only action with a nonnegative integer expectedRevision matching the current member. Successful changes increment revision. Restore always grants member and requires a fresh sign-in. Revocation and restoration invalidate sessions. Self-demotion and self-revocation require another active owner. Unknown IDs return 404; stale revisions, invalid transitions and last-owner conflicts return 409.";

for (const [entity, name] of [["company", "Company"], ["contact", "Contact"], ["deal", "Deal"]] as const) {
  for (const suffix of ["Query", "FacetQuery"] as const) {
    const schema = requestSchemas[`${name}${suffix}`];
    annotateProperty(schema, "sort", { enum: [...RECORD_SORTS[entity]], description: "Server sort before pagination; stable ID tie-breaker. Amount groups by currency then exact cents; nulls last." });
    annotateProperty(schema, "filters", { description: `One JSON object of string-array facets: ${RECORD_FACETS[entity].join(", ")}. Up to 50 selected values per facet and 32768 characters. OR within facets, AND between facets. Custom field keys are unsupported.` });
    annotateProperty(schema, "includeFields", { enum: [false], description: "Reserved: true returns an unsupported request error until custom projections are implemented." });
    annotateProperty(schema, "includeSummary", { description: "Opt in to page-batched safe owner/company labels and company contact/open-deal counts." });
  }
}
requestSchemas.CreateSavedView.description = "Only entity/name/shared/filters are accepted. Owner is the signed-in account. filters stores q/sort/dir/archived/filters, validated against its entity; no page, selection, identity or record stack. Duplicate name per entity and owner returns 409.";
requestSchemas.UpdateSavedView.description = "Only creator may change name/shared/filters. Foreign or absent views return 404, including for workspace owners.";
