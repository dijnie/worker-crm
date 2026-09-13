import { stageApiInput } from "@/lib/server/deal-api-inputs";
import { DealService } from "@services/deal.service";
import { withApi, readJson, type RouteContext } from "@/lib/server/api-handler";

export function POST(request: Request, context: RouteContext) {
  return withApi(request, async ({ db, user }) => {
    const input = stageApiInput.parse(await readJson(request));
    return Response.json(await new DealService(db).setStage((await context.params).id, { ...input, actorId: user.id }));
  });
}
