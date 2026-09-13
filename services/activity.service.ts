import { and, count, desc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod/v3";
import type { Database } from "@/lib/db";
import { activities, ACTIVITY_TYPES } from "@/lib/db/schema";
import { ActivityStampService } from "./activity-stamp.service";
import { requireRecord, ServiceError } from "@/lib/utils/service-error";
import { dateTime, identifier, listInput, nullableId, optionalText } from "@/lib/utils/validation";

export const activityCreateShape = {
  type: z.enum(["NOTE", "CALL", "EMAIL", "MEETING", "TASK"]),
  subject: optionalText,
  body: optionalText,
  occurredAt: dateTime.optional(),
  dueAt: dateTime.nullable().optional(),
  companyId: nullableId,
  contactId: nullableId,
  dealId: nullableId,
};

export function refineActivityCreate(input: z.output<z.ZodObject<typeof activityCreateShape>>, ctx: z.RefinementCtx): void {
  if (!input.companyId && !input.contactId && !input.dealId) {
    ctx.addIssue({ code: "custom", message: "An activity needs a company, contact, or deal" });
  }
  if (input.type === "TASK" && !input.subject) {
    ctx.addIssue({ code: "custom", path: ["subject"], message: "A task needs a subject" });
  }
  if (input.type !== "TASK" && input.dueAt != null) {
    ctx.addIssue({ code: "custom", path: ["dueAt"], message: "Only tasks have a due date" });
  }
}

export const createActivityInput = z.object({
  ...activityCreateShape,
  createdById: identifier,
}).strict().superRefine(refineActivityCreate);

export const ACTIVITY_VIEWS = ["all", "history", "notes", "upcoming", "done", "email", "meetings"] as const;
export type ActivityView = typeof ACTIVITY_VIEWS[number];
export type ActivityCounts = Record<ActivityView, number>;
export const activityCountsInput = z.object({
  companyId: identifier.optional(),
  contactId: identifier.optional(),
  dealId: identifier.optional(),
  type: z.enum(ACTIVITY_TYPES).optional(),
}).strict();
export type ActivityCountsInput = z.input<typeof activityCountsInput>;
export const activityListInput = listInput.pick({ page: true, limit: true }).extend({
  ...activityCountsInput.shape,
  view: z.enum(ACTIVITY_VIEWS).optional(),
}).strict();

function viewPredicate(view: ActivityView = "all") {
  switch (view) {
    case "all": return undefined;
    case "history": return or(ne(activities.type, "TASK"), isNotNull(activities.completedAt));
    case "notes": return eq(activities.type, "NOTE");
    case "email": return eq(activities.type, "EMAIL");
    case "meetings": return eq(activities.type, "MEETING");
    case "upcoming": return and(eq(activities.type, "TASK"), isNull(activities.completedAt));
    case "done": return and(eq(activities.type, "TASK"), isNotNull(activities.completedAt));
  }
}

function activityPredicate(options: ActivityCountsInput, view?: ActivityView) {
  return and(
    options.companyId ? eq(activities.companyId, options.companyId) : undefined,
    options.contactId ? eq(activities.contactId, options.contactId) : undefined,
    options.dealId ? eq(activities.dealId, options.dealId) : undefined,
    options.type ? eq(activities.type, options.type) : undefined,
    viewPredicate(view),
  );
}

function activityOrder(view?: ActivityView) {
  if (view === "upcoming") return [sql`${activities.dueAt} IS NULL`, sql`julianday(${activities.dueAt}) ASC`, sql`julianday(${activities.createdAt}) DESC`, desc(activities.id)];
  if (view === "done") return [sql`julianday(${activities.completedAt}) DESC`, desc(activities.id)];
  return [sql`julianday(${activities.createdAt}) DESC`, desc(activities.id)];
}
export const completeTaskInput = z.object({ completed: z.boolean() }).strict();
export type CreateActivityInput = z.input<typeof createActivityInput>;
export type ActivityListInput = z.input<typeof activityListInput>;
export type CompleteTaskInput = z.input<typeof completeTaskInput>;

export class ActivityService {
  private readonly stamps: ActivityStampService;

  constructor(private readonly db: Database) {
    this.stamps = new ActivityStampService(db);
  }

  async list(input: unknown = {}) {
    const options = activityListInput.parse(input);
    const where = activityPredicate(options, options.view);
    const [items, totals] = await this.db.batch([
      this.db.select().from(activities).where(where)
        .orderBy(...activityOrder(options.view))
        .limit(options.limit).offset((options.page - 1) * options.limit),
      this.db.select({ total: count() }).from(activities).where(where),
    ]);
    return { items, total: totals[0].total, page: options.page, limit: options.limit };
  }

  async counts(input: unknown = {}): Promise<ActivityCounts> {
    const options = activityCountsInput.parse(input);
    const aggregate = (view: ActivityView) => sql<number>`coalesce(sum(case when ${viewPredicate(view) ?? sql`1`} then 1 else 0 end), 0)`.mapWith(Number);
    const [result] = await this.db.select({
      all: count(), history: aggregate("history"), notes: aggregate("notes"),
      upcoming: aggregate("upcoming"), done: aggregate("done"), email: aggregate("email"), meetings: aggregate("meetings"),
    }).from(activities).where(activityPredicate(options));
    return result;
  }

  async getById(id: string) {
    id = identifier.parse(id);
    return requireRecord(await this.db.query.activities.findFirst({ where: eq(activities.id, id) }), "Activity");
  }

  async create(input: unknown) {
    const data = createActivityInput.parse(input);
    const company = data.companyId ? requireReference(await this.db.query.companies.findFirst({
      where: (table, { eq }) => eq(table.id, data.companyId!), columns: { id: true },
    }), "Company") : null;
    const contact = data.contactId ? requireReference(await this.db.query.contacts.findFirst({
      where: (table, { eq }) => eq(table.id, data.contactId!), columns: { id: true, companyId: true },
    }), "Contact") : null;
    const deal = data.dealId ? requireReference(await this.db.query.deals.findFirst({
      where: (table, { eq }) => eq(table.id, data.dealId!), columns: { id: true, companyId: true },
    }), "Deal") : null;
    const companyId = company?.id ?? deal?.companyId ?? contact?.companyId ?? null;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const target = { companyId, contactId: data.contactId, dealId: data.dealId };
    const [created] = await this.db.batch([
      this.db.insert(activities).values({
        ...data, id, companyId, occurredAt: data.occurredAt ?? now,
        dueAt: data.dueAt ?? null, createdAt: now, updatedAt: now,
      }).returning(),
      ...this.stamps.touchStatements(target, now),
    ]);
    return created[0];
  }

  async completeTask(id: string, input: unknown) {
    id = identifier.parse(id);
    const { completed } = completeTaskInput.parse(input);
    const existing = await this.getById(id);
    if (existing.type !== "TASK") throw new ServiceError(400, "Only tasks can be completed");
    const now = new Date().toISOString();
    const [updated] = await this.db.update(activities).set({ completedAt: completed ? now : null, updatedAt: now })
      .where(and(eq(activities.id, id), eq(activities.type, "TASK"))).returning();
    return requireRecord(updated, "Activity");
  }

  async delete(id: string) {
    id = identifier.parse(id);
    const existing = await this.getById(id);
    await this.db.batch([
      this.db.delete(activities).where(eq(activities.id, id)),
      ...this.stamps.recomputeStatements(existing),
    ]);
    return { id };
  }
}

function requireReference<T>(record: T | undefined, label: string): T {
  if (record === undefined) throw new ServiceError(400, `Referenced ${label.toLowerCase()} does not exist`);
  return record;
}
