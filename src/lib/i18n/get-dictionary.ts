import type { AppLocale } from "./config";
import { dictionaries, type AppDictionary } from "./dictionary";

export type { AppDictionary } from "./dictionary";

export function getDictionary(locale: AppLocale): AppDictionary {
  return dictionaries[locale];
}
