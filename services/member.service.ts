import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v3";
import type { Database } from "@/lib/db";
import { roles, session, singletonMembership, user } from "@/lib/db/schema";
import { ServiceError } from "@/lib/utils/service-error";
import { identifier, listInput, type Page } from "@/lib/utils/validation";

const revisionInput = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const memberListInput = listInput.pick({ page: true, limit: true }).extend({
  status: z.enum(["active", "revoked"]).optional(),
}).strict();
export const memberMutationInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("change-role"), roleId: identifier.nullable(), expectedRevision: revisionInput }).strict(),
  z.object({ action: z.literal("revoke"), expectedRevision: revisionInput }).strict(),
  z.object({ action: z.literal("restore"), expectedRevision: revisionInput }).strict(),
]);
export type MemberListInput = z.input<typeof memberListInput>;
export type MemberMutationInput = z.input<typeof memberMutationInput>;
export interface MemberRecord {
  id: string;
  name: string;
  email: string;
  roleId: string | null;
  role: { id: string; name: string; isSystem: boolean; revision: number } | null;
  status: "active" | "revoked";
  revision: number;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

const recordFields = {
  id: singletonMembership.userId,
  name: user.name,
  email: user.email,
  roleId: singletonMembership.roleId,
  role: { id: roles.id, name: sql<string>`${roles.name}`.as("role_name"), isSystem: roles.isSystem, revision: sql<number>`${roles.revision}`.as("role_revision") },
  status: singletonMembership.status,
  revision: singletonMembership.revision,
  createdAt: singletonMembership.createdAt,
  updatedAt: singletonMembership.updatedAt,
  revokedAt: singletonMembership.revokedAt,
};
type StoredRecord = Omit<MemberRecord, "createdAt" | "updatedAt" | "revokedAt"> & {
  createdAt: Date; updatedAt: Date; revokedAt: Date | null;
};
function serialize(record: StoredRecord): MemberRecord {
  return { ...record, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
    revokedAt: record.revokedAt?.toISOString() ?? null };
}

export async function reconcileSingletonMembership(db: Database, inputUserId: string) {
  const userId = identifier.parse(inputUserId);
  const now = new Date();
  const [, [membership], [identity]] = await db.batch([
    db.insert(singletonMembership).select(db.select({
      userId: user.id, roleId: sql<null>`null`.as("role_id"),
      status: sql<"active">`'active'`.as("status"), revision: sql<number>`0`.as("revision"), accessVersion: sql<number>`0`.as("access_version"),
      createdAt: sql<Date>`${now.getTime()}`.as("created_at"), updatedAt: sql<Date>`${now.getTime()}`.as("updated_at"), revokedAt: sql<null>`null`.as("revoked_at"),
    }).from(user).where(and(eq(user.id, userId), eq(user.emailVerified, true))))
      .onConflictDoNothing({ target: singletonMembership.userId }),
    db.select().from(singletonMembership).where(eq(singletonMembership.userId, userId)),
    db.select({ emailVerified: user.emailVerified }).from(user).where(eq(user.id, userId)),
  ]);
  if (!identity?.emailVerified) throw new ServiceError(403, "Verify your email before accessing the workspace");
  if (membership?.status === "revoked") throw new ServiceError(403, "Workspace access has been revoked");
  if (!membership) throw new ServiceError(409, "Workspace admission could not be completed");
  return membership;
}

export function systemActorCondition(actorId: string) {
  return sql`exists (select 1 from singleton_membership as actor
    inner join user as identity on identity.id = actor.user_id
    inner join roles as actor_role on actor_role.id = actor.role_id
    where actor.user_id = ${actorId} and actor_role.is_system = 1
      and actor.status = 'active' and identity.email_verified = 1)`;
}

export class MemberService {
  constructor(private readonly db: Database) {}

  async getMembership(inputUserId: string) {
    const [membership] = await this.db.select().from(singletonMembership)
      .where(eq(singletonMembership.userId, identifier.parse(inputUserId)));
    return membership;
  }

  private async requireSystem(actorId: string) {
    const [actor] = await this.db.select({ id: singletonMembership.userId }).from(singletonMembership)
      .where(and(eq(singletonMembership.userId, actorId), systemActorCondition(actorId)));
    if (!actor) throw new ServiceError(403, "Only active system accounts can manage members");
  }

  async list(inputActorId: string, input: unknown = {}): Promise<Page<MemberRecord>> {
    const actorId = identifier.parse(inputActorId);
    const { page, limit, status } = memberListInput.parse(input);
    const where = and(systemActorCondition(actorId), status ? eq(singletonMembership.status, status) : undefined);
    const [actors, items, [total]] = await this.db.batch([
      this.db.select({ id: singletonMembership.userId }).from(singletonMembership)
        .where(and(eq(singletonMembership.userId, actorId), systemActorCondition(actorId))),
      this.db.select(recordFields).from(singletonMembership).innerJoin(user, eq(user.id, singletonMembership.userId)).leftJoin(roles, eq(roles.id, singletonMembership.roleId))
        .where(where).orderBy(desc(singletonMembership.createdAt), desc(singletonMembership.userId))
        .limit(limit).offset((page - 1) * limit),
      this.db.select({ value: count() }).from(singletonMembership).where(where),
    ]);
    if (!actors.length) throw new ServiceError(403, "Only active system accounts can manage members");
    return { items: items.map(serialize), total: total.value, page, limit };
  }

  changeRole(actorId: string, targetId: string, expectedRevision: number, roleId: string | null) {
    return this.mutate(actorId, targetId, { action: "change-role", expectedRevision, roleId });
  }

  revoke(actorId: string, targetId: string, expectedRevision: number) {
    return this.mutate(actorId, targetId, { action: "revoke", expectedRevision });
  }

  restore(actorId: string, targetId: string, expectedRevision: number) {
    return this.mutate(actorId, targetId, { action: "restore", expectedRevision });
  }

  private async mutate(inputActorId: string, inputTargetId: string, input: unknown): Promise<MemberRecord> {
    const actorId = identifier.parse(inputActorId);
    const targetId = identifier.parse(inputTargetId);
    const data = memberMutationInput.parse(input);
    const now = new Date();
    const lifecycle = data.action !== "change-role";
    const change = this.db.update(singletonMembership).set({
      revision: sql`${singletonMembership.revision} + 1`, updatedAt: now,
      ...(data.action === "change-role" ? { roleId: data.roleId } : {
        status: data.action === "revoke" ? "revoked" as const : "active" as const,
        ...(data.action === "restore" ? { roleId: null } : {}),
        revokedAt: data.action === "revoke" ? now : null,
        accessVersion: sql`${singletonMembership.accessVersion} + 1`,
      }),
    }).where(and(eq(singletonMembership.userId, targetId),
      eq(singletonMembership.revision, data.expectedRevision), systemActorCondition(actorId),
      eq(singletonMembership.status, data.action === "restore" ? "revoked" : "active"),
      data.action === "change-role" ? sql`${singletonMembership.roleId} is not ${data.roleId}` : undefined,
    )).returning({ id: singletonMembership.userId });
    const record = this.db.select(recordFields).from(singletonMembership)
      .innerJoin(user, eq(user.id, singletonMembership.userId)).leftJoin(roles, eq(roles.id, singletonMembership.roleId)).where(eq(singletonMembership.userId, targetId));
    let changed: { id: string }[];
    let rows: StoredRecord[];
    try {
      if (lifecycle) {
        // changes() belongs to the immediately preceding UPDATE inside this atomic batch.
        // It remains valid when self-revocation removes the actor's system authority.
        [changed, , rows] = await this.db.batch([change,
          this.db.delete(session).where(and(eq(session.userId, targetId), sql`changes() > 0`)), record]);
      } else {
        [changed, rows] = await this.db.batch([change, record]);
      }
    } catch (error) {
      let cause: unknown = error;
      for (let depth = 0; depth < 6 && cause instanceof Error; depth++) {
        if (cause.message.includes("last_active_system")) throw new ServiceError(409, "At least one active system account must remain");
        cause = (cause as Error & { cause?: unknown }).cause;
      }
      throw error;
    }
    if (!changed.length) {
      await this.requireSystem(actorId);
      if (!rows.length) throw new ServiceError(404, "Member not found");
      throw new ServiceError(409, "Membership changed or the requested transition is invalid; refresh and try again");
    }
    return serialize(rows[0]);
  }
}
