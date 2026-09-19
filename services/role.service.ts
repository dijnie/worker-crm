import { and, eq, exists, notExists, sql } from "drizzle-orm";
import { z } from "zod/v3";
import type { Database } from "@/lib/db";
import { rolePermissions, roles, singletonMembership, user } from "@/lib/db/schema";
import { allPermissions, permissionCatalog, type Permission } from "@/lib/auth/permissions";
import { identifier } from "@/lib/utils/validation";
import { ServiceError } from "@/lib/utils/service-error";
import { systemActorCondition } from "./member.service";

const revisionInput = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const permissionInput = z.object({
  entity: z.enum(["company", "contact", "deal", "activity"]),
  action: z.enum(["read", "create", "update", "archive", "restore", "complete", "delete"]),
}).strict().refine(permission => (permissionCatalog[permission.entity] as readonly string[]).includes(permission.action), "Unknown entity action");
const permissionsInput = z.array(permissionInput).max(allPermissions.length).superRefine((permissions, context) => {
  const seen = new Set<string>();
  for (const [index, permission] of permissions.entries()) {
    const key = `${permission.entity}:${permission.action}`;
    if (seen.has(key)) context.addIssue({ code: "custom", path: [index], message: "Duplicate permission" });
    seen.add(key);
    if (permission.action !== "read" && !permissions.some(candidate => candidate.entity === permission.entity && candidate.action === "read")) {
      context.addIssue({ code: "custom", path: [index], message: "Write permissions require entity read permission" });
    }
  }
});
const roleFields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).nullable().optional().transform(value => value || null),
};
export const roleCreateInput = z.object({ ...roleFields, permissions: permissionsInput.default([]) }).strict();
export const roleUpdateInput = z.object({ ...roleFields, permissions: permissionsInput, expectedRevision: revisionInput }).strict();
export const roleDeleteInput = z.object({ expectedRevision: revisionInput }).strict();
export type RoleCreateInput = z.input<typeof roleCreateInput>;
export type RoleUpdateInput = z.input<typeof roleUpdateInput>;
export interface RoleRecord {
  id: string; name: string; description: string | null; isSystem: boolean; revision: number;
  permissions: Permission[]; memberCount: number; createdAt: string; updatedAt: string;
}
const fields = {
  id: roles.id, name: roles.name, description: roles.description, isSystem: roles.isSystem,
  revision: roles.revision, createdAt: roles.createdAt, updatedAt: roles.updatedAt,
  memberCount: sql<number>`(select count(*) from singleton_membership where role_id = ${roles.id})`.as("member_count"),
};
type StoredRole = typeof roles.$inferSelect & { memberCount: number };
function serialize(role: StoredRole, grants: { roleId: string; entity: string; action: string }[]): RoleRecord {
  return { ...role, createdAt: role.createdAt.toISOString(), updatedAt: role.updatedAt.toISOString(),
    permissions: role.isSystem ? [...allPermissions] : grants.filter(grant => grant.roleId === role.id)
      .map(({ entity, action }) => ({ entity, action }) as Permission) };
}
function translateRoleError(error: unknown): never {
  for (let cause: unknown = error, depth = 0; cause instanceof Error && depth < 8; depth++) {
    if (cause.message.includes("protected_system_role")) throw new ServiceError(409, "The system role is protected", "SYSTEM_ROLE_PROTECTED");
    if (cause.message.includes("roles_name_unique")) throw new ServiceError(409, "A role with this name already exists", "ROLE_NAME_TAKEN");
    if (cause.message.includes("FOREIGN KEY constraint failed")) throw new ServiceError(409, "The role is assigned to an account", "ROLE_ASSIGNED");
    cause = (cause as Error & { cause?: unknown }).cause;
  }
  throw error;
}
export class RoleService {
  constructor(private readonly db: Database) {}
  private async requireSystem(actorId: string) {
    const actors = await this.db.select({ id: user.id }).from(user)
      .where(and(eq(user.id, actorId), systemActorCondition(actorId)));
    if (!actors.length) throw new ServiceError(403, "Only active system accounts can manage roles", "FORBIDDEN_ACTION");
  }
  async list(inputActorId: string): Promise<RoleRecord[]> {
    const actorId = identifier.parse(inputActorId);
    const [actors, records, grants] = await this.db.batch([
      this.db.select({ id: user.id }).from(user).where(and(eq(user.id, actorId), systemActorCondition(actorId))),
      this.db.select(fields).from(roles).where(systemActorCondition(actorId)).orderBy(roles.createdAt, roles.id),
      this.db.select().from(rolePermissions).where(systemActorCondition(actorId)),
    ]);
    if (!actors.length) throw new ServiceError(403, "Only active system accounts can manage roles", "FORBIDDEN_ACTION");
    return records.map(role => serialize(role, grants));
  }
  async get(actorId: string, inputId: string): Promise<RoleRecord> {
    const id = identifier.parse(inputId);
    const role = (await this.list(actorId)).find(role => role.id === id);
    if (!role) throw new ServiceError(404, "Role not found", "ROLE_NOT_FOUND");
    return role;
  }
  async create(inputActorId: string, input: unknown): Promise<RoleRecord> {
    const actorId = identifier.parse(inputActorId);
    const data = roleCreateInput.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();
    await this.requireSystem(actorId);
    const create = this.db.insert(roles).select(this.db.select({
      id: sql<string>`${id}`.as("id"), name: sql<string>`${data.name}`.as("name"), description: sql<string | null>`${data.description}`.as("description"),
      isSystem: sql<boolean>`0`.as("is_system"), revision: sql<number>`0`.as("revision"),
      createdAt: sql<Date>`${now.getTime()}`.as("created_at"), updatedAt: sql<Date>`${now.getTime()}`.as("updated_at"),
    }).from(user).where(and(eq(user.id, actorId), systemActorCondition(actorId)))).returning({ id: roles.id });
    const grantQueries = data.permissions.map(permission => this.db.insert(rolePermissions).select(this.db.select({
      roleId: roles.id, entity: sql<typeof permission.entity>`${permission.entity}`.as("entity"), action: sql<typeof permission.action>`${permission.action}`.as("action"),
    }).from(roles).where(and(eq(roles.id, id), systemActorCondition(actorId)))));
    try {
      const result = await this.db.batch([create, ...grantQueries]);
      if (!result[0].length) throw new ServiceError(403, "Only active system accounts can manage roles", "FORBIDDEN_ACTION");
    } catch (error) { translateRoleError(error); }
    return { id, ...data, permissions: data.permissions as Permission[], isSystem: false, revision: 0,
      memberCount: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() };
  }
  async update(inputActorId: string, inputId: string, input: unknown): Promise<RoleRecord> {
    const actorId = identifier.parse(inputActorId), id = identifier.parse(inputId);
    const data = roleUpdateInput.parse(input);
    const existing = await this.get(actorId, id);
    if (existing.isSystem) throw new ServiceError(409, "The system role is protected", "SYSTEM_ROLE_PROTECTED");
    const now = new Date();
    const mutable = and(eq(roles.id, id), eq(roles.revision, data.expectedRevision), eq(roles.isSystem, false), systemActorCondition(actorId));
    const current = exists(this.db.select({ id: roles.id }).from(roles).where(mutable));
    const remove = this.db.delete(rolePermissions).where(and(eq(rolePermissions.roleId, id), current));
    const insertions = data.permissions.map(permission => this.db.insert(rolePermissions).select(this.db.select({
      roleId: roles.id, entity: sql<typeof permission.entity>`${permission.entity}`.as("entity"), action: sql<typeof permission.action>`${permission.action}`.as("action"),
    }).from(roles).where(mutable)));
    const update = this.db.update(roles).set({ name: data.name, description: data.description,
      revision: sql`${roles.revision} + 1`, updatedAt: now }).where(mutable).returning();
    let updated: (typeof roles.$inferSelect)[];
    try {
      const result = await this.db.batch([remove, ...insertions, update]);
      updated = result[result.length - 1] as (typeof roles.$inferSelect)[];
    } catch (error) { translateRoleError(error); }
    if (!updated!.length) {
      await this.requireSystem(actorId);
      throw new ServiceError(409, "Role changed; refresh and try again", "STALE_REVISION");
    }
    return { ...existing, name: data.name, description: data.description, permissions: data.permissions as Permission[],
      revision: updated![0].revision, updatedAt: now.toISOString() };
  }
  async delete(inputActorId: string, inputId: string, inputRevision: number): Promise<void> {
    const actorId = identifier.parse(inputActorId), id = identifier.parse(inputId);
    const expectedRevision = revisionInput.parse(inputRevision);
    const existing = await this.get(actorId, id);
    if (existing.isSystem) throw new ServiceError(409, "The system role is protected", "SYSTEM_ROLE_PROTECTED");
    let deleted;
    try {
      deleted = await this.db.delete(roles).where(and(eq(roles.id, id), eq(roles.revision, expectedRevision),
        eq(roles.isSystem, false), systemActorCondition(actorId),
        notExists(this.db.select().from(singletonMembership).where(eq(singletonMembership.roleId, id))))).returning({ id: roles.id });
    } catch (error) { translateRoleError(error); }
    if (!deleted?.length) {
      await this.requireSystem(actorId);
      throw new ServiceError(409, "Role changed or is assigned to an account; refresh and try again", "ROLE_CHANGED_OR_ASSIGNED");
    }
  }
}
