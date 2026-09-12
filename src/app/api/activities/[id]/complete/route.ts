import { ActivityService } from "@services/activity.service";
import { withApi, readJson, type RouteContext } from "@/lib/server/api-handler";

export function POST(request: Request, context: RouteContext) {
  return withApi(request, async db => Response.json(await new ActivityService(db).completeTask((await context.params).id, await readJson(request))));
}
