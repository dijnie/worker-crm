"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useAssigneeDirectory } from "../records/use-assignee-directory";
import { TimelineEntry } from "../timeline/timeline-entry";

const RECENT_QUERY = { limit: 10, includeLinks: true } as const;

export function RecentActivity() {
  const { api, invalidate } = useAppData();
  const feed = useAppQuery("activities:recent", RECENT_QUERY, signal => api.activities.list(RECENT_QUERY, { signal }));
  const refresh = () => invalidate(["activities"]);
  const directory = useAssigneeDirectory();
  const [result, setResult] = useState<{ message: string; error?: boolean } | null>(null);
  const now = new Date();
  return <section aria-labelledby="overview-recent-heading" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="overview-recent-heading" className="text-lg font-semibold">Recent activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">The latest 10 activities, ordered by creation time.</p>
      </div>
      <Button type="button" variant="ghost" className="min-h-11" disabled={feed.loading || feed.refreshing} onClick={refresh}>Refresh activity</Button>
    </div>
    {result && <p role={result.error ? "alert" : "status"} className={`text-sm ${result.error ? "text-destructive" : "text-muted-foreground"}`}>{result.message}</p>}
    {!!directory.error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm">
      <p>Actor names could not load. Historical actor IDs remain visible.</p>
      <Button type="button" variant="outline" className="min-h-11" onClick={directory.refresh}>Retry actor names</Button>
    </div>}
    {directory.loading && <Skeleton className="h-3 w-32" />}
    {!!feed.error && <div role="alert" className="space-y-3 rounded-lg border bg-card p-4">
      <p className="text-sm">Recent activity could not load. {feed.error instanceof Error ? feed.error.message : "Please try again."}</p>
      <Button type="button" variant="outline" className="min-h-11" onClick={refresh}>Retry activity</Button>
    </div>}
    {feed.loading && <div className="space-y-3" aria-busy="true" aria-label="Loading recent activity">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>}
    {feed.refreshing && <p role="status" className="py-4 text-sm text-muted-foreground">Refreshing recent activity…</p>}
    {feed.data?.items.length === 0 && <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">No activity yet. Activities logged on a company, contact, or deal will appear here.</div>}
    <div aria-label="Recent activity" className="space-y-3 [&_button]:min-h-11 [&_summary]:min-h-11">{feed.data?.items.map(activity => {
      const labels = Object.fromEntries(activity.links.map(link => [`${link.kind}:${link.id}`, `${link.name || `Unavailable ${link.kind} (${link.id})`}${link.archivedAt ? " (archived)" : ""}`]));
      return <TimelineEntry key={activity.id} activity={activity} now={now} directory={directory.data ?? []} labels={labels} headingLevel={3} onResult={(message, error) => setResult({ message, error })} />;
    })}</div>
  </section>;
}
