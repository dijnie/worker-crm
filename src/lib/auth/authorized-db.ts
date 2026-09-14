import { drizzle } from "drizzle-orm/d1";
import type { Database } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { ServiceError } from "@/lib/utils/service-error";
import type { Permission } from "./permissions";

export interface AuthorizationActor {
  userId: string;
  sessionId: string;
  accessVersion: number;
  membershipRevision: number;
  roleId: string | null;
  roleRevision: number | null;
}
export type AuthorizationRequirements = readonly Permission[] | "system";

/** Every statement runs with its authorization assertion in the same D1 transaction. */
export function createAuthorizedDatabase(binding: D1Database, actor: AuthorizationActor, requirements: AuthorizationRequirements): Database {
  const required = requirements === "system" ? [] : requirements;
  const predicates = required.flatMap(permission => permission.action === "read" ? [permission] : [permission, { entity: permission.entity, action: "read" }]);
  const grants = requirements === "system" ? "r.is_system = 1" : `(r.is_system = 1 OR (${predicates.length ? predicates.map(() =>
    "EXISTS (SELECT 1 FROM role_permissions p WHERE p.role_id = r.id AND p.entity = ? AND p.action = ?)"
  ).join(" AND ") : "1"}))`;
  const assertion = () => binding.prepare(`INSERT INTO request_authorization_guard (allowed)
    SELECT 0 WHERE NOT EXISTS (
      SELECT 1 FROM singleton_membership m
      JOIN user u ON u.id = m.user_id
      JOIN session s ON s.user_id = m.user_id
      LEFT JOIN roles r ON r.id = m.role_id
      WHERE m.user_id = ? AND s.id = ? AND m.status = 'active' AND u.email_verified = 1
        AND s.expires_at > ? AND s.access_version = ? AND m.access_version = ?
        AND m.revision = ? AND m.role_id IS ? AND r.revision IS ? AND ${grants}
    )`).bind(actor.userId, actor.sessionId, Date.now(), actor.accessVersion, actor.accessVersion,
      actor.membershipRevision, actor.roleId, actor.roleRevision, ...predicates.flatMap(permission => [permission.entity, permission.action]));
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  const execute = async (statements: D1PreparedStatement[]) => {
    try { return (await binding.batch<Record<string, unknown>>([assertion(), ...statements])).slice(1); }
    catch (error) {
      for (let cause: unknown = error, depth = 0; cause instanceof Error && depth < 8; depth++) {
        if (cause.message.includes("request_authorization_denied")) {
          throw new ServiceError(403, "Access changed; refresh and try again", "FORBIDDEN_ACTION");
        }
        cause = (cause as Error & { cause?: unknown }).cause;
      }
      throw error;
    }
  };
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const wrapped = {
      bind: (...values: unknown[]) => wrap(statement.bind(...values)),
      all: async () => (await execute([statement]))[0],
      run: async () => (await execute([statement]))[0],
      raw: async (options?: { columnNames?: boolean }) => {
        const result = (await execute([statement]))[0];
        const rows = result.results.map(row => Object.values(row));
        return options?.columnNames && result.results.length ? [Object.keys(result.results[0]), ...rows] : rows;
      },
      first: async (column?: string) => {
        const row = (await execute([statement]))[0].results[0];
        if (!row) return null;
        if (column && !Object.hasOwn(row, column)) throw new Error("D1 column not found");
        return column ? row[column] : row;
      },
    } as D1PreparedStatement;
    originals.set(wrapped, statement);
    return wrapped;
  };
  const guarded = {
    // A subquery assigns distinct output names to duplicate join columns. This keeps
    // D1's object-form batch results lossless when Drizzle expects positional rows.
    prepare: (query: string) => wrap(binding.prepare(/^\s*(select|with)\b/i.test(query)
      ? `SELECT * FROM (${query.replace(/;\s*$/, "")})` : query)),
    batch: async (statements: D1PreparedStatement[]) => execute(statements.map(statement => {
      const original = originals.get(statement);
      if (!original) throw new Error("Authorized batches require statements prepared by the same database");
      return original;
    })),
  } as D1Database;
  return drizzle(guarded, { schema });
}
