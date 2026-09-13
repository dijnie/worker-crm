import { DealService } from "@services/deal.service";
import { withApi, readJson, readQuery, pageResponse, type RouteContext } from "@/lib/server/api-handler";

export function GET(request: Request) {
  return withApi(request, async ({ db }) => pageResponse(await new DealService(db).list(readQuery(request))));
}

export function POST(request: Request) {
  return withApi(request, async ({ db }) => Response.json(await new DealService(db).create(await readJson(request)), { status: 201 }));
}
