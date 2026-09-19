import { and, eq } from "drizzle-orm";
import { fieldDefinitions, savedViews } from "@/lib/db/schema";
import { accountIdentity, authorizationActor, type RequestContext } from "@/lib/auth/request-context";
import { canPermission, type Permission } from "@/lib/auth/permissions";
import { createAuthorizedDatabase } from "@/lib/auth/authorized-db";
import { ServiceError } from "@/lib/utils/service-error";
import { readJsonBody } from "@/lib/http/json-body";

const recordEntities = { companies: "company", contacts: "contact", deals: "deal" } as const;
type Entity = Permission["entity"];
type Action = Permission["action"];

function denied(): never { throw new ServiceError(403, "Your role does not permit this operation", "PERMISSION_REQUIRED"); }
function entityName(value: unknown): "company" | "contact" | "deal" {
  const entity = typeof value === "string" ? value.toLowerCase() : "";
  if (entity !== "company" && entity !== "contact" && entity !== "deal") {
    throw new ServiceError(400, "Expected a valid entity", "INVALID_QUERY");
  }
  return entity;
}

export async function authorizeApiRequest(request: Request, context: RequestContext): Promise<RequestContext> {
  const url = new URL(request.url);
  const [, prefix, resource, encodedId, operation] = url.pathname.split("/");
  if (prefix !== "api") denied();
  const method = request.method;
  const identity = accountIdentity(context);
  // Identity is deliberately available before role assignment; it exposes no CRM data.
  if (resource === "account" && method === "GET") return context;
  const actor = authorizationActor(context);
  const guard = (requirements: Permission[] | "system") => ({ ...context,
    db: createAuthorizedDatabase(context.db.$client, actor, requirements) });
  if (resource === "roles" || resource === "members") {
    if (!identity.role?.isSystem) denied();
    return guard("system");
  }
  if (!identity.role || !["company", "contact", "deal", "activity"].some(entity =>
    canPermission(identity, entity as Entity, "read"))) denied();
  const requirements: Permission[] = [];
  const add = (entity: Entity, action: Action) => {
    if (!canPermission(identity, entity, action)) denied();
    if (!requirements.some(item => item.entity === entity && item.action === action)) requirements.push({ entity, action } as Permission);
    if (action !== "read" && !requirements.some(item => item.entity === entity && item.action === "read")) add(entity, "read");
  };
  const id = encodedId ? decodeURIComponent(encodedId) : undefined;
  const readBody = async (): Promise<Record<string, unknown>> => {
    if (method === "GET" || request.body === null) return {};
    const value = await readJsonBody(request, { allowEmpty: true });
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  };
  const safeDb = guard([]).db;
  if (resource in recordEntities) {
    const entity = recordEntities[resource as keyof typeof recordEntities];
    const action = method === "GET" ? "read" : operation === "contacts" ? "update"
      : operation === "restore" ? "restore" : method === "DELETE" ? "archive"
      : method === "POST" && !id ? "create" : "update";
    add(entity, action);
    if (operation === "contacts") add("contact", "read");
    const body = action === "create" || action === "update" ? await readBody() : {};
    if (Object.hasOwn(body, "companyId")) add("company", "read");
    if (Object.hasOwn(body, "primaryContactId") || Object.hasOwn(body, "contactId")) add("contact", "read");
  } else if (resource === "activities") {
    add("activity", method === "GET" ? "read" : method === "DELETE" ? "delete"
      : operation === "complete" ? "complete" : "create");
    const body = method === "POST" && !id ? await readBody() : {};
    for (const entity of ["company", "contact", "deal"] as const) {
      if (body[`${entity}Id`] || url.searchParams.get(`${entity}Id`)) add(entity, "read");
    }
    // Service resolution checks inferred and stored links under the same revision snapshot.
  } else if (resource === "fields") {
    if (method !== "GET" && operation !== "value") {
      if (!identity.role.isSystem) denied();
      return guard("system");
    }
    let entity;
    if (!id || id === "values") entity = entityName(url.searchParams.get("entity"));
    else {
      const [definition] = await safeDb.select({ entity: fieldDefinitions.entity }).from(fieldDefinitions).where(eq(fieldDefinitions.id, id));
      if (!definition) throw new ServiceError(404, "Field not found", "FIELD_NOT_FOUND");
      entity = entityName(definition.entity);
    }
    add(entity, method === "GET" ? "read" : "update");
    if (operation === "value" && entityName((await readBody()).entity) !== entity) throw new ServiceError(400, "Field belongs to another entity", "FIELD_ENTITY_MISMATCH");
  } else if (resource === "saved-views") {
    let entity;
    if (!id) entity = entityName(method === "GET" ? url.searchParams.get("entity") : (await readBody()).entity);
    else {
      const [view] = await safeDb.select({ entity: savedViews.entity }).from(savedViews)
        .where(and(eq(savedViews.id, id), eq(savedViews.ownerId, context.user.id)));
      if (!view) throw new ServiceError(404, "Saved view not found", "SAVED_VIEW_NOT_FOUND");
      entity = entityName(view.entity);
    }
    add(entity, "read");
  } else if ((resource === "stats" || resource === "assignees") && method === "GET") {
    // Snapshot checking keeps the request's complete read scope current.
  } else if (resource === "settings") {
    // The reporting currency is workspace-wide, so reading it needs no grant
    // beyond the CRM read already required above; changing it is a system action.
    if (method !== "GET") {
      if (!identity.role.isSystem) denied();
      return guard("system");
    }
  } else denied();
  return guard(requirements);
}
