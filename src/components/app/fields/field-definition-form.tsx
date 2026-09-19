"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { FIELD_TYPES, type FieldEntity, type FieldType } from "@/lib/db/schema/constants";
import { errorMessage } from "@/lib/i18n/error-message";
import { derivedFieldKey, type FieldDefinition } from "@/lib/field-form-values";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useDictionary } from "../i18n-provider";
import { selectClass } from "../records/record-picker";

type DraftOption = { id?: string; localId: string; label: string };
export function FieldDefinitionForm({ entity, definition, onClose }: { entity: FieldEntity; definition?: FieldDefinition; onClose: () => void }) {
  const { api, invalidate, store, generation } = useAppData();
  const dictionary = useDictionary();
  const copy = dictionary.fields;
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
    if (!draft.label.trim()) { setError(copy.form.labelRequired); return; }
    const key = draft.key.trim() || derivedFieldKey(draft.label);
    if (!definition && (!/^[a-z][a-z0-9_]*$/.test(key) || key.length > 200)) { setError(copy.form.keyInvalid); return; }
    if (draft.type === "SELECT" && (!options.length || options.some(option => !option.label.trim()))) { setError(copy.form.optionsRequired); return; }
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
      if (mounted.current && store.isCurrent(generation)) setError(failure instanceof ApiError ? errorMessage(failure, dictionary) : copy.saveNotConfirmed);
    } finally { pendingRef.current = false; if (mounted.current && store.isCurrent(generation)) setPending(false); }
  };
  const toggles = ([
    ["required", "required"],
    ["showOnSheet", "sheet"],
    ["showOnTable", "table"],
    ["showOnFilter", "filter"],
  ] as const);
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto" onEscapeKeyDown={event => { if (dirty || pending) { event.preventDefault(); close(); } }} onInteractOutside={event => { if (dirty || pending) event.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>{definition ? copy.form.editTitle : copy.form.newTitle}</DialogTitle>
        <DialogDescription>{copy.form.description(dictionary.crm.entities[entity].lower)}</DialogDescription>
      </DialogHeader>
      <form aria-label={copy.form.formLabel} className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={pending}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-label`}>{copy.form.fieldLabel}</FieldLabel>
              <Input id={`${id}-label`} autoFocus required maxLength={1000} value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} />
            </Field>

            {definition ? <dl className="grid grid-cols-2 gap-2 text-xs">
              <div><dt className="text-muted-foreground">{copy.form.entityImmutable}</dt><dd>{definition.entity}</dd></div>
              <div><dt className="text-muted-foreground">{copy.form.keyImmutable}</dt><dd className="break-all">{definition.key}</dd></div>
            </dl> : <Field>
              <FieldLabel htmlFor={`${id}-key`}>{copy.form.fieldKeyOptional}</FieldLabel>
              <Input id={`${id}-key`} maxLength={200} pattern="[a-z][a-z0-9_]*" placeholder={derivedFieldKey(draft.label) || copy.form.keyPlaceholderFallback} value={draft.key} onChange={event => setDraft({ ...draft, key: event.target.value })} />
              <FieldDescription>{copy.form.keyPreview(draft.key.trim() || derivedFieldKey(draft.label) || copy.form.enterExplicitKey)}</FieldDescription>
            </Field>}

            <Field>
              <FieldLabel htmlFor={`${id}-type`}>{copy.form.fieldType}</FieldLabel>
              <select id={`${id}-type`} className={selectClass} value={draft.type} onChange={event => { const type = event.target.value as FieldType; setDraft({ ...draft, type, showOnFilter: (type === "SELECT" || type === "USER") && draft.showOnFilter }); }}>
                {FIELD_TYPES.map(type => <option key={type} value={type}>{dictionary.crm.fieldTypes[type]}</option>)}
              </select>
              {definition && <FieldDescription>{copy.form.typeChangeHint}</FieldDescription>}
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              {toggles.map(([key, suffix]) => <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-${suffix}`}
                  checked={draft[key]}
                  disabled={pending || (key === "showOnFilter" && draft.type !== "SELECT" && draft.type !== "USER")}
                  onCheckedChange={checked => setDraft({ ...draft, [key]: checked === true })}
                />
                <Label htmlFor={`${id}-${suffix}`}>{copy.form.toggles[key]}</Label>
              </div>)}
            </div>
            <FieldDescription>{copy.form.filtersHint}</FieldDescription>

            {draft.type === "SELECT" && <FieldSet aria-label={copy.form.selectOptions} className="rounded-lg border p-3">
              <FieldLegend variant="label" className="mb-0">{copy.form.selectOptions}</FieldLegend>
              {options.map((option, index) => <div key={option.localId} className="flex flex-wrap items-center gap-1">
                <Input className="min-w-24 flex-1" aria-label={copy.form.optionLabelAria(index + 1)} maxLength={1000} required value={option.label} onChange={event => setOptions(rows => rows.map(row => row.localId === option.localId ? { ...row, label: event.target.value } : row))} />
                <Button type="button" size="sm" variant="ghost" aria-label={copy.form.moveOptionUpAria(index + 1)} disabled={index === 0} onClick={() => move(index, -1)}>↑</Button>
                <Button type="button" size="sm" variant="ghost" aria-label={copy.form.moveOptionDownAria(index + 1)} disabled={index === options.length - 1} onClick={() => move(index, 1)}>↓</Button>
                <Button type="button" size="sm" variant="ghost" aria-label={copy.form.archiveOptionAria(index + 1)} onClick={() => { if (option.id) setRemoved(rows => [...rows, option]); setOptions(rows => rows.filter(row => row.localId !== option.localId)); }}>{copy.actions.archive}</Button>
              </div>)}
              <Button type="button" size="sm" variant="outline" className="self-start" disabled={options.length >= 100} onClick={() => setOptions(rows => [...rows, { localId: crypto.randomUUID(), label: "" }])}>{copy.form.addOption}</Button>
              <div className="flex items-center gap-2">
                <Checkbox id={`${id}-archived-options`} checked={includeArchived} onCheckedChange={checked => setIncludeArchived(checked === true)} />
                <Label htmlFor={`${id}-archived-options`}>{copy.form.showArchivedOptions}</Label>
              </div>
              {includeArchived && <div className="flex flex-col gap-2">
                {optionsQuery.loading && <p role="status" className="text-xs">{copy.form.loadingArchivedOptions}</p>}
                {optionsQuery.error
                  ? <p role="alert" className="text-xs text-destructive">{copy.form.archivedOptionsUnavailable}{" "}<Button type="button" variant="link" className="h-auto px-0" onClick={optionsQuery.refresh}>{copy.form.retryOptions}</Button></p>
                  : !optionsQuery.loading && !archived.length && <p className="text-xs text-muted-foreground">{copy.form.noArchivedOptions}</p>}
                {archived.map(option => <div key={option.localId} className="flex items-center justify-between gap-2 text-xs">
                  <span>{option.label}{copy.valueDisplay.retiredSuffix}</span>
                  <Button type="button" size="sm" variant="outline" aria-label={copy.form.restoreOptionAria(option.label)} disabled={options.length >= 100} onClick={() => { setOptions(rows => [...rows, option]); setRemoved(rows => rows.filter(row => row.localId !== option.localId)); }}>{copy.actions.restore}</Button>
                </div>)}
              </div>}
              <FieldDescription>{copy.form.optionsHint}</FieldDescription>
            </FieldSet>}

            {definition && <details>
              <summary className="cursor-pointer text-xs font-medium">{copy.form.storedAgentMetadata}</summary>
              <dl className="mt-2 text-xs">
                <dt>{copy.form.agentFilled}</dt><dd>{definition.agentFilled ? copy.valueDisplay.yes : copy.valueDisplay.no}</dd>
                <dt className="mt-2">{copy.form.agentBrief}</dt><dd className="whitespace-pre-wrap break-words">{definition.agentBrief || copy.valueDisplay.notSet}</dd>
              </dl>
            </details>}
          </FieldGroup>
        </fieldset>

        {error && <Alert variant="destructive">{error}</Alert>}
        <div role="status" aria-live="polite" className="text-xs text-muted-foreground">{pending ? copy.form.savingField : ""}</div>
        {confirmClose && <Alert>
          <p>{copy.form.unsavedChanges}</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={() => { next.current = null; setConfirmClose(false); }}>{copy.form.keepEditing}</Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => { if (!pendingRef.current) finish(); }}>{copy.form.discardChanges}</Button>
          </div>
        </Alert>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={close}>{dictionary.common.cancel}</Button>
          <Button type="submit" disabled={pending}>{copy.form.saveField}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
