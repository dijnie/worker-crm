import { sql, type SQLWrapper } from "drizzle-orm";

/** Literal contains with SQLite's ASCII case folding, without D1's LIKE pattern byte limit. */
export function literalContains(value: SQLWrapper, search: string) {
  return sql`instr(lower(${value}), lower(${search})) > 0`;
}
