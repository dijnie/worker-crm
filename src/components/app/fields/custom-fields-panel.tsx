"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import type { FieldEntity } from "@/lib/db/schema/constants";
import { fieldDraft, parseFieldDraft, type FieldDefinition, type FieldValue } from "@/lib/field-form-values";
import { useAppData, useAppQuery } from "../app-data-provider";
import { RecordPicker, selectClass } from "../records/record-picker";
import { useAssigneeDirectory } from "../records/use-assignee-directory";
import type { DirtyChange } from "../record-sheet/inline-field";
import type { RecordRef } from "../record-sheet/record-navigation";
import { FieldValueDisplay } from "./field-value-display";

type ValueDefinition = FieldDefinition & { value: FieldValue };
export function CustomFieldsPanel(props: { record: RecordRef; onDirtyChange: DirtyChange }) {
  const { generation } = useAppData();
  return <PanelSession key={`${generation}:${props.record.kind}:${props.record.id}`} {...props} />;
}
function PanelSession({ record, onDirtyChange }: { record: RecordRef; onDirtyChange: DirtyChange }) {
  const { api } = useAppData();
  const entity = record.kind.toUpperCase() as FieldEntity;
  const values = useAppQuery("fields:values", { entity, id: record.id }, signal => api.fields.values(entity, record.id, { signal }));
  const [dirtyIds, setDirtyIds] = useState<string[]>([]);
  const remembered = useRef<ValueDefinition[]>([]);
  if (values.data) remembered.current = [...values.data, ...remembered.current.filter(row => dirtyIds.includes(row.id) && !values.data?.some(next => next.id === row.id))];
  const visible = (values.error ? remembered.current.filter(row => dirtyIds.includes(row.id)) : remembered.current).filter(row => row.showOnSheet || dirtyIds.includes(row.id));
  const directory = useAssigneeDirectory();
  return <section className="mt-5" aria-label="Custom fields">
    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Custom fields</h3><Link className="text-xs underline" href={`/settings?returnTo=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname + window.location.search)}`}>Manage fields</Link></div>
    {values.loading && <p role="status" className="py-3 text-sm text-muted-foreground">Loading custom fields…</p>}
    {values.error ? <p role="alert" className="py-3 text-sm text-destructive">{values.error instanceof Error ? values.error.message : "Custom fields unavailable."} <button type="button" className="underline" onClick={values.refresh}>Retry custom fields</button></p> : !values.loading && !visible.length && <p className="py-3 text-sm text-muted-foreground">No custom fields shown on this record.</p>}
    {visible.some(definition => definition.type === "USER") && !!directory.error && <p role="alert" className="py-2 text-xs text-destructive">User directory unavailable. <button type="button" className="underline" onClick={directory.refresh}>Retry user directory</button></p>}
    {visible.map(definition => <ValueEditor key={definition.id} record={record} definition={definition}
      userLabel={definition.type !== "USER" || definition.value == null ? undefined : directory.error ? `User directory unavailable (${definition.value})` : directory.loading ? `Loading user… (${definition.value})` : directory.data?.find(user => user.id === definition.value)?.name}
      unavailable={!!values.error || !!values.data && !values.data.some(row => row.id === definition.id && row.showOnSheet)} onDirtyChange={(key, state) => {
        setDirtyIds(ids => state ? ids.includes(definition.id) ? ids : [...ids, definition.id] : ids.includes(definition.id) ? ids.filter(id => id !== definition.id) : ids);
        onDirtyChange(key, state);
      }} />)}
  </section>;
}
function ValueEditor({ record, definition, onDirtyChange, userLabel, unavailable }: {
  record: RecordRef; definition: ValueDefinition; onDirtyChange: DirtyChange; userLabel?: string; unavailable: boolean;
}) {
  const { api, store, generation, invalidate } = useAppData();
  const id = useId();
  const [opening, setOpening] = useState<ValueDefinition | null>(null);
  const [draft, setDraft] = useState<FieldValue>(fieldDraft(definition.type, definition.value));
  const [confirmed, setConfirmed] = useState<FieldValue>(definition.value);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  const flight = useRef<Promise<boolean> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const current = useRef({ draft, opening, confirmed }); current.current = { draft, opening, confirmed };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!current.current.opening && !flight.current) { setConfirmed(definition.value); setDraft(fieldDraft(definition.type, definition.value)); } }, [definition.value, definition.type]);
  const focus = () => requestAnimationFrame(() => {
    if (!mounted.current || !store.isCurrent(generation)) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== root.current?.closest('[role="dialog"]') && !root.current?.contains(active)) return;
    editButton.current?.focus();
  });
  const discard = () => { if (flight.current) return; setOpening(null); setDraft(fieldDraft(definition.type, definition.value)); setConfirmed(definition.value); setError(""); focus(); };
  const save = (): Promise<boolean> => {
    if (flight.current) return flight.current;
    if (!mounted.current || !store.isCurrent(generation)) return Promise.resolve(false);
    const snapshot = current.current;
    if (!snapshot.opening) return Promise.resolve(true);
    let value: FieldValue;
    try { value = parseFieldDraft(snapshot.opening.type, snapshot.draft, snapshot.opening.required); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Check this value."); return Promise.resolve(false); }
    if (snapshot.draft === fieldDraft(snapshot.opening.type, snapshot.confirmed)) { discard(); return Promise.resolve(true); }
    setPending(true); setError(""); setSuccess("");
    flight.current = (async () => {
      try {
        const result = await api.fields.setValue(definition.id, record.kind.toUpperCase() as FieldEntity, record.id, value, snapshot.opening!.type);
        if (!store.isCurrent(generation)) return false;
        invalidate(["fields"]);
        if (mounted.current) { setConfirmed(result.value); setDraft(fieldDraft(snapshot.opening!.type, result.value)); setOpening(null); setSuccess("Saved."); focus(); }
        return true;
      } catch (failure) {
        if (mounted.current && store.isCurrent(generation)) {
          setError(failure instanceof Error ? failure.message : "The save could not be confirmed. Your draft is preserved.");
          if (failure instanceof ApiError && (failure.status === 409 || failure.status === 400)) invalidate(["fields"]);
        }
        return false;
      } finally { flight.current = null; if (mounted.current && store.isCurrent(generation)) setPending(false); }
    })();
    return flight.current;
  };
  const latest = useRef({ save, discard, onDirtyChange }); latest.current = { save, discard, onDirtyChange };
  const dirty = !!opening && draft !== fieldDraft(opening.type, confirmed) || pending;
  const dirtyKey = `${record.kind}:${record.id}:field:${definition.id}`;
  useEffect(() => {
    latest.current.onDirtyChange(dirtyKey, dirty ? { dirty: true, pending, save: () => latest.current.save(), discard: () => latest.current.discard() } : null);
    return () => latest.current.onDirtyChange(dirtyKey, null);
  }, [dirty, pending, dirtyKey]);
  const active = opening ?? definition;
  const text = typeof draft === "string" ? draft : "";
  const maxLength = active.type === "NUMBER" || active.type === "USER" || active.type === "SELECT" ? 200 : active.type === "PHONE" || active.type === "EMAIL" ? 1000 : 100000;
  return <div ref={root} className="space-y-2 border-b py-3" data-custom-field={definition.key} data-field-id={definition.id}>
    <label htmlFor={opening ? id : undefined} className="text-xs font-medium text-muted-foreground">{active.label}{active.required ? " *" : ""}</label>
    {opening ? <div data-inline-editor className="space-y-2" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!dirty) discard(); }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); void save(); }
    }}>
      {(unavailable || definition.type !== opening.type) && <p role="alert" className="text-xs text-destructive">This field changed or is no longer visible. Your draft uses {opening.type}. Cancel to load the current definition.</p>}
      {active.type === "CHECKBOX" ? <div className="space-y-1"><label className="flex items-center gap-2"><input id={id} aria-label={active.label} type="checkbox" checked={draft === true} disabled={pending} onChange={event => setDraft(event.target.checked)} />{draft === null ? "Not set" : draft ? "Yes" : "No"}</label>
        {draft === null && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setDraft(false)}>Set to No</Button>}</div> : active.type === "USER" ? <RecordPicker kind="owner" label={active.label} value={text} required={active.required} disabled={pending} selectedLabel={userLabel} onChange={setDraft} /> : active.type === "SELECT" ?
        <select id={id} aria-label={active.label} autoFocus className={selectClass} value={text} disabled={pending} onChange={event => setDraft(event.target.value)}><option value="">Choose an option</option>{active.options.map(option => <option key={option.id} value={option.id} disabled={!!option.archivedAt}>{option.label}{option.archivedAt ? " (retired)" : ""}</option>)}</select> : active.type === "LONG_TEXT" ?
          <Textarea id={id} aria-label={active.label} autoFocus value={text} disabled={pending} maxLength={maxLength} onChange={event => setDraft(event.target.value)} /> :
          <Input id={id} aria-label={active.label} autoFocus type={active.type === "DATE" ? "date" : active.type === "EMAIL" ? "email" : active.type === "URL" ? "url" : active.type === "PHONE" ? "tel" : "text"} inputMode={active.type === "NUMBER" ? "decimal" : undefined} value={text} disabled={pending} maxLength={maxLength} onChange={event => setDraft(event.target.value)} />}
      {error && <p role="alert" className="text-xs text-destructive">{error} Last saved: <FieldValueDisplay definition={opening} value={confirmed} userLabel={userLabel} /></p>}
      <div className="flex flex-wrap gap-2"><Button size="sm" type="button" aria-label={`Save ${active.label.toLowerCase()}`} disabled={pending} onClick={() => void save()}>Save</Button><Button size="sm" type="button" variant="ghost" disabled={pending} onClick={discard}>Cancel</Button>{!active.required && <Button type="button" size="sm" variant="outline" aria-label={`Clear ${active.label.toLowerCase()}`} disabled={pending} onClick={() => setDraft(null)}>Clear</Button>}</div>
    </div> : <div className="flex items-start justify-between gap-2"><div className="min-w-0 text-sm"><FieldValueDisplay definition={definition} value={confirmed} userLabel={userLabel} /></div><Button ref={editButton} type="button" variant="ghost" size="sm" aria-label={`Edit ${definition.label.toLowerCase()}`} disabled={unavailable} onClick={() => { setOpening(definition); setDraft(fieldDraft(definition.type, confirmed)); setError(""); setSuccess(""); }}>Edit</Button></div>}
    <div role="status" aria-live="polite" className="text-xs text-muted-foreground">{pending ? "Saving…" : success}</div>
  </div>;
}
