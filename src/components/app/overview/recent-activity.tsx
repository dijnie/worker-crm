"use client";
import { useState } from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardPanel, CardPanelEmpty, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/i18n/error-message";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useDictionary } from "../i18n-provider";
import { useAssigneeDirectory } from "../records/use-assignee-directory";
import { TimelineEntry } from "../timeline/timeline-entry";

const RECENT_QUERY = { limit: 10, includeLinks: true } as const;

export function RecentActivity() {
  const { api, invalidate } = useAppData();
  const dictionary = useDictionary();
  const { crm, overview } = dictionary;
  const copy = overview.recentActivity;
  const feed = useAppQuery("activities:recent", RECENT_QUERY, signal => api.activities.list(RECENT_QUERY, { signal }));
  const directory = useAssigneeDirectory();
  const [result, setResult] = useState<{ message: string; error?: boolean } | null>(null);
  const now = new Date();
  return <Card className="min-w-0">
    <CardHeader>
      <CardTitle><h2>{copy.title}</h2></CardTitle>
      <CardDescription>{copy.description}</CardDescription>
      <CardAction><Button type="button" variant="outline" size="sm" disabled={feed.loading || feed.refreshing} onClick={() => invalidate(["activities"])}>{copy.refresh}</Button></CardAction>
    </CardHeader>
    <CardPanel className="h-auto">
      {result && <p role={result.error ? "alert" : "status"} className={`px-4 pt-3 text-xs ${result.error ? "text-destructive" : "text-muted-foreground"}`}>{result.message}</p>}
      {!!directory.error && <div className="p-3"><Alert>
        <AlertDescription>{copy.actorNamesFailed}</AlertDescription>
        <AlertAction><Button type="button" variant="outline" size="sm" onClick={directory.refresh}>{copy.retryActorNames}</Button></AlertAction>
      </Alert></div>}
      {directory.loading && <Skeleton className="mx-4 mt-3 h-3 w-32" />}
      {!!feed.error && <div className="p-3"><Alert variant="destructive">
        <AlertTitle>{copy.loadFailedTitle}</AlertTitle>
        <AlertDescription>{feed.error instanceof ApiError ? errorMessage(feed.error, dictionary) : overview.retryFallback}</AlertDescription>
        <AlertAction><Button type="button" variant="outline" size="sm" onClick={() => invalidate(["activities"])}>{copy.retryActivity}</Button></AlertAction>
      </Alert></div>}
      {feed.loading && <div className="flex flex-col gap-3 p-4" aria-busy="true" aria-label={copy.loadingAriaLabel}>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>}
      {feed.refreshing && <p role="status" className="px-4 pt-3 text-xs text-muted-foreground">{copy.refreshing}</p>}
      {feed.data?.items.length === 0 && <CardPanelEmpty>{copy.empty}</CardPanelEmpty>}
      <div aria-label={copy.listAriaLabel} className="divide-y px-4 [&_button]:min-h-11 [&_summary]:min-h-11">{feed.data?.items.map(activity => {
        const labels = Object.fromEntries(activity.links.map(link => {
          const entityLower = crm.entities[link.kind.toUpperCase() as "COMPANY" | "CONTACT" | "DEAL"].lower;
          const name = link.name || copy.unavailableLink(entityLower, link.id);
          return [`${link.kind}:${link.id}`, link.archivedAt ? copy.archived(name) : name];
        }));
        return <TimelineEntry key={activity.id} activity={activity} now={now} directory={directory.data ?? []} labels={labels} headingLevel={3} onResult={(message, error) => setResult({ message, error })} />;
      })}</div>
    </CardPanel>
  </Card>;
}
