"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FIELD_TYPES, type FieldEntity, type FieldType } from "@/lib/db/schema/constants";
import { derivedFieldKey, FIELD_TYPE_LABELS, type FieldDefinition } from "@/lib/field-form-values";
import { useAppData, useAppQuery } from "../app-data-provider";
import { selectClass } from "../records/record-picker";

type DraftOption = { id?: string; localId: string; label: string };
export function FieldDefinitionForm({ entity, definition, onClose }: { entity: FieldEntity; definition?: FieldDefinition; onClose: () => void }) {
  const { api, invalidate, store, generation } = useAppData();
  const id = useId();
  const [draft, setDraft] = useState(() => ({ label: definition?.label ?? "", key: "", type: definition?.type ?? "TEXT" as FieldType,
    required: definition?.required ?? false, showOnSheet: definition?.showOnSheet ?? true,
    showOnTable: definition?.showOnTable ?? false, showOnFilter: definition?.showOnFilter ?? false }));
  const [options, setOptions] = useState<DraftOption[]>(() => (definition?.options ?? []).map(option => ({ id: option.id, localId: option.id, label: option.label })));
  const initial = useRef(JSON.stringify({ draft, options }));
  const [includeArchived, setIncludeArchived] = useState(false);
  const [removed, setRemoved] = useState<DraftOption[]>([]);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const mounted = useRef(true);
  const next = useRef<(() => void) | null>(null);
  const bypass = useRef(false);
  const dirty = initial.current !== JSON.stringify({ draft, options });
  const optionsQuery = useAppQuery("fields:options", { id: definition?.id ?? null, archived: true }, signal => definition?.type === "SELECT" ? api.fields.options(definition.id, true, { signal }) : Promise.resolve([]));
  const archived = [...(optionsQuery.data ?? []).filter(option => option.archivedAt && !options.some(active => active.id === option.id)).map(option => ({ id: option.id, localId: option.id, label: option.label })), ...removed.filter(option => !options.some(active => active.localId === option.localId))];
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!dirty && !pending) return;
    const href = window.location.href;
    const state = window.history.state;
    const historyIndex = Number(state?.workerRecordHistoryIndex);
    let restoring = false;
    const pop = (event: PopStateEvent) => {
      if (bypass.current) return;
      event.stopImmediatePropagation();
      if (restoring) { restoring = false; return; }
      const targetIndex = Number(window.history.state?.workerRecordHistoryIndex);
      const delta = Number.isFinite(historyIndex) && Number.isFinite(targetIndex) ? targetIndex - historyIndex : 0;
      const target = window.location.href;
      if (delta) {
        restoring = true; window.history.go(-delta);
        next.current = () => window.history.go(delta);
      } else {
        window.history.replaceState(state, "", href);
        next.current = () => window.location.replace(target);
      }
      setConfirmClose(true);
    };
    // Cancel traversal before the router's popstate listener can unmount this draft.
    const traverse = (event: NavigateEvent) => {
      if (bypass.current || event.navigationType !== "traverse" || !event.cancelable || !event.destination.sameDocument) return;
      const navigation = window.navigation;
      if (!navigation) return;
      const key = event.destination.key;
      event.preventDefault();
      next.current = () => { navigation.traverseTo(key); };
      setConfirmClose(true);
    };
    const unload = (event: BeforeUnloadEvent) => { if (!bypass.current) { event.preventDefault(); event.returnValue = ""; } };
    const navigation = (event: MouseEvent) => {
      if (bypass.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href);
      if (url.href === window.location.href || (url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search)) return;
      event.preventDefault(); event.stopPropagation();
      next.current = () => window.location.assign(url.href);
      setConfirmClose(true);
    };
    window.navigation?.addEventListener("navigate", traverse);
    window.addEventListener("popstate", pop, true); window.addEventListener("beforeunload", unload); document.addEventListener("click", navigation, true);
    return () => { window.navigation?.removeEventListener("navigate", traverse); window.removeEventListener("popstate", pop, true); window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigation, true); };
  }, [dirty, pending]);
  const finish = () => {
    const action = next.current; next.current = null; bypass.current = true;
    onClose(); action?.();
  };
  const close = () => { if (pendingRef.current) return; next.current = null; if (dirty) setConfirmClose(true); else onClose(); };
  const move = (index: number, offset: number) => setOptions(rows => { const next = [...rows]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; return next; });
  const save = async () => {
    if (pendingRef.current || !store.isCurrent(generation)) return;
    setError("");
    if (!draft.label.trim()) { setError("Field label is required."); return; }
    const key = draft.key.trim() || derivedFieldKey(draft.label);
    if (!definition && (!/^[a-z][a-z0-9_]*$/.test(key) || key.length > 200)) { setError("Enter a field key beginning with a lowercase letter, using letters, numbers and underscores."); return; }
    if (draft.type === "SELECT" && (!options.length || options.some(option => !option.label.trim()))) { setError("A select field needs at least one option, and every option needs a label."); return; }
    const body = { label: draft.label.trim(), type: draft.type, required: draft.required, showOnSheet: draft.showOnSheet,
      showOnTable: draft.showOnTable, showOnFilter: (draft.type === "SELECT" || draft.type === "USER") && draft.showOnFilter,
      ...(draft.type === "SELECT" ? { options: options.map((option, position) => ({ ...(option.id ? { id: option.id } : {}), label: option.label.trim(), position })) } : {}) };
    pendingRef.current = true; setPending(true);
    try {
      if (definition) await api.fields.update(definition.id, body);
      else await api.fields.create({ ...body, entity, key });
      if (!store.isCurrent(generation)) return;
      invalidate(["fields"]);
      if (mounted.current) finish();
    } catch (failure) {
      if (mounted.current && store.isCurrent(generation)) setError(failure instanceof Error ? failure.message : "The save could not be confirmed. Your draft is preserved.");
    } finally { pendingRef.current = false; if (mounted.current && store.isCurrent(generation)) setPending(false); }
  };
  const toggles = ([
    ["required", "Required", "required"],
    ["showOnSheet", "Show on sheet", "sheet"],
    ["showOnTable", "Show on table", "table"],
    ["showOnFilter", "Show on filter", "filter"],
  ] as const);
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto" onEscapeKeyDown={event => { if (dirty || pending) { event.preventDefault(); close(); } }} onInteractOutside={event => { if (dirty || pending) event.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>{definition ? "Edit field" : "New field"}</DialogTitle>
        <DialogDescription>Configure a {entity.toLowerCase()} custom field. Changes apply across this workspace.</DialogDescription>
      </DialogHeader>
      <form aria-label="Field definition" className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={pending}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-label`}>Field label</FieldLabel>
              <Input id={`${id}-label`} autoFocus required maxLength={1000} value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} />
            </Field>

            {definition ? <dl className="grid grid-cols-2 gap-2 text-xs">
              <div><dt className="text-muted-foreground">Entity (immutable)</dt><dd>{definition.entity}</dd></div>
              <div><dt className="text-muted-foreground">Key (immutable)</dt><dd className="break-all">{definition.key}</dd></div>
            </dl> : <Field>
              <FieldLabel htmlFor={`${id}-key`}>Field key (optional)</FieldLabel>
              <Input id={`${id}-key`} maxLength={200} pattern="[a-z][a-z0-9_]*" placeholder={derivedFieldKey(draft.label) || "custom_field"} value={draft.key} onChange={event => setDraft({ ...draft, key: event.target.value })} />
              <FieldDescription>Key preview: {draft.key.trim() || derivedFieldKey(draft.label) || "Enter an explicit key"}. The key cannot change after creation.</FieldDescription>
            </Field>}

            <Field>
              <FieldLabel htmlFor={`${id}-type`}>Field type</FieldLabel>
              <select id={`${id}-type`} className={selectClass} value={draft.type} onChange={event => { const type = event.target.value as FieldType; setDraft({ ...draft, type, showOnFilter: (type === "SELECT" || type === "USER") && draft.showOnFilter }); }}>
                {FIELD_TYPES.map(type => <option key={type} value={type}>{FIELD_TYPE_LABELS[type]}</option>)}
              </select>
              {definition && <FieldDescription>A type change is allowed only when the field has no stored values.</FieldDescription>}
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              {toggles.map(([key, label, suffix]) => <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-${suffix}`}
                  checked={draft[key]}
                  disabled={pending || (key === "showOnFilter" && draft.type !== "SELECT" && draft.type !== "USER")}
                  onCheckedChange={checked => setDraft({ ...draft, [key]: checked === true })}
                />
                <Label htmlFor={`${id}-${suffix}`}>{label}</Label>
              </div>)}
            </div>
            <FieldDescription>Filters support Select and User fields. Required prevents clearing a value; existing empty records remain allowed.</FieldDescription>

            {draft.type === "SELECT" && <FieldSet aria-label="Select options" className="rounded-lg border p-3">
              <FieldLegend variant="label" className="mb-0">Select options</FieldLegend>
              {options.map((option, index) => <div key={option.localId} className="flex flex-wrap items-center gap-1">
                <Input className="min-w-24 flex-1" aria-label={`Option ${index + 1} label`} maxLength={1000} required value={option.label} onChange={event => setOptions(rows => rows.map(row => row.localId === option.localId ? { ...row, label: event.target.value } : row))} />
                <Button type="button" size="sm" variant="ghost" aria-label={`Move option ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</Button>
                <Button type="button" size="sm" variant="ghost" aria-label={`Move option ${index + 1} down`} disabled={index === options.length - 1} onClick={() => move(index, 1)}>↓</Button>
                <Button type="button" size="sm" variant="ghost" aria-label={`Archive option ${index + 1}`} onClick={() => { if (option.id) setRemoved(rows => [...rows, option]); setOptions(rows => rows.filter(row => row.localId !== option.localId)); }}>Archive</Button>
              </div>)}
              <Button type="button" size="sm" variant="outline" className="self-start" disabled={options.length >= 100} onClick={() => setOptions(rows => [...rows, { localId: crypto.randomUUID(), label: "" }])}>Add option</Button>
              <div className="flex items-center gap-2">
                <Checkbox id={`${id}-archived-options`} checked={includeArchived} onCheckedChange={checked => setIncludeArchived(checked === true)} />
                <Label htmlFor={`${id}-archived-options`}>Show archived options</Label>
              </div>
              {includeArchived && <div className="flex flex-col gap-2">
                {optionsQuery.loading && <p role="status" className="text-xs">Loading archived options…</p>}
                {optionsQuery.error
                  ? <p role="alert" className="text-xs text-destructive">Archived options unavailable.{" "}<Button type="button" variant="link" className="h-auto px-0" onClick={optionsQuery.refresh}>Retry options</Button></p>
                  : !optionsQuery.loading && !archived.length && <p className="text-xs text-muted-foreground">No archived options.</p>}
                {archived.map(option => <div key={option.localId} className="flex items-center justify-between gap-2 text-xs">
                  <span>{option.label} (retired)</span>
                  <Button type="button" size="sm" variant="outline" aria-label={`Restore option ${option.label}`} disabled={options.length >= 100} onClick={() => { setOptions(rows => [...rows, option]); setRemoved(rows => rows.filter(row => row.localId !== option.localId)); }}>Restore</Button>
                </div>)}
              </div>}
              <FieldDescription>Renaming, ordering, archiving and restoring options take effect when you save the field. Historical values retain their option IDs.</FieldDescription>
            </FieldSet>}

            {definition && <details>
              <summary className="cursor-pointer text-xs font-medium">Stored agent metadata</summary>
              <dl className="mt-2 text-xs">
                <dt>Agent filled</dt><dd>{definition.agentFilled ? "Yes" : "No"}</dd>
                <dt className="mt-2">Agent brief</dt><dd className="whitespace-pre-wrap break-words">{definition.agentBrief || "Not set"}</dd>
              </dl>
            </details>}
          </FieldGroup>
        </fieldset>

        {error && <Alert variant="destructive">{error}</Alert>}
        <div role="status" aria-live="polite" className="text-xs text-muted-foreground">{pending ? "Saving field…" : ""}</div>
        {confirmClose && <Alert>
          <p>Keep editing or discard your unsaved field changes.</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={() => { next.current = null; setConfirmClose(false); }}>Keep editing</Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => { if (!pendingRef.current) finish(); }}>Discard changes</Button>
          </div>
        </Alert>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={close}>Cancel</Button>
          <Button type="submit" disabled={pending}>Save field</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
