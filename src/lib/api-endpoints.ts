export interface APIEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description: string;
}

const recordEndpoints: APIEndpoint[] = ["companies", "contacts", "deals"].flatMap(resource => [
  { method: "GET" as const, path: `/api/${resource}`, description: "List records; pagination metadata is returned in X-Total-Count, X-Page and X-Limit headers." },
  { method: "POST" as const, path: `/api/${resource}`, description: "Create a record." },
  { method: "GET" as const, path: `/api/${resource}/:id`, description: "Get a record and its related data." },
  { method: "PATCH" as const, path: `/api/${resource}/:id`, description: "Update supplied properties." },
  { method: "DELETE" as const, path: `/api/${resource}/:id`, description: "Archive a record." },
  { method: "POST" as const, path: `/api/${resource}/:id/restore`, description: "Restore an archived record." },
]);

const apiEndpoints: APIEndpoint[] = [
  ...recordEndpoints,
  { method: "POST", path: "/api/deals/:id/stage", description: "Change stage with actorId and optional reason, recording history atomically." },
  { method: "GET", path: "/api/activities", description: "List activities by companyId, contactId, dealId or type, with pagination headers." },
  { method: "POST", path: "/api/activities", description: "Create a linked activity with explicit createdById attribution." },
  { method: "GET", path: "/api/activities/:id", description: "Get an activity." },
  { method: "DELETE", path: "/api/activities/:id", description: "Delete an activity and recompute linked activity timestamps." },
  { method: "POST", path: "/api/activities/:id/complete", description: "Complete or reopen a task using a completed boolean." },
  { method: "GET", path: "/api/fields", description: "List definitions by entity, optionally includeArchived." },
  { method: "POST", path: "/api/fields", description: "Create a field definition and its options." },
  { method: "GET", path: "/api/fields/:id", description: "Get a field definition and options." },
  { method: "PATCH", path: "/api/fields/:id", description: "Update a field definition." },
  { method: "DELETE", path: "/api/fields/:id", description: "Archive a field definition." },
  { method: "POST", path: "/api/fields/:id/restore", description: "Restore a field definition." },
  { method: "GET", path: "/api/fields/:id/options", description: "List options, optionally includeArchived." },
  { method: "POST", path: "/api/fields/:id/options", description: "Create an option for a SELECT field." },
  { method: "PATCH", path: "/api/fields/:id/options/:optionId", description: "Edit, archive or restore an option belonging to this field." },
  { method: "GET", path: "/api/fields/values", description: "Get definitions and values for entity and entityId." },
  { method: "PUT", path: "/api/fields/:id/value", description: "Set a typed value for entity and entityId; null clears an optional value." },
  { method: "GET", path: "/api/stats", description: "Active record counts, activity count for the UTC week, and open deal value in the requested currency (default USD)." },
];

export default apiEndpoints;
