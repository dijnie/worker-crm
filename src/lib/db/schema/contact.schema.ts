import { sql } from "drizzle-orm";
import {
  index,
  sqliteTable,
  text,
  type AnySQLiteColumn,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { ENRICHMENT_STATUSES, RECORD_SOURCES } from "./constants";
import { companies } from "./company.schema";

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID())
      .notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
    seniority: text("seniority"),
    function: text("function"),
    linkedinUrl: text("linkedin_url"),
    twitterUrl: text("twitter_url"),
    githubUrl: text("github_url"),
    imageUrl: text("image_url"),
    socialsCheckedAt: text("socials_checked_at"),
    enrichmentStatus: text("enrichment_status", { enum: ENRICHMENT_STATUSES })
      .notNull()
      .default("PENDING"),
    enrichedAt: text("enriched_at"),
    enrichmentError: text("enrichment_error"),
    companyId: text("company_id")
      .references((): AnySQLiteColumn => companies.id, { onDelete: "set null" }),
    ownerId: text("owner_id"),
    source: text("source", { enum: RECORD_SOURCES })
      .notNull()
      .default("MANUAL"),
    lastActivityAt: text("last_activity_at"),
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
    uniqueIndex("contacts_email_unique").on(table.email)
      .where(sql`${table.archivedAt} IS NULL`),
    index("contacts_company_id_idx").on(table.companyId),
    index("contacts_owner_id_idx").on(table.ownerId),
    index("contacts_last_activity_at_idx").on(table.lastActivityAt),
    index("contacts_archived_at_idx").on(table.archivedAt),
  ],
);

export type ContactSelect = typeof contacts.$inferSelect;
export type ContactInsert = typeof contacts.$inferInsert;
