"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { overviewCurrencyUrl, parseOverviewCurrency } from "@/lib/overview-query";
import { useAppData, useAppQuery } from "../app-data-provider";
import { RECORD_OPEN_EVENT } from "../record-sheet/record-navigation";
import { PipelineSummary } from "./pipeline-summary";
import { RecentActivity } from "./recent-activity";
import { StatCard } from "./stat-card";

export function OverviewDashboard() {
  const { generation } = useAppData();
  return <OverviewSession key={generation} />;
}

function OverviewSession() {
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
      <form className="w-full space-y-2 sm:w-auto" noValidate onSubmit={event => {
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
      </form>
    </header>
    {currency === null ? <p role="status" className="text-sm text-muted-foreground">Loading overview…</p> : <OverviewStats currency={currency} />}
    <RecentActivity />
  </div>;
}

function OverviewStats({ currency }: { currency: string }) {
  const { api } = useAppData();
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
        <StatCard name="totalCompanies" label="Total companies" description="Workspace total · active companies" value={data?.totalCompanies} loading={stats.loading} />
        <StatCard name="totalContacts" label="Total contacts" description="Workspace total · active contacts" value={data?.totalContacts} loading={stats.loading} />
        <StatCard name="openDeals" label="Open deals" description="Workspace total · all currencies" value={data?.openDeals} loading={stats.loading} />
        <StatCard name="openDealValue" label={`Open deal value · ${currency}`} description={`Active open deals · ${currency} only`} value={data ? `${data.currency} ${data.openDealValue}` : undefined} loading={stats.loading} />
      </dl>
    </section>
    <PipelineSummary currency={currency} pipeline={data?.pipeline} loading={stats.loading} />
  </div>;
}
