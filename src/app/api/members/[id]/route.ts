import { MemberService, memberMutationInput } from "@services/member.service";
import { readJson, withApi, type RouteContext } from "@/lib/server/api-handler";
import { requireSystem } from "@/lib/auth/request-context";

export async function PATCH(request: Request, route: RouteContext) {
  return withApi(request, async context => {
    requireSystem(context);
    const { id } = await route.params;
    const input = memberMutationInput.parse(await readJson(request));
    const service = new MemberService(context.db);
    const result = input.action === "change-role"
      ? await service.changeRole(context.user.id, id, input.expectedRevision, input.roleId)
      : await service[input.action](context.user.id, id, input.expectedRevision);
    return Response.json(result);
  });
}
