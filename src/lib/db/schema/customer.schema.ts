import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { customerSubscriptions } from "./customer-subscription.schema";

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const customersRelations = relations(customers, ({ many }) => ({
  customerSubscriptions: many(customerSubscriptions),
}));

export type CustomerSelect = typeof customers.$inferSelect;
export type CustomerInsert = typeof customers.$inferInsert;
