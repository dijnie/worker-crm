"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, type ActivityView } from "@/lib/api";
import { activityAnchor, groupActivityDays, uniqueVisibleActivities, type TimelineActivity } from "@/lib/activity-presentation";
import { errorMessage } from "@/lib/i18n/error-message";
import type { Page } from "@/lib/utils/validation";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useDictionary, useFormat } from "../i18n-provider";
import type { RecordRef } from "../record-sheet/record-navigation";
import { useAssigneeDirectory } from "../records/use-assignee-directory";
import { TimelineEntry } from "./timeline-entry";
import { ActivityComposer } from "./activity-composer";
import type { DirtyChange } from "../record-sheet/inline-field";

const VIEWS = ["all", "history", "notes", "upcoming", "done", "email", "meetings"] as const satisfies readonly ActivityView[];
const LIMIT = 25;

/** Observe individual pages in the workspace cache without maintaining a second row cache. */
function useTimelinePages(record: RecordRef, view: ActivityView | null) {
  const { api, store, generation } = useAppData();
  const version = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const [pageCount, setPageCount] = useState(1);
  const scope = `${generation}:${record.kind}:${record.id}:${view}`;
  const previous = useRef<{ scope: string; pages: Map<string, Page<TimelineActivity>> }>({ scope, pages: new Map() });
  if (previous.current.scope !== scope) previous.current = { scope, pages: new Map() };
  const queries = view ? Array.from({ length: pageCount }, (_, index) => ({ ...activityAnchor(record), view, page: index + 1, limit: LIMIT })) : [];
  const keys = queries.map(query => store.key("activities", query));
  const keySignature = JSON.stringify(keys);
  useEffect(() => {
    const releases = (JSON.parse(keySignature) as string[]).map(key => store.retain(key));
    return () => releases.forEach(release => release());
  }, [store, keySignature]);
  useEffect(() => {
    const requestKeys = JSON.parse(keySignature) as string[];
    for (let index = 0; index < requestKeys.length; index++) {
      const key = requestKeys[index];
      if (!store.state(key)) void store.load("activities", key, signal => api.activities.list({ ...activityAnchor(record), view: view!, page: index + 1, limit: LIMIT }, { signal }));
    }
  }, [api, store, record.kind, record.id, view, generation, version, keySignature]);
  const states = keys.map(key => {
    const state = store.state<Page<TimelineActivity>>(key);
    if (state?.data) previous.current.pages.set(key, state.data);
    return { ...state, loading: !state || state.loading, data: state?.data ?? (state?.error ? undefined : previous.current.pages.get(key)) };
  });
  const first = states[0]?.data;
  const items = uniqueVisibleActivities(states.flatMap(state => state.data?.items ?? []));
  const loading = states.some(state => state.loading);
  const error = states.find(state => state.error)?.error;
  return {
    items, error, loading, refreshing: loading && items.length > 0,
    loadingMore: states.length > 1 && !!first && !!states.at(-1)?.loading && !states.at(-1)?.data,
    total: first?.total, hasMore: !!first && pageCount * LIMIT < first.total,
    loadMore: () => setPageCount(count => count + 1),
    retry: () => store.invalidate(["activities"]),
  };
}

export interface TimelinePanelProps { canCreateActivity?: boolean; record: RecordRef; labels?: Record<string, string>; onDirtyChange?: DirtyChange }
export function TimelinePanel(props: TimelinePanelProps) {
  const { generation, account } = useAppData();
  if (!canPermission(account, "activity", "read")) return null;
  return <TimelineSession key={`${generation}:${props.record.kind}:${props.record.id}`} {...props} />;
}

function TimelineSession({ record, labels, onDirtyChange, canCreateActivity = false }: TimelinePanelProps) {
  const { api, account } = useAppData();
  const { crm, timeline } = useDictionary();
  const copy = timeline.panel;
  const format = useFormat();
  const [view, setView] = useState<ActivityView>("all");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ message: string; error?: boolean } | null>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const onResult = (message: string, error?: boolean) => setResult({ message, error });
  useEffect(() => {
    if (!result) return;
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === document.body) tabs.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [result, view]);
  const directory = useAssigneeDirectory();
  const counts = useAppQuery("activities", { counts: true, ...activityAnchor(record) }, signal => api.activities.counts(activityAnchor(record), { signal }));
  return <section aria-label={copy.sectionAriaLabel} className="flex flex-col gap-3">
    {canCreateActivity && canPermission(account, "activity", "create") && <ActivityComposer record={record} onDirtyChange={onDirtyChange} onCreated={() => {
      setRevision(value => value + 1);
      onResult(copy.activityCreated);
    }} />}
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium">{copy.heading}</h2>
      <Button type="button" size="sm" variant="ghost" onClick={counts.refresh}>{copy.refresh}</Button>
    </div>
    {result && <p role={result.error ? "alert" : "status"} className={`text-xs ${result.error ? "text-destructive" : "text-muted-foreground"}`}>{result.message}</p>}
    <Tabs value={view} onValueChange={next => setView(next as ActivityView)} className="flex-col gap-3">
      <TabsList ref={tabs} aria-label={copy.viewsAriaLabel} variant="line" className="w-full flex-wrap justify-start gap-x-4 gap-y-1 border-b">
        {VIEWS.map(value => <TabsTrigger key={value} value={value} className="flex-none">
          {copy.views[value]} <span className="text-muted-foreground tabular-nums">{counts.data?.[value] !== undefined ? format.number(counts.data[value]) : counts.error ? crm.empty : copy.pendingCount}</span>
        </TabsTrigger>)}
      </TabsList>
      {counts.error ? <RequestError error={counts.error} label={copy.countsFailed} retry={counts.refresh} /> : counts.refreshing && <p role="status" className="text-xs text-muted-foreground">{copy.countsRefreshing}</p>}
      {!!directory.error && <RequestError error={directory.error} label={copy.directoryFailed} retry={directory.refresh} />}
      <TabsContent value={view} className="rounded-md focus-visible:ring-2 focus-visible:ring-ring/50">
        <TimelineView key={`${view}:${revision}`} record={record} labels={labels} view={view} onResult={onResult} directory={directory.data ?? []} />
      </TabsContent>
    </Tabs>
  </section>;
}

function RequestError({ error, label, retry }: { error: unknown; label: string; retry: () => void }) {
  const dictionary = useDictionary();
  const { common, timeline } = dictionary;
  return <p role="alert" className="text-xs text-destructive">{label} {error instanceof ApiError ? errorMessage(error, dictionary) : timeline.panel.requestFailed} <Button type="button" variant="link" className="h-auto px-0" onClick={retry}>{common.retry}</Button></p>;
}

function TimelineDay({ date, rows, record, labels, now, directory, onResult }: {
  date: Date | null; rows: TimelineActivity[]; record: RecordRef; labels?: Record<string, string>;
  now: Date; directory: readonly { id: string; name: string }[]; onResult: (message: string, error?: boolean) => void;
}) {
  const { timeline } = useDictionary();
  const format = useFormat();
  return <section className="flex flex-col">
    <h3 className="py-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">{date ? format.longDay(date) : timeline.panel.dateUnavailable}</h3>
    <div className="divide-y">{rows.map(activity => <TimelineEntry key={activity.id} activity={activity} record={record} labels={labels} now={now} directory={directory} onResult={onResult} />)}</div>
  </section>;
}

function TimelineView({ record, labels, view, directory, onResult }: TimelinePanelProps & { view: ActivityView; directory: readonly { id: string; name: string }[]; onResult: (message: string, error?: boolean) => void }) {
  const { timeline } = useDictionary();
  const copy = timeline.panel;
  const now = new Date();
  const main = useTimelinePages(record, view);
  const pinned = useTimelinePages(record, view === "all" ? "upcoming" : null);
  const pinnedIds = new Set(pinned.items.map(item => item.id));
  const history = view === "all" ? uniqueVisibleActivities(main.items, pinnedIds) : main.items;
  return <div className="flex flex-col gap-5">
    {view === "all" && <section aria-label={copy.pinnedSectionAriaLabel} className="rounded-lg border bg-muted/20 p-3">
      <h3 className="text-sm font-medium">{copy.upcomingHeading}</h3>
      {!!pinned.error && <RequestError error={pinned.error} label={copy.upcomingFailed} retry={pinned.retry} />}
      {pinned.loading && <p role="status" className="text-xs text-muted-foreground">{pinned.loadingMore ? copy.upcomingLoadingMore : pinned.refreshing ? copy.upcomingRefreshing : copy.upcomingLoading}</p>}
      <div className="flex flex-col">{groupActivityDays(pinned.items).map(group => <TimelineDay key={group.key} date={group.date} rows={group.items} record={record} labels={labels} now={now} directory={directory} onResult={onResult} />)}</div>
      {!pinned.loading && !pinned.error && pinned.total === 0 && <p className="text-xs text-muted-foreground">{copy.noUpcoming}</p>}
      {pinned.hasMore && <Button type="button" size="sm" variant="outline" className="mt-2 self-start" disabled={pinned.loading || !!pinned.error} onClick={pinned.loadMore}>{copy.loadMoreUpcoming}</Button>}
    </section>}
    {!!main.error && <RequestError error={main.error} label={copy.timelineFailed} retry={main.retry} />}
    {main.loading && <p role="status" className="text-xs text-muted-foreground">{main.loadingMore ? copy.loadingMoreActivities : main.refreshing ? copy.refreshingTimeline : copy.loadingTimeline}</p>}
    <div className="flex flex-col">{groupActivityDays(history).map(group => <TimelineDay key={group.key} date={group.date} rows={group.items} record={record} labels={labels} now={now} directory={directory} onResult={onResult} />)}</div>
    {!main.loading && !main.error && main.total === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{copy.noActivitiesInView}</p>}
    {view === "all" && !main.loading && !main.error && !!main.total && !history.length && <p className="text-xs text-muted-foreground">{copy.shownInUpcoming}</p>}
    {main.hasMore && <Button type="button" variant="outline" className="self-start" disabled={main.loading || !!main.error} onClick={main.loadMore}>{view === "upcoming" ? copy.loadMoreTasks : copy.loadOlderActivities}</Button>}
  </div>;
}
