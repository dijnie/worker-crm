"use client";
import { Calendar, CheckSquare, FileText, GitBranch, Mail, Phone, Sparkles } from "lucide-react";
import {
  ACTIVITY_PRESENTATION, activityActorLabel, activityMetadataText,
  activityOccurredAt, activityRecordLinks, activityStageTransition,
  activityTaskState, type TimelineActivity,
} from "@/lib/activity-presentation";
import { openRecord, type RecordRef } from "../record-sheet/record-navigation";
import { stageLabel } from "../records/stage-change";
import { ActivityActions } from "./activity-actions";

const icons = { note: FileText, phone: Phone, mail: Mail, calendar: Calendar, task: CheckSquare, stage: GitBranch, enrichment: Sparkles };
export interface TimelineEntryProps {
  activity: TimelineActivity;
  now: Date;
  directory: readonly { id: string; name: string }[];
  labels?: Record<string, string>;
  record?: RecordRef;
  headingLevel?: 3 | 4;
  onResult: (message: string, error?: boolean) => void;
}

function Timestamp({ date }: { date: Date | null }) {
  return date ? <time dateTime={date.toISOString()} title={date.toLocaleString()}>{date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time> : <span>Time unavailable</span>;
}

export function TimelineEntry({ activity, now, directory, labels, record, headingLevel = 4, onResult }: TimelineEntryProps) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const presentation = ACTIVITY_PRESENTATION[activity.type] ?? { label: "Activity", icon: "note" as const };
  const Icon = icons[presentation.icon];
  const occurred = activityOccurredAt(activity);
  const transition = activity.type === "STAGE_CHANGE" ? activityStageTransition(activity.meta) : null;
  const task = activity.type === "TASK" ? activityTaskState(activity, now) : null;
  const metadata = activityMetadataText(activity.meta);
  const links = activityRecordLinks(activity).filter(link => !record || link.kind !== record.kind || link.id !== record.id);
  return <article className="rounded-lg border bg-background p-4" data-activity-id={activity.id} aria-label={`${presentation.label}: ${activity.subject || "Untitled"}`}>
    <div className="flex items-start gap-3">
      <span className="rounded-md bg-muted p-2"><Icon className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Heading className="break-words text-sm font-medium [overflow-wrap:anywhere]">{activity.subject || presentation.label}</Heading>
          <span className="text-xs text-muted-foreground">{presentation.label}</span>
        </div>
        {activity.type === "STAGE_CHANGE" && <p className="text-sm">{transition ? `${stageLabel(transition.from)} → ${stageLabel(transition.to)}` : "Stage transition details unavailable"}</p>}
        {task && <p className={`text-xs ${task.overdue ? "text-destructive" : "text-muted-foreground"}`}>{task.label}{task.date && <> · <Timestamp date={task.date} /></>}</p>}
        {activity.body && <p className="whitespace-pre-wrap break-words text-sm">{activity.body}</p>}
        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground"><span className="break-all">{activityActorLabel(activity.createdById, directory)}</span><span>·</span><Timestamp date={occurred} /></p>
        {links.length > 0 && <nav aria-label="Activity related records" className="flex flex-wrap gap-2">{links.map(link => <button key={`${link.kind}:${link.id}`} type="button" className="min-h-11 max-w-full break-all rounded border px-2 py-1 text-xs underline-offset-2 hover:bg-accent hover:underline active:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => openRecord(link)}>{labels?.[`${link.kind}:${link.id}`] || `${link.kind[0].toUpperCase()}${link.kind.slice(1)} · ${link.id}`}</button>)}</nav>}
        <ActivityActions activity={activity} onResult={onResult} />
        {(metadata !== null || activity.emailThreadId || activity.calendarEventId) && <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Stored activity details</summary>
          {activity.emailThreadId && <p className="mt-2 break-all">Email thread reference: {activity.emailThreadId}</p>}
          {activity.calendarEventId && <p className="mt-2 break-all">Calendar event reference: {activity.calendarEventId}</p>}
          {metadata !== null && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono">{metadata}</pre>}
        </details>}
      </div>
    </div>
  </article>;
}
