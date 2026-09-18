"use client";
import ArrowDown from "@carbon/icons-react/es/ArrowDown";
import ArrowUp from "@carbon/icons-react/es/ArrowUp";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link as TextLink } from "@/components/ui/link";
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
  const archivesId = useId();
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
  return (
    <Card id="custom-field-settings" role="region" aria-label="Custom field settings">
      <CardHeader>
        <CardTitle>Custom fields</CardTitle>
        <CardDescription>Manage record properties for your workspace.</CardDescription>
        <CardAction>
          <Button onClick={() => setEditor({ entity })} disabled={pending}>New field</Button>
        </CardAction>
      </CardHeader>

      <CardContent className="gap-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Field entity">
          {FIELD_ENTITIES.map(value => <Button
            key={value}
            size="sm"
            variant={entity === value ? "default" : "outline"}
            aria-pressed={entity === value}
            disabled={pending}
            onClick={() => { setEntity(value); setSearch(""); setError(""); setSuccess(""); }}
          >
            {value[0] + value.slice(1).toLowerCase()}
          </Button>)}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Input className="sm:max-w-xs" aria-label="Search custom fields" placeholder="Search fields…" value={search} onChange={event => setSearch(event.target.value)} />
          <div className="flex items-center gap-2">
            <Checkbox id={archivesId} checked={includeArchived} disabled={pending} onCheckedChange={checked => setIncludeArchived(checked === true)} />
            <Label htmlFor={archivesId}>Include archived fields</Label>
          </div>
        </div>

        {definitions.loading && <div role="status" aria-busy="true" aria-label="Loading fields" className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="flex flex-wrap gap-1">
                <Skeleton className="h-7 w-7" />
                <Skeleton className="h-7 w-7" />
                <Skeleton className="h-7 w-14" />
                <Skeleton className="h-7 w-16" />
              </div>
            </div>
          ))}
        </div>}

        {definitions.error
          ? <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-xs text-destructive">{definitions.error instanceof Error ? definitions.error.message : "Fields unavailable."}</p>
            <Button variant="outline" onClick={definitions.refresh}>Retry fields</Button>
          </div>
          : !definitions.loading && !filtered.length && <p className="text-xs text-muted-foreground">{search ? "No fields match your search." : `No ${entity.toLowerCase()} fields yet.`}</p>}

        {!!filtered.length && <ul className="flex flex-col divide-y border-y">
          {filtered.map(field => {
            const index = active.findIndex(value => value.id === field.id);
            return <li key={field.id} data-field-id={field.id} className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{field.label}{field.archivedAt ? " (archived)" : ""}</p>
                <p className="break-all text-xs text-muted-foreground">{field.key} · {FIELD_TYPE_LABELS[field.type]}{field.required ? " · Required" : ""}</p>
                <p className="text-xs text-muted-foreground">{[field.showOnSheet && "Sheet", field.showOnTable && "Table", field.showOnFilter && (field.type === "SELECT" || field.type === "USER") && "Filter"].filter(Boolean).join(" · ") || "Hidden from record layouts"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {field.archivedAt
                  ? <Button size="sm" variant="outline" disabled={pending || definitions.refreshing} aria-label={`Restore field ${field.label}`} onClick={() => void mutate(() => api.fields.restore(field.id), "Field restored.")}>Restore</Button>
                  : <>
                    <Button size="icon-sm" variant="ghost" aria-label={`Move field ${field.label} up`} disabled={pending || definitions.refreshing || index <= 0 || !!search} onClick={() => reorder(index, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Move field ${field.label} down`} disabled={pending || definitions.refreshing || index === active.length - 1 || !!search} onClick={() => reorder(index, 1)}>
                      <ArrowDown />
                    </Button>
                    <Button size="sm" variant="outline" aria-label={`Edit field ${field.label}`} disabled={pending} onClick={() => setEditor({ entity, definition: field })}>Edit</Button>
                    <Button size="sm" variant="ghost" aria-label={`Archive field ${field.label}`} disabled={pending || definitions.refreshing} onClick={() => void mutate(() => api.fields.archive(field.id), "Field archived. Stored values are preserved.")}>Archive</Button>
                  </>}
              </div>
            </li>;
          })}
        </ul>}

        {search && !!filtered.length && <p className="text-xs text-muted-foreground">Clear the search to reorder all active fields.</p>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <div role="status" aria-live="polite" className="text-xs text-muted-foreground">{pending ? "Saving changes…" : success}</div>
        {params.get("returnTo") && <TextLink asChild variant="inline" className="self-start text-xs">
          <NextLink href={safeReturnUrl(params.get("returnTo"))}>Return to records</NextLink>
        </TextLink>}
      </CardContent>

      {editor && <FieldDefinitionForm key={`${editor.entity}:${editor.definition?.id ?? "new"}`} {...editor} onClose={() => setEditor(null)} />}
    </Card>
  );
}
