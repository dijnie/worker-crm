import { FieldService } from "@services/field.service";
import { withApi, type RouteContext } from "@/lib/server/api-handler";

export function POST(request: Request, context: RouteContext) {
  return withApi(request, async db => Response.json(await new FieldService(db).restoreDefinition((await context.params).id)));
}
