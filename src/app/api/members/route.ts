import { MemberService } from "@services/member.service";
import { pageResponse, readQuery, withApi } from "@/lib/server/api-handler";
import { requireSystem } from "@/lib/auth/request-context";

export async function GET(request: Request) {
  return withApi(request, async context => {
    requireSystem(context);
    return pageResponse(await new MemberService(context.db).list(context.user.id, readQuery(request)));
  });
}
