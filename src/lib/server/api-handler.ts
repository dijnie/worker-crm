import { ZodError } from "zod";
import { getApiToken, getDb, type Database } from "../db";
import { ServiceError, translateDatabaseError } from "../utils/service-error";
import type { Page } from "../utils/validation";
import { validateApiToken } from "./api-auth";

export type RouteContext<T extends Record<string, string> = { id: string }> = {
  params: Promise<T> | T;
};

export async function withApi(request: Request, handler: (db: Database) => Promise<Response>): Promise<Response> {
  if (!validateApiToken(request, getApiToken())) {
    return Response.json({ message: "Invalid API token" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const response = await handler(getDb());
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    let failure = error;
    try { translateDatabaseError(error); } catch (translated) { failure = translated; }
    const headers = { "Cache-Control": "no-store" };
    if (failure instanceof ZodError) {
      return Response.json({ message: "Invalid request", issues: failure.issues.map(({ path, message }) => ({ path, message })) }, { status: 400, headers });
    }
    if (failure instanceof ServiceError) return Response.json({ message: failure.message }, { status: failure.status, headers });
    return Response.json({ message: "Internal server error" }, { status: 500, headers });
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try { return await request.json(); }
  catch { throw new ServiceError(400, "Expected a valid JSON body"); }
}

export function readQuery(request: Request): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(values, key)) throw new ServiceError(400, `Duplicate query parameter: ${key}`);
    if (["archived", "includeArchived"].includes(key)) {
      if (value !== "true" && value !== "false") throw new ServiceError(400, `${key} must be true or false`);
      values[key] = value === "true";
    } else if (["page", "limit"].includes(key)) {
      if (!/^\d+$/.test(value)) throw new ServiceError(400, `${key} must be an integer`);
      values[key] = Number(value);
    } else values[key] = value;
  }
  return values;
}

export function pageResponse<T>(page: Page<T>): Response {
  return Response.json(page.items, { headers: {
    "X-Total-Count": String(page.total), "X-Page": String(page.page), "X-Limit": String(page.limit),
  } });
}
