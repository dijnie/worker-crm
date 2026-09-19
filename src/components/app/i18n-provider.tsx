"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AppLocale } from "@/lib/i18n/config";
import { getDictionary, type AppDictionary } from "@/lib/i18n/get-dictionary";
import { createFormat, type AppFormat } from "@/lib/ui/format";

interface I18nValue {
  locale: AppLocale;
  dictionary: AppDictionary;
  format: AppFormat;
}

const I18nContext = createContext<I18nValue | null>(null);

// Dictionaries hold functions for interpolated copy, and functions cannot be
// passed from a server component. The server sends only the locale; the client
// picks the matching dictionary from its own bundle.
export function I18nProvider({ locale, children }: { locale: AppLocale; children: ReactNode }) {
  const value = useMemo<I18nValue>(
    () => ({ locale, dictionary: getDictionary(locale), format: createFormat(locale) }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useDictionary must be used inside I18nProvider");
  return value;
}

export function useDictionary(): AppDictionary {
  return useI18n().dictionary;
}

export function useLocale(): AppLocale {
  return useI18n().locale;
}

export function useFormat(): AppFormat {
  return useI18n().format;
}
