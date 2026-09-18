"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useEffect, useState } from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DashboardRow, StatGroup } from "@/components/ui/dashboard";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { overviewCurrencyUrl, parseOverviewCurrency } from "@/lib/overview-query";
import { currencyCode } from "@/lib/utils/validation";
import { useAppData, useAppQuery } from "../app-data-provider";
import {
  PageShell, PageShellActions, PageShellContent, PageShellDescription, PageShellHeader, PageShellHeading, PageShellTitle,
} from "../page-shell";
import { RECORD_OPEN_EVENT } from "../record-sheet/record-navigation";
import { PipelineSummary } from "./pipeline-summary";
import { RecentActivity } from "./recent-activity";

export function OverviewDashboard() {
  const { generation } = useAppData();
  return <OverviewSession key={generation} />;
}

function OverviewSession() {
  const { api, account } = useAppData();
  const canStats = (["company", "contact", "deal"] as const).some(entity => canPermission(account, entity, "read"));
  const canPipeline = canPermission(account, "deal", "read");
  const canActivity = canPermission(account, "activity", "read");
  // The workspace's stored reporting currency is the fallback for every view that
  // does not name one, so the first paint waits for it rather than assuming USD.
  const settings = useAppQuery("settings", {}, signal => api.settings.get({ signal }));
  const stored = settings.data?.reportingCurrency;
  const [currency, setCurrency] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!stored) return;
    const read = () => {
      try {
        const next = parseOverviewCurrency(window.location.search, stored);
        setCurrency(next); setDraft(next); setError("");
      } catch {
        setCurrency(stored); setDraft(stored);
        setError(`This link has an invalid currency. Showing ${stored}; enter a three-letter code to update it.`);
      }
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [stored]);
  return <PageShell>
    <PageShellHeader>
      <PageShellHeading>
        <PageShellTitle>Welcome back</PageShellTitle>
        <PageShellDescription>What the team has closed, what is still in play, and what needs you today.</PageShellDescription>
      </PageShellHeading>
      <PageShellActions className="col-span-full col-start-1 row-start-3 justify-self-start md:col-span-1 md:col-start-2 md:row-start-1 md:justify-self-end">
        {canPipeline && <form className="flex flex-col gap-1.5 md:items-end" noValidate onSubmit={event => {
          event.preventDefault();
          try {
            const selectedCurrency = currencyCode.parse(draft);
            const navigate = () => {
              const next = overviewCurrencyUrl(window.location.href, selectedCurrency);
              window.history.pushState({}, "", next);
              window.dispatchEvent(new PopStateEvent("popstate"));
            };
            // A deferred sheet decision must commit the URL and notify its readers together.
            const navigation = new CustomEvent(RECORD_OPEN_EVENT, { cancelable: true, detail: navigate });
            if (window.dispatchEvent(navigation) !== false) navigate();
          } catch { setError("Enter a three-letter currency code, such as USD or EUR."); }
        }}>
          <div className="flex flex-wrap items-end gap-2">
            <Field className="w-24" orientation="vertical">
              <FieldLabel htmlFor="overview-currency">Currency</FieldLabel>
              <Input id="overview-currency" name="currency" value={draft} disabled={currency === null} onChange={event => setDraft(event.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={`overview-currency-help${error ? " overview-currency-error" : ""}`} className="uppercase" />
            </Field>
            <Button type="submit" variant="contrast" disabled={currency === null}>Apply currency</Button>
          </div>
          <FieldDescription id="overview-currency-help">Values use this currency only. No conversion.</FieldDescription>
          {error && <Alert id="overview-currency-error" variant="destructive"><AlertTitle>{error}</AlertTitle></Alert>}
        </form>}
      </PageShellActions>
    </PageShellHeader>

    <PageShellContent>
      <OverviewBody currency={currency} canStats={canStats} canPipeline={canPipeline} canActivity={canActivity} />
    </PageShellContent>
  </PageShell>;
}

function OverviewBody({ currency, canStats, canPipeline, canActivity }: {
  currency: string | null; canStats: boolean; canPipeline: boolean; canActivity: boolean;
}) {
  if (!canStats) return canActivity ? <RecentActivity /> : null;
  if (currency === null) return <StatGroup>
    {Array.from({ length: 4 }).map((_, index) => <StatCard key={index} label={<Skeleton className="h-4 w-24" />} value={<Skeleton className="h-8 w-16" />} description={<Skeleton className="h-3 w-32" />} />)}
  </StatGroup>;
  return <OverviewStats currency={currency} canPipeline={canPipeline} canActivity={canActivity} />;
}

interface StatCell { name: string; label: string; description: string; value?: string | number }

function OverviewStats({ currency, canPipeline, canActivity }: { currency: string; canPipeline: boolean; canActivity: boolean }) {
  const { api, account } = useAppData();
  const stats = useAppQuery("stats", { currency }, signal => api.stats(currency, { signal }));
  const data = stats.data;
  const cells: StatCell[] = [];
  if (canPermission(account, "company", "read")) cells.push({ name: "totalCompanies", label: "Total companies", description: "Workspace total · active companies", value: data?.totalCompanies ?? undefined });
  if (canPermission(account, "contact", "read")) cells.push({ name: "totalContacts", label: "Total contacts", description: "Workspace total · active contacts", value: data?.totalContacts ?? undefined });
  if (canPermission(account, "deal", "read")) cells.push({ name: "openDeals", label: "Open deals", description: "Workspace total · all currencies", value: data?.openDeals ?? undefined });
  if (canPermission(account, "deal", "read")) cells.push({ name: "openDealValue", label: `Open deal value · ${currency}`, description: `Active open deals · ${currency} only`, value: data?.openDealValue != null ? `${data.currency} ${data.openDealValue}` : undefined });
  return <>
    <section aria-label="Workspace statistics" className="flex min-w-0 flex-col gap-3">
      {!!stats.error && <Alert variant="destructive">
        <AlertTitle>Workspace statistics could not load.</AlertTitle>
        <AlertDescription>{stats.error instanceof Error ? stats.error.message : "Please try again."}</AlertDescription>
        <AlertAction><Button type="button" variant="outline" size="sm" onClick={stats.refresh}>Retry statistics</Button></AlertAction>
      </Alert>}
      {(stats.loading || stats.refreshing) && <p role="status" className="text-xs text-muted-foreground">{stats.refreshing ? `Refreshing statistics for ${currency}…` : `Loading statistics for ${currency}…`}</p>}
      <StatGroup>
        {cells.map(cell => <StatCard
          key={cell.name}
          data-stat={cell.name}
          className="min-w-0"
          label={cell.label}
          description={cell.description}
          value={<dl className="contents">
            <dd className="[overflow-wrap:anywhere]">
              {cell.value !== undefined ? cell.value : stats.loading ? <Skeleton className="h-8 w-24" /> : <span className="text-base font-normal text-muted-foreground">Unavailable</span>}
            </dd>
          </dl>}
        />)}
      </StatGroup>
    </section>
    {canPipeline
      ? <DashboardRow split="even">
        <PipelineSummary currency={currency} pipeline={data?.pipeline ?? undefined} loading={stats.loading} />
        {canActivity && <RecentActivity />}
      </DashboardRow>
      : canActivity && <RecentActivity />}
  </>;
}
