import apiEndpoints from "../api-endpoints";
import { getRequestId } from "../http/request-metadata";

type FailureCategory = "api_unexpected" | "auth_unexpected" | "email_delivery_failed";

const authRoutes = [
  "/api/auth/sign-up/email", "/api/auth/sign-in/email", "/api/auth/sign-out",
  "/api/auth/get-session", "/api/auth/verify-email", "/api/auth/send-verification-email",
  "/api/auth/request-password-reset", "/api/auth/reset-password", "/api/auth/reset-password/:token",
];
const routes = [...new Set([...apiEndpoints.map(({ path }) => path), ...authRoutes])]
  // Prefer static routes such as fields/values over fields/:id.
  .sort((a, b) => a.split(":").length - b.split(":").length)
  .map(template => ({ template, segments: template.split("/") }));
const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function routeTemplate(request: Request): string {
  const segments = new URL(request.url).pathname.split("/");
  return routes.find(route => route.segments.length === segments.length && route.segments.every((part, index) =>
    part.startsWith(":") ? segments[index].length > 0 : part === segments[index],
  ))?.template ?? "unmatched";
}

/** Accept only diagnostic metadata; raw errors and request contents must never enter logs. */
export function reportRequestFailure(request: Request, response: Response, category: FailureCategory): Response {
  if (response.status < 500) return response;
  try {
    const requestId = getRequestId(request);
    response.headers.set("X-Request-Id", requestId);
    console.error(JSON.stringify({
      event: "request_failure", requestId, route: routeTemplate(request),
      method: methods.has(request.method) ? request.method : "OTHER", status: response.status, category,
    }));
  } catch {
    // Diagnostics must not replace the business response if logging is unavailable.
  }
  return response;
}
