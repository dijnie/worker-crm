"use client";
import { canPermission } from "@/lib/auth/permissions";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { ACTIVITY_PRESENTATION, type TimelineActivity } from "@/lib/activity-presentation";
import {
  MANUAL_ACTIVITY_TYPES, ActivityComposerValidationError, buildActivityCreateInput,
  emptyActivityDraft, isActivityDraftDirty, type ActivityComposerDraft, type ActivityComposerErrors, type ActivityRelatedIds,
} from "@/lib/activity-composer-values";
import { useAppData } from "../app-data-provider";
import type { RecordRef } from "../record-sheet/record-navigation";
import type { DirtyChange } from "../record-sheet/inline-field";

export interface ActivityComposerProps {
  record: RecordRef;
  relatedIds?: ActivityRelatedIds;
  onDirtyChange?: DirtyChange;
  onCreated?: (activity: TimelineActivity) => void;
}

export function ActivityComposer(props: ActivityComposerProps) {
  const { generation, account } = useAppData();
  if (!canPermission(account, "activity", "create") || !canPermission(account, props.record.kind, "read") || props.record.kind === "deal" && !canPermission(account, "company", "read")) return null;
  return <ComposerSession key={`${generation}:${props.record.kind}:${props.record.id}`} {...props} />;
}

function ComposerSession({ record, relatedIds, onDirtyChange, onCreated }: ActivityComposerProps) {
  const { api, store, generation, invalidate } = useAppData();
  const id = useId();
  const [draft, setDraft] = useState(emptyActivityDraft);
  const draftRef = useRef(draft); draftRef.current = draft;
  const [fields, setFields] = useState<ActivityComposerErrors>({});
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const flight = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);
  const subject = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const created = useRef(onCreated); created.current = onCreated;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const change = (field: keyof ActivityComposerDraft, value: string) => {
    if (flight.current) return;
    const next = { ...draftRef.current, [field]: value } as ActivityComposerDraft;
    if (field === "type" && value !== "TASK") next.dueAt = "";
    draftRef.current = next; setDraft(next); setFields({}); setMessage(""); setSuccess("");
  };
  const discard = () => {
    if (flight.current) return;
    const next = emptyActivityDraft(draftRef.current.type);
    draftRef.current = next; setDraft(next); setFields({}); setMessage(""); setSuccess("");
  };
  const save = (): Promise<boolean> => {
    if (flight.current) return flight.current;
    if (!mounted.current || !store.isCurrent(generation)) return Promise.resolve(false);
    let input;
    try { input = buildActivityCreateInput(record, draftRef.current, relatedIds); }
    catch (failure) {
      setFields(failure instanceof ActivityComposerValidationError ? failure.fields : {});
      setMessage(failure instanceof Error ? failure.message : "Check the activity fields.");
      setSuccess("");
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return Promise.resolve(false);
    }
    const submittedType = draftRef.current.type;
    setPending(true); setFields({}); setMessage(""); setSuccess("");
    flight.current = (async () => {
      try {
        const activity = await api.activities.create(input);
        if (!store.isCurrent(generation)) return false;
        invalidate(["activity-create"]);
        if (!mounted.current) return true;
        const next = emptyActivityDraft(submittedType);
        draftRef.current = next; setDraft(next);
        setSuccess(`${ACTIVITY_PRESENTATION[submittedType].label} saved.`);
        created.current?.(activity);
        requestAnimationFrame(() => {
          if (!mounted.current || !store.isCurrent(generation)) return;
          // Disabling the form can move focus to its enclosing Radix dialog.
          // Recover that fallback, but preserve other fields and nested dialogs.
          const active = document.activeElement;
          const recordDialog = form.current?.closest('[role="dialog"]');
          if (active && active !== document.body && active !== recordDialog && !form.current?.contains(active)) return;
          (submittedType === "TASK" ? subject.current : body.current)?.focus();
        });
        return true;
      } catch (failure) {
        if (mounted.current && store.isCurrent(generation)) {
          const nextFields: ActivityComposerErrors = {};
          if (failure instanceof ApiError) for (const issue of failure.issues ?? []) {
            const field = issue.path[0];
            if (typeof field === "string" && ["type", "subject", "body", "occurredAt", "dueAt", "companyId", "contactId", "dealId"].includes(field)) {
              nextFields[field as keyof ActivityComposerErrors] ??= issue.message;
            }
          }
          setFields(nextFields);
          setMessage(failure instanceof ApiError ? failure.message : "The save could not be confirmed. Check the timeline before trying again to avoid a duplicate.");
        }
        return false;
      } finally {
        flight.current = null;
        if (mounted.current && store.isCurrent(generation)) setPending(false);
      }
    })();
    return flight.current;
  };
  const latest = useRef({ save, discard }); latest.current = { save, discard };
  const dirty = isActivityDraftDirty(draft) || pending;
  const dirtyKey = `${record.kind}:${record.id}:activity-composer`;
  useEffect(() => {
    onDirtyChange?.(dirtyKey, dirty ? { dirty: true, pending, save: () => latest.current.save(), discard: () => latest.current.discard() } : null);
    return () => onDirtyChange?.(dirtyKey, null);
  }, [dirty, pending, dirtyKey, onDirtyChange]);
  const fieldError = (field: keyof ActivityComposerErrors) => fields[field] && <p id={`${id}-${field}-error`} className="text-xs text-destructive">{fields[field]}</p>;
  const accessibility = (field: keyof ActivityComposerErrors) => ({ "aria-invalid": !!fields[field], "aria-describedby": fields[field] ? `${id}-${field}-error` : undefined });

  return <form ref={form} aria-label="Log activity" data-activity-composer data-inline-editor={dirty ? "" : undefined} noValidate
    className="space-y-3 rounded-lg border bg-muted/10 p-3" onSubmit={event => { event.preventDefault(); void save(); }} onKeyDown={event => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); void save(); }
      if (event.key === "Escape" && dirty) { event.preventDefault(); event.stopPropagation(); }
    }}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Log activity</h3><span className="text-xs text-muted-foreground">Ctrl / ⌘ + Enter to save</span></div>
    <fieldset disabled={pending} className="space-y-3">
      <div className="space-y-1"><label htmlFor={`${id}-type`} className="text-xs font-medium">Activity type</label>
        <select id={`${id}-type`} className="h-9 w-full rounded-md border border-input bg-control px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring" value={draft.type} onChange={event => change("type", event.target.value)} {...accessibility("type")}>
          {MANUAL_ACTIVITY_TYPES.map(type => <option key={type} value={type}>{type === "EMAIL" ? "Log email" : ACTIVITY_PRESENTATION[type].label}</option>)}
        </select>{fieldError("type")}</div>
      {draft.type === "EMAIL" && <p className="text-xs text-muted-foreground">Record an email in the CRM. This does not send an email.</p>}
      <div className="space-y-1"><label htmlFor={`${id}-subject`} className="text-xs font-medium">Subject {draft.type === "TASK" ? "(required)" : "(optional)"}</label>
        <Input ref={subject} id={`${id}-subject`} aria-label="Subject" value={draft.subject} required={draft.type === "TASK"} maxLength={100000} onChange={event => change("subject", event.target.value)} {...accessibility("subject")} />{fieldError("subject")}</div>
      <div className="space-y-1"><label htmlFor={`${id}-body`} className="text-xs font-medium">Body</label>
        <Textarea ref={body} id={`${id}-body`} aria-label="Body" placeholder={draft.type === "CALL" ? "Call outcome and notes" : "Activity notes"} rows={3} value={draft.body} maxLength={100000} onChange={event => change("body", event.target.value)} {...accessibility("body")} />{fieldError("body")}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ActivityDateInput id={`${id}-occurredAt`} label="Occurred at" value={draft.occurredAt} defaultMode="datetime-local" onChange={value => change("occurredAt", value)} error={fields.occurredAt} />
        {draft.type === "TASK" && <ActivityDateInput id={`${id}-dueAt`} label="Due date" value={draft.dueAt} defaultMode="date" onChange={value => change("dueAt", value)} error={fields.dueAt} />}
      </div>
      <p className="text-xs text-muted-foreground">Leave occurrence blank for now. Dates use midnight UTC; date and time uses your local timezone.</p>
    </fieldset>
    {(["companyId", "contactId", "dealId"] as const).map(field => fields[field] && <p key={field} className="text-xs text-destructive">{fields[field]}</p>)}
    {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    <div role="status" aria-live="polite" className="text-sm text-muted-foreground">{pending ? "Saving activity…" : success}</div>
    <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" aria-label="Add activity" disabled={pending}>{pending ? "Saving…" : "Add activity"}</Button>
      {dirty && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={discard}>Discard draft</Button>}</div>
  </form>;
}

function ActivityDateInput({ id, label, value, defaultMode, onChange, error }: {
  id: string; label: string; value: string; defaultMode: "date" | "datetime-local"; onChange: (value: string) => void; error?: string;
}) {
  const [mode, setMode] = useState(defaultMode);
  return <div className="space-y-1"><label htmlFor={id} className="text-xs font-medium">{label} (optional)</label>
    <select aria-label={`${label} format`} className="h-9 w-full rounded-md border border-input bg-control px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring" value={mode} onChange={event => {
      const next = event.target.value as typeof mode;
      setMode(next);
      if (value) onChange(next === "date" ? value.slice(0, 10) : `${value.slice(0, 10)}T00:00`);
    }}><option value="date">Date only (UTC)</option><option value="datetime-local">Date and time (local)</option></select>
    <Input id={id} aria-label={label} type={mode} value={value} onChange={event => onChange(event.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
    {error && <p id={`${id}-error`} className="text-xs text-destructive">{error}</p>}
  </div>;
}
