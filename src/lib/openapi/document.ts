import type { OpenAPIV3 } from "openapi-types";
import apiEndpoints, { type APIEndpoint } from "@/lib/api-endpoints";
import { requestSchemas, type RequestSchemaName } from "./requests";
import { responseSchemas, type ResponseSchemaName } from "./responses";
import { arrayOf, reference } from "./schema-helpers";

type Tag = "Companies" | "Contacts" | "Deals" | "Activities" | "Fields" | "Stats";
interface Contract {
  operationId: string;
  tag: Tag;
  query?: RequestSchemaName;
  body?: RequestSchemaName;
  response?: ResponseSchemaName;
  array?: boolean;
  paginated?: boolean;
  status?: 201 | 204;
  description?: string;
}

const contracts = new Map<string, Contract>();
function register(method: APIEndpoint["method"], path: string, contract: Contract): void {
  contracts.set(`${method} ${path}`, contract);
}

for (const [resource, singular, tag] of [
  ["companies", "Company", "Companies"],
  ["contacts", "Contact", "Contacts"],
  ["deals", "Deal", "Deals"],
] as const) {
  const path = `/api/${resource}`;
  register("GET", path, { operationId: `list${tag}`, tag, query: `${singular}Query`, response: singular, array: true, paginated: true });
  register("POST", path, { operationId: `create${singular}`, tag, body: `Create${singular}`, response: singular, status: 201 });
  register("GET", `${path}/:id`, { operationId: `get${singular}`, tag, response: `${singular}Detail` });
  register("PATCH", `${path}/:id`, { operationId: `update${singular}`, tag, body: `Update${singular}`, response: singular === "Deal" ? "DealUpdateResult" : singular });
  register("DELETE", `${path}/:id`, { operationId: `archive${singular}`, tag, response: singular });
  register("POST", `${path}/:id/restore`, { operationId: `restore${singular}`, tag, response: singular });
}
register("POST", "/api/deals/:id/stage", { operationId: "changeDealStage", tag: "Deals", body: "ChangeStage", response: "StageResult" });
register("GET", "/api/activities", { operationId: "listActivities", tag: "Activities", query: "ActivityQuery", response: "Activity", array: true, paginated: true });
register("POST", "/api/activities", { operationId: "createActivity", tag: "Activities", body: "CreateActivity", response: "Activity", status: 201 });
register("GET", "/api/activities/:id", { operationId: "getActivity", tag: "Activities", response: "Activity" });
register("DELETE", "/api/activities/:id", { operationId: "deleteActivity", tag: "Activities", status: 204 });
register("POST", "/api/activities/:id/complete", { operationId: "completeTask", tag: "Activities", body: "CompleteTask", response: "Activity" });
register("GET", "/api/fields", { operationId: "listFields", tag: "Fields", query: "FieldQuery", response: "FieldDefinitionWithOptions", array: true });
register("POST", "/api/fields", { operationId: "createField", tag: "Fields", body: "CreateField", response: "FieldDefinitionWithOptions", status: 201 });
register("GET", "/api/fields/:id", { operationId: "getField", tag: "Fields", response: "FieldDefinitionWithOptions" });
register("PATCH", "/api/fields/:id", { operationId: "updateField", tag: "Fields", body: "UpdateField", response: "FieldDefinitionWithOptions" });
register("DELETE", "/api/fields/:id", { operationId: "archiveField", tag: "Fields", response: "FieldDefinitionWithOptions" });
register("POST", "/api/fields/:id/restore", { operationId: "restoreField", tag: "Fields", response: "FieldDefinitionWithOptions" });
register("GET", "/api/fields/:id/options", { operationId: "listFieldOptions", tag: "Fields", query: "OptionQuery", response: "FieldOption", array: true, description: "includeArchived includes retired options. Non-SELECT fields return an empty array." });
register("POST", "/api/fields/:id/options", { operationId: "createFieldOption", tag: "Fields", body: "CreateOption", response: "FieldOption", status: 201 });
register("PATCH", "/api/fields/:id/options/:optionId", { operationId: "updateFieldOption", tag: "Fields", body: "UpdateOption", response: "FieldOption" });
register("GET", "/api/fields/values", { operationId: "getFieldValues", tag: "Fields", query: "FieldValuesQuery", response: "FieldResolvedValue", array: true });
register("PUT", "/api/fields/:id/value", { operationId: "setFieldValue", tag: "Fields", body: "SetFieldValue", response: "FieldValueResult" });
register("GET", "/api/stats", { operationId: "getStats", tag: "Stats", query: "StatsQuery", response: "Stats" });

const noStore: OpenAPIV3.HeaderObject = { description: "Responses are not cached.", schema: { type: "string", enum: ["no-store"] } };
const paginationHeaders: Record<string, OpenAPIV3.HeaderObject> = {
  "X-Total-Count": { description: "Total matching records before pagination.", schema: { type: "integer", minimum: 0 } },
  "X-Page": { description: "Requested one-based page.", schema: { type: "integer", minimum: 1 } },
  "X-Limit": { description: "Requested maximum items per page.", schema: { type: "integer", minimum: 1, maximum: 100 } },
};
const errors: OpenAPIV3.ResponsesObject = Object.fromEntries([
  [400, "Invalid input, malformed JSON, duplicate/unknown query parameters, or invalid references.", "ValidationError"],
  [401, "API token is missing or invalid, or no token is configured.", "Error"],
  [404, "The requested record, field, option, or target does not exist.", "Error"],
  [409, "Uniqueness conflict or concurrent changes prevent the operation.", "Error"],
  [500, "Unexpected server failure. Internal details are not returned.", "Error"],
].map(([status, description, schema]) => [String(status), {
  description: String(description),
  headers: { "Cache-Control": noStore },
  content: { "application/json": { schema: reference(String(schema)) } },
}]));

function parameters(path: string, query?: RequestSchemaName): OpenAPIV3.ParameterObject[] {
  const result: OpenAPIV3.ParameterObject[] = [...path.matchAll(/:([A-Za-z]+)/g)].map(([, name]) => ({
    name, in: "path", required: true, schema: reference("Identifier"), description: "Record identifier.",
  }));
  if (query) {
    const schema = requestSchemas[query];
    for (const [name, property] of Object.entries(schema.properties ?? {})) {
      result.push({
        name, in: "query", required: schema.required?.includes(name) ?? false,
        schema: property,
        description: "$ref" in property ? undefined : property.description,
      });
    }
  }
  return result;
}

const paths: OpenAPIV3.PathsObject = {};
for (const endpoint of apiEndpoints) {
  const contract = contracts.get(`${endpoint.method} ${endpoint.path}`);
  if (!contract) throw new Error(`Missing OpenAPI contract: ${endpoint.method} ${endpoint.path}`);
  const success: OpenAPIV3.ResponseObject = {
    description: contract.status === 204 ? "Deleted successfully; no response body." : contract.status === 201 ? "Created successfully." : "Successful response.",
    headers: { "Cache-Control": noStore, ...(contract.paginated ? paginationHeaders : {}) },
  };
  if (contract.response) {
    const schema = reference(contract.response);
    success.content = { "application/json": { schema: contract.array ? arrayOf(schema) : schema } };
  }
  const operation: OpenAPIV3.OperationObject = {
    operationId: contract.operationId,
    tags: [contract.tag],
    summary: endpoint.description.split(".")[0],
    description: [endpoint.description, contract.description,
      contract.query ? "Duplicate or unknown query parameters are rejected. Booleans use true/false; page and limit use decimal digits." : undefined,
    ].filter(Boolean).join("\n\n"),
    parameters: parameters(endpoint.path, contract.query),
    responses: { ...errors, [String(contract.status ?? 200)]: success },
  };
  if (contract.body) {
    operation.requestBody = { required: true, content: { "application/json": { schema: reference(contract.body) } } };
  }
  const path = endpoint.path.replace(/:([A-Za-z]+)/g, "{$1}");
  const item = paths[path] ?? {};
  item[endpoint.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete"] = operation;
  paths[path] = item;
}
if (contracts.size !== apiEndpoints.length) throw new Error("OpenAPI contracts and the endpoint catalog are out of sync");

export const openApiDocument: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "Vinext API",
    version: "1.0.0",
    description: "Business APIs for companies, contacts, deals, activities, custom fields, and statistics. API-token authentication is currently required; login sessions are planned but not implemented. Actor IDs are explicit external attribution, not verified identities. This public document contains no application records or credentials.",
  },
  servers: [{ url: "/", description: "Same-origin application server" }],
  tags: ["Companies", "Contacts", "Deals", "Activities", "Fields", "Stats"].map(name => ({ name })),
  security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
  paths,
  components: {
    schemas: { ...requestSchemas, ...responseSchemas },
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", description: "Enter the configured API token. Legacy Token-prefixed and raw Authorization values are also accepted. Authorization takes precedence over x-api-token." },
      apiKeyAuth: { type: "apiKey", in: "header", name: "x-api-token", description: "Alternative API-token header, used when Authorization is absent." },
    },
  },
};
