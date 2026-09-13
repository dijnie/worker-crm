import { ActivityService } from "@services/activity.service";
import { withApi, readQuery } from "@/lib/server/api-handler";

export function GET(request: Request) {
  return withApi(request, async ({ db }) => Response.json(await new ActivityService(db).counts(readQuery(request))));
}
