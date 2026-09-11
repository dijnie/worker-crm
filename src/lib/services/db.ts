import { env } from "cloudflare:workers";
import { createDatabase, type Database } from "@/lib/db";

export interface AppEnv {
  DB: D1Database;
  API_TOKEN?: string;
}

export function getAppEnv(): AppEnv {
  return env as unknown as AppEnv;
}

export function getDB(): D1Database {
  return getAppEnv().DB;
}

export function getDatabase(): Database {
  return createDatabase(getDB());
}

export function getApiToken(): string {
  return getAppEnv().API_TOKEN || "";
}
