import { openApiDocument } from "@/lib/openapi/document";
import { finalizeHttpResponse } from "@/lib/http/response";

export function GET(request: Request) {
  return finalizeHttpResponse(request, Response.json(openApiDocument));
}
