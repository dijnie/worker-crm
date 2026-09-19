"use client";
import Bookmark from "@carbon/icons-react/es/Bookmark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { selectClass } from "../records/record-picker";
import { useEffect, useRef, useState } from "react";
import {
  recordListInput,
  type RecordEntity,
} from "@/lib/record-list-contracts";
import type { FieldEntity } from "@/lib/db/schema/constants";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useDictionary } from "../i18n-provider";
import { errorMessage } from "@/lib/i18n/error-message";
import { ApiError } from "@/lib/api";
import type { FieldDefinition } from "@/lib/field-form-values";
import { supportedFieldFilter } from "../fields/field-facets";
import {
  DEFAULT_TABLE_QUERY,
  savedConfiguration,
  type TableQuery,
} from "./table-query";
export function SavedViews({
  entity,
  query,
  apply,
  clear,
  fieldDefinitions = [],
  definitionsReady = true,
}: {
  entity: RecordEntity;
  query: TableQuery;
  apply: (query: TableQuery) => void;
  clear: () => void;
  fieldDefinitions?: readonly FieldDefinition[];
  definitionsReady?: boolean;
}) {
  const { api, invalidate, generation, store } = useAppData();
  const dictionary = useDictionary();
  const copy = dictionary.recordList;
  const fieldEntity = entity.toUpperCase() as FieldEntity;
  const result = useAppQuery("saved-views", { entity }, (signal) =>
    api.savedViews.list(fieldEntity, { signal }),
  );
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [unsupported, setUnsupported] = useState<string | null>(null);
  useEffect(() => {
    setName("");
    setShared(false);
    setPending(false);
    setError("");
    setUnsupported(null);
  }, [generation]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = result.data?.find((view) => view.id === query.view);
  useEffect(() => {
    if (!query.view) {
      setName("");
      setShared(false);
      setError("");
      setUnsupported(null);
    }
  }, [query.view]);
  useEffect(() => {
    if (current) setName(current.name);
  }, [current?.id, current?.name]);
  useEffect(() => {
    if (current) setShared(current.shared);
  }, [current?.id, current?.shared]);
  useEffect(() => {
    if (!current || !definitionsReady) return;
    const repairMessage = copy.savedViews.repairFieldMessage;
    if (Object.keys(query.filters).some(key => !supportedFieldFilter(entity, key, fieldDefinitions))) {
      setUnsupported(current.id);
      setError(repairMessage);
    } else {
      setUnsupported(id => id === current.id ? null : id);
      setError(message => message === repairMessage ? "" : message);
    }
  }, [current, definitionsReady, entity, fieldDefinitions, query.filters, copy]);
  function select(id: string, repair = false) {
    const view = result.data?.find((item) => item.id === id);
    if (!view) return;
    if (!definitionsReady) { setError(copy.savedViews.waitForDefinitions); return; }
    try {
      const config = view.filters as ReturnType<typeof savedConfiguration>;
      const filters = repair
        ? Object.fromEntries(
            Object.entries(config.filters ?? {}).filter(([key]) =>
              supportedFieldFilter(entity, key, fieldDefinitions),
            ),
          )
        : config.filters;
      if (Object.keys(filters ?? {}).some(key => !supportedFieldFilter(entity, key, fieldDefinitions))) throw new Error("Unsupported field filter");
      const parsed = recordListInput(entity).parse({
        search: config.q,
        sort: config.sort,
        dir: config.dir,
        archived: config.archived,
        filters,
      });
      apply({
        ...DEFAULT_TABLE_QUERY,
        limit: query.limit,
        q: parsed.search ?? "",
        sort: parsed.sort,
        dir: parsed.dir,
        archived: parsed.archived,
        filters: parsed.filters,
        view: id,
      });
      setName(view.name);
      setShared(view.shared);
      setUnsupported(null);
      setError("");
    } catch {
      setUnsupported(id);
      setError(copy.savedViews.unsupportedConfigurationMessage);
    }
  }
  async function mutate(action: () => Promise<unknown>) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await action();
      if (mounted.current && store.isCurrent(generation))
        invalidate(["saved-views"]);
    } catch (error) {
      if (mounted.current && store.isCurrent(generation))
        setError(
          error instanceof ApiError ? errorMessage(error, dictionary) : copy.savedViews.updateFailedFallback,
        );
    } finally {
      if (mounted.current && store.isCurrent(generation)) setPending(false);
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="justify-start sm:justify-center">
          <Bookmark data-icon="inline-start" />
          <span className="max-w-40 truncate">
            {copy.savedViews.trigger}{current ? ` · ${current.name}` : ""}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 p-3"
        /* The panel is a form: only Escape leaves it to the menu. */
        onKeyDown={(event) => {
          if (event.key !== "Escape") event.stopPropagation();
        }}
      >
        <div className="space-y-4">
          <label className="block text-xs">
            {copy.savedViews.applyLabel}
            <select
              aria-label={copy.savedViews.applyLabel}
              className={`${selectClass} h-8 bg-background text-xs`}
              value={query.view ?? ""}
              disabled={pending || result.loading || result.refreshing || !definitionsReady}
              onChange={(event) =>
                event.target.value ? select(event.target.value) : clear()
              }
            >
              <option value="">{copy.savedViews.chooseView}</option>
              {result.data?.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                  {view.shared ? copy.savedViews.sharedSuffix : copy.savedViews.privateSuffix}
                </option>
              ))}
            </select>
          </label>
          {!!result.error && (
            <p role="alert" className="text-xs text-destructive">
              {result.error instanceof ApiError
                ? errorMessage(result.error, dictionary)
                : copy.savedViews.loadFailedFallback}{" "}
              <button type="button" onClick={result.refresh}>
                {copy.savedViews.retry}
              </button>
            </p>
          )}
          <div className="grid gap-3 border-t pt-4">
            <Input
              aria-label={copy.savedViews.viewNameLabel}
              className="w-full"
              placeholder={copy.savedViews.viewNameLabel}
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="size-3.5 accent-primary"
                checked={shared}
                onChange={(event) => setShared(event.target.checked)}
              />
              {copy.savedViews.sharedCheckbox}
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !name.trim()}
              onClick={() =>
                mutate(async () => {
                  const created = await api.savedViews.create({
                    entity: fieldEntity,
                    name: name.trim(),
                    shared,
                    filters: savedConfiguration(query),
                  });
                  if (mounted.current && store.isCurrent(generation))
                    apply({ ...query, page: 1, view: created.id });
                })
              }
            >
              {copy.savedViews.saveAsNew}
            </Button>
          </div>
          {current?.mine && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || !name.trim()}
                onClick={() =>
                  mutate(() =>
                    api.savedViews.update(current.id, { name: name.trim() }),
                  )
                }
              >
                {copy.savedViews.rename}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  mutate(() =>
                    api.savedViews.update(current.id, {
                      filters: savedConfiguration(query),
                    }),
                  )
                }
              >
                {copy.savedViews.updateConfiguration}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  mutate(() =>
                    api.savedViews.update(current.id, {
                      shared: !current.shared,
                    }),
                  )
                }
              >
                {current.shared ? copy.savedViews.makePrivate : copy.savedViews.shareView}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  mutate(async () => {
                    await api.savedViews.delete(current.id);
                    if (mounted.current && store.isCurrent(generation)) clear();
                  })
                }
              >
                {copy.savedViews.deleteView}
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          {unsupported && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => select(unsupported, true)}
            >
              {copy.savedViews.removeUnsupportedFilters}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={clear}
          >
            {copy.clearFilters}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
