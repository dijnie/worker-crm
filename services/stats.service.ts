import { and, count, eq, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod/v3";
import type { Database } from "@/lib/db";
import { activities, companies, contacts, deals, DEAL_STAGES, type DealStage } from "@/lib/db/schema";
import { centsToDecimal } from "@/lib/utils/money";
import { currencyCode } from "@/lib/utils/validation";
import { canRead, activityReadPredicate } from "@/lib/server/read-access";

export const statsInput = z.object({ currency: currencyCode.default("USD") }).strict();

const closedStages = new Set<DealStage>(["CLOSED_WON", "CLOSED_LOST", "UNQUALIFIED_TO_BUY"]);

export class StatsService {
  constructor(private readonly db: Database) {}

  async getStats(input: unknown = {}) {
    const { currency } = statsInput.parse(input);
    const now = new Date();
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7);
    const activeDeals = and(isNull(deals.archivedAt), canRead(this.db, "deal") ? undefined : sql`0`);
    const openDeals = and(activeDeals, notInArray(deals.stage, [...closedStages]));
    const selectedCurrencyDeals = and(activeDeals, eq(deals.currency, currency));
    const [companyCount, contactCount, dealCount, openDealCount, activityCount, amounts] = await this.db.batch([
      this.db.select({ total: count() }).from(companies).where(and(isNull(companies.archivedAt), canRead(this.db, "company") ? undefined : sql`0`)),
      this.db.select({ total: count() }).from(contacts).where(and(isNull(contacts.archivedAt), canRead(this.db, "contact") ? undefined : sql`0`)),
      this.db.select({ total: count() }).from(deals).where(activeDeals),
      this.db.select({ total: count() }).from(deals).where(openDeals),
      this.db.select({ total: count() }).from(activities).where(and(activityReadPredicate(this.db), sql`julianday(${activities.createdAt}) >= julianday(${weekStart.toISOString()}) AND julianday(${activities.createdAt}) <= julianday(${now.toISOString()})`)),
      this.db.select({ stage: deals.stage, amount: deals.amount }).from(deals).where(selectedCurrencyDeals),
    ]);
    // D1 returns one safe integer per deal; BigInt keeps totals exact beyond that range.
    // The selected-currency projection is materialized by the batch and uses O(N) memory.
    const buckets = new Map(DEAL_STAGES.map((stage) => [stage, { count: 0, cents: BigInt(0) }]));
    for (const row of amounts) {
      const bucket = buckets.get(row.stage)!;
      bucket.count += 1;
      bucket.cents += BigInt(row.amount ?? 0);
    }
    let openCents = BigInt(0);
    const pipeline = DEAL_STAGES.map((stage) => {
      const bucket = buckets.get(stage)!;
      if (!closedStages.has(stage)) openCents += bucket.cents;
      return { stage, count: bucket.count, value: centsToDecimal(bucket.cents) };
    });
    return {
      totalCompanies: canRead(this.db, "company") ? companyCount[0].total : null,
      totalContacts: canRead(this.db, "contact") ? contactCount[0].total : null,
      totalDeals: canRead(this.db, "deal") ? dealCount[0].total : null,
      openDeals: canRead(this.db, "deal") ? openDealCount[0].total : null,
      openDealValue: canRead(this.db, "deal") ? centsToDecimal(openCents) : null,
      currency,
      activitiesThisWeek: canRead(this.db, "activity") ? activityCount[0].total : null,
      pipeline: canRead(this.db, "deal") ? pipeline : null,
    };
  }
}
