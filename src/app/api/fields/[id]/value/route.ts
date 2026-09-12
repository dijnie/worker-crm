import { z } from "zod";
import { FIELD_ENTITIES } from "@/lib/db/schema/constants";
import { FieldService } from "@services/field.service";
import { identifier } from "@/lib/utils/validation";
import { withApi, readJson, type RouteContext } from "@/lib/server/api-handler";

const input = z.object({ entity: z.enum(FIELD_ENTITIES), entityId: identifier, value: z.unknown() }).strict()
  .refine(body => Object.hasOwn(body, "value"), { message: "Value is required", path: ["value"] });

export function PUT(request: Request, context: RouteContext) {
  return withApi(request, async db => {
    const { entity, entityId, value } = input.parse(await readJson(request));
    return Response.json(await new FieldService(db).upsertValue((await context.params).id, entity, entityId, value));
  });
}
