import { env } from "cloudflare:workers";

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

export function getApiToken(): string {
  return getAppEnv().API_TOKEN || "";
}
