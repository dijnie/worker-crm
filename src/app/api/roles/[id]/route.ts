import { RoleService, roleDeleteInput } from "@services/role.service";
import { requireSystem } from "@/lib/auth/request-context";
import { readJson, withApi, type RouteContext } from "@/lib/server/api-handler";

export async function GET(request: Request, route: RouteContext) {
  return withApi(request, async context => {
    requireSystem(context);
    return Response.json(await new RoleService(context.db).get(context.user.id, (await route.params).id));
  });
}
export async function PATCH(request: Request, route: RouteContext) {
  return withApi(request, async context => {
    requireSystem(context);
    return Response.json(await new RoleService(context.db).update(context.user.id, (await route.params).id, await readJson(request)));
  });
}
export async function DELETE(request: Request, route: RouteContext) {
  return withApi(request, async context => {
    requireSystem(context);
    const { expectedRevision } = roleDeleteInput.parse(await readJson(request));
    await new RoleService(context.db).delete(context.user.id, (await route.params).id, expectedRevision);
    return new Response(null, { status: 204 });
  });
}
