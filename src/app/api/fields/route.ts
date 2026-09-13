import { FieldService } from "@services/field.service";
import { withApi, readJson, readQuery } from "@/lib/server/api-handler";
import { fieldListInput } from "@/lib/server/field-api-inputs";

export function GET(request: Request) {
  return withApi(request, async ({ db }) => {
    const input = fieldListInput.parse(readQuery(request));
    return Response.json(await new FieldService(db).listDefinitions(input.entity, input.includeArchived));
  });
}

export function POST(request: Request) {
  return withApi(request, async ({ db }) => Response.json(await new FieldService(db).createDefinition(await readJson(request)), { status: 201 }));
}
