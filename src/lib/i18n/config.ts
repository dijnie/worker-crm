export const APP_LOCALES = ["en", "vi"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (APP_LOCALES as readonly string[]).includes(value);
}

// The BCP 47 tag handed to Intl formatters for each interface language.
const INTL_LOCALES: Record<AppLocale, string> = { en: "en-US", vi: "vi-VN" };

export function intlLocale(locale: AppLocale): string {
  return INTL_LOCALES[locale];
}
