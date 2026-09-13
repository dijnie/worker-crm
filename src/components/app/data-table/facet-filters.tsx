"use client";
import { useEffect, useState } from "react";
import {
  RECORD_FACETS,
  type RecordEntity,
  type RecordListQuery,
} from "@/lib/record-list-contracts";
import { useAppData, useAppQuery } from "../app-data-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Filter from "@carbon/icons-react/es/Filter";
import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import { ToolbarMenu } from "./toolbar-menu";
import type { FieldDefinition } from "@/lib/field-form-values";
import { fieldFacetDefinitions } from "../fields/field-facets";
export const facetLabels: Record<string, string> = {
  owner: "Owner",
  industry: "Industry",
  source: "Source",
  enrichment: "Enrichment",
  activity: "Activity",
  company: "Company",
  title: "Title",
  seniority: "Seniority",
  persona: "Persona",
  stage: "Stage",
  status: "Status",
  closing: "Closing",
  currency: "Currency",
};
function Facet({
  entity,
  facet,
  query,
  onChange,
  label = facetLabels[facet] ?? facet,
}: {
  entity: RecordEntity;
  facet: string;
  query: RecordListQuery;
  onChange: (values: string[]) => void;
  label?: string;
}) {
  const { api } = useAppData();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const options = {
    ...query,
    page: 1,
    facet,
    facetSearch: term,
    facetPage: page,
    facetLimit: 50,
  };
  const result = useAppQuery("facets", { entity, ...options }, (signal) =>
    api[
      entity === "company"
        ? "companies"
        : entity === "contact"
          ? "contacts"
          : "deals"
    ].facets(options, { signal }),
  );
  const selected = query.filters?.[facet] ?? [];
  const counts = result.data?.facetCounts[facet] ?? [];
  const info = result.data?.facetPages[facet];
  return (
    <details className="group/facet border-b last:border-b-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        {label}
        {selected.length ? ` (${selected.length})` : ""}
        <ChevronDown
          aria-hidden="true"
          className="ml-auto size-4 text-muted-foreground group-open/facet:rotate-180"
        />
      </summary>
      <div className="space-y-3 pb-3">
        <Input
          aria-label={`Search ${label} filters`}
          placeholder="Search options…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {result.error ? (
          <p role="alert" className="text-sm text-destructive">
            {result.error instanceof Error
              ? result.error.message
              : "Request failed"}{" "}
            <button type="button" onClick={result.refresh}>
              Retry
            </button>
          </p>
        ) : (
          <>
            <div className="max-h-52 space-y-2 overflow-y-auto">
              {counts.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    disabled={
                      result.loading ||
                      result.refreshing ||
                      (!selected.includes(option.value) &&
                        selected.length >= 50)
                    }
                    checked={selected.includes(option.value)}
                    onChange={(event) =>
                      onChange(
                        event.target.checked
                          ? [...selected, option.value]
                          : selected.filter((value) => value !== option.value),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 break-words">
                    {option.label}
                  </span>
                  <span className="text-muted-foreground">{option.count}</span>
                </label>
              ))}
              {!counts.length && !result.loading && (
                <p className="text-xs text-muted-foreground">
                  No available values.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={page <= 1 || result.loading || result.refreshing}
                onClick={() => setPage(page - 1)}
              >
                Previous options
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={
                  !info ||
                  page * info.limit >= info.total ||
                  result.loading ||
                  result.refreshing
                }
                onClick={() => setPage(page + 1)}
              >
                Next options
              </Button>
            </div>
            {(result.loading || result.refreshing) && (
              <p role="status" className="text-xs">
                Loading filters…
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
export function FacetFilters({
  entity,
  query,
  onChange,
  fieldDefinitions = [],
}: {
  entity: RecordEntity;
  query: RecordListQuery;
  onChange: (filters: Record<string, string[]>) => void;
  fieldDefinitions?: readonly FieldDefinition[];
}) {
  return (
    <ToolbarMenu
      icon={<Filter aria-hidden="true" />}
      label={`Filters${Object.values(query.filters ?? {}).flat().length ? ` (${Object.values(query.filters ?? {}).flat().length})` : ""}`}
      active={Object.values(query.filters ?? {}).some(
        (values) => values.length > 0,
      )}
      wide
    >
      <p className="mb-1 text-xs text-muted-foreground">
        Filter by record properties
      </p>
      <div>
        {[...RECORD_FACETS[entity].map(facet => ({ key: facet, label: facetLabels[facet] })), ...fieldFacetDefinitions(fieldDefinitions).map(field => ({ key: `field:${field.key}`, label: field.label }))].map(({ key: facet, label }) => (
          <Facet
            key={facet}
            entity={entity}
            facet={facet}
            label={label}
            query={query}
            onChange={(values) => {
              const next = { ...query.filters };
              if (values.length) next[facet] = values;
              else delete next[facet];
              onChange(next);
            }}
          />
        ))}
      </div>
    </ToolbarMenu>
  );
}
