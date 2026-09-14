import { RoleService } from "@services/role.service";
import { requireSystem } from "@/lib/auth/request-context";
import { readJson, withApi } from "@/lib/server/api-handler";

export async function GET(request: Request) {
  return withApi(request, async context => {
    requireSystem(context);
    return Response.json(await new RoleService(context.db).list(context.user.id));
  });
}
export async function POST(request: Request) {
  return withApi(request, async context => {
    requireSystem(context);
    return Response.json(await new RoleService(context.db).create(context.user.id, await readJson(request)), { status: 201 });
  });
}
