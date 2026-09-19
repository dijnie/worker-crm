"use client";
import { useMemo } from "react";
import type { DataTableFacet } from "@/components/ui/data-table";
import { canPermission } from "@/lib/auth/permissions";
import {
  RECORD_FACETS,
  type RecordEntity,
  type RecordFacets,
  type RecordListQuery,
} from "@/lib/record-list-contracts";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useDictionary } from "../i18n-provider";
import type { FieldDefinition } from "@/lib/field-form-values";
import { fieldFacetCopy, fieldFacetDefinitions, fieldFilterLabel } from "../fields/field-facets";

/** The API caps `facetLimit` at one hundred options per facet. */
const facetOptionLimit = 100;
/** Past this many options a facet submenu gains its search box. */
const facetSearchThreshold = 12;

/** Facet definitions for the ported `DataTable`, counted in one request so the
 * submenus open without a second round trip. */
export function useListFacets({
  entity,
  query,
  fieldDefinitions = [],
}: {
  entity: RecordEntity;
  query: RecordListQuery;
  fieldDefinitions?: readonly FieldDefinition[];
}) {
  const { api, account } = useAppData();
  const dictionary = useDictionary();
  const resource =
    entity === "company" ? "companies" : entity === "contact" ? "contacts" : "deals";
  const options = { ...query, page: 1, facetLimit: facetOptionLimit };
  const result = useAppQuery<RecordFacets>(
    "facets",
    { entity, ...options },
    (signal) => api[resource].facets(options, { signal }),
  );
  const facets = useMemo<DataTableFacet[]>(() => {
    const canActivity = (["company", "contact", "deal", "activity"] as const).every(
      (kind) => canPermission(account, kind, "read"),
    );
    return [
      ...RECORD_FACETS[entity].filter(
        (facet) =>
          (facet !== "company" || canPermission(account, "company", "read")) &&
          (facet !== "activity" || canActivity),
      ),
      ...fieldFacetDefinitions(fieldDefinitions).map((field) => `field:${field.key}`),
    ].map((id) => {
      const counted = result.data?.facetCounts[id] ?? [];
      return {
        id,
        label: dictionary.recordList.facets[id] ?? fieldFilterLabel(id, fieldDefinitions, fieldFacetCopy(dictionary.fields)),
        options: counted.map((option) => ({
          value: option.value,
          label: option.label,
        })),
        searchable: counted.length > facetSearchThreshold,
      };
    });
  }, [entity, account, fieldDefinitions, result.data, dictionary]);
  return {
    facets,
    error: result.error,
    refresh: result.refresh,
  };
}
