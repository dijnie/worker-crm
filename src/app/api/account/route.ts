import { accountIdentity } from "@/lib/auth/request-context";
import { withApi } from "@/lib/server/api-handler";

export async function GET(request: Request) {
  return withApi(request, async context => Response.json(accountIdentity(context)));
}
