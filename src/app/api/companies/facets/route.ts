import { CompanyService } from "@services/company.service";
import { readQuery, withApi } from "@/lib/server/api-handler";

export function GET(request: Request) {
  return withApi(request, async ({ db }) => Response.json(await new CompanyService(db).facets(readQuery(request))));
}
