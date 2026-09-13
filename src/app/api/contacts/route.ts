import { ContactService } from "@services/contact.service";
import { withApi, readJson, readQuery, pageResponse, type RouteContext } from "@/lib/server/api-handler";

export function GET(request: Request) {
  return withApi(request, async ({ db }) => pageResponse(await new ContactService(db).list(readQuery(request))));
}

export function POST(request: Request) {
  return withApi(request, async ({ db }) => Response.json(await new ContactService(db).create(await readJson(request)), { status: 201 }));
}
