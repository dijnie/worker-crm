import { and, count, desc, eq, exists, isNull, notExists, sql } from "drizzle-orm";
import { z } from "zod/v3";
import type { Database } from "@/lib/db";
import { session, singletonMembership, singletonWorkspace, user } from "@/lib/db/schema";
import { ServiceError } from "@/lib/utils/service-error";
import { identifier, listInput, type Page } from "@/lib/utils/validation";

const roleInput = z.enum(["owner", "member"]);
const revisionInput = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const memberListInput = listInput.pick({ page: true, limit: true }).extend({
  status: z.enum(["active", "revoked"]).optional(),
}).strict();
export const memberMutationInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("change-role"), role: roleInput, expectedRevision: revisionInput }).strict(),
  z.object({ action: z.literal("revoke"), expectedRevision: revisionInput }).strict(),
  z.object({ action: z.literal("restore"), expectedRevision: revisionInput }).strict(),
]);
export type MemberListInput = z.input<typeof memberListInput>;
export type MemberMutationInput = z.input<typeof memberMutationInput>;
export interface MemberRecord {
  id: string;
  name: string;
  email: string;
  role: "owner" | "member";
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
  role: singletonMembership.role,
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
  const verified = db.select({ id: user.id }).from(user).where(and(eq(user.id, userId), eq(user.emailVerified, true)));
  const [, , [membership], [identity]] = await db.batch([
    db.update(singletonWorkspace).set({ ownerUserId: userId, updatedAt: now }).where(and(
      eq(singletonWorkspace.id, "shared"), isNull(singletonWorkspace.ownerUserId), exists(verified),
      notExists(db.select().from(singletonMembership).where(eq(singletonMembership.userId, userId))),
    )),
    db.insert(singletonMembership).select(db.select({
      userId: user.id,
      role: sql<"owner" | "member">`case when ${singletonWorkspace.ownerUserId} = ${user.id} then 'owner' else 'member' end`.as("role"),
      status: sql<"active">`'active'`.as("status"), revision: sql<number>`0`.as("revision"), accessVersion: sql<number>`0`.as("access_version"),
      createdAt: sql<Date>`${now.getTime()}`.as("created_at"), updatedAt: sql<Date>`${now.getTime()}`.as("updated_at"), revokedAt: sql<null>`null`.as("revoked_at"),
    }).from(user).innerJoin(singletonWorkspace, eq(singletonWorkspace.id, "shared"))
      .where(and(eq(user.id, userId), eq(user.emailVerified, true), sql`${singletonWorkspace.ownerUserId} is not null`)))
      .onConflictDoNothing({ target: singletonMembership.userId }),
    db.select().from(singletonMembership).where(eq(singletonMembership.userId, userId)),
    db.select({ emailVerified: user.emailVerified }).from(user).where(eq(user.id, userId)),
  ]);
  if (!identity?.emailVerified) throw new ServiceError(403, "Verify your email before accessing the workspace");
  if (membership?.status === "revoked") throw new ServiceError(403, "Workspace access has been revoked");
  if (!membership) throw new ServiceError(409, "Workspace admission could not be completed");
  return membership;
}

export class MemberService {
  constructor(private readonly db: Database) {}

  async getMembership(inputUserId: string) {
    const [membership] = await this.db.select().from(singletonMembership)
      .where(eq(singletonMembership.userId, identifier.parse(inputUserId)));
    return membership;
  }

  private ownerCondition(actorId: string) {
    // Use an independent subquery: the actor can also be the row being changed.
    return sql`exists (select 1 from singleton_membership as actor
      inner join user as identity on identity.id = actor.user_id
      where actor.user_id = ${actorId} and actor.role = 'owner'
        and actor.status = 'active' and identity.email_verified = 1)`;
  }

  private async requireOwner(actorId: string) {
    const [owner] = await this.db.select({ id: singletonMembership.userId }).from(singletonMembership)
      .where(and(eq(singletonMembership.userId, actorId), this.ownerCondition(actorId)));
    if (!owner) throw new ServiceError(403, "Only active owners can manage members");
  }

  async list(inputActorId: string, input: unknown = {}): Promise<Page<MemberRecord>> {
    const actorId = identifier.parse(inputActorId);
    const { page, limit, status } = memberListInput.parse(input);
    const where = and(this.ownerCondition(actorId), status ? eq(singletonMembership.status, status) : undefined);
    const [owners, items, [total]] = await this.db.batch([
      this.db.select({ id: singletonMembership.userId }).from(singletonMembership)
        .where(and(eq(singletonMembership.userId, actorId), this.ownerCondition(actorId))),
      this.db.select(recordFields).from(singletonMembership).innerJoin(user, eq(user.id, singletonMembership.userId))
        .where(where).orderBy(desc(singletonMembership.createdAt), desc(singletonMembership.userId))
        .limit(limit).offset((page - 1) * limit),
      this.db.select({ value: count() }).from(singletonMembership).where(where),
    ]);
    if (!owners.length) throw new ServiceError(403, "Only active owners can manage members");
    return { items: items.map(serialize), total: total.value, page, limit };
  }

  changeRole(actorId: string, targetId: string, expectedRevision: number, role: "owner" | "member") {
    return this.mutate(actorId, targetId, { action: "change-role", expectedRevision, role });
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
      ...(data.action === "change-role" ? { role: data.role } : {
        status: data.action === "revoke" ? "revoked" as const : "active" as const,
        ...(data.action === "restore" ? { role: "member" as const } : {}),
        revokedAt: data.action === "revoke" ? now : null,
        accessVersion: sql`${singletonMembership.accessVersion} + 1`,
      }),
    }).where(and(eq(singletonMembership.userId, targetId),
      eq(singletonMembership.revision, data.expectedRevision), this.ownerCondition(actorId),
      eq(singletonMembership.status, data.action === "restore" ? "revoked" : "active"),
      data.action === "change-role" ? sql`${singletonMembership.role} <> ${data.role}` : undefined,
    )).returning({ id: singletonMembership.userId });
    const record = this.db.select(recordFields).from(singletonMembership)
      .innerJoin(user, eq(user.id, singletonMembership.userId)).where(eq(singletonMembership.userId, targetId));
    let changed: { id: string }[];
    let rows: StoredRecord[];
    try {
      if (lifecycle) {
        // changes() belongs to the immediately preceding UPDATE inside this atomic batch.
        // It remains valid when self-revocation removes the actor's owner authority.
        [changed, , rows] = await this.db.batch([change,
          this.db.delete(session).where(and(eq(session.userId, targetId), sql`changes() > 0`)), record]);
      } else {
        [changed, rows] = await this.db.batch([change, record]);
      }
    } catch (error) {
      let cause: unknown = error;
      for (let depth = 0; depth < 6 && cause instanceof Error; depth++) {
        if (cause.message.includes("last_active_owner")) throw new ServiceError(409, "At least one active owner must remain");
        cause = (cause as Error & { cause?: unknown }).cause;
      }
      throw error;
    }
    if (!changed.length) {
      await this.requireOwner(actorId);
      if (!rows.length) throw new ServiceError(404, "Member not found");
      throw new ServiceError(409, "Membership changed or the requested transition is invalid; refresh and try again");
    }
    return serialize(rows[0]);
  }
}
