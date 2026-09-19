"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useEffect, useId, useState } from "react";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useDictionary, useFormat } from "../i18n-provider";
import { errorMessage } from "@/lib/i18n/error-message";
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
  const dictionary = useDictionary();
  const format = useFormat();
  const { picker: copy } = dictionary.recordSheet;
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
  const labelLower = label.toLowerCase();
  if (!allowed) return <p className="text-muted-foreground text-xs">{copy.permissionDenied}</p>;
  return (
    <div className="space-y-2">
      <FieldLabel htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </FieldLabel>
      <Input
        aria-label={copy.searchAria(labelLower)}
        placeholder={copy.searchPlaceholder(labelLower)}
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
            ? copy.chooseOption(labelLower)
            : kind === "owner"
              ? dictionary.recordSheet.common.unassigned
              : dictionary.recordSheet.common.none}
        </option>
        {missingSelected && (
          <option value={value}>
            {chosen?.id === value
              ? chosen.name
              : (selectedLabel ?? dictionary.recordSheet.common.unavailableHistorical(value))}
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
          {errorMessage(result.error, dictionary)}{" "}
          <button type="button" className="underline" onClick={result.refresh}>
            {copy.retryDirectory}
          </button>
        </p>
      ) : result.loading ? (
        <div role="status" aria-busy="true" aria-label={copy.loadingOptions} className="space-y-2 py-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-3/4" />
          ))}
        </div>
      ) : result.refreshing ? (
        <p role="status" className="text-muted-foreground text-xs">
          {copy.refreshingOptions}
        </p>
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <span className="tabular-nums">{copy.available(format.number(result.data?.total ?? 0))}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={copy.previousAria(labelLower)}
            disabled={page <= 1 || disabled}
            onClick={() => setPage(page - 1)}
          >
            {copy.previous}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={copy.nextAria(labelLower)}
            disabled={
              !result.data || page * 25 >= result.data.total || disabled
            }
            onClick={() => setPage(page + 1)}
          >
            {copy.next}
          </Button>
        </div>
      )}
    </div>
  );
}
