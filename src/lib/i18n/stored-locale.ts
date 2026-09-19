import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { singletonWorkspace } from "@/lib/db/schema";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "./config";

/**
 * The interface language stored for the workspace. Every page and every auth
 * email asks for it, so a failed read must cost the language, not the page: a
 * database that is unreachable or not yet migrated still serves sign-in in the
 * default language.
 */
export async function readWorkspaceLocale(db: Database): Promise<AppLocale> {
  try {
    const [row] = await db.select({ locale: singletonWorkspace.locale }).from(singletonWorkspace)
      .where(eq(singletonWorkspace.id, "shared"));
    return isAppLocale(row?.locale) ? row.locale : DEFAULT_LOCALE;
  } catch {
    // Diagnostic metadata only; raw database errors never enter logs.
    console.error(JSON.stringify({ event: "workspace_locale_unreadable", fallback: DEFAULT_LOCALE }));
    return DEFAULT_LOCALE;
  }
}
