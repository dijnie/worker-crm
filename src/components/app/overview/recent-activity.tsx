"use client";
import { useState } from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardPanel, CardPanelEmpty, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useAssigneeDirectory } from "../records/use-assignee-directory";
import { TimelineEntry } from "../timeline/timeline-entry";

const RECENT_QUERY = { limit: 10, includeLinks: true } as const;

export function RecentActivity() {
  const { api, invalidate } = useAppData();
  const feed = useAppQuery("activities:recent", RECENT_QUERY, signal => api.activities.list(RECENT_QUERY, { signal }));
  const directory = useAssigneeDirectory();
  const [result, setResult] = useState<{ message: string; error?: boolean } | null>(null);
  const now = new Date();
  return <Card className="min-w-0">
    <CardHeader>
      <CardTitle><h2>Recent activity</h2></CardTitle>
      <CardDescription>The latest 10 activities, ordered by creation time</CardDescription>
      <CardAction><Button type="button" variant="outline" size="sm" disabled={feed.loading || feed.refreshing} onClick={() => invalidate(["activities"])}>Refresh activity</Button></CardAction>
    </CardHeader>
    <CardPanel className="h-auto">
      {result && <p role={result.error ? "alert" : "status"} className={`px-4 pt-3 text-xs ${result.error ? "text-destructive" : "text-muted-foreground"}`}>{result.message}</p>}
      {!!directory.error && <div className="p-3"><Alert>
        <AlertDescription>Actor names could not load. Historical actor IDs remain visible.</AlertDescription>
        <AlertAction><Button type="button" variant="outline" size="sm" onClick={directory.refresh}>Retry actor names</Button></AlertAction>
      </Alert></div>}
      {directory.loading && <Skeleton className="mx-4 mt-3 h-3 w-32" />}
      {!!feed.error && <div className="p-3"><Alert variant="destructive">
        <AlertTitle>Recent activity could not load.</AlertTitle>
        <AlertDescription>{feed.error instanceof Error ? feed.error.message : "Please try again."}</AlertDescription>
        <AlertAction><Button type="button" variant="outline" size="sm" onClick={() => invalidate(["activities"])}>Retry activity</Button></AlertAction>
      </Alert></div>}
      {feed.loading && <div className="flex flex-col gap-3 p-4" aria-busy="true" aria-label="Loading recent activity">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>}
      {feed.refreshing && <p role="status" className="px-4 pt-3 text-xs text-muted-foreground">Refreshing recent activity…</p>}
      {feed.data?.items.length === 0 && <CardPanelEmpty>No activity yet. Activities logged on a company, contact, or deal will appear here.</CardPanelEmpty>}
      <div aria-label="Recent activity" className="divide-y px-4 [&_button]:min-h-11 [&_summary]:min-h-11">{feed.data?.items.map(activity => {
        const labels = Object.fromEntries(activity.links.map(link => [`${link.kind}:${link.id}`, `${link.name || `Unavailable ${link.kind} (${link.id})`}${link.archivedAt ? " (archived)" : ""}`]));
        return <TimelineEntry key={activity.id} activity={activity} now={now} directory={directory.data ?? []} labels={labels} headingLevel={3} onResult={(message, error) => setResult({ message, error })} />;
      })}</div>
    </CardPanel>
  </Card>;
}
