import { env } from "cloudflare:workers";
import { and, eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db";
import { roles, rolePermissions, session, singletonMembership } from "@/lib/db/schema";
import { ServiceError } from "@/lib/utils/service-error";
import { CloudflareEmailAdapter } from "@/lib/email/cloudflare-email-adapter";
import { createAuth } from "./auth";
import { allPermissions, canPermission, type Permission, type PermissionEntity, type PermissionAction } from "./permissions";
import type { AuthorizationActor } from "./authorized-db";

type AuthEnvironment = {
  AUTH_BASE_URL: string;
  AUTH_EMAIL_FROM: string;
  BETTER_AUTH_SECRET: string;
  EMAIL: ConstructorParameters<typeof CloudflareEmailAdapter>[0]["binding"];
};
export interface AccountRole { id: string; name: string; isSystem: boolean; revision: number }
export interface AccountIdentity {
  id: string;
  name: string;
  email: string;
  role: AccountRole | null;
  permissions: Permission[];
  membershipRevision: number;
  accessVersion: number;
}
export interface RequestContext {
  db: Database;
  user: { id: string; name: string; email: string };
  membership: typeof singletonMembership.$inferSelect;
  role: AccountRole | null;
  permissions: Permission[];
  sessionId: string;
}
export function getAuthBaseUrl(): string {
  return (env as unknown as AuthEnvironment).AUTH_BASE_URL;
}
export function getAuth(db = getDb()) {
  const config = env as unknown as AuthEnvironment;
  return createAuth(db, { secret: config.BETTER_AUTH_SECRET, baseUrl: config.AUTH_BASE_URL },
    new CloudflareEmailAdapter({ binding: config.EMAIL, from: config.AUTH_EMAIL_FROM }));
}
export async function requireRequestContext(headers: Headers): Promise<RequestContext> {
  const db = getDb();
  // The auth client's session endpoint owns cookie and database expiry renewal.
  const current = await getAuth(db).api.getSession({ headers, query: { disableRefresh: true } });
  if (!current?.user.emailVerified) throw new ServiceError(401, "Sign in is required", "UNAUTHENTICATED");
  const [states, permissions] = await db.batch([
    db.select({ membership: singletonMembership, sessionVersion: sql<number>`${session.accessVersion}`.as("session_access_version"), role: {
      id: roles.id, name: roles.name, isSystem: roles.isSystem, revision: sql<number>`${roles.revision}`.as("role_revision"),
    } }).from(singletonMembership).innerJoin(session, eq(session.userId, singletonMembership.userId))
      .leftJoin(roles, eq(roles.id, singletonMembership.roleId))
      .where(and(eq(singletonMembership.userId, current.user.id), eq(session.id, current.session.id))),
    db.select({ entity: rolePermissions.entity, action: rolePermissions.action }).from(rolePermissions)
      .innerJoin(singletonMembership, eq(singletonMembership.roleId, rolePermissions.roleId))
      .where(eq(singletonMembership.userId, current.user.id)),
  ]);
  const state = states[0];
  if (!state || state.membership.status !== "active" || state.sessionVersion !== state.membership.accessVersion) {
    throw new ServiceError(403, "Active membership is required", "INACTIVE_MEMBERSHIP");
  }
  return { db, user: { id: current.user.id, name: current.user.name, email: current.user.email },
    membership: state.membership, role: state.role, permissions: state.role?.isSystem ? [...allPermissions] : permissions as Permission[],
    sessionId: current.session.id };
}
export function accountIdentity(context: RequestContext): AccountIdentity {
  return { ...context.user, role: context.role, permissions: context.permissions,
    membershipRevision: context.membership.revision, accessVersion: context.membership.accessVersion };
}
export function authorizationActor(context: RequestContext): AuthorizationActor {
  return { userId: context.user.id, sessionId: context.sessionId, accessVersion: context.membership.accessVersion,
    membershipRevision: context.membership.revision, roleId: context.role?.id ?? null, roleRevision: context.role?.revision ?? null };
}
export function requireSystem(context: RequestContext): void {
  if (!context.role?.isSystem) throw new ServiceError(403, "System access is required", "FORBIDDEN_ACTION");
}
export function requirePermission(context: RequestContext, entity: PermissionEntity, action: PermissionAction): void {
  if (!canPermission(context, entity, action)) throw new ServiceError(403, "Permission is required", "FORBIDDEN_ACTION");
}
