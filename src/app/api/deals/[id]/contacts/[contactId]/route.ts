import { DealContactService } from "@services/deal-contact.service";
import { withApi, readJson, type RouteContext } from "@/lib/server/api-handler";

type Context = RouteContext<{ id: string; contactId: string }>;
export function PATCH(request: Request, context: Context) {
  return withApi(request, async ({ db }) => {
    const { id, contactId } = await context.params;
    return Response.json(await new DealContactService(db).updateRole(id, contactId, await readJson(request)));
  });
}

export function DELETE(request: Request, context: Context) {
  return withApi(request, async ({ db }) => {
    const { id, contactId } = await context.params;
    await new DealContactService(db).detach(id, contactId);
    return new Response(null, { status: 204 });
  });
}
