import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v3";
import type { Database } from "@/lib/db";
import { singletonWorkspace, user } from "@/lib/db/schema";
import { APP_LOCALES, type AppLocale } from "@/lib/i18n/config";
import { currencyCode, identifier } from "@/lib/utils/validation";
import { ServiceError } from "@/lib/utils/service-error";
import { systemActorCondition } from "./member.service";

const revisionInput = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

// Each setting is optional so one can change without resending the other; the
// service rejects a request that names neither.
export const workspaceSettingsUpdateInput = z.object({
  reportingCurrency: currencyCode.optional(),
  locale: z.enum(APP_LOCALES).optional(),
  expectedRevision: revisionInput,
}).strict();
export type WorkspaceSettingsUpdateInput = z.input<typeof workspaceSettingsUpdateInput>;

export interface WorkspaceSettings {
  reportingCurrency: string;
  locale: AppLocale;
  revision: number;
  updatedAt: string;
}

// The workspace row is seeded by migration 0001 and its deletion is blocked by a
// trigger, so a missing row means the database is not a workspace.
const WORKSPACE_ID = "shared";
const fields = {
  reportingCurrency: singletonWorkspace.reportingCurrency,
  locale: singletonWorkspace.locale,
  revision: singletonWorkspace.revision,
  updatedAt: singletonWorkspace.updatedAt,
};

export class WorkspaceService {
  constructor(private readonly db: Database) {}

  async get(): Promise<WorkspaceSettings> {
    const [row] = await this.db.select(fields).from(singletonWorkspace)
      .where(eq(singletonWorkspace.id, WORKSPACE_ID));
    if (!row) throw new ServiceError(404, "The workspace is not initialised", "WORKSPACE_MISSING");
    return { ...row, updatedAt: row.updatedAt.toISOString() };
  }

  async update(inputActorId: string, input: unknown): Promise<WorkspaceSettings> {
    const actorId = identifier.parse(inputActorId);
    const data = workspaceSettingsUpdateInput.parse(input);
    if (data.reportingCurrency === undefined && data.locale === undefined) {
      throw new ServiceError(400, "Provide a reporting currency or a locale", "SETTINGS_EMPTY");
    }
    const now = new Date();
    const actors = await this.db.select({ id: user.id }).from(user)
      .where(and(eq(user.id, actorId), systemActorCondition(actorId)));
    if (!actors.length) throw new ServiceError(403, "Only active system accounts can change workspace settings", "FORBIDDEN_ACTION");
    // The revision precondition and the actor check travel with the write, so a
    // concurrent change or a revoked role cannot be overwritten.
    const [updated] = await this.db.update(singletonWorkspace)
      .set({
        ...(data.reportingCurrency !== undefined && { reportingCurrency: data.reportingCurrency }),
        ...(data.locale !== undefined && { locale: data.locale }),
        revision: sql`${singletonWorkspace.revision} + 1`,
        updatedAt: now,
      })
      .where(and(
        eq(singletonWorkspace.id, WORKSPACE_ID),
        eq(singletonWorkspace.revision, data.expectedRevision),
        systemActorCondition(actorId),
      ))
      .returning(fields);
    if (!updated) throw new ServiceError(409, "The workspace settings changed; reload and try again", "STALE_REVISION");
    return { ...updated, updatedAt: updated.updatedAt.toISOString() };
  }
}
