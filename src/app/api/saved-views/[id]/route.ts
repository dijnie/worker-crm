import { SavedViewService } from "@services/saved-view.service";
import { readJson, withApi, type RouteContext } from "@/lib/server/api-handler";
export function PATCH(request: Request, context: RouteContext) {
  return withApi(request, async ({ db, user }) => Response.json(await new SavedViewService(db).update(user.id, (await context.params).id, await readJson(request))));
}
export function DELETE(request: Request, context: RouteContext) {
  return withApi(request, async ({ db, user }) => {
    await new SavedViewService(db).delete(user.id, (await context.params).id);
    return new Response(null, { status: 204 });
  });
}
