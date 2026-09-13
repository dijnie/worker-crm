import { FieldService } from "@services/field.service";
import { withApi, readJson, type RouteContext } from "@/lib/server/api-handler";

export function PATCH(request: Request, context: RouteContext<{ id: string; optionId: string }>) {
  return withApi(request, async ({ db }) => {
    const { id, optionId } = await context.params;
    return Response.json(await new FieldService(db).updateOption(id, optionId, await readJson(request)));
  });
}
