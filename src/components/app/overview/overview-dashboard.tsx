"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { overviewCurrencyUrl, parseOverviewCurrency } from "@/lib/overview-query";
import { useAppData, useAppQuery } from "../app-data-provider";
import { RECORD_OPEN_EVENT } from "../record-sheet/record-navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { PipelineSummary } from "./pipeline-summary";
import { RecentActivity } from "./recent-activity";
import { StatCard } from "./stat-card";

export function OverviewDashboard() {
  const { generation } = useAppData();
  return <OverviewSession key={generation} />;
}

function OverviewSession() {
  const { account } = useAppData();
  const canStats = (["company", "contact", "deal"] as const).some(entity => canPermission(account, entity, "read"));
  const [currency, setCurrency] = useState<string | null>(null);
  const [draft, setDraft] = useState("USD");
  const [error, setError] = useState("");
  useEffect(() => {
    const read = () => {
      try {
        const next = parseOverviewCurrency(window.location.search);
        setCurrency(next); setDraft(next); setError("");
      } catch {
        setCurrency("USD"); setDraft("USD");
        setError("This link has an invalid currency. Showing USD; enter a three-letter code to update it.");
      }
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  return <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-start justify-between gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your workspace at a glance.</p>
      </div>
      {canPermission(account, "deal", "read") && <form className="w-full space-y-2 sm:w-auto" noValidate onSubmit={event => {
        event.preventDefault();
        try {
          const selectedCurrency = parseOverviewCurrency(new URLSearchParams({ currency: draft }).toString());
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
        <label htmlFor="overview-currency" className="block text-sm font-medium">Currency</label>
        <div className="flex gap-2">
          <Input id="overview-currency" name="currency" value={draft} disabled={currency === null} onChange={event => setDraft(event.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={`overview-currency-help${error ? " overview-currency-error" : ""}`} className="min-h-11 w-28 text-base uppercase md:text-base" />
          <Button type="submit" variant="outline" className="min-h-11" disabled={currency === null}>Apply currency</Button>
        </div>
        <p id="overview-currency-help" className="text-xs text-muted-foreground">Values use this currency only. No conversion.</p>
        {error && <p id="overview-currency-error" role="alert" className="max-w-sm text-sm text-destructive">{error}</p>}
      </form>}
    </header>
    {canStats && (currency === null ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="min-w-0 rounded-lg border bg-card p-4 sm:p-6 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div> : <OverviewStats currency={currency} />)}
    {canPermission(account, "activity", "read") && <RecentActivity />}
  </div>;
}

function OverviewStats({ currency }: { currency: string }) {
  const { api, account } = useAppData();
  const stats = useAppQuery("stats", { currency }, signal => api.stats(currency, { signal }));
  const data = stats.data;
  return <div className="space-y-8">
    <section aria-label="Workspace statistics" className="space-y-4">
      {!!stats.error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <p className="text-sm">Workspace statistics could not load. {stats.error instanceof Error ? stats.error.message : "Please try again."}</p>
        <Button type="button" variant="outline" className="min-h-11" onClick={stats.refresh}>Retry statistics</Button>
      </div>}
      {(stats.loading || stats.refreshing) && <p role="status" className="text-sm text-muted-foreground">{stats.refreshing ? `Refreshing statistics for ${currency}…` : `Loading statistics for ${currency}…`}</p>}
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canPermission(account, "company", "read") && <StatCard name="totalCompanies" label="Total companies" description="Workspace total · active companies" value={data?.totalCompanies ?? undefined} loading={stats.loading} />}
        {canPermission(account, "contact", "read") && <StatCard name="totalContacts" label="Total contacts" description="Workspace total · active contacts" value={data?.totalContacts ?? undefined} loading={stats.loading} />}
        {canPermission(account, "deal", "read") && <StatCard name="openDeals" label="Open deals" description="Workspace total · all currencies" value={data?.openDeals ?? undefined} loading={stats.loading} />}
        {canPermission(account, "deal", "read") && <StatCard name="openDealValue" label={`Open deal value · ${currency}`} description={`Active open deals · ${currency} only`} value={data?.openDealValue != null ? `${data.currency} ${data.openDealValue}` : undefined} loading={stats.loading} />}
      </dl>
    </section>
    {canPermission(account, "deal", "read") && <PipelineSummary currency={currency} pipeline={data?.pipeline ?? undefined} loading={stats.loading} />}
  </div>;
}
