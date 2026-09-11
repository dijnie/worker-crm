import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { subscriptionFeatures } from "./subscription-feature.schema";

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

export const featuresRelations = relations(features, ({ many }) => ({
  subscriptionFeatures: many(subscriptionFeatures),
}));

export type FeatureSelect = typeof features.$inferSelect;
export type FeatureInsert = typeof features.$inferInsert;
