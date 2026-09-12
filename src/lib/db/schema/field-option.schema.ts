import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { fieldDefinitions } from "./field-definition.schema";

export const fieldOptions = sqliteTable(
  "field_options",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID())
      .notNull(),
    fieldId: text("field_id")
      .notNull()
      .references(() => fieldDefinitions.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position")
      .notNull(),
    archivedAt: text("archived_at"),
  },
  (table) => [
    index("field_options_field_id_position_idx").on(table.fieldId, table.position),
  ],
);

export type FieldOptionSelect = typeof fieldOptions.$inferSelect;
export type FieldOptionInsert = typeof fieldOptions.$inferInsert;
