import { and, count, eq, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod/v3";
import type { Database } from "@/lib/db";
import { activities, companies, contacts, deals } from "@/lib/db/schema";
import { centsToDecimal } from "@/lib/utils/money";
import { currencyCode } from "@/lib/utils/validation";

export const statsInput = z.object({ currency: currencyCode.default("USD") }).strict();

export class StatsService {
  constructor(private readonly db: Database) {}

  async getStats(input: unknown = {}) {
    const { currency } = statsInput.parse(input);
    const now = new Date();
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7);
    const [companyCount, contactCount, dealCount, activityCount, amounts] = await this.db.batch([
      this.db.select({ total: count() }).from(companies).where(isNull(companies.archivedAt)),
      this.db.select({ total: count() }).from(contacts).where(isNull(contacts.archivedAt)),
      this.db.select({ total: count() }).from(deals).where(isNull(deals.archivedAt)),
      this.db.select({ total: count() }).from(activities).where(sql`julianday(${activities.createdAt}) >= julianday(${weekStart.toISOString()}) AND julianday(${activities.createdAt}) <= julianday(${now.toISOString()})`),
      this.db.select({ amount: deals.amount }).from(deals).where(and(
        isNull(deals.archivedAt), eq(deals.currency, currency),
        notInArray(deals.stage, ["CLOSED_WON", "CLOSED_LOST", "UNQUALIFIED_TO_BUY"]),
      )),
    ]);
    const cents = amounts.reduce((sum, row) => sum + BigInt(row.amount ?? 0), BigInt(0));
    return {
      totalCompanies: companyCount[0].total,
      totalContacts: contactCount[0].total,
      totalDeals: dealCount[0].total,
      openDealValue: centsToDecimal(cents),
      currency,
      activitiesThisWeek: activityCount[0].total,
    };
  }
}
