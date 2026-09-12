import { CompanyService } from "@services/company.service";
import { withApi, type RouteContext } from "@/lib/server/api-handler";

export function POST(request: Request, context: RouteContext) {
  return withApi(request, async db => Response.json(await new CompanyService(db).restore((await context.params).id)));
}
