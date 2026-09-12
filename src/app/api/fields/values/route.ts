import { FieldService } from "@services/field.service";
import { withApi, readQuery } from "@/lib/server/api-handler";
import { fieldValuesInput } from "@/lib/server/field-api-inputs";

export function GET(request: Request) {
  return withApi(request, async db => {
    const { entity, entityId } = fieldValuesInput.parse(readQuery(request));
    return Response.json(await new FieldService(db).getValues(entity, entityId));
  });
}
