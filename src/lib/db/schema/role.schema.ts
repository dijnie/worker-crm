import { sql } from "drizzle-orm";
import { check, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isSystem: integer("is_system", { mode: "boolean" }).default(false).notNull(),
  revision: integer("revision").default(0).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, table => [
  uniqueIndex("roles_name_unique").on(sql`lower(${table.name})`),
  uniqueIndex("roles_single_system_unique").on(table.isSystem).where(sql`${table.isSystem} = 1`),
  check("roles_system_check", sql`${table.isSystem} in (0, 1)`),
  check("roles_revision_check", sql`${table.revision} >= 0`),
]);

export const rolePermissions = sqliteTable("role_permissions", {
  roleId: text("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  entity: text("entity", { enum: ["company", "contact", "deal", "activity"] }).notNull(),
  action: text("action", { enum: ["read", "create", "update", "archive", "restore", "complete", "delete"] }).notNull(),
}, table => [
  primaryKey({ columns: [table.roleId, table.entity, table.action] }),
  check("role_permissions_catalog_check", sql`(${table.entity} in ('company', 'contact', 'deal') and ${table.action} in ('read', 'create', 'update', 'archive', 'restore')) or (${table.entity} = 'activity' and ${table.action} in ('read', 'create', 'complete', 'delete'))`),
]);

// Successful assertions insert nothing. Failed checks abort the enclosing D1 batch.
export const requestAuthorizationGuard = sqliteTable("request_authorization_guard", {
  allowed: integer("allowed").notNull(),
}, table => [check("request_authorization_denied", sql`${table.allowed} = 1`)]);
