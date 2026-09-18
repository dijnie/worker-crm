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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { useEffect, useState } from "react";
import { useAppData, useAppQuery } from "../app-data-provider";

export function ReportingCurrencyForm() {
  const { api, invalidate } = useAppData();
  const settings = useAppQuery("settings", {}, signal => api.settings.get({ signal }));
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (settings.data) setDraft(settings.data.reportingCurrency);
  }, [settings.data]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const stored = settings.data;
    if (!stored || pending) return;
    setPending(true);
    setError("");
    setConfirmation("");
    try {
      const next = await api.settings.update({
        reportingCurrency: draft,
        expectedRevision: stored.revision,
      });
      invalidate(["settings"]);
      setConfirmation(`Reporting currency saved as ${next.reportingCurrency}.`);
    } catch (failure) {
      // A stale revision means someone else changed it first. Reload so the
      // editor shows the value that actually won, then let the user retry.
      if (failure instanceof ApiError && failure.status === 409) {
        setError("The reporting currency changed while you were editing. The stored value is shown; apply it again.");
        invalidate(["settings"]);
      } else {
        setError(failure instanceof Error ? failure.message : "The reporting currency could not be saved.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Card role="region" aria-label="Reporting currency settings">
      <CardHeader>
        <CardTitle>Reporting currency</CardTitle>
        <CardDescription>
          Totals on the overview use this currency only. No conversion.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-col gap-3">
        {settings.loading ? (
          <Skeleton className="h-8 w-40" />
        ) : settings.error ? (
          <Alert variant="destructive">
            <AlertTitle>Workspace settings are unavailable</AlertTitle>
            <AlertDescription>
              The stored reporting currency could not be read.
            </AlertDescription>
            <Button type="button" variant="outline" size="sm" onClick={settings.refresh}>
              Retry
            </Button>
          </Alert>
        ) : (
          <form className="flex flex-col items-start gap-3" noValidate onSubmit={save}>
            <Field className="w-40" orientation="vertical">
              <FieldLabel htmlFor="reporting-currency">Reporting currency</FieldLabel>
              <Input
                id="reporting-currency"
                name="reportingCurrency"
                value={draft}
                disabled={pending}
                onChange={event => setDraft(event.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!error}
                className="uppercase"
              />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save currency"}
            </Button>
            {error && (
              <p role="alert" className="text-destructive text-xs">
                {error}
              </p>
            )}
            {confirmation && (
              <p role="status" className="text-muted-foreground text-xs">
                {confirmation}
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
