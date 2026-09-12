import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ACTIVITY_TYPES } from "./constants";
import { companies } from "./company.schema";
import { contacts } from "./contact.schema";
import { deals } from "./deal.schema";

export const activities = sqliteTable(
  "activities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID())
      .notNull(),
    type: text("type", { enum: ACTIVITY_TYPES })
      .notNull(),
    subject: text("subject"),
    body: text("body"),
    occurredAt: text("occurred_at"),
    dueAt: text("due_at"),
    completedAt: text("completed_at"),
    companyId: text("company_id")
      .references(() => companies.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .references(() => contacts.id, { onDelete: "cascade" }),
    dealId: text("deal_id")
      .references(() => deals.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").notNull(),
    meta: text("meta", { mode: "json" }),
    emailThreadId: text("email_thread_id")
      .unique(),
    calendarEventId: text("calendar_event_id")
      .unique(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("activities_company_id_created_at_idx").on(table.companyId, table.createdAt),
    index("activities_deal_id_created_at_idx").on(table.dealId, table.createdAt),
    index("activities_contact_id_created_at_idx").on(table.contactId, table.createdAt),
    index("activities_due_at_idx").on(table.dueAt),
    index("activities_created_by_id_idx").on(table.createdById),
  ],
);

export type ActivitySelect = typeof activities.$inferSelect;
export type ActivityInsert = typeof activities.$inferInsert;
