import { relations, sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { subscriptions } from "./subscription.schema";
import { features } from "./feature.schema";

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

export type SubscriptionFeatureSelect =
  typeof subscriptionFeatures.$inferSelect;
export type SubscriptionFeatureInsert =
  typeof subscriptionFeatures.$inferInsert;
