"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FIELD_ENTITIES, type FieldEntity } from "@/lib/db/schema/constants";
import { FIELD_TYPE_LABELS, type FieldDefinition } from "@/lib/field-form-values";
import { safeReturnUrl } from "@/lib/auth/safe-return-url";
import { useAppData, useAppQuery } from "../app-data-provider";
import { FieldDefinitionForm } from "./field-definition-form";
export function FieldDefinitionList() {
  const { generation } = useAppData();
  return <DefinitionSession key={generation} />;
}
function DefinitionSession() {
  const { api, invalidate, store, generation } = useAppData();
  const params = useSearchParams();
  const [entity, setEntity] = useState<FieldEntity>("COMPANY");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{ entity: FieldEntity; definition?: FieldDefinition } | null>(null);
  const [pending, setPending] = useState(false);
  const flight = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const definitions = useAppQuery("fields", { entity, includeArchived }, signal => api.fields.list(entity, includeArchived, { signal }));
  const active = definitions.data?.filter(field => !field.archivedAt) ?? [];
  const filtered = definitions.data?.filter(field => `${field.label} ${field.key}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const mutate = async (operation: () => Promise<unknown>, message: string) => {
    if (flight.current || !store.isCurrent(generation)) return;
    flight.current = true; setPending(true); setError(""); setSuccess("");
    try { await operation(); if (store.isCurrent(generation)) { invalidate(["fields"]); setSuccess(message); } }
    catch (failure) { if (store.isCurrent(generation)) { setError(failure instanceof Error ? failure.message : "The change could not be confirmed."); invalidate(["fields"]); } }
    finally { flight.current = false; if (store.isCurrent(generation)) setPending(false); }
  };
  const reorder = (index: number, offset: number) => {
    const ids = active.map(field => field.id); [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    void mutate(() => api.fields.reorder({ entity, ids }), "Field order saved.");
  };
  return <section className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground sm:p-6" aria-label="Custom field settings">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium">Custom fields</h2><p className="mt-1 text-sm text-muted-foreground">Manage record properties for your workspace.</p></div><Button onClick={() => setEditor({ entity })} disabled={pending}>New field</Button></div>
    <div className="flex flex-wrap gap-2" aria-label="Field entity">{FIELD_ENTITIES.map(value => <Button key={value} size="sm" variant={entity === value ? "default" : "outline"} aria-pressed={entity === value} disabled={pending} onClick={() => { setEntity(value); setSearch(""); setError(""); setSuccess(""); }}>{value[0] + value.slice(1).toLowerCase()}</Button>)}</div>
    <div className="flex flex-wrap items-center gap-3"><Input className="sm:max-w-xs" aria-label="Search custom fields" placeholder="Search fields…" value={search} onChange={event => setSearch(event.target.value)} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeArchived} disabled={pending} onChange={event => setIncludeArchived(event.target.checked)} />Include archived fields</label></div>
    {definitions.loading && <div role="status" aria-busy="true" aria-label="Loading fields" className="space-y-3 py-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex flex-wrap gap-1">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      ))}
    </div>}
    {definitions.error ? <p role="alert" className="text-sm text-destructive">{definitions.error instanceof Error ? definitions.error.message : "Fields unavailable."} <button type="button" className="underline" onClick={definitions.refresh}>Retry fields</button></p> : !definitions.loading && !filtered.length && <p className="py-4 text-sm text-muted-foreground">{search ? "No fields match your search." : `No ${entity.toLowerCase()} fields yet.`}</p>}
    <ul className="divide-y">{filtered.map(field => {
      const index = active.findIndex(value => value.id === field.id);
      return <li key={field.id} data-field-id={field.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"><div className="min-w-0"><p className="break-words text-sm font-medium">{field.label}{field.archivedAt ? " (archived)" : ""}</p><p className="break-all text-xs text-muted-foreground">{field.key} · {FIELD_TYPE_LABELS[field.type]}{field.required ? " · Required" : ""}</p><p className="text-xs text-muted-foreground">{[field.showOnSheet && "Sheet", field.showOnTable && "Table", field.showOnFilter && (field.type === "SELECT" || field.type === "USER") && "Filter"].filter(Boolean).join(" · ") || "Hidden from record layouts"}</p></div>
        <div className="flex flex-wrap gap-1">{field.archivedAt ? <Button size="sm" variant="outline" disabled={pending || definitions.refreshing} aria-label={`Restore field ${field.label}`} onClick={() => void mutate(() => api.fields.restore(field.id), "Field restored.")}>Restore</Button> : <><Button size="sm" variant="ghost" aria-label={`Move field ${field.label} up`} disabled={pending || definitions.refreshing || index <= 0 || !!search} onClick={() => reorder(index, -1)}>↑</Button><Button size="sm" variant="ghost" aria-label={`Move field ${field.label} down`} disabled={pending || definitions.refreshing || index === active.length - 1 || !!search} onClick={() => reorder(index, 1)}>↓</Button><Button size="sm" variant="outline" aria-label={`Edit field ${field.label}`} disabled={pending} onClick={() => setEditor({ entity, definition: field })}>Edit</Button><Button size="sm" variant="ghost" aria-label={`Archive field ${field.label}`} disabled={pending || definitions.refreshing} onClick={() => void mutate(() => api.fields.archive(field.id), "Field archived. Stored values are preserved.")}>Archive</Button></>}</div></li>;
    })}</ul>
    {search && !!filtered.length && <p className="text-xs text-muted-foreground">Clear the search to reorder all active fields.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div role="status" aria-live="polite" className="text-sm text-muted-foreground">{pending ? "Saving changes…" : success}</div>
    {params.get("returnTo") && <Link className="text-sm underline" href={safeReturnUrl(params.get("returnTo"))}>Return to records</Link>}
    {editor && <FieldDefinitionForm key={`${editor.entity}:${editor.definition?.id ?? "new"}`} {...editor} onClose={() => setEditor(null)} />}
  </section>;
}
