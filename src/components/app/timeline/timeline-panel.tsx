"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import type { ActivityView } from "@/lib/api";
import { activityAnchor, groupActivityDays, uniqueVisibleActivities, type TimelineActivity } from "@/lib/activity-presentation";
import type { Page } from "@/lib/utils/validation";
import { useAppData, useAppQuery } from "../app-data-provider";
import type { RecordRef } from "../record-sheet/record-navigation";
import { useAssigneeDirectory } from "../records/use-assignee-directory";
import { TimelineEntry } from "./timeline-entry";
import { ActivityComposer } from "./activity-composer";
import type { DirtyChange } from "../record-sheet/inline-field";

const VIEWS = [
  ["all", "All"], ["history", "History"], ["notes", "Notes"],
  ["upcoming", "Upcoming"], ["done", "Done"], ["email", "Email"], ["meetings", "Meetings"],
] as const satisfies readonly (readonly [ActivityView, string])[];
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
  const [view, setView] = useState<ActivityView>("all");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ message: string; error?: boolean } | null>(null);
  const id = useId();
  const onResult = (message: string, error?: boolean) => setResult({ message, error });
  useEffect(() => {
    if (!result) return;
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === document.body) document.getElementById(`${id}-${view}`)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [result, view, id]);
  const directory = useAssigneeDirectory();
  const counts = useAppQuery("activities", { counts: true, ...activityAnchor(record) }, signal => api.activities.counts(activityAnchor(record), { signal }));
  return <section aria-label="Activity timeline" className="space-y-4">
    {canCreateActivity && canPermission(account, "activity", "create") && <ActivityComposer record={record} onDirtyChange={onDirtyChange} onCreated={() => {
      setRevision(value => value + 1);
      onResult("Activity saved. The current view has been refreshed; use All to see every activity type.");
    }} />}
    <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">Timeline</h2><Button type="button" size="sm" variant="ghost" onClick={counts.refresh}>Refresh timeline</Button></div>
    {result && <p role={result.error ? "alert" : "status"} className={`text-sm ${result.error ? "text-destructive" : "text-muted-foreground"}`}>{result.message}</p>}
    <div role="tablist" aria-label="Activity views" className="flex gap-1 overflow-x-auto border-b pb-2" onKeyDown={event => {
      const index = VIEWS.findIndex(([value]) => value === view);
      let next: number;
      if (event.key === "ArrowRight") next = (index + 1) % VIEWS.length;
      else if (event.key === "ArrowLeft") next = (index + VIEWS.length - 1) % VIEWS.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = VIEWS.length - 1;
      else return;
      event.preventDefault();
      setView(VIEWS[next][0]);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }}>
      {VIEWS.map(([value, label]) => <button type="button" key={value} id={`${id}-${value}`} role="tab" aria-selected={view === value} aria-controls={`${id}-panel`} tabIndex={view === value ? 0 : -1} onClick={() => setView(value)} className={`whitespace-nowrap rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${view === value ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60"}`}>{label} <span className="ml-1 text-xs tabular-nums">{counts.data?.[value] ?? (counts.error ? "—" : "…")}</span></button>)}
    </div>
    {counts.error ? <RequestError error={counts.error} label="Activity counts could not load." retry={counts.refresh} /> : counts.refreshing && <p role="status" className="text-xs text-muted-foreground">Refreshing activity counts…</p>}
    {!!directory.error && <RequestError error={directory.error} label="Actor directory could not load. Historical IDs remain visible." retry={directory.refresh} />}
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${view}`} tabIndex={0} className="outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <TimelineView key={`${view}:${revision}`} record={record} labels={labels} view={view} onResult={onResult} directory={directory.data ?? []} />
    </div>
  </section>;
}

function RequestError({ error, label, retry }: { error: unknown; label: string; retry: () => void }) {
  return <p role="alert" className="text-sm text-destructive">{label} {error instanceof Error ? error.message : "Request failed."} <button type="button" className="underline" onClick={retry}>Retry</button></p>;
}

function TimelineView({ record, labels, view, directory, onResult }: TimelinePanelProps & { view: ActivityView; directory: readonly { id: string; name: string }[]; onResult: (message: string, error?: boolean) => void }) {
  const now = new Date();
  const main = useTimelinePages(record, view);
  const pinned = useTimelinePages(record, view === "all" ? "upcoming" : null);
  const pinnedIds = new Set(pinned.items.map(item => item.id));
  const history = view === "all" ? uniqueVisibleActivities(main.items, pinnedIds) : main.items;
  const renderRows = (rows: TimelineActivity[]) => groupActivityDays(rows).map(group => <div key={group.key} className="space-y-3">
    <h3 className="text-xs font-medium text-muted-foreground">{group.date ? group.date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "Date unavailable"}</h3>
    {group.items.map(activity => <TimelineEntry key={activity.id} activity={activity} record={record} labels={labels} now={now} directory={directory} onResult={onResult} />)}
  </div>);
  return <div className="space-y-5">
    {view === "all" && <section aria-label="Pinned upcoming tasks" className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <h3 className="text-sm font-medium">Upcoming tasks</h3>
      {!!pinned.error && <RequestError error={pinned.error} label="Upcoming tasks could not load." retry={pinned.retry} />}
      {pinned.loading && <p role="status" className="text-sm text-muted-foreground">{pinned.loadingMore ? "Loading more upcoming tasks…" : pinned.refreshing ? "Refreshing upcoming tasks…" : "Loading upcoming tasks…"}</p>}
      {renderRows(pinned.items)}
      {!pinned.loading && !pinned.error && pinned.total === 0 && <p className="text-sm text-muted-foreground">No upcoming tasks.</p>}
      {pinned.hasMore && <Button type="button" size="sm" variant="outline" disabled={pinned.loading || !!pinned.error} onClick={pinned.loadMore}>Load more upcoming tasks</Button>}
    </section>}
    {!!main.error && <RequestError error={main.error} label="Timeline could not load." retry={main.retry} />}
    {main.loading && <p role="status" className="text-sm text-muted-foreground">{main.loadingMore ? "Loading more activities…" : main.refreshing ? "Refreshing timeline…" : "Loading timeline…"}</p>}
    {renderRows(history)}
    {!main.loading && !main.error && main.total === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No activities in this view.</p>}
    {view === "all" && !main.loading && !main.error && !!main.total && !history.length && <p className="text-sm text-muted-foreground">The activities on these pages are shown in Upcoming tasks.</p>}
    {main.hasMore && <Button type="button" variant="outline" disabled={main.loading || !!main.error} onClick={main.loadMore}>{view === "upcoming" ? "Load more tasks" : "Load older activities"}</Button>}
  </div>;
}
