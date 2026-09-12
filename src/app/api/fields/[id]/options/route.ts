import { FieldService } from "@services/field.service";
import { withApi, readJson, readQuery, type RouteContext } from "@/lib/server/api-handler";
import { z } from "zod";

const query = z.object({ includeArchived: z.boolean().default(false) }).strict();

export function GET(request: Request, context: RouteContext) {
  return withApi(request, async db => {
    const input = query.parse(readQuery(request));
    return Response.json(await new FieldService(db).listOptions((await context.params).id, input.includeArchived));
  });
}

export function POST(request: Request, context: RouteContext) {
  return withApi(request, async db => Response.json(await new FieldService(db).createOption((await context.params).id, await readJson(request)), { status: 201 }));
}
