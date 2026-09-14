import { getRequestId } from "./request-metadata";
import { applySecurityHeaders } from "./security-headers";

export function finalizeHttpResponse(request: Request, response: Response): Response {
  const result = applySecurityHeaders(response, request);
  result.headers.set("X-Request-Id", getRequestId(request));
  return result;
}
