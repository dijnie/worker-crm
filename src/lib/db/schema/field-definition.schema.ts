import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { FIELD_ENTITIES, FIELD_TYPES } from "./constants";

export const fieldDefinitions = sqliteTable(
  "field_definitions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID())
      .notNull(),
    entity: text("entity", { enum: FIELD_ENTITIES })
      .notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type", { enum: FIELD_TYPES })
      .notNull(),
    agentFilled: integer("agent_filled", { mode: "boolean" })
      .notNull()
      .default(true),
    agentBrief: text("agent_brief"),
    required: integer("required", { mode: "boolean" })
      .notNull()
      .default(false),
    showOnSheet: integer("show_on_sheet", { mode: "boolean" })
      .notNull()
      .default(true),
    showOnTable: integer("show_on_table", { mode: "boolean" })
      .notNull()
      .default(false),
    showOnFilter: integer("show_on_filter", { mode: "boolean" })
      .notNull()
      .default(false),
    position: integer("position")
      .notNull(),
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
    uniqueIndex("field_definitions_entity_key_unique").on(table.entity, table.key),
    index("field_definitions_entity_position_idx").on(table.entity, table.position),
  ],
);

export type FieldDefinitionSelect = typeof fieldDefinitions.$inferSelect;
export type FieldDefinitionInsert = typeof fieldDefinitions.$inferInsert;
