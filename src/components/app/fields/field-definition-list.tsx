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
import { ApiError } from "@/lib/api";
import { FIELD_ENTITIES, type FieldEntity } from "@/lib/db/schema/constants";
import { errorMessage } from "@/lib/i18n/error-message";
import type { FieldDefinition } from "@/lib/field-form-values";
import { safeReturnUrl } from "@/lib/auth/safe-return-url";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useDictionary } from "../i18n-provider";
import { FieldDefinitionForm } from "./field-definition-form";
export function FieldDefinitionList() {
  const { generation } = useAppData();
  return <DefinitionSession key={generation} />;
}
function DefinitionSession() {
  const { api, invalidate, store, generation } = useAppData();
  const dictionary = useDictionary();
  const copy = dictionary.fields;
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
    catch (failure) { if (store.isCurrent(generation)) { setError(failure instanceof ApiError ? errorMessage(failure, dictionary) : copy.list.changeFailed); invalidate(["fields"]); } }
    finally { flight.current = false; if (store.isCurrent(generation)) setPending(false); }
  };
  const reorder = (index: number, offset: number) => {
    const ids = active.map(field => field.id); [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    void mutate(() => api.fields.reorder({ entity, ids }), copy.list.orderSaved);
  };
  return (
    <Card id="custom-field-settings" role="region" aria-label={copy.list.regionLabel}>
      <CardHeader>
        <CardTitle>{copy.list.title}</CardTitle>
        <CardDescription>{copy.list.description}</CardDescription>
        <CardAction>
          <Button onClick={() => setEditor({ entity })} disabled={pending}>{copy.list.newField}</Button>
        </CardAction>
      </CardHeader>

      <CardContent className="gap-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label={copy.list.entityGroupLabel}>
          {FIELD_ENTITIES.map(value => <Button
            key={value}
            size="sm"
            variant={entity === value ? "default" : "outline"}
            aria-pressed={entity === value}
            disabled={pending}
            onClick={() => { setEntity(value); setSearch(""); setError(""); setSuccess(""); }}
          >
            {dictionary.crm.entities[value].singular}
          </Button>)}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Input className="sm:max-w-xs" aria-label={copy.list.searchLabel} placeholder={copy.list.searchPlaceholder} value={search} onChange={event => setSearch(event.target.value)} />
          <div className="flex items-center gap-2">
            <Checkbox id={archivesId} checked={includeArchived} disabled={pending} onCheckedChange={checked => setIncludeArchived(checked === true)} />
            <Label htmlFor={archivesId}>{copy.list.includeArchived}</Label>
          </div>
        </div>

        {definitions.loading && <div role="status" aria-busy="true" aria-label={copy.list.loadingLabel} className="flex flex-col gap-3">
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
            <p role="alert" className="text-xs text-destructive">{definitions.error instanceof ApiError ? errorMessage(definitions.error, dictionary) : copy.list.unavailable}</p>
            <Button variant="outline" onClick={definitions.refresh}>{copy.list.retry}</Button>
          </div>
          : !definitions.loading && !filtered.length && <p className="text-xs text-muted-foreground">{search ? copy.list.noMatch : copy.list.noneYet(dictionary.crm.entities[entity].lower)}</p>}

        {!!filtered.length && <ul className="flex flex-col divide-y border-y">
          {filtered.map(field => {
            const index = active.findIndex(value => value.id === field.id);
            return <li key={field.id} data-field-id={field.id} className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{field.label}{field.archivedAt ? copy.list.archivedSuffix : ""}</p>
                <p className="break-all text-xs text-muted-foreground">{field.key} · {dictionary.crm.fieldTypes[field.type]}{field.required ? copy.list.requiredSuffix : ""}</p>
                <p className="text-xs text-muted-foreground">{[field.showOnSheet && copy.list.placementSheet, field.showOnTable && copy.list.placementTable, field.showOnFilter && (field.type === "SELECT" || field.type === "USER") && copy.list.placementFilter].filter(Boolean).join(" · ") || copy.list.placementHidden}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {field.archivedAt
                  ? <Button size="sm" variant="outline" disabled={pending || definitions.refreshing} aria-label={copy.list.restoreAria(field.label)} onClick={() => void mutate(() => api.fields.restore(field.id), copy.list.fieldRestored)}>{copy.actions.restore}</Button>
                  : <>
                    <Button size="icon-sm" variant="ghost" aria-label={copy.list.moveUpAria(field.label)} disabled={pending || definitions.refreshing || index <= 0 || !!search} onClick={() => reorder(index, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={copy.list.moveDownAria(field.label)} disabled={pending || definitions.refreshing || index === active.length - 1 || !!search} onClick={() => reorder(index, 1)}>
                      <ArrowDown />
                    </Button>
                    <Button size="sm" variant="outline" aria-label={copy.list.editAria(field.label)} disabled={pending} onClick={() => setEditor({ entity, definition: field })}>{copy.actions.edit}</Button>
                    <Button size="sm" variant="ghost" aria-label={copy.list.archiveAria(field.label)} disabled={pending || definitions.refreshing} onClick={() => void mutate(() => api.fields.archive(field.id), copy.list.fieldArchived)}>{copy.actions.archive}</Button>
                  </>}
              </div>
            </li>;
          })}
        </ul>}

        {search && !!filtered.length && <p className="text-xs text-muted-foreground">{copy.list.clearSearchHint}</p>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <div role="status" aria-live="polite" className="text-xs text-muted-foreground">{pending ? copy.list.savingChanges : success}</div>
        {params.get("returnTo") && <TextLink asChild variant="inline" className="self-start text-xs">
          <NextLink href={safeReturnUrl(params.get("returnTo"))}>{copy.list.returnToRecords}</NextLink>
        </TextLink>}
      </CardContent>

      {editor && <FieldDefinitionForm key={`${editor.entity}:${editor.definition?.id ?? "new"}`} {...editor} onClose={() => setEditor(null)} />}
    </Card>
  );
}
