"use client";
import { useEffect, useId, useState } from "react";
import { useAppData, useAppQuery } from "../app-data-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export const selectClass =
  "h-9 w-full rounded-md border border-input bg-control px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
interface PickerProps {
  kind: "company" | "contact" | "owner";
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  selectedLabel?: string;
}
export function RecordPicker({
  kind,
  label,
  value,
  onChange,
  required,
  disabled,
  selectedLabel,
}: PickerProps) {
  const { api, generation } = useAppData();
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
  );
  const items = result.data?.items ?? [];
  const missingSelected = value && !items.some((item) => item.id === value);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? " *" : ""}
      </label>
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
        <p role="alert" className="text-sm text-destructive">
          {result.error instanceof Error
            ? result.error.message
            : "Request failed"}{" "}
          <button type="button" className="underline" onClick={result.refresh}>
            Retry directory
          </button>
        </p>
      ) : result.loading || result.refreshing ? (
        <p role="status" className="text-xs text-muted-foreground">
          Loading options…
        </p>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{result.data?.total ?? 0} available</span>
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
