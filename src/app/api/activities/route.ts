import { createActivityApiInput } from "@/lib/server/activity-api-inputs";
import { ActivityService } from "@services/activity.service";
import { withApi, readJson, readQuery, pageResponse } from "@/lib/server/api-handler";

export function GET(request: Request) {
  return withApi(request, async ({ db }) => pageResponse(await new ActivityService(db).list(readQuery(request))));
}

export function POST(request: Request) {
  return withApi(request, async ({ db, user }) => {
    const input = createActivityApiInput.parse(await readJson(request));
    return Response.json(await new ActivityService(db).create({ ...input, createdById: user.id }), { status: 201 });
  });
}
