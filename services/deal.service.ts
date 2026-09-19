import { listRecords, recordFacets } from "./record-list-query";
import { recordListInput } from "@/lib/record-list-contracts";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v3";
import type { Database } from "@/lib/db";
import { activities, companies, deals, DEAL_STAGES } from "@/lib/db/schema";
import { ActivityStampService } from "./activity-stamp.service";
import { decimalToCents, serializeDeal } from "@/lib/utils/money";
import { requireRecord, ServiceError } from "@/lib/utils/service-error";
import { currencyCode, dateTime, decimalString, identifier, optionalText, requiredText } from "@/lib/utils/validation";

const amountInput = decimalString.refine(value => /^\d+(?:\.\d{1,2})?$/.test(value),
  "Amount must be nonnegative with at most two fractional digits").nullable().optional();
export const createDealInput = z.object({
  name: requiredText,
  description: optionalText,
  companyId: identifier,
  ownerId: identifier,
  amount: amountInput,
  currency: currencyCode.default("USD"),
  expectedCloseDate: dateTime.nullable().optional(),
}).strict();
export const updateDealInput = createDealInput.partial().strict();
export const dealListInput = recordListInput("deal");
export const stageShape = {
  stage: z.enum(DEAL_STAGES),
  reason: optionalText,
};
export const stageInput = z.object({ ...stageShape, actorId: identifier }).strict();
export type CreateDealInput = z.input<typeof createDealInput>;
export type UpdateDealInput = z.input<typeof updateDealInput>;
export type DealListInput = z.input<typeof dealListInput>;
export type StageInput = z.input<typeof stageInput>;

const closedStages: ReadonlySet<string> = new Set(["CLOSED_WON", "CLOSED_LOST", "UNQUALIFIED_TO_BUY"]);

export class DealService {
  private readonly stamps: ActivityStampService;

  constructor(private readonly db: Database) {
    this.stamps = new ActivityStampService(db);
  }

  async list(input: unknown = {}) {
    const result = await listRecords(this.db, "deal", input);
    return { ...result, items: result.items.map(serializeDeal) };
  }

  async facets(input: unknown = {}) {
    return recordFacets(this.db, "deal", input);
  }

  async getById(id: string) {
    id = identifier.parse(id);
    const deal = requireRecord(await this.db.query.deals.findFirst({
      where: eq(deals.id, id),
      with: {
        company: true,
        contacts: { with: { contact: true } },
        activities: { orderBy: [desc(activities.createdAt), desc(activities.id)], limit: 30 },
        fieldValues: { with: { field: true, option: true } },
      },
    }), "Deal");
    return serializeDeal({ ...deal, contacts: deal.contacts.map(({ contact, role }) => ({ ...contact, role })) });
  }

  async create(input: unknown) {
    const data = createDealInput.parse(input);
    await this.requireCompany(data.companyId);
    const now = new Date().toISOString();
    const [created] = await this.db.insert(deals).values({
      ...data, amount: data.amount == null ? null : decimalToCents(data.amount),
      id: crypto.randomUUID(), stage: "DEMO_BOOKED", stageChangedAt: now,
      createdAt: now, updatedAt: now,
    }).returning();
    return serializeDeal(created);
  }

  async update(id: string, input: unknown) {
    id = identifier.parse(id);
    const data = updateDealInput.parse(input);
    if (data.companyId) await this.requireCompany(data.companyId);
    if (Object.keys(data).length === 0) return this.getById(id);
    const [updated] = await this.db.update(deals).set({
      ...data, amount: data.amount === undefined ? undefined : data.amount === null ? null : decimalToCents(data.amount),
      updatedAt: new Date().toISOString(),
    }).where(eq(deals.id, id)).returning();
    return serializeDeal(requireRecord(updated, "Deal"));
  }

  async archive(id: string) {
    return this.setArchived(id, new Date().toISOString());
  }

  async restore(id: string) {
    return this.setArchived(id, null);
  }

  async setStage(id: string, input: unknown) {
    id = identifier.parse(id);
    const data = stageInput.parse(input);
    requireRecord(await this.db.query.deals.findFirst({ where: eq(deals.id, id), columns: { id: true } }), "Deal");
    const now = new Date().toISOString();
    const activityId = crypto.randomUUID();
    const closed = closedStages.has(data.stage);
    const losing = data.stage === "CLOSED_LOST" || data.stage === "UNQUALIFIED_TO_BUY";
    // History reads the current stage inside the batch, serializing concurrent transitions.
    const historyExists = sql`EXISTS (SELECT 1 FROM ${activities} WHERE ${activities.id} = ${activityId})`;
    const companyId = sql`(SELECT ${activities.companyId} FROM ${activities} WHERE ${activities.id} = ${activityId})`;
    if (losing && !data.reason) {
      const current = requireRecord(await this.db.query.deals.findFirst({ where: eq(deals.id, id), columns: { stage: true } }), "Deal");
      if (current.stage === data.stage) return { id, stage: data.stage, changed: false };
      throw new z.ZodError([{ code: "custom", path: ["reason"], message: "A lost deal needs a reason", params: { code: "LOST_REASON_REQUIRED" } }]);
    }
    const [inserted] = await this.db.batch([
      this.db.insert(activities).select(this.db.select({
        id: sql<string>`${activityId}`.as("id"),
        type: sql<"STAGE_CHANGE">`'STAGE_CHANGE'`.as("type"),
        subject: sql<string>`'Stage changed'`.as("subject"),
        body: sql<string | null>`${data.reason ?? null}`.as("body"),
        occurredAt: sql<string>`${now}`.as("occurred_at"),
        dueAt: sql<null>`NULL`.as("due_at"),
        completedAt: sql<null>`NULL`.as("completed_at"),
        companyId: deals.companyId,
        contactId: sql<null>`NULL`.as("contact_id"),
        dealId: deals.id,
        createdById: sql<string>`${data.actorId}`.as("created_by_id"),
        meta: sql`json_object('from', ${deals.stage}, 'to', ${data.stage})`.as("meta"),
        emailThreadId: sql<null>`NULL`.as("email_thread_id"),
        calendarEventId: sql<null>`NULL`.as("calendar_event_id"),
        createdAt: sql<string>`${now}`.as("created_at"),
        updatedAt: sql<string>`${now}`.as("updated_at"),
      }).from(deals).where(and(eq(deals.id, id), sql`${deals.stage} <> ${data.stage}`))).returning({ id: activities.id }),
      ...this.stamps.touchStatements({ companyId, dealId: id }, now, historyExists),
      this.db.update(deals).set({
        stage: data.stage, stageChangedAt: now, closedAt: closed ? now : null,
        closedReason: closed ? data.reason ?? null : null, updatedAt: now,
      }).where(and(eq(deals.id, id), historyExists)),
    ]);
    return { id, stage: data.stage, changed: inserted.length > 0 };
  }

  private async requireCompany(id: string) {
    const company = await this.db.query.companies.findFirst({ where: eq(companies.id, id), columns: { id: true } });
    if (!company) throw new ServiceError(400, "Referenced company does not exist", "COMPANY_MISSING");
    return company;
  }

  private async setArchived(id: string, archivedAt: string | null) {
    id = identifier.parse(id);
    const [updated] = await this.db.update(deals).set({ archivedAt, updatedAt: new Date().toISOString() })
      .where(eq(deals.id, id)).returning();
    return serializeDeal(requireRecord(updated, "Deal"));
  }
}
