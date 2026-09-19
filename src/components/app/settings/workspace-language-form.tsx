"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { APP_LOCALES, isAppLocale, type AppLocale } from "@/lib/i18n/config";
import { errorMessage } from "@/lib/i18n/error-message";
import { useEffect, useState } from "react";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useDictionary } from "../i18n-provider";
import { selectClass } from "../records/record-picker";

export function WorkspaceLanguageForm() {
  const { api, invalidate } = useAppData();
  const dictionary = useDictionary();
  const { common, settings: copy } = dictionary;
  const settings = useAppQuery("settings", {}, signal => api.settings.get({ signal }));
  const [draft, setDraft] = useState<AppLocale | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (settings.data) setDraft(settings.data.locale);
  }, [settings.data]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const stored = settings.data;
    if (!stored || !draft || pending) return;
    setPending(true);
    setError("");
    try {
      await api.settings.update({ locale: draft, expectedRevision: stored.revision });
      // The language is resolved on the server for the whole document, so a
      // reload is what makes server-rendered and client copy agree.
      window.location.reload();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        setError(copy.language.conflict);
        invalidate(["settings"]);
      } else {
        setError(failure instanceof ApiError ? errorMessage(failure, dictionary) : copy.language.failed);
      }
      setPending(false);
    }
  }

  return (
    <Card role="region" aria-label={copy.language.regionLabel}>
      <CardHeader>
        <CardTitle>{copy.language.title}</CardTitle>
        <CardDescription>{copy.language.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-col gap-3">
        {settings.loading ? (
          <Skeleton className="h-8 w-40" />
        ) : settings.error ? (
          <Alert variant="destructive">
            <AlertTitle>{copy.unavailableTitle}</AlertTitle>
            <AlertDescription>{copy.language.unavailable}</AlertDescription>
            <Button type="button" variant="outline" size="sm" onClick={settings.refresh}>
              {common.retry}
            </Button>
          </Alert>
        ) : (
          <form className="flex flex-col items-start gap-3" noValidate onSubmit={save}>
            <Field className="w-40" orientation="vertical">
              <FieldLabel htmlFor="workspace-language">{copy.language.label}</FieldLabel>
              <select
                id="workspace-language"
                name="locale"
                className={selectClass}
                value={draft ?? ""}
                disabled={pending}
                aria-invalid={!!error}
                onChange={event => { if (isAppLocale(event.target.value)) setDraft(event.target.value); }}
              >
                {APP_LOCALES.map(locale => (
                  <option key={locale} value={locale} lang={locale}>{common.languageNames[locale]}</option>
                ))}
              </select>
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? common.saving : copy.language.submit}
            </Button>
            {error && (
              <p role="alert" className="text-destructive text-xs">
                {error}
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
