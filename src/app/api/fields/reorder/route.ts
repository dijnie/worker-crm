import { FieldService } from "@services/field.service";
import { withApi, readJson } from "@/lib/server/api-handler";
import { reorderFieldsInput } from "@/lib/server/field-api-inputs";

export function POST(request: Request) {
  return withApi(request, async ({ db }) => {
    const input = reorderFieldsInput.parse(await readJson(request));
    return Response.json(await new FieldService(db).reorder(input));
  });
}
