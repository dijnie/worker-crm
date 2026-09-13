import { FieldService } from "@services/field.service";
import { withApi, readJson, type RouteContext } from "@/lib/server/api-handler";
import { fieldValueInput } from "@/lib/server/field-api-inputs";

export function PUT(request: Request, context: RouteContext) {
  return withApi(request, async ({ db }) => {
    const { entity, entityId, value } = fieldValueInput.parse(await readJson(request));
    return Response.json(await new FieldService(db).upsertValue((await context.params).id, entity, entityId, value));
  });
}
