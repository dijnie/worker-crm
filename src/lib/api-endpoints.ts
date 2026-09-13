export interface APIEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description: string;
}

const recordEndpoints: APIEndpoint[] = ["companies", "contacts", "deals"].flatMap(resource => [
  { method: "GET" as const, path: `/api/${resource}`, description: "List records; pagination metadata is returned in X-Total-Count, X-Page and X-Limit headers." },
  { method: "GET" as const, path: `/api/${resource}/facets`, description: "Bounded facet options and counts, excluding each facet own selection." },
  { method: "POST" as const, path: `/api/${resource}`, description: "Create a record." },
  { method: "GET" as const, path: `/api/${resource}/:id`, description: "Get a record and its related data." },
  { method: "PATCH" as const, path: `/api/${resource}/:id`, description: "Update supplied properties." },
  { method: "DELETE" as const, path: `/api/${resource}/:id`, description: "Archive a record." },
  { method: "POST" as const, path: `/api/${resource}/:id/restore`, description: "Restore an archived record." },
]);

const apiEndpoints: APIEndpoint[] = [
  ...recordEndpoints,
  { method: "GET", path: "/api/assignees", description: "Active members list safe active verified assignees with search and pagination." },
  { method: "GET", path: "/api/saved-views", description: "List own private and shared views for an entity." },
  { method: "POST", path: "/api/saved-views", description: "Save a view owned by the signed-in account." },
  { method: "PATCH", path: "/api/saved-views/:id", description: "Update an own view; foreign views return 404." },
  { method: "DELETE", path: "/api/saved-views/:id", description: "Delete an own view; foreign views return 404." },
  { method: "POST", path: "/api/deals/:id/stage", description: "Change stage with an optional reason, recording history atomically under the signed-in account. Supplied actorId is rejected." },
  { method: "POST", path: "/api/deals/:id/contacts", description: "Attach an existing contact independently of employer; duplicate participation returns 409." },
  { method: "PATCH", path: "/api/deals/:id/contacts/:contactId", description: "Set or clear a participant role; missing deal or link returns 404." },
  { method: "DELETE", path: "/api/deals/:id/contacts/:contactId", description: "Detach a participant; missing deal or link returns 404." },
  { method: "GET", path: "/api/activities", description: "List activities by companyId, contactId, dealId, type and optional named view, with pagination headers." },
  { method: "GET", path: "/api/activities/counts", description: "Full-dataset counts for all, history, notes, upcoming, done, email and meetings in the same anchor/type context." },
  { method: "POST", path: "/api/activities", description: "Create a linked activity attributed to the signed-in account. Supplied createdById is rejected." },
  { method: "GET", path: "/api/activities/:id", description: "Get an activity." },
  { method: "DELETE", path: "/api/activities/:id", description: "Delete an activity and recompute linked activity timestamps." },
  { method: "POST", path: "/api/activities/:id/complete", description: "Complete or reopen a task using a completed boolean." },
  { method: "GET", path: "/api/fields", description: "List definitions by entity, optionally includeArchived." },
  { method: "POST", path: "/api/fields", description: "Create a field definition and its options." },
  { method: "POST", path: "/api/fields/reorder", description: "Atomically reorder the exact active definition set for an entity; stale membership returns 409." },
  { method: "GET", path: "/api/fields/:id", description: "Get a field definition and options." },
  { method: "PATCH", path: "/api/fields/:id", description: "Update a field definition." },
  { method: "DELETE", path: "/api/fields/:id", description: "Archive a field definition." },
  { method: "POST", path: "/api/fields/:id/restore", description: "Restore a field definition." },
  { method: "GET", path: "/api/fields/:id/options", description: "List options, optionally includeArchived." },
  { method: "POST", path: "/api/fields/:id/options", description: "Create an option for a SELECT field." },
  { method: "PATCH", path: "/api/fields/:id/options/:optionId", description: "Edit, archive or restore an option belonging to this field." },
  { method: "GET", path: "/api/fields/values", description: "Get definitions and values for entity and entityId." },
  { method: "PUT", path: "/api/fields/:id/value", description: "Set a typed value for entity and entityId; null clears an optional value. Optional expectedType rejects stale editors with 409." },
  { method: "GET", path: "/api/members", description: "Owners list workspace members with pagination headers and an optional active or revoked status filter." },
  { method: "PATCH", path: "/api/members/:id", description: "Owners change a role, revoke access or restore access using the current expectedRevision. Restore grants the member role and requires a new sign-in. Last-owner and stale changes return 409." },
  { method: "GET", path: "/api/stats", description: "Active record counts, activity count for the UTC week, and open deal value in the requested currency (default USD)." },
];

export default apiEndpoints;
