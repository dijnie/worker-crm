import { ActivityService } from "@services/activity.service";
import { withApi, type RouteContext } from "@/lib/server/api-handler";

export function GET(request: Request, context: RouteContext) {
  return withApi(request, async db => Response.json(await new ActivityService(db).getById((await context.params).id)));
}

export function DELETE(request: Request, context: RouteContext) {
  return withApi(request, async db => {
    await new ActivityService(db).delete((await context.params).id);
    return new Response(null, { status: 204 });
  });
}
