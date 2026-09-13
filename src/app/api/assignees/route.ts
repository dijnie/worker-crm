import { AssigneeService } from "@services/assignee.service";
import { pageResponse, readQuery, withApi } from "@/lib/server/api-handler";
export function GET(request: Request) {
  return withApi(request, async ({ db }) => pageResponse(await new AssigneeService(db).list(readQuery(request))));
}
