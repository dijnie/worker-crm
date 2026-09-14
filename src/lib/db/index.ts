import { env } from "cloudflare:workers";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Database = DrizzleD1Database<typeof schema> & { $client: D1Database };

export function createDatabase(d1: D1Database): Database {
  return drizzle(d1, { schema });
}

export function getDb(): Database {
  const d1 = (env as unknown as { DB: D1Database }).DB;
  return createDatabase(d1);
}

export * from "./schema";
