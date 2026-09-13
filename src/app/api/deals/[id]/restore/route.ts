import { DealService } from "@services/deal.service";
import { withApi, type RouteContext } from "@/lib/server/api-handler";

export function POST(request: Request, context: RouteContext) {
  return withApi(request, async ({ db }) => Response.json(await new DealService(db).restore((await context.params).id)));
}
