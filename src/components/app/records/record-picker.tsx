"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useEffect, useId, useState } from "react";
import { useAppData, useAppQuery } from "../app-data-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
export const selectClass =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none transition-colors hover:border-ring/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25 dark:bg-muted";
interface PickerProps {
  kind: "company" | "contact" | "owner";
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  selectedLabel?: string;
  excludeIds?: readonly string[];
}
export function RecordPicker({
  kind,
  label,
  value,
  onChange,
  required,
  disabled,
  selectedLabel,
  excludeIds = [],
}: PickerProps) {
  const { api, generation, account } = useAppData();
  const allowed = kind === "owner" || canPermission(account, kind, "read");
  const id = useId();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(
    null,
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setSearch("");
    setDebounced("");
    setPage(1);
    setChosen(null);
  }, [generation]);
  const query = { search: debounced, page, limit: 25 };
  const result = useAppQuery(
    kind === "owner"
      ? "assignees"
      : kind === "company"
        ? "companies"
        : "contacts",
    { picker: kind, ...query },
    async (signal) => {
      if (kind === "owner") return api.assignees.list(query, { signal });
      if (kind === "company") {
        const data = await api.companies.list(query, { signal });
        return {
          ...data,
          items: data.items.map((row) => ({ id: row.id, name: row.name })),
        };
      }
      const data = await api.contacts.list(query, { signal });
      return {
        ...data,
        items: data.items.map((row) => ({
          id: row.id,
          name: [row.firstName, row.lastName].filter(Boolean).join(" "),
        })),
      };
    },
    allowed,
  );
  const items = (result.data?.items ?? []).filter(item => !excludeIds.includes(item.id));
  const missingSelected = value && !items.some((item) => item.id === value);
  if (!allowed) return <p className="text-muted-foreground text-xs">Your role cannot select this linked record.</p>;
  return (
    <div className="space-y-2">
      <FieldLabel htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </FieldLabel>
      <Input
        aria-label={`Search ${label.toLowerCase()}`}
        placeholder={`Search ${label.toLowerCase()}…`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        disabled={disabled}
      />
      <select
        id={id}
        aria-label={label}
        className={selectClass}
        value={value}
        required={required}
        disabled={
          disabled || result.loading || result.refreshing || !!result.error
        }
        onChange={(event) => {
          const item = items.find((item) => item.id === event.target.value);
          if (item) setChosen(item);
          onChange(event.target.value);
        }}
      >
        <option value="">
          {required
            ? `Choose ${label.toLowerCase()}`
            : kind === "owner"
              ? "Unassigned"
              : "None"}
        </option>
        {missingSelected && (
          <option value={value}>
            {chosen?.id === value
              ? chosen.name
              : (selectedLabel ?? `Unavailable / historical (${value})`)}
          </option>
        )}
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      {result.error ? (
        <p role="alert" className="text-destructive text-xs">
          {result.error instanceof Error
            ? result.error.message
            : "Request failed"}{" "}
          <button type="button" className="underline" onClick={result.refresh}>
            Retry directory
          </button>
        </p>
      ) : result.loading ? (
        <div role="status" aria-busy="true" aria-label="Loading options" className="space-y-2 py-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-3/4" />
          ))}
        </div>
      ) : result.refreshing ? (
        <p role="status" className="text-muted-foreground text-xs">
          Refreshing options…
        </p>
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <span className="tabular-nums">{result.data?.total ?? 0} available</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Previous ${label.toLowerCase()} options`}
            disabled={page <= 1 || disabled}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Next ${label.toLowerCase()} options`}
            disabled={
              !result.data || page * 25 >= result.data.total || disabled
            }
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
