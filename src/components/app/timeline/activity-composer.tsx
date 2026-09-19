"use client";
import { canPermission } from "@/lib/auth/permissions";

import { useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { type TimelineActivity } from "@/lib/activity-presentation";
import {
  MANUAL_ACTIVITY_TYPES, ActivityComposerValidationError, buildActivityCreateInput,
  emptyActivityDraft, isActivityDraftDirty, type ActivityComposerDraft, type ActivityComposerErrors, type ActivityRelatedIds,
} from "@/lib/activity-composer-values";
import { errorMessage, issueMessage } from "@/lib/i18n/error-message";
import { useAppData } from "../app-data-provider";
import { useDictionary } from "../i18n-provider";
import type { RecordRef } from "../record-sheet/record-navigation";
import type { DirtyChange } from "../record-sheet/inline-field";
import { selectClass } from "../records/record-picker";

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
  const dictionary = useDictionary();
  const { common, crm, timeline } = dictionary;
  const copy = timeline.composer;
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
    try { input = buildActivityCreateInput(record, draftRef.current, relatedIds, copy.errors); }
    catch (failure) {
      setFields(failure instanceof ActivityComposerValidationError ? failure.fields : {});
      setMessage(failure instanceof Error ? failure.message : copy.genericCheckFields);
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
        setSuccess(copy.savedMessage(crm.activityTypes[submittedType]));
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
              nextFields[field as keyof ActivityComposerErrors] ??= issueMessage(issue, dictionary);
            }
          }
          setFields(nextFields);
          setMessage(failure instanceof ApiError ? errorMessage(failure, dictionary) : copy.saveUnconfirmed);
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
  const fieldError = (field: keyof ActivityComposerErrors) => fields[field] && <FieldError id={`${id}-${field}-error`}>{fields[field]}</FieldError>;
  const accessibility = (field: keyof ActivityComposerErrors) => ({ "aria-invalid": !!fields[field], "aria-describedby": fields[field] ? `${id}-${field}-error` : undefined });

  return <form ref={form} aria-label={copy.heading} data-activity-composer data-inline-editor={dirty ? "" : undefined} noValidate
    className="flex flex-col gap-3 rounded-lg border bg-card p-4" onSubmit={event => { event.preventDefault(); void save(); }} onKeyDown={event => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); void save(); }
      if (event.key === "Escape" && dirty) { event.preventDefault(); event.stopPropagation(); }
    }}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-medium">{copy.heading}</h3>
      <span className="text-xs text-muted-foreground">{copy.shortcutHint}</span>
    </div>
    <fieldset disabled={pending} className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor={`${id}-type`}>{copy.typeLabel}</FieldLabel>
        <select id={`${id}-type`} className={selectClass} value={draft.type} onChange={event => change("type", event.target.value)} {...accessibility("type")}>
          {MANUAL_ACTIVITY_TYPES.map(type => <option key={type} value={type}>{type === "EMAIL" ? copy.logEmailOption : crm.activityTypes[type]}</option>)}
        </select>{fieldError("type")}
      </Field>
      {draft.type === "EMAIL" && <p className="text-xs text-muted-foreground">{copy.emailHint}</p>}
      <Field>
        <FieldLabel htmlFor={`${id}-subject`}>{copy.subjectLabel(draft.type === "TASK")}</FieldLabel>
        <Input ref={subject} id={`${id}-subject`} aria-label={copy.subjectAria} value={draft.subject} required={draft.type === "TASK"} maxLength={100000} onChange={event => change("subject", event.target.value)} {...accessibility("subject")} />{fieldError("subject")}
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-body`}>{copy.bodyLabel}</FieldLabel>
        <Textarea ref={body} id={`${id}-body`} aria-label={copy.bodyAria} placeholder={draft.type === "CALL" ? copy.bodyPlaceholderCall : copy.bodyPlaceholderDefault} rows={3} value={draft.body} maxLength={100000} onChange={event => change("body", event.target.value)} {...accessibility("body")} />{fieldError("body")}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <ActivityDateInput id={`${id}-occurredAt`} label={copy.occurredAtLabel} value={draft.occurredAt} defaultMode="datetime-local" onChange={value => change("occurredAt", value)} error={fields.occurredAt} />
        {draft.type === "TASK" && <ActivityDateInput id={`${id}-dueAt`} label={copy.dueAtLabel} value={draft.dueAt} defaultMode="date" onChange={value => change("dueAt", value)} error={fields.dueAt} />}
      </div>
      <p className="text-xs text-muted-foreground">{copy.timezoneHint}</p>
    </fieldset>
    {(["companyId", "contactId", "dealId"] as const).map(field => fields[field] && <p key={field} className="text-xs text-destructive">{fields[field]}</p>)}
    {message && <Alert variant="destructive">{message}</Alert>}
    <div role="status" aria-live="polite" className="text-xs text-muted-foreground">{pending ? copy.saving : success}</div>
    <div className="flex flex-wrap gap-2">
      <Button type="submit" size="sm" aria-label={copy.addActivity} disabled={pending}>{pending ? common.saving : copy.addActivity}</Button>
      {dirty && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={discard}>{copy.discardDraft}</Button>}
    </div>
  </form>;
}

function ActivityDateInput({ id, label, value, defaultMode, onChange, error }: {
  id: string; label: string; value: string; defaultMode: "date" | "datetime-local"; onChange: (value: string) => void; error?: string;
}) {
  const { timeline } = useDictionary();
  const copy = timeline.composer;
  const [mode, setMode] = useState(defaultMode);
  return <Field>
    <FieldLabel htmlFor={id}>{copy.withOptional(label)}</FieldLabel>
    <select aria-label={copy.formatAria(label)} className={selectClass} value={mode} onChange={event => {
      const next = event.target.value as typeof mode;
      setMode(next);
      if (value) onChange(next === "date" ? value.slice(0, 10) : `${value.slice(0, 10)}T00:00`);
    }}>
      <option value="date">{copy.dateOnlyOption}</option>
      <option value="datetime-local">{copy.dateTimeOption}</option>
    </select>
    <Input id={id} aria-label={label} type={mode} value={value} onChange={event => onChange(event.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
    {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
  </Field>;
}
