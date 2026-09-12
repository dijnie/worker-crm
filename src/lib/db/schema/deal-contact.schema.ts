import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { deals } from "./deal.schema";
import { contacts } from "./contact.schema";

export const dealContacts = sqliteTable(
  "deal_contacts",
  {
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    role: text("role"),
  },
  (table) => [
    primaryKey({ columns: [table.dealId, table.contactId] }),
    index("deal_contacts_contact_id_idx").on(table.contactId),
  ],
);

export type DealContactSelect = typeof dealContacts.$inferSelect;
export type DealContactInsert = typeof dealContacts.$inferInsert;
