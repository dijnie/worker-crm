import { ActivityService } from "@services/activity.service";
import { withApi, readJson, readQuery, pageResponse } from "@/lib/server/api-handler";

export function GET(request: Request) {
  return withApi(request, async db => pageResponse(await new ActivityService(db).list(readQuery(request))));
}

export function POST(request: Request) {
  return withApi(request, async db => Response.json(await new ActivityService(db).create(await readJson(request)), { status: 201 }));
}
