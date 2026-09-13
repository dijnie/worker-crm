import { DealService } from "@services/deal.service";
import { readQuery, withApi } from "@/lib/server/api-handler";

export function GET(request: Request) {
  return withApi(request, async ({ db }) => Response.json(await new DealService(db).facets(readQuery(request))));
}
