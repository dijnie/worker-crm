import { and, count, eq, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod/v3";
import type { Database } from "@/lib/db";
import { activities, companies, contacts, deals, DEAL_STAGES, type DealStage } from "@/lib/db/schema";
import { centsToDecimal } from "@/lib/utils/money";
import { currencyCode } from "@/lib/utils/validation";

export const statsInput = z.object({ currency: currencyCode.default("USD") }).strict();

const closedStages = new Set<DealStage>(["CLOSED_WON", "CLOSED_LOST", "UNQUALIFIED_TO_BUY"]);

export class StatsService {
  constructor(private readonly db: Database) {}

  async getStats(input: unknown = {}) {
    const { currency } = statsInput.parse(input);
    const now = new Date();
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7);
    const activeDeals = isNull(deals.archivedAt);
    const openDeals = and(activeDeals, notInArray(deals.stage, [...closedStages]));
    const selectedCurrencyDeals = and(activeDeals, eq(deals.currency, currency));
    const [companyCount, contactCount, dealCount, openDealCount, activityCount, amounts] = await this.db.batch([
      this.db.select({ total: count() }).from(companies).where(isNull(companies.archivedAt)),
      this.db.select({ total: count() }).from(contacts).where(isNull(contacts.archivedAt)),
      this.db.select({ total: count() }).from(deals).where(activeDeals),
      this.db.select({ total: count() }).from(deals).where(openDeals),
      this.db.select({ total: count() }).from(activities).where(sql`julianday(${activities.createdAt}) >= julianday(${weekStart.toISOString()}) AND julianday(${activities.createdAt}) <= julianday(${now.toISOString()})`),
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
      totalCompanies: companyCount[0].total,
      totalContacts: contactCount[0].total,
      totalDeals: dealCount[0].total,
      openDeals: openDealCount[0].total,
      openDealValue: centsToDecimal(openCents),
      currency,
      activitiesThisWeek: activityCount[0].total,
      pipeline,
    };
  }
}
