import { FieldService } from "@services/field.service";
import { withApi, readJson, readQuery, type RouteContext } from "@/lib/server/api-handler";
import { z } from "zod";
import { FIELD_ENTITIES } from "@/lib/db/schema/constants";

const query = z.object({ entity: z.enum(FIELD_ENTITIES), includeArchived: z.boolean().default(false) }).strict();

export function GET(request: Request) {
  return withApi(request, async db => {
    const input = query.parse(readQuery(request));
    return Response.json(await new FieldService(db).listDefinitions(input.entity, input.includeArchived));
  });
}

export function POST(request: Request) {
  return withApi(request, async db => Response.json(await new FieldService(db).createDefinition(await readJson(request)), { status: 201 }));
}
