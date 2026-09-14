import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth.schema";
import { roles } from "./role.schema";

export const singletonWorkspace = sqliteTable("singleton_workspace", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [check("singleton_workspace_id_check", sql`${table.id} = 'shared'`)]);

export const singletonMembership = sqliteTable("singleton_membership", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "restrict" }),
  roleId: text("role_id").references(() => roles.id, { onDelete: "restrict" }),
  status: text("status", { enum: ["active", "revoked"] }).default("active").notNull(),
  revision: integer("revision").default(0).notNull(),
  accessVersion: integer("access_version").default(0).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
}, (table) => [
  index("singleton_membership_status_idx").on(table.status),
  index("singleton_membership_role_idx").on(table.roleId),
  check("singleton_membership_status_check", sql`${table.status} in ('active', 'revoked')`),
  check("singleton_membership_revision_check", sql`${table.revision} >= 0`),
  check("singleton_membership_access_version_check", sql`${table.accessVersion} >= 0`),
]);
