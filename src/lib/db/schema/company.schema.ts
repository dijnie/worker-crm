import { sql } from "drizzle-orm";
import {
  index,
  sqliteTable,
  text,
  type AnySQLiteColumn,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { ENRICHMENT_STATUSES, RECORD_SOURCES } from "./constants";
import { contacts } from "./contact.schema";

export const companies = sqliteTable(
  "companies",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID())
      .notNull(),
    name: text("name").notNull(),
    domain: text("domain"),
    website: text("website"),
    description: text("description"),
    logoUrl: text("logo_url"),
    logoDarkUrl: text("logo_dark_url"),
    iconUrl: text("icon_url"),
    iconDarkUrl: text("icon_dark_url"),
    iconTone: text("icon_tone"),
    brandColor: text("brand_color"),
    industry: text("industry"),
    subIndustry: text("sub_industry"),
    city: text("city"),
    stateCode: text("state_code"),
    country: text("country"),
    countryCode: text("country_code"),
    phone: text("phone"),
    email: text("email"),
    linkedinUrl: text("linkedin_url"),
    twitterUrl: text("twitter_url"),
    githubUrl: text("github_url"),
    pricingUrl: text("pricing_url"),
    careersUrl: text("careers_url"),
    ownerId: text("owner_id"),
    primaryContactId: text("primary_contact_id")
      .unique()
      .references((): AnySQLiteColumn => contacts.id, { onDelete: "set null" }),
    enrichmentStatus: text("enrichment_status", { enum: ENRICHMENT_STATUSES })
      .notNull()
      .default("PENDING"),
    enrichedAt: text("enriched_at"),
    enrichmentError: text("enrichment_error"),
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
    uniqueIndex("companies_domain_unique").on(table.domain)
      .where(sql`${table.archivedAt} IS NULL`),
    index("companies_owner_id_idx").on(table.ownerId),
    index("companies_name_idx").on(table.name),
    index("companies_last_activity_at_idx").on(table.lastActivityAt),
    index("companies_archived_at_idx").on(table.archivedAt),
  ],
);

export type CompanySelect = typeof companies.$inferSelect;
export type CompanyInsert = typeof companies.$inferInsert;
