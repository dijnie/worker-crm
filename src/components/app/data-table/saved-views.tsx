"use client";
import Bookmark from "@carbon/icons-react/es/Bookmark";
import { ToolbarMenu } from "./toolbar-menu";
import { useEffect, useRef, useState } from "react";
import {
  recordListInput,
  RECORD_FACETS,
  type RecordEntity,
} from "@/lib/record-list-contracts";
import type { FieldEntity } from "@/lib/db/schema/constants";
import { useAppData, useAppQuery } from "../app-data-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "../records/record-picker";
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
}: {
  entity: RecordEntity;
  query: TableQuery;
  apply: (query: TableQuery) => void;
  clear: () => void;
}) {
  const { api, invalidate, generation, store } = useAppData();
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
  function select(id: string, repair = false) {
    const view = result.data?.find((item) => item.id === id);
    if (!view) return;
    try {
      const config = view.filters as ReturnType<typeof savedConfiguration>;
      const filters = repair
        ? Object.fromEntries(
            Object.entries(config.filters ?? {}).filter(([key]) =>
              (RECORD_FACETS[entity] as readonly string[]).includes(key),
            ),
          )
        : config.filters;
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
      setError(
        "This view contains unsupported filters or sorting. Remove unsupported field filters to apply it, or clear the view and save a supported configuration.",
      );
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
          error instanceof Error ? error.message : "Could not update the view.",
        );
    } finally {
      if (mounted.current && store.isCurrent(generation)) setPending(false);
    }
  }
  return (
    <ToolbarMenu
      icon={<Bookmark aria-hidden="true" />}
      label={`Saved views${current ? ` · ${current.name}` : ""}`}
      active={!!current}
      wide
    >
      <div className="space-y-4">
        <label className="block text-sm">
          Apply saved view
          <select
            aria-label="Apply saved view"
            className={`${selectClass} mt-2`}
            value={query.view ?? ""}
            disabled={pending || result.loading || result.refreshing}
            onChange={(event) =>
              event.target.value ? select(event.target.value) : clear()
            }
          >
            <option value="">Choose a view</option>
            {result.data?.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
                {view.shared ? " (shared)" : " (private)"}
              </option>
            ))}
          </select>
        </label>
        {!!result.error && (
          <p role="alert" className="text-sm text-destructive">
            {result.error instanceof Error
              ? result.error.message
              : "Could not load saved views"}{" "}
            <button type="button" onClick={result.refresh}>
              Retry views
            </button>
          </p>
        )}
        <div className="grid gap-3 border-t pt-4">
          <Input
            aria-label="View name"
            className="w-full"
            placeholder="View name"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={shared}
              onChange={(event) => setShared(event.target.checked)}
            />
            Shared view
          </label>
          <Button
            type="button"
            variant="outline"
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
            Save as new view
          </Button>
        </div>
        {current?.mine && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending || !name.trim()}
              onClick={() =>
                mutate(() =>
                  api.savedViews.update(current.id, { name: name.trim() }),
                )
              }
            >
              Rename view
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() =>
                mutate(() =>
                  api.savedViews.update(current.id, {
                    filters: savedConfiguration(query),
                  }),
                )
              }
            >
              Update view configuration
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() =>
                mutate(() =>
                  api.savedViews.update(current.id, {
                    shared: !current.shared,
                  }),
                )
              }
            >
              {current.shared ? "Make private" : "Share view"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() =>
                mutate(async () => {
                  await api.savedViews.delete(current.id);
                  if (mounted.current && store.isCurrent(generation)) clear();
                })
              }
            >
              Delete view
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {unsupported && (
          <Button
            type="button"
            variant="outline"
            onClick={() => select(unsupported, true)}
          >
            Remove unsupported field filters
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={clear}>
          Clear filters
        </Button>
      </div>
    </ToolbarMenu>
  );
}
