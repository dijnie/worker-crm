"use client";
import { canPermission } from "@/lib/auth/permissions";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import { ApiError } from "@/lib/api";
import type { FieldEntity } from "@/lib/db/schema/constants";
import { errorMessage } from "@/lib/i18n/error-message";
import { fieldDraft, parseFieldDraft, type FieldDefinition, type FieldValue } from "@/lib/field-form-values";
import { useAppData, useAppQuery } from "../app-data-provider";
import { PROPERTY_LABEL, PROPERTY_ROW, DetailSheetSection } from "../detail-sheet";
import { useDictionary } from "../i18n-provider";
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
  const { api, account } = useAppData();
  const dictionary = useDictionary();
  const copy = dictionary.fields;
  const entity = record.kind.toUpperCase() as FieldEntity;
  const values = useAppQuery("fields:values", { entity, id: record.id }, signal => api.fields.values(entity, record.id, { signal }));
  const [dirtyIds, setDirtyIds] = useState<string[]>([]);
  const remembered = useRef<ValueDefinition[]>([]);
  if (values.data) remembered.current = [...values.data, ...remembered.current.filter(row => dirtyIds.includes(row.id) && !values.data?.some(next => next.id === row.id))];
  const visible = (values.error ? remembered.current.filter(row => dirtyIds.includes(row.id)) : remembered.current).filter(row => row.showOnSheet || dirtyIds.includes(row.id));
  const directory = useAssigneeDirectory();
  return <DetailSheetSection aria-label={copy.panel.regionLabel} title={copy.panel.regionLabel} action={account.role?.isSystem ? <Link className="text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground" href={`/settings?returnTo=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname + window.location.search)}`}>{copy.panel.manageFields}</Link> : null}>
    {values.loading && <div role="status" aria-busy="true" aria-label={copy.panel.loadingLabel} className="space-y-3 py-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-b py-2 last:border-b-0">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>}
    {values.error ? <p role="alert" className="text-destructive text-xs">{values.error instanceof ApiError ? errorMessage(values.error, dictionary) : copy.panel.unavailable} <button type="button" className="underline" onClick={values.refresh}>{copy.panel.retry}</button></p> : !values.loading && !visible.length && <p className="text-muted-foreground text-xs">{copy.panel.empty}</p>}
    {visible.some(definition => definition.type === "USER") && !!directory.error && <p role="alert" className="text-destructive text-xs">{copy.panel.directoryUnavailable} <button type="button" className="underline" onClick={directory.refresh}>{copy.panel.retryDirectory}</button></p>}
    {visible.map(definition => <ValueEditor key={definition.id} record={record} definition={definition}
      userLabel={definition.type !== "USER" || definition.value == null ? undefined : directory.error ? copy.panel.directoryUnavailableValue(String(definition.value)) : directory.loading ? copy.panel.directoryLoadingValue(String(definition.value)) : directory.data?.find(user => user.id === definition.value)?.name}
      unavailable={!!values.error || !!values.data && !values.data.some(row => row.id === definition.id && row.showOnSheet)} onDirtyChange={(key, state) => {
        setDirtyIds(ids => state ? ids.includes(definition.id) ? ids : [...ids, definition.id] : ids.includes(definition.id) ? ids.filter(id => id !== definition.id) : ids);
        onDirtyChange(key, state);
      }} />)}
  </DetailSheetSection>;
}
function ValueEditor({ record, definition, onDirtyChange, userLabel, unavailable }: {
  record: RecordRef; definition: ValueDefinition; onDirtyChange: DirtyChange; userLabel?: string; unavailable: boolean;
}) {
  const { api, store, generation, invalidate, account } = useAppData();
  const dictionary = useDictionary();
  const copy = dictionary.fields;
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
    try { value = parseFieldDraft(snapshot.opening.type, snapshot.draft, snapshot.opening.required, copy.validation); }
    catch (failure) { setError(failure instanceof Error ? failure.message : copy.panel.checkValue); return Promise.resolve(false); }
    if (snapshot.draft === fieldDraft(snapshot.opening.type, snapshot.confirmed)) { discard(); return Promise.resolve(true); }
    setPending(true); setError(""); setSuccess("");
    flight.current = (async () => {
      try {
        const result = await api.fields.setValue(definition.id, record.kind.toUpperCase() as FieldEntity, record.id, value, snapshot.opening!.type);
        if (!store.isCurrent(generation)) return false;
        invalidate(["fields"]);
        if (mounted.current) { setConfirmed(result.value); setDraft(fieldDraft(snapshot.opening!.type, result.value)); setOpening(null); setSuccess(copy.panel.saved); focus(); }
        return true;
      } catch (failure) {
        if (mounted.current && store.isCurrent(generation)) {
          setError(failure instanceof ApiError ? errorMessage(failure, dictionary) : copy.saveNotConfirmed);
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
  return <div ref={root} className={cn(PROPERTY_ROW, "items-center border-b py-2 last:border-b-0")} data-custom-field={definition.key} data-field-id={definition.id}>
    <label htmlFor={opening ? id : undefined} className={PROPERTY_LABEL}>{active.label}{active.required ? " *" : ""}</label>
    <div className="min-w-0">
      {opening ? <div data-inline-editor className="space-y-2" onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!dirty) discard(); }
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); void save(); }
      }}>
        {(unavailable || definition.type !== opening.type) && <p role="alert" className="text-destructive text-xs">{copy.panel.draftMismatch(opening.type)}</p>}
        {active.type === "CHECKBOX" ? <div className="space-y-1"><span className="flex items-center gap-2 text-xs/5"><Checkbox id={id} aria-label={active.label} checked={draft === true} disabled={pending} onCheckedChange={next => setDraft(next === true)} /><span>{draft === null ? copy.valueDisplay.notSet : draft ? copy.valueDisplay.yes : copy.valueDisplay.no}</span></span>
          {draft === null && <Button type="button" size="sm" variant="outline-ghost" disabled={pending} onClick={() => setDraft(false)}>{copy.panel.setToNo}</Button>}</div> : active.type === "USER" ? <RecordPicker kind="owner" label={active.label} value={text} required={active.required} disabled={pending} selectedLabel={userLabel} onChange={setDraft} /> : active.type === "SELECT" ?
          <select id={id} aria-label={active.label} autoFocus className={selectClass} value={text} disabled={pending} onChange={event => setDraft(event.target.value)}><option value="">{copy.panel.chooseOption}</option>{active.options.map(option => <option key={option.id} value={option.id} disabled={!!option.archivedAt}>{option.label}{option.archivedAt ? copy.valueDisplay.retiredSuffix : ""}</option>)}</select> : active.type === "LONG_TEXT" ?
            <Textarea id={id} aria-label={active.label} autoFocus value={text} disabled={pending} maxLength={maxLength} onChange={event => setDraft(event.target.value)} /> :
            <Input id={id} aria-label={active.label} autoFocus type={active.type === "DATE" ? "date" : active.type === "EMAIL" ? "email" : active.type === "URL" ? "url" : active.type === "PHONE" ? "tel" : "text"} inputMode={active.type === "NUMBER" ? "decimal" : undefined} value={text} disabled={pending} maxLength={maxLength} onChange={event => setDraft(event.target.value)} />}
        {error && <p role="alert" className="text-destructive text-xs">{error} {copy.panel.lastSaved} <FieldValueDisplay definition={opening} value={confirmed} userLabel={userLabel} copy={copy.valueDisplay} /></p>}
        <div className="flex flex-wrap gap-2"><Button size="sm" type="button" aria-label={copy.panel.saveAria(active.label.toLowerCase())} disabled={pending} onClick={() => void save()}>{pending ? dictionary.common.saving : dictionary.common.save}</Button><Button size="sm" type="button" variant="ghost" disabled={pending} onClick={discard}>{dictionary.common.cancel}</Button>{!active.required && <Button type="button" size="sm" variant="outline-ghost" aria-label={copy.panel.clearAria(active.label.toLowerCase())} disabled={pending} onClick={() => setDraft(null)}>{copy.panel.clear}</Button>}</div>
      </div> : <div className="flex items-start justify-between gap-2"><div className="min-w-0 text-xs/5"><FieldValueDisplay definition={definition} value={confirmed} userLabel={userLabel} copy={copy.valueDisplay} /></div>{canPermission(account, record.kind, "update") && <Button ref={editButton} type="button" variant="ghost" size="sm" aria-label={copy.panel.editAria(definition.label.toLowerCase())} disabled={unavailable} onClick={() => { setOpening(definition); setDraft(fieldDraft(definition.type, confirmed)); setError(""); setSuccess(""); }}>{copy.actions.edit}</Button>}</div>}
      <div role="status" aria-live="polite" className="text-muted-foreground text-xs">{pending ? dictionary.common.saving : success}</div>
    </div>
  </div>;
}
