import { FieldService } from "@services/field.service";
import { withApi, readJson, type RouteContext } from "@/lib/server/api-handler";

export function GET(request: Request, context: RouteContext) {
  return withApi(request, async ({ db }) => Response.json(await new FieldService(db).getDefinition((await context.params).id)));
}

export function PATCH(request: Request, context: RouteContext) {
  return withApi(request, async ({ db }) => Response.json(await new FieldService(db).updateDefinition((await context.params).id, await readJson(request))));
}

export function DELETE(request: Request, context: RouteContext) {
  return withApi(request, async ({ db }) => Response.json(await new FieldService(db).archiveDefinition((await context.params).id)));
}
