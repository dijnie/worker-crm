import { WorkspaceService } from "@services/workspace.service";
import { requireSystem } from "@/lib/auth/request-context";
import { readJson, withApi } from "@/lib/server/api-handler";

export async function GET(request: Request) {
  return withApi(request, async context => {
    return Response.json(await new WorkspaceService(context.db).get());
  });
}

export async function PATCH(request: Request) {
  return withApi(request, async context => {
    requireSystem(context);
    return Response.json(await new WorkspaceService(context.db).update(context.user.id, await readJson(request)));
  });
}
