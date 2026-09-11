import { relations, sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { customers } from "./customer.schema";

export const subscriptions = sqliteTable("subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const features = sqliteTable("features", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const subscriptionFeatures = sqliteTable(
  "subscription_features",
  {
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    featureId: integer("feature_id")
      .notNull()
      .references(() => features.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.subscriptionId, table.featureId] }),
  ],
);

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

export const subscriptionsRelations = relations(subscriptions, ({ many }) => ({
  features: many(subscriptionFeatures),
  customerSubscriptions: many(customerSubscriptions),
}));

export const featuresRelations = relations(features, ({ many }) => ({
  subscriptionFeatures: many(subscriptionFeatures),
}));

export const subscriptionFeaturesRelations = relations(
  subscriptionFeatures,
  ({ one }) => ({
    subscription: one(subscriptions, {
      fields: [subscriptionFeatures.subscriptionId],
      references: [subscriptions.id],
    }),
    feature: one(features, {
      fields: [subscriptionFeatures.featureId],
      references: [features.id],
    }),
  }),
);

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

export type SubscriptionSelect = typeof subscriptions.$inferSelect;
export type SubscriptionInsert = typeof subscriptions.$inferInsert;
export type FeatureSelect = typeof features.$inferSelect;
export type FeatureInsert = typeof features.$inferInsert;
export type CustomerSubscriptionSelect =
  typeof customerSubscriptions.$inferSelect;
export type CustomerSubscriptionInsert =
  typeof customerSubscriptions.$inferInsert;
