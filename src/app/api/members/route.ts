import { MemberService } from "@services/member.service";
import { pageResponse, readQuery, withApi } from "@/lib/server/api-handler";
import { requireOwner } from "@/lib/auth/request-context";

export async function GET(request: Request) {
  return withApi(request, async context => {
    requireOwner(context);
    return pageResponse(await new MemberService(context.db).list(context.user.id, readQuery(request)));
  });
}
