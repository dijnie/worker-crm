import { StatsService } from "@services/stats.service";
import { withApi, readQuery } from "@/lib/server/api-handler";

export function GET(request: Request) {
  return withApi(request, async ({ db }) => Response.json(await new StatsService(db).getStats(readQuery(request))));
}
