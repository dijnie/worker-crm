"use client";
import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Chat from "@carbon/icons-react/es/Chat";
import Email from "@carbon/icons-react/es/Email";
import Events from "@carbon/icons-react/es/Events";
import MagicWand from "@carbon/icons-react/es/MagicWand";
import Phone from "@carbon/icons-react/es/Phone";
import Task from "@carbon/icons-react/es/Task";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon, type CarbonIcon } from "@/components/ui/icon";
import { StatusIndicator } from "@/components/ui/status-indicator";
import {
  ACTIVITY_PRESENTATION, activityActorLabel, activityMetadataText,
  activityOccurredAt, activityRecordLinks, activityStageTransition,
  activityTaskState, type TimelineActivity,
} from "@/lib/activity-presentation";
import { cn } from "@/lib/utils/cn";
import { openRecord, type RecordRef } from "../record-sheet/record-navigation";
import { stageLabel } from "../records/stage-change";
import { ActivityActions } from "./activity-actions";

const ICONS = {
  note: Chat, phone: Phone, mail: Email, calendar: Events,
  task: Task, stage: ArrowRight, enrichment: MagicWand,
} as const satisfies Record<string, CarbonIcon>;

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
  const occurred = activityOccurredAt(activity);
  const transition = activity.type === "STAGE_CHANGE" ? activityStageTransition(activity.meta) : null;
  const task = activity.type === "TASK" ? activityTaskState(activity, now) : null;
  const metadata = activityMetadataText(activity.meta);
  const links = activityRecordLinks(activity).filter(link => !record || link.kind !== record.kind || link.id !== record.id);
  return <article data-activity-id={activity.id} aria-label={`${presentation.label}: ${activity.subject || "Untitled"}`} className="flex gap-3 py-3">
    <span className="mt-0.5 shrink-0 text-muted-foreground"><Icon icon={ICONS[presentation.icon]} className="size-4" /></span>
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Heading className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">{activity.subject || presentation.label}</Heading>
        <Badge variant="outline">{presentation.label}</Badge>
      </div>
      {activity.type === "STAGE_CHANGE" && <p className="text-xs">{transition ? `${stageLabel(transition.from)} → ${stageLabel(transition.to)}` : "Stage transition details unavailable"}</p>}
      {task && <StatusIndicator
        tone={task.overdue ? "error" : "info"}
        size="sm"
        className={cn("w-fit", task.overdue && "text-destructive")}
        label={<>{task.label}{task.date && <> · <Timestamp date={task.date} /></>}</>}
      />}
      {activity.body && <p className={cn("whitespace-pre-wrap text-pretty text-sm [overflow-wrap:anywhere]", activity.subject && "text-muted-foreground")}>{activity.body}</p>}
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"><span className="break-all">{activityActorLabel(activity.createdById, directory)}</span><span aria-hidden="true">·</span><Timestamp date={occurred} /></p>
      {links.length > 0 && <nav aria-label="Activity related records" className="flex flex-wrap gap-1.5">{links.map(link => <Button
        key={`${link.kind}:${link.id}`}
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 max-w-full justify-start whitespace-normal text-left [overflow-wrap:anywhere]"
        onClick={() => openRecord(link)}
      >{labels?.[`${link.kind}:${link.id}`] || `${link.kind[0].toUpperCase()}${link.kind.slice(1)} · ${link.id}`}</Button>)}</nav>}
      <ActivityActions activity={activity} onResult={onResult} />
      {(metadata !== null || activity.emailThreadId || activity.calendarEventId) && <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Stored activity details</summary>
        {activity.emailThreadId && <p className="mt-2 break-all">Email thread reference: {activity.emailThreadId}</p>}
        {activity.calendarEventId && <p className="mt-2 break-all">Calendar event reference: {activity.calendarEventId}</p>}
        {metadata !== null && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-muted p-2 font-mono">{metadata}</pre>}
      </details>}
    </div>
  </article>;
}
