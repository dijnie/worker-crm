import { SavedViewService } from "@services/saved-view.service";
import { readJson, readQuery, withApi } from "@/lib/server/api-handler";
export function GET(request: Request) {
  return withApi(request, async ({ db, user }) => Response.json(await new SavedViewService(db).list(user.id, readQuery(request))));
}
export function POST(request: Request) {
  return withApi(request, async ({ db, user }) => Response.json(await new SavedViewService(db).create(user.id, await readJson(request)), { status: 201 }));
}
