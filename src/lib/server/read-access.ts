import { and, isNull, sql, type SQL } from "drizzle-orm";
import { activities } from "@/lib/db/schema";
import { canPermission } from "@/lib/auth/permissions";
import type { AccountIdentity } from "@/lib/auth/request-context";
import type { Database } from "@/lib/db";
import { ServiceError } from "@/lib/utils/service-error";

type Entity = "company" | "contact" | "deal" | "activity";
const access = new WeakMap<Database, AccountIdentity>();

export function setDatabaseAccess(db: Database, identity: AccountIdentity): void {
  access.set(db, identity);
}

// Standalone service jobs are trusted; HTTP always establishes this scope.
export function canRead(db: Database | undefined, entity: Entity): boolean {
  const identity = (db ? access.get(db) : undefined);
  return !identity || canPermission(identity, entity, "read");
}

export function requireRead(db: Database | undefined, entity: Entity): void {
  if (!canRead(db, entity)) throw new ServiceError(403, "You do not have access to this entity", "PERMISSION_REQUIRED");
}

export function canReadActivitySummary(db: Database | undefined): boolean {
  return (["company", "contact", "deal", "activity"] as const).every(entity => canRead(db, entity));
}

export function canReadQuery(db: Database | undefined, query: { companyId?: string; sort?: string; filters?: Record<string, string[]> }): boolean {
  return !((query.companyId || query.filters?.company?.length || query.sort === "company") && !canRead(db, "company"))
    && !(query.sort === "contacts" && !canRead(db, "contact"))
    && !(query.sort === "deals" && !canRead(db, "deal"))
    && !((query.sort === "lastActivity" || query.filters?.activity?.length) && !canReadActivitySummary(db));
}

export function requireQueryRead(db: Database | undefined, query: Parameters<typeof canReadQuery>[1]): void {
  if (!canReadQuery(db, query)) throw new ServiceError(403, "This query requires access to related data", "PERMISSION_REQUIRED");
}

export function activityReadPredicate(db: Database): SQL | undefined {
  if (!canRead(db, "activity")) return sql`0`;
  return and(
    !canRead(db, "company") ? isNull(activities.companyId) : undefined,
    !canRead(db, "contact") ? isNull(activities.contactId) : undefined,
    !canRead(db, "deal") ? isNull(activities.dealId) : undefined,
  );
}

export function canReadActivity(db: Database, row: { companyId?: unknown; contactId?: unknown; dealId?: unknown }): boolean {
  return canRead(db, "activity") && (["company", "contact", "deal"] as const)
    .every(entity => !row[`${entity}Id`] || canRead(db, entity));
}

export function requireActivityLinks(db: Database, row: { companyId?: unknown; contactId?: unknown; dealId?: unknown }): void {
  for (const entity of ["company", "contact", "deal"] as const) {
    if (row[`${entity}Id`]) requireRead(db, entity);
  }
}

// Apply to every record response, including mutations and nested detail records.
export function scopeRecord(db: Database, entity: "company" | "contact" | "deal", value: unknown): unknown {
  if (Array.isArray(value)) return value.map(row => scopeRecord(db, entity, row));
  if (!value || typeof value !== "object") return value;
  const row = { ...value } as Record<string, unknown>;
  if (Array.isArray(row.activities)) {
    const identity = (db ? access.get(db) : undefined);
    row.canCreateActivity = (!identity || canPermission(identity, "activity", "create"))
      && (entity === "company" || !row.companyId || canRead(db, "company"));
  }
  for (const [key, target] of [["company", "company"], ["primaryContact", "contact"],
    ["primaryOf", "company"], ["contacts", "contact"], ["deals", "deal"]] as const) {
    if (!(key in row)) continue;
    row[key] = canRead(db, target) ? scopeRecord(db, target, row[key]) : Array.isArray(row[key]) ? [] : null;
  }
  if (Array.isArray(row.activities)) row.activities = row.activities.filter(item =>
    item && typeof item === "object" && canReadActivity(db, item));
  if (!canRead(db, "company") && "companyId" in row) row.companyId = null;
  if (!canRead(db, "contact") && "primaryContactId" in row) row.primaryContactId = null;
  if (!canRead(db, "contact")) delete row.contactCount;
  if (!canRead(db, "deal")) delete row.openDealCount;
  if (!canReadActivitySummary(db) && "lastActivityAt" in row) row.lastActivityAt = null;
  return row;
}
