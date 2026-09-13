import { DealContactService } from "@services/deal-contact.service";
import { withApi, readJson, type RouteContext } from "@/lib/server/api-handler";

export function POST(request: Request, context: RouteContext) {
  return withApi(request, async ({ db }) => {
    const { id } = await context.params;
    return Response.json(await new DealContactService(db).attach(id, await readJson(request)), { status: 201 });
  });
}
