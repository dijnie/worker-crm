"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useAppData } from "../app-data-provider";
import { RecordPicker } from "../records/record-picker";
import { propertyError } from "./property-values";
export type DirtyEditor = { dirty: boolean; pending?: boolean; save: () => Promise<boolean>; discard: () => void };
export type DirtyChange = (key: string, state: DirtyEditor | null) => void;
export function InlineField({ fieldKey, label, value, display, onSave, onDirtyChange, multiline, type = "text", picker, required, selectedLabel, readOnly = false }: {
  fieldKey: string; label: string; value: string; display?: ReactNode; onSave: (value: string) => Promise<string>;
  onDirtyChange: DirtyChange; multiline?: boolean; type?: string; picker?: "owner" | "company" | "contact"; required?: boolean; selectedLabel?: string; readOnly?: boolean;
}) {
  const { store, generation } = useAppData();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  const [draft, setDraft] = useState(value);
  const [confirmed, setConfirmed] = useState(value);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const flight = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);
  const draftRef = useRef(draft); draftRef.current = draft;
  const confirmedRef = useRef(confirmed); confirmedRef.current = confirmed;
  const cancelBlur = useRef(false);
  const observedValue = useRef(value);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!editing && !flight.current && observedValue.current !== value) { setConfirmed(value); setDraft(value); }
    observedValue.current = value;
  }, [value, editing]);
  const discard = () => { if (flight.current) return; cancelBlur.current = true; editingRef.current = false; draftRef.current = confirmedRef.current; setDraft(confirmedRef.current); setEditing(false); setError(""); };
  const save = (): Promise<boolean> => {
    if (readOnly) return Promise.resolve(false);
    if (flight.current) return flight.current;
    if (!editingRef.current) return Promise.resolve(true);
    if (draftRef.current === confirmedRef.current) { editingRef.current = false; setEditing(false); return Promise.resolve(true); }
    setPending(true); setError("");
    const submitted = draftRef.current;
    flight.current = (async () => {
      try {
        const saved = await onSave(submitted);
        if (!mounted.current || !store.isCurrent(generation)) return false;
        confirmedRef.current = saved; draftRef.current = saved; editingRef.current = false;
        setConfirmed(saved); setDraft(saved); setEditing(false); return true;
      } catch (failure) {
        if (mounted.current && store.isCurrent(generation)) setError(propertyError(failure));
        return false;
      } finally {
        flight.current = null;
        if (mounted.current && store.isCurrent(generation)) setPending(false);
      }
    })();
    return flight.current;
  };
  const latest = useRef({ save, discard }); latest.current = { save, discard };
  const dirty = draft !== confirmed || pending;
  useEffect(() => {
    onDirtyChange(fieldKey, dirty ? { dirty: true, pending, save: () => latest.current.save(), discard: () => latest.current.discard() } : null);
    return () => onDirtyChange(fieldKey, null);
  }, [dirty, pending, fieldKey, onDirtyChange]);
  return <div className="space-y-1 border-b py-3" data-property={fieldKey}>
    <label htmlFor={editing ? id : undefined} className="text-xs font-medium text-muted-foreground">{label}</label>
    {editing ? <div data-inline-editor className="space-y-2" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); discard(); }
      if (event.key === "Enter" && !picker && !event.shiftKey) { event.preventDefault(); cancelBlur.current = true; void save(); }
    }}>
      {picker ? <RecordPicker kind={picker} label={label} value={draft} required={required} selectedLabel={selectedLabel} disabled={pending} onChange={setDraft} /> : multiline ?
        <Textarea id={id} aria-label={label} autoFocus disabled={pending} value={draft} onChange={event => setDraft(event.target.value)} /> :
        <Input id={id} aria-label={label} type={type} inputMode={fieldKey.endsWith(":amount") ? "decimal" : undefined} autoFocus disabled={pending} value={draft}
          onChange={event => setDraft(event.target.value)} onBlur={event => {
            if (cancelBlur.current) { cancelBlur.current = false; return; }
            if (!editingRef.current || flight.current) return;
            if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest(`[data-property]`) === event.currentTarget.closest(`[data-property]`)) return;
            void save();
          }} />}
      {error && <p role="alert" className="text-xs text-destructive">{error} Last saved: {confirmed || "Not set"}</p>}
      <div className="flex gap-2"><Button size="sm" type="button" disabled={pending} aria-label={`Save ${label.toLowerCase()}`} onClick={() => void save()}>{pending ? "Saving…" : "Save"}</Button>
        <Button size="sm" type="button" variant="ghost" disabled={pending} onMouseDown={() => { cancelBlur.current = true; }} onClick={discard}>Cancel</Button></div>
    </div> : <div className="flex items-start justify-between gap-2"><div className="min-w-0 whitespace-pre-wrap break-words text-sm">{display ?? (confirmed || <span className="text-muted-foreground">Not set</span>)}</div>
      {!readOnly && <Button type="button" variant="ghost" size="sm" aria-label={`Edit ${label.toLowerCase()}`} onClick={() => { cancelBlur.current = false; editingRef.current = true; setDraft(confirmed); setEditing(true); }}>Edit</Button>}</div>}
  </div>;
}
