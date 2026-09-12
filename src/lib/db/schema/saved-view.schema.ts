import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { FIELD_ENTITIES } from "./constants";

export const savedViews = sqliteTable(
  "saved_views",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID())
      .notNull(),
    entity: text("entity", { enum: FIELD_ENTITIES })
      .notNull(),
    name: text("name").notNull(),
    shared: integer("shared", { mode: "boolean" })
      .notNull()
      .default(false),
    filters: text("filters", { mode: "json" })
      .notNull(),
    ownerId: text("owner_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("saved_views_entity_owner_id_name_unique").on(table.entity, table.ownerId, table.name),
    index("saved_views_entity_shared_idx").on(table.entity, table.shared),
  ],
);

export type SavedViewSelect = typeof savedViews.$inferSelect;
export type SavedViewInsert = typeof savedViews.$inferInsert;
