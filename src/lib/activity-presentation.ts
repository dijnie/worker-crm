import { DEAL_STAGES, type ActivityType, type DealStage } from "./db/schema/constants";
import type { ActivitySelect } from "./db/schema/activity.schema";
import type { RecordRef } from "../components/app/record-sheet/record-navigation";

export type TimelineActivity = ActivitySelect;
// How each type is drawn. Its name is copy and comes from `dictionary.crm.activityTypes`.
export const ACTIVITY_PRESENTATION = {
  NOTE: { icon: "note" },
  CALL: { icon: "phone" },
  EMAIL: { icon: "mail" },
  MEETING: { icon: "calendar" },
  TASK: { icon: "task" },
  STAGE_CHANGE: { icon: "stage" },
  ENRICHMENT: { icon: "enrichment" },
} as const satisfies Record<ActivityType, { icon: string }>;

/** SQLite's unzoned timestamps are UTC, just like the API's ISO timestamps. */
export function activityDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)
    ? `${value.replace(" ", "T")}Z` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function activityOccurredAt(activity: Pick<TimelineActivity, "occurredAt" | "createdAt">) {
  return activityDate(activity.occurredAt) ?? activityDate(activity.createdAt);
}

export function activityDayKey(date: Date | null): string {
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : "unknown";
}

/** Adjacent day runs preserve server order when occurrence dates go backwards or forwards. */
export function groupActivityDays<T extends Pick<TimelineActivity, "id" | "occurredAt" | "createdAt">>(rows: readonly T[]) {
  const groups: { key: string; date: Date | null; items: T[] }[] = [];
  for (const row of rows) {
    const date = activityOccurredAt(row);
    const day = activityDayKey(date);
    const previous = groups.at(-1);
    if (previous && activityDayKey(previous.date) === day) previous.items.push(row);
    else groups.push({ key: `${day}:${row.id}`, date, items: [row] });
  }
  return groups;
}

export function uniqueVisibleActivities<T extends { id: string }>(rows: readonly T[], excluded: ReadonlySet<string> = new Set()): T[] {
  const seen = new Set(excluded);
  return rows.filter(row => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export function activityStageTransition(meta: unknown): { from: DealStage; to: DealStage } | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const { from, to } = meta as Record<string, unknown>;
  const isStage = (value: unknown): value is DealStage => DEAL_STAGES.some(stage => stage === value);
  return isStage(from) && isStage(to) ? { from, to } : null;
}

/** Labels an unresolved actor. Callers pass the interface language's phrase; English is the default. */
export function activityActorLabel(id: string, directory: readonly { id: string; name: string }[], unavailableLabel = "Unavailable / historical actor"): string {
  return directory.find(actor => actor.id === id)?.name || `${unavailableLabel} (${id || "unknown"})`;
}

export interface TaskStateLabels { completed: string; dueDateUnavailable: string; noDueDate: string; overdue: string; due: string }
const DEFAULT_TASK_STATE_LABELS: TaskStateLabels = {
  completed: "Completed", dueDateUnavailable: "Due date unavailable", noDueDate: "No due date", overdue: "Overdue", due: "Due",
};

/** Callers pass the interface language's labels; English is the default. */
export function activityTaskState(activity: Pick<TimelineActivity, "completedAt" | "dueAt">, now: Date, labels: TaskStateLabels = DEFAULT_TASK_STATE_LABELS) {
  if (activity.completedAt) return { label: labels.completed, date: activityDate(activity.completedAt), overdue: false };
  const date = activityDate(activity.dueAt);
  if (!date) return { label: activity.dueAt ? labels.dueDateUnavailable : labels.noDueDate, date: null, overdue: false };
  const overdue = date.getTime() < now.getTime();
  return { label: overdue ? labels.overdue : labels.due, date, overdue };
}

export function activityRecordLinks(activity: Pick<TimelineActivity, "companyId" | "contactId" | "dealId">): RecordRef[] {
  return ([{ kind: "company", id: activity.companyId }, { kind: "contact", id: activity.contactId }, { kind: "deal", id: activity.dealId }] as const)
    .filter((ref): ref is { kind: "company" | "contact" | "deal"; id: string } => !!ref.id);
}

export function activityAnchor(record: RecordRef) {
  switch (record.kind) {
    case "company": return { companyId: record.id };
    case "contact": return { contactId: record.id };
    case "deal": return { dealId: record.id };
  }
}

/** The caller passes the interface language's fallback; English is the default. */
export function activityMetadataText(meta: unknown, unavailable = "Stored metadata is unavailable."): string | null {
  if (meta === undefined || meta === null) return null;
  try { return typeof meta === "string" ? meta : JSON.stringify(meta, null, 2); }
  catch { return unavailable; }
}
