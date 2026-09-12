import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { fieldDefinitions } from "./field-definition.schema";
import { companies } from "./company.schema";
import { contacts } from "./contact.schema";
import { deals } from "./deal.schema";
import { fieldOptions } from "./field-option.schema";

export const fieldValues = sqliteTable(
  "field_values",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID())
      .notNull(),
    fieldId: text("field_id")
      .notNull()
      .references(() => fieldDefinitions.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .references(() => companies.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .references(() => contacts.id, { onDelete: "cascade" }),
    dealId: text("deal_id")
      .references(() => deals.id, { onDelete: "cascade" }),
    text: text("text"),
    number: text("number"),
    date: text("date"),
    bool: integer("bool", { mode: "boolean" }),
    optionId: text("option_id")
      .references(() => fieldOptions.id, { onDelete: "set null" }),
    userId: text("user_id"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("field_values_field_id_company_id_unique").on(table.fieldId, table.companyId),
    uniqueIndex("field_values_field_id_contact_id_unique").on(table.fieldId, table.contactId),
    uniqueIndex("field_values_field_id_deal_id_unique").on(table.fieldId, table.dealId),
    index("field_values_field_id_text_idx").on(table.fieldId, table.text),
    index("field_values_field_id_number_idx").on(table.fieldId, table.number),
    index("field_values_field_id_date_idx").on(table.fieldId, table.date),
    index("field_values_company_id_idx").on(table.companyId),
    index("field_values_contact_id_idx").on(table.contactId),
    index("field_values_deal_id_idx").on(table.dealId),
    index("field_values_option_id_idx").on(table.optionId),
    index("field_values_user_id_idx").on(table.userId),
  ],
);

export type FieldValueSelect = typeof fieldValues.$inferSelect;
export type FieldValueInsert = typeof fieldValues.$inferInsert;
