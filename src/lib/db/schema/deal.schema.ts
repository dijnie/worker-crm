import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { DEAL_STAGES } from "./constants";
import { companies } from "./company.schema";

export const deals = sqliteTable(
  "deals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID())
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    stage: text("stage", { enum: DEAL_STAGES })
      .notNull()
      .default("DEMO_BOOKED"),
    stageChangedAt: text("stage_changed_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    amount: integer("amount"),
    currency: text("currency")
      .notNull()
      .default("USD"),
    expectedCloseDate: text("expected_close_date"),
    closedAt: text("closed_at"),
    closedReason: text("closed_reason"),
    baseAmount: text("base_amount"),
    baseCurrency: text("base_currency"),
    fxRate: text("fx_rate"),
    fxRateAt: text("fx_rate_at"),
    lastActivityAt: text("last_activity_at"),
    archivedAt: text("archived_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("deals_company_id_idx").on(table.companyId),
    index("deals_owner_id_idx").on(table.ownerId),
    index("deals_stage_idx").on(table.stage),
    index("deals_expected_close_date_idx").on(table.expectedCloseDate),
    index("deals_last_activity_at_idx").on(table.lastActivityAt),
    index("deals_base_amount_idx").on(table.baseAmount),
    index("deals_currency_idx").on(table.currency),
    index("deals_archived_at_idx").on(table.archivedAt),
  ],
);

export type DealSelect = typeof deals.$inferSelect;
export type DealInsert = typeof deals.$inferInsert;
