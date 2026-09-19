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
import { useDictionary, useFormat } from "../i18n-provider";
import { openRecord, type RecordRef } from "../record-sheet/record-navigation";
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
  const { timeline } = useDictionary();
  const format = useFormat();
  return date ? <time dateTime={date.toISOString()} title={format.timestamp(date)}>{format.dateTime(date)}</time> : <span>{timeline.entry.timeUnavailable}</span>;
}

export function TimelineEntry({ activity, now, directory, labels, record, headingLevel = 4, onResult }: TimelineEntryProps) {
  const dictionary = useDictionary();
  const { crm, timeline } = dictionary;
  const copy = timeline.entry;
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const icon = ACTIVITY_PRESENTATION[activity.type]?.icon ?? "note";
  const typeLabel = crm.activityTypes[activity.type] ?? crm.activity.singular;
  const occurred = activityOccurredAt(activity);
  const transition = activity.type === "STAGE_CHANGE" ? activityStageTransition(activity.meta) : null;
  const task = activity.type === "TASK" ? activityTaskState(activity, now, copy.task) : null;
  const metadata = activityMetadataText(activity.meta, copy.metadataUnavailable);
  const links = activityRecordLinks(activity).filter(link => !record || link.kind !== record.kind || link.id !== record.id);
  return <article data-activity-id={activity.id} aria-label={`${typeLabel}: ${activity.subject || copy.untitled}`} className="flex gap-3 py-3">
    <span className="mt-0.5 shrink-0 text-muted-foreground"><Icon icon={ICONS[icon]} className="size-4" /></span>
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Heading className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">{activity.subject || typeLabel}</Heading>
        <Badge variant="outline">{typeLabel}</Badge>
      </div>
      {activity.type === "STAGE_CHANGE" && <p className="text-xs">{transition ? copy.stageTransition(crm.stages[transition.from] ?? transition.from, crm.stages[transition.to] ?? transition.to) : copy.stageTransitionUnavailable}</p>}
      {task && <StatusIndicator
        tone={task.overdue ? "error" : "info"}
        size="sm"
        className={cn("w-fit", task.overdue && "text-destructive")}
        label={<>{task.label}{task.date && <> · <Timestamp date={task.date} /></>}</>}
      />}
      {activity.body && <p className={cn("whitespace-pre-wrap text-pretty text-sm [overflow-wrap:anywhere]", activity.subject && "text-muted-foreground")}>{activity.body}</p>}
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"><span className="break-all">{activityActorLabel(activity.createdById, directory, copy.unavailableActor)}</span><span aria-hidden="true">·</span><Timestamp date={occurred} /></p>
      {links.length > 0 && <nav aria-label={copy.relatedRecordsAriaLabel} className="flex flex-wrap gap-1.5">{links.map(link => <Button
        key={`${link.kind}:${link.id}`}
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 max-w-full justify-start whitespace-normal text-left [overflow-wrap:anywhere]"
        onClick={() => openRecord(link)}
      >{labels?.[`${link.kind}:${link.id}`] || copy.relatedRecordFallback(crm.entities[link.kind.toUpperCase() as "COMPANY" | "CONTACT" | "DEAL"].singular, link.id)}</Button>)}</nav>}
      <ActivityActions activity={activity} onResult={onResult} />
      {(metadata !== null || activity.emailThreadId || activity.calendarEventId) && <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">{copy.storedDetailsSummary}</summary>
        {activity.emailThreadId && <p className="mt-2 break-all">{copy.emailThreadReference(activity.emailThreadId)}</p>}
        {activity.calendarEventId && <p className="mt-2 break-all">{copy.calendarEventReference(activity.calendarEventId)}</p>}
        {metadata !== null && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-muted p-2 font-mono">{metadata}</pre>}
      </details>}
    </div>
  </article>;
}
