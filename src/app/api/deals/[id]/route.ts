import { DealService } from "@services/deal.service";
import { withApi, readJson, type RouteContext } from "@/lib/server/api-handler";

export function GET(request: Request, context: RouteContext) {
  return withApi(request, async db => Response.json(await new DealService(db).getById((await context.params).id)));
}

export function PATCH(request: Request, context: RouteContext) {
  return withApi(request, async db => Response.json(await new DealService(db).update((await context.params).id, await readJson(request))));
}

export function DELETE(request: Request, context: RouteContext) {
  return withApi(request, async db => Response.json(await new DealService(db).archive((await context.params).id)));
}
