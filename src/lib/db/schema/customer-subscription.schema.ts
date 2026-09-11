import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { customers } from "./customer.schema";
import { subscriptions } from "./subscription.schema";

export const customerSubscriptions = sqliteTable("customer_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  subscriptionId: integer("subscription_id")
    .notNull()
    .references(() => subscriptions.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("active"),
  subscriptionStartsAt: text("subscription_starts_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  subscriptionEndsAt: text("subscription_ends_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const customerSubscriptionsRelations = relations(
  customerSubscriptions,
  ({ one }) => ({
    customer: one(customers, {
      fields: [customerSubscriptions.customerId],
      references: [customers.id],
    }),
    subscription: one(subscriptions, {
      fields: [customerSubscriptions.subscriptionId],
      references: [subscriptions.id],
    }),
  }),
);

export type CustomerSubscriptionSelect =
  typeof customerSubscriptions.$inferSelect;
export type CustomerSubscriptionInsert =
  typeof customerSubscriptions.$inferInsert;
