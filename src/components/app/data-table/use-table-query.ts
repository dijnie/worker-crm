"use client";
import { useCallback, useEffect, useState } from "react";
import type { RecordEntity } from "@/lib/record-list-contracts";
import {
  DEFAULT_TABLE_QUERY,
  parseTableQuery,
  tableQueryUrl,
  type TableQuery,
} from "./table-query";
export function useTableQuery(entity: RecordEntity) {
  const [query, setQuery] = useState<TableQuery>(DEFAULT_TABLE_QUERY);
  const [error, setError] = useState<Error | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setQuery(parseTableQuery(entity, window.location.search));
        setError(null);
      } catch (error) {
        setError(
          error instanceof Error ? error : new Error("Invalid table link"),
        );
      }
      setReady(true);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [entity]);
  const write = useCallback((next: TableQuery, replace = false) => {
    window.history[replace ? "replaceState" : "pushState"](
      {},
      "",
      tableQueryUrl(window.location.href, next),
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);
  const update = (patch: Partial<TableQuery>, resetPage = true) =>
    write({ ...query, ...patch, ...(resetPage ? { page: 1 } : {}) });
  return {
    query,
    error,
    ready,
    update,
    write,
    clear: () => write({ ...DEFAULT_TABLE_QUERY, limit: query.limit }),
  };
}
