import { openApiDocument } from "@/lib/openapi/document";

export function GET() {
  return Response.json(openApiDocument);
}
