import { headers } from "next/headers";
import { cache } from "react";
import { getDb } from "@/lib/db";
import type { AppLocale } from "./config";
import { getDictionary } from "./get-dictionary";
import { readWorkspaceLocale } from "./stored-locale";

// The language is a stored workspace setting, so a page that shows it must be
// rendered per request. Reading the request headers opts the route out of
// build-time prerendering, where the stored value does not exist yet.
export const getWorkspaceLocale = cache(async (): Promise<AppLocale> => {
  await headers();
  return readWorkspaceLocale(getDb());
});

export async function getWorkspaceDictionary() {
  return getDictionary(await getWorkspaceLocale());
}
