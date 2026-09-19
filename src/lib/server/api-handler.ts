import { ZodError, type ZodIssue } from "zod/v3";
import { getAuthBaseUrl, requireRequestContext, type RequestContext } from "../auth/request-context";
import { ServiceError, translateDatabaseError } from "../utils/service-error";
import type { Page } from "../utils/validation";
import { reportRequestFailure } from "./error-reporting";
import { authorizeApiRequest } from "./api-permissions";
import { accountIdentity } from "../auth/request-context";
import { scopeRecord, setDatabaseAccess } from "./read-access";
import { readJsonBody } from "../http/json-body";
import { getRequestId } from "../http/request-metadata";
import { finalizeHttpResponse } from "../http/response";

export type RouteContext<T extends Record<string, string> = { id: string }> = {
  params: Promise<T> | T;
};

export async function withApi(request: Request, handler: (context: RequestContext) => Promise<Response>): Promise<Response> {
  const requestId = getRequestId(request);
  const finish = (response: Response) => finalizeHttpResponse(request, response);
  try {
    const context = await requireRequestContext(request.headers, requestId);
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
      if (request.headers.get("Origin") !== new URL(getAuthBaseUrl()).origin) {
        throw new ServiceError(403, "A same-origin request is required", "FORBIDDEN_ACTION");
      }
      const contentType = request.headers.get("Content-Type");
      if (contentType && contentType.split(";")[0].trim().toLowerCase() !== "application/json") {
        throw new ServiceError(415, "Expected application/json", "UNSUPPORTED_MEDIA_TYPE");
      }
    }
    const authorized = await authorizeApiRequest(request, context);
    setDatabaseAccess(authorized.db, accountIdentity(authorized));
    let response = await handler(authorized);
    const resource = new URL(request.url).pathname.split("/")[2];
    const entity = ({ companies: "company", contacts: "contact", deals: "deal" } as const)[resource as "companies" | "contacts" | "deals"];
    if (entity && response.status !== 204 && response.headers.get("content-type")?.includes("application/json")) {
      response = Response.json(scopeRecord(authorized.db, entity, await response.json()), { status: response.status, headers: response.headers });
    }
    response.headers.set("Cache-Control", "no-store");
    return finish(response);
  } catch (error) {
    let failure = error;
    try { translateDatabaseError(error); } catch (translated) { failure = translated; }
    const headers = { "Cache-Control": "no-store" };
    if (failure instanceof ZodError) {
      return finish(Response.json({ message: "Invalid request", code: "INVALID_REQUEST", issues: failure.issues.map(issueBody) }, { status: 400, headers }));
    }
    if (failure instanceof ServiceError) return finish(Response.json({ message: failure.message, code: failure.code }, { status: failure.status, headers }));
    return finish(reportRequestFailure(request, Response.json({ message: "Internal server error" }, { status: 500, headers }), "api_unexpected"));
  }
}

// A schema names its own failure through `params.code`; any other issue is
// identified by the validator's category so clients can translate it.
function issueBody(issue: ZodIssue) {
  const declared = issue.code === "custom" ? (issue.params as { code?: unknown } | undefined)?.code : undefined;
  return { path: issue.path, message: issue.message, code: typeof declared === "string" ? declared : issue.code };
}

export async function readJson(request: Request): Promise<unknown> {
  return readJsonBody(request);
}

export function readQuery(request: Request): Record<string, unknown> {
  const values: Record<string, unknown> = Object.create(null);
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(values, key)) throw new ServiceError(400, `Duplicate query parameter: ${key}`, "INVALID_QUERY");
    if (["archived", "includeArchived", "includeSummary", "includeFields", "includeLinks"].includes(key)) {
      if (value !== "true" && value !== "false") throw new ServiceError(400, `${key} must be true or false`, "INVALID_QUERY");
      values[key] = value === "true";
    } else if (["page", "limit", "facetPage", "facetLimit"].includes(key)) {
      if (!/^\d+$/.test(value)) throw new ServiceError(400, `${key} must be an integer`, "INVALID_QUERY");
      values[key] = Number(value);
    } else if (key === "filters") {
      if (value.length > 32768) throw new ServiceError(400, "Filters are too large", "INVALID_QUERY");
      try { values[key] = JSON.parse(value); }
      catch { throw new ServiceError(400, "Expected filters to be a JSON object", "INVALID_QUERY"); }
    } else values[key] = value;
  }
  return values;
}

export function pageResponse<T>(page: Page<T>): Response {
  return Response.json(page.items, { headers: {
    "X-Total-Count": String(page.total), "X-Page": String(page.page), "X-Limit": String(page.limit),
  } });
}
