import { z } from "zod";
import { FIELD_ENTITIES } from "@/lib/db/schema/constants";
import { FieldService } from "@services/field.service";
import { identifier } from "@/lib/utils/validation";
import { withApi, readQuery } from "@/lib/server/api-handler";

const query = z.object({ entity: z.enum(FIELD_ENTITIES), entityId: identifier }).strict();

export function GET(request: Request) {
  return withApi(request, async db => {
    const { entity, entityId } = query.parse(readQuery(request));
    return Response.json(await new FieldService(db).getValues(entity, entityId));
  });
}
