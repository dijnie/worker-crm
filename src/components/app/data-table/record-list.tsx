"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type {
  RecordEntity,
  RecordSummary,
  RecordFields,
} from "@/lib/record-list-contracts";
import type { Page } from "@/lib/utils/validation";
import type { DealStage, EnrichmentStatus, FieldEntity } from "@/lib/db/schema/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import type { TableQueryState } from "@/lib/ui/table-query";
import { useTableSelection } from "@/hooks/use-table-selection";
import { useAppData, useAppQuery } from "../app-data-provider";
import { CreateRecordDialog } from "../records/record-form";
import {
  BulkActions,
  BulkReportView,
  type BulkReport,
} from "../records/bulk-actions";
import {
  RecordLinkError,
  buildRecordUrl,
  openRecord,
  parseRecordStack,
  writeRecordStack,
  type RecordRef,
} from "../record-sheet/record-navigation";
import { PageShellLoading } from "../page-shell";
import Search from "@carbon/icons-react/es/Search";
import Renew from "@carbon/icons-react/es/Renew";
import Close from "@carbon/icons-react/es/Close";
import { useListFacets } from "./facet-filters";
import { SavedViews } from "./saved-views";
import { useTableQuery } from "./use-table-query";
import { tableQueryToApi, type TableQuery } from "./table-query";
import { useFieldDefinitions } from "../fields/use-field-definitions";
import { fieldColumns } from "../fields/field-columns";
import {
  fieldFacetCopy,
  fieldFilterLabel,
  fieldFilterValues,
  supportedFieldFilter,
} from "../fields/field-facets";
import { useAssigneeDirectory } from "../records/use-assignee-directory";
import { useDictionary, useFormat } from "../i18n-provider";
import { errorMessage } from "@/lib/i18n/error-message";
import { ApiError } from "@/lib/api";

export interface RecordListRow extends RecordSummary, RecordFields {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string | null;
  domain?: string | null;
  industry?: string | null;
  ownerId?: string | null;
  companyId?: string | null;
  title?: string | null;
  email?: string | null;
  amount?: string | null;
  currency?: string;
  stage?: string;
  expectedCloseDate?: string | null;
  createdAt: string;
  lastActivityAt?: string | null;
  archivedAt?: string | null;
  enrichmentStatus?: string | null;
}
/** The URL-backed table controller this surface drives. */
export interface RecordListQueryState {
  query: TableQuery;
  error: Error | null;
  ready: boolean;
  update: (patch: Partial<TableQuery>, resetPage?: boolean) => void;
  write: (next: TableQuery, replace?: boolean) => void;
  clear: () => void;
}
const emptyRows: RecordListRow[] = [];
const pageSizes = [25, 50, 100];
/** `hideable: false` pins a column: the ported table omits it from its column menu. */
type ListColumn = DataTableColumn<RecordListRow>;
/** A click that lands on a control inside a row belongs to that control. */
const rowControlSelector =
  "a,button,input,select,textarea,summary,[role='checkbox'],[role='menuitem']";
export function recordName(row: RecordListRow) {
  return row.name ?? [row.firstName, row.lastName].filter(Boolean).join(" ");
}
function fieldEntityOf(entity: RecordEntity): FieldEntity {
  return entity.toUpperCase() as FieldEntity;
}
function RecordLink({
  reference,
  children,
}: {
  reference: RecordRef;
  children: React.ReactNode;
}) {
  let href = "#";
  try {
    href = buildRecordUrl(window.location.href, reference);
  } catch {
    /* Parent renders the recoverable invalid-link control. */
  }
  function click(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      href === "#"
    )
      return;
    event.preventDefault();
    openRecord(reference);
  }
  return (
    <a
      className="font-medium text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
      onClick={click}
    >
      {children}
    </a>
  );
}
/** The page header owns "New <entity>"; an empty list reuses the same control. */
export function CreateRecordButton({ entity }: { entity: RecordEntity }) {
  const { account } = useAppData();
  const dictionary = useDictionary();
  const [creating, setCreating] = useState(false);
  const canCreate =
    canPermission(account, entity, "create") &&
    (entity !== "deal" || canPermission(account, "company", "read"));
  if (!canCreate) return null;
  return (
    <>
      <Button onClick={() => setCreating(true)}>
        {dictionary.recordList.list.newRecord(dictionary.crm.entities[fieldEntityOf(entity)].lower)}
      </Button>
      <CreateRecordDialog
        entity={entity}
        open={creating}
        onOpenChange={setCreating}
      />
    </>
  );
}
function ListContent({
  entity,
  state,
}: {
  entity: RecordEntity;
  state: RecordListQueryState;
}) {
  const { api, account } = useAppData();
  const dictionary = useDictionary();
  const format = useFormat();
  const copy = dictionary.recordList;
  const facetCopy = useMemo(() => fieldFacetCopy(dictionary.fields), [dictionary]);
  const { query, update, clear, write } = state;
  const canUpdate = canPermission(account, entity, "update");
  const canSelect =
    canUpdate ||
    canPermission(account, entity, query.archived ? "restore" : "archive");
  const canActivitySummary = (
    ["company", "contact", "deal", "activity"] as const
  ).every((kind) => canPermission(account, kind, "read"));
  const fieldQuery = useFieldDefinitions(entity);
  const directory = useAssigneeDirectory();
  const directoryStatus = directory.error
    ? copy.list.directoryStatusUnavailable
    : directory.loading
      ? copy.list.directoryStatusLoading
      : undefined;
  const customColumns = useMemo(
    () =>
      fieldColumns(fieldQuery.data ?? [], directory.data ?? [], directoryStatus, dictionary.fields.valueDisplay),
    [fieldQuery.data, directory.data, directoryStatus, dictionary],
  );
  const unavailableFilters = fieldQuery.data
    ? Object.keys(query.filters).filter(
        (key) => !supportedFieldFilter(entity, key, fieldQuery.data!),
      )
    : [];
  const resource =
    entity === "company" ? "companies" : entity === "contact" ? "contacts" : "deals";
  const apiQuery = {
    ...tableQueryToApi(query),
    includeFields: customColumns.length > 0,
  };
  const {
    facets,
    error: facetError,
    refresh: refreshFacets,
  } = useListFacets({
    entity,
    query: apiQuery,
    fieldDefinitions: fieldQuery.data,
  });
  const result = useAppQuery<Page<RecordListRow>>(
    resource,
    apiQuery,
    (signal) => api[resource].list(apiQuery, { signal }),
  );
  const [search, setSearch] = useState(query.q);
  const [report, setReport] = useState<BulkReport | null>(null);
  const skipRowOpen = useRef(false);
  useEffect(() => {
    setSearch(query.q);
  }, [query.q]);
  useEffect(() => {
    if (search === query.q) return;
    const timer = setTimeout(() => update({ q: search }), 350);
    return () => clearTimeout(timer);
  }, [search, query]);
  const rows = result.data?.items ?? emptyRows;
  const total = result.data?.total ?? 0;
  const loading = result.loading || result.refreshing;
  const settled =
    !loading && !result.error && !!result.data && !state.error;
  const maxPage = Math.max(1, Math.ceil(total / query.limit));
  useEffect(() => {
    if (settled && query.page > maxPage) write({ ...query, page: maxPage }, true);
  }, [settled, query.page, maxPage]);
  const selection = useTableSelection(rows.map((row) => row.id));
  const selectedTargets = rows
    .filter((row) => selection.has(row.id))
    .map((row) => ({ id: row.id, name: recordName(row) }));
  const formatDate = useMemo(
    () => (value: string | null | undefined, dayOnly = false) => {
      if (!value) return dictionary.crm.empty;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return value;
      return dayOnly ? format.day(parsed) : format.timestamp(parsed);
    },
    [dictionary, format],
  );
  const relatedCompanyCell = useMemo(
    () => (row: RecordListRow) => {
      if (!row.companyId) return dictionary.crm.empty;
      return (
        <RecordLink reference={{ kind: "company", id: row.companyId }}>
          {row.company?.name ?? copy.list.unknownCompany(row.companyId)}
          {row.company?.archivedAt ? copy.list.archivedSuffix : ""}
        </RecordLink>
      );
    },
    [dictionary, copy],
  );
  const ownerCell = useMemo(
    () => (row: RecordListRow) => {
      if (row.owner?.name) return row.owner.name;
      if (row.ownerId) return copy.list.ownerUnavailable(row.ownerId);
      return copy.list.unassigned;
    },
    [copy],
  );
  const columns = useMemo<ListColumn[]>(() => {
    const fieldEntity = fieldEntityOf(entity);
    const base: ListColumn[] = [
      {
        id: "name",
        header:
          entity === "contact"
            ? copy.list.columns.name
            : dictionary.crm.entities[fieldEntity].singular,
        sortable: true,
        hideable: false,
        width: "w-[24%]",
        cellClassName: "truncate",
        cell: (row) => (
          <RecordLink reference={{ kind: entity, id: row.id }}>
            {recordName(row)}
          </RecordLink>
        ),
      },
    ];
    if (entity === "company")
      base.push(
        {
          id: "domain",
          header: copy.list.columns.domain,
          sortable: true,
          width: "w-[16%]",
          cellClassName: "truncate",
          cell: (row) => row.domain ?? dictionary.crm.empty,
        },
        {
          id: "industry",
          header: copy.list.columns.industry,
          sortable: true,
          width: "w-[14%]",
          cellClassName: "truncate",
          cell: (row) => row.industry ?? dictionary.crm.empty,
        },
        {
          id: "owner",
          header: copy.list.columns.owner,
          sortable: true,
          width: "w-[16%]",
          cellClassName: "truncate",
          cell: ownerCell,
        },
        {
          id: "contacts",
          header: copy.list.columns.contacts,
          sortable: true,
          align: "right",
          width: "w-[9%]",
          cellClassName: "tabular-nums",
          cell: (row) => row.contactCount ?? dictionary.crm.empty,
        },
        {
          id: "deals",
          header: copy.list.columns.openDeals,
          sortable: true,
          align: "right",
          width: "w-[9%]",
          cellClassName: "tabular-nums",
          cell: (row) => row.openDealCount ?? dictionary.crm.empty,
        },
      );
    if (entity === "contact")
      base.push(
        {
          id: "title",
          header: copy.list.columns.title,
          sortable: true,
          width: "w-[16%]",
          cellClassName: "truncate",
          cell: (row) => row.title ?? dictionary.crm.empty,
        },
        {
          id: "email",
          header: copy.list.columns.email,
          sortable: true,
          width: "w-[18%]",
          cellClassName: "truncate",
          cell: (row) => row.email ?? dictionary.crm.empty,
        },
        {
          id: "company",
          header: dictionary.crm.entities.COMPANY.singular,
          sortable: true,
          width: "w-[18%]",
          cellClassName: "truncate",
          cell: relatedCompanyCell,
        },
        {
          id: "owner",
          header: copy.list.columns.owner,
          sortable: true,
          width: "w-[16%]",
          cellClassName: "truncate",
          cell: ownerCell,
        },
      );
    if (entity === "deal")
      base.push(
        {
          id: "company",
          header: dictionary.crm.entities.COMPANY.singular,
          sortable: true,
          width: "w-[12%]",
          cellClassName: "truncate",
          cell: relatedCompanyCell,
        },
        {
          id: "stage",
          header: copy.list.columns.stage,
          sortable: true,
          width: "w-[8%]",
          cell: (row) => {
            const stage = (row.stage ?? "DEMO_BOOKED") as DealStage;
            return dictionary.crm.stages[stage] ?? row.stage ?? "DEMO_BOOKED";
          },
        },
        {
          id: "amount",
          header: copy.list.columns.amount,
          sortable: true,
          align: "right",
          width: "w-[9%]",
          cellClassName: "tabular-nums",
          cell: (row) =>
            row.amount == null
              ? dictionary.crm.empty
              : row.currency
                ? format.money(row.amount, row.currency)
                : format.decimal(row.amount),
        },
        {
          id: "owner",
          header: copy.list.columns.owner,
          sortable: true,
          width: "w-[9%]",
          cellClassName: "truncate",
          cell: ownerCell,
        },
        {
          id: "expectedCloseDate",
          header: copy.list.columns.closeDate,
          sortable: true,
          align: "right",
          width: "w-[7%]",
          cell: (row) => formatDate(row.expectedCloseDate, true),
        },
      );
    base.push(
      {
        id: "createdAt",
        header: copy.list.columns.created,
        sortable: true,
        align: "right",
        width: "w-[12%]",
        defaultHidden: true,
        cell: (row) => formatDate(row.createdAt),
      },
      {
        id: "lastActivity",
        header: copy.list.columns.lastActivity,
        sortable: true,
        align: "right",
        width: "w-[12%]",
        cell: (row) => formatDate(row.lastActivityAt),
      },
    );
    if (entity === "company")
      base.push({
        id: "enrichment",
        header: copy.list.columns.enrichment,
        width: "w-[12%]",
        defaultHidden: true,
        cell: (row) =>
          row.enrichmentStatus
            ? (dictionary.crm.enrichmentStatuses[row.enrichmentStatus as EnrichmentStatus] ?? row.enrichmentStatus)
            : dictionary.crm.empty,
      });
    if (query.archived)
      base.push({
        id: "archivedAt",
        header: copy.list.columns.archived,
        sortable: true,
        align: "right",
        width: "w-[12%]",
        cell: (row) => formatDate(row.archivedAt),
      });
    base.push(
      ...customColumns.map((extension) => ({
        id: extension.id,
        header: extension.header,
        width: "w-[12%]",
        cellClassName: "truncate",
        cell: extension.cell,
      })),
    );
    if (entity === "deal" && canUpdate)
      base.push({
        id: "actions",
        header: copy.list.columns.actions,
        hideable: false,
        align: "right",
        width: "w-[132px]",
        cell: (row) => (
          <BulkActions
            stageOnly
            entity="deal"
            targets={[{ id: row.id, name: recordName(row) }]}
            archived={query.archived}
            disabled={!settled}
            retainFailures={() => {}}
          />
        ),
      });
    return base.filter((entry) => {
      if (entry.id === "company") return canPermission(account, "company", "read");
      if (entry.id === "contacts") return canPermission(account, "contact", "read");
      if (entry.id === "deals") return canPermission(account, "deal", "read");
      if (entry.id === "lastActivity") return canActivitySummary;
      return true;
    });
  }, [
    entity,
    query.archived,
    customColumns,
    account,
    canActivitySummary,
    canUpdate,
    settled,
    dictionary,
    copy,
    format,
    formatDate,
    relatedCompanyCell,
    ownerCell,
  ]);
  let recordError = "";
  try {
    parseRecordStack(window.location.search);
  } catch (error) {
    recordError = dictionary.recordSheet.host.navigation[error instanceof RecordLinkError ? error.reason : "invalid"];
  }
  const filtered =
    !!query.q ||
    query.archived ||
    Object.keys(query.filters).length > 0 ||
    !!query.companyId ||
    !!query.stage ||
    !!query.currency;
  const tableQuery: TableQueryState & {
    setPageSize: (pageSize: number) => void;
  } = {
    sort: query.sort,
    dir: query.dir,
    page: query.page,
    pageSize: query.limit,
    tab: "all",
    filters: query.filters,
    toggleSort: (id) =>
      update(
        query.sort === id
          ? { dir: query.dir === "asc" ? "desc" : "asc" }
          : { sort: id, dir: "asc" },
      ),
    setSort: (id) => update({ sort: id }),
    setDir: (nextDir) => update({ dir: nextDir }),
    setPage: async (page) => {
      update({ page }, false);
    },
    /* Worker CRM lists have no tab strip; the state still carries htcrm's shape. */
    setTab: () => {},
    setFilter: (id, values) => {
      const filters = { ...query.filters };
      if (values.length) filters[id] = values;
      else delete filters[id];
      update({ filters });
    },
    setPageSize: (pageSize) => update({ limit: pageSize }),
  };
  const entityLower = dictionary.crm.entities[fieldEntityOf(entity)].lower;
  const entityLowerPlural = dictionary.crm.entities[fieldEntityOf(entity)].lowerPlural;
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3"
      onClickCapture={(event) => {
        const target = event.target as HTMLElement;
        skipRowOpen.current =
          !!target.closest(rowControlSelector) ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          !!recordError;
      }}
    >
      {recordError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/30 p-3 text-xs"
        >
          {recordError}
          <Button size="sm" variant="outline" onClick={() => writeRecordStack([])}>
            {copy.list.invalidRecordLinkClose}
          </Button>
        </div>
      )}
      {fieldQuery.error ? (
        <p role="alert" className="text-xs text-destructive">
          {copy.list.fieldsUnavailableMessage}{" "}
          {fieldQuery.error instanceof ApiError
            ? errorMessage(fieldQuery.error, dictionary)
            : copy.list.requestFailedFallback}{" "}
          <button
            type="button"
            className="underline"
            onClick={fieldQuery.refresh}
          >
            {copy.list.retryCustomFields}
          </button>
        </p>
      ) : null}
      {!!directory.error &&
        fieldQuery.data?.some(
          (field) =>
            field.type === "USER" &&
            (field.showOnTable || field.showOnFilter) &&
            !field.archivedAt,
        ) && (
          <p role="alert" className="text-xs text-destructive">
            {copy.list.userDirectoryUnavailableMessage}{" "}
            <button
              type="button"
              className="underline"
              onClick={directory.refresh}
            >
              {copy.list.retryUserDirectory}
            </button>
          </p>
        )}
      {unavailableFilters.length > 0 && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-destructive/30 p-3 text-xs"
        >
          <p>{copy.list.unavailableFieldFiltersMessage}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              update({
                filters: Object.fromEntries(
                  Object.entries(query.filters).filter(
                    ([key]) => !unavailableFilters.includes(key),
                  ),
                ),
              })
            }
          >
            {copy.list.removeUnavailableFieldFilters}
          </Button>
        </div>
      )}
      {report && <BulkReportView report={report} />}
      {/* The ported table hides its own controls row while rows are selected,
          so the list search stays in its own row above the table. */}
      <div className="relative w-full sm:max-w-sm">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          className="pl-8"
          aria-label={copy.list.search.ariaLabel(entityLowerPlural)}
          placeholder={copy.list.search.placeholder(entityLowerPlural)}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {!!facetError && (
        <p role="alert" className="text-xs text-destructive">
          {copy.list.filterOptionsUnavailableMessage}{" "}
          {facetError instanceof ApiError
            ? errorMessage(facetError, dictionary)
            : copy.list.requestFailedFallback}{" "}
          <button type="button" className="underline" onClick={refreshFacets}>
            {copy.list.retryFilters}
          </button>
        </p>
      )}
      {Object.keys(query.filters).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{copy.list.filteredBy}</span>
          {Object.entries(query.filters).map(([facet, values]) => (
            <button
              key={facet}
              type="button"
              aria-label={copy.list.removeFilter(copy.facets[facet] ?? fieldFilterLabel(facet, fieldQuery.data ?? [], facetCopy))}
              className="inline-flex max-w-full items-center gap-1.5 rounded-sm border bg-card px-2 py-1 text-xs text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                const filters = { ...query.filters };
                delete filters[facet];
                update({ filters });
              }}
            >
              <span className="truncate">
                {copy.facets[facet] ?? fieldFilterLabel(facet, fieldQuery.data ?? [], facetCopy)}
                :{" "}
                {facet === "owner" || facet === "company"
                  ? copy.list.selectedCount(values.length)
                  : facet.startsWith("field:")
                    ? fieldFilterValues(
                        facet,
                        values,
                        fieldQuery.data ?? [],
                        directory.data ?? [],
                        directoryStatus,
                        facetCopy,
                      )
                    : values.join(", ")}
              </span>
              <Close aria-hidden="true" className="size-3 shrink-0" />
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={clear}>
            {copy.clearFilters}
          </Button>
        </div>
      )}
      {query.sort === "amount" && (
        <p className="text-xs text-muted-foreground">{copy.list.amountSortNote}</p>
      )}
      {result.error ? (
        <div role="alert" className="rounded-md border border-destructive/30 p-6">
          <p className="text-xs">
            {result.error instanceof ApiError
              ? errorMessage(result.error, dictionary)
              : copy.list.loadRecordsFailedFallback}
          </p>
          <Button variant="outline" className="mt-3" onClick={result.refresh}>
            {copy.list.retryRecords}
          </Button>
        </div>
      ) : (
        <DataTable
          query={tableQuery}
          columns={columns}
          rows={rows}
          total={total}
          getRowId={(row) => row.id}
          loading={loading}
          facets={facets}
          storageKey={`record-list:${entity}:columns`}
          actions={
            <>
              <SavedViews
                entity={entity}
                query={query}
                apply={(next) => write(next)}
                clear={clear}
                fieldDefinitions={fieldQuery.data}
                definitionsReady={
                  !fieldQuery.loading &&
                  !fieldQuery.refreshing &&
                  !fieldQuery.error
                }
              />
              <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted">
                <input
                  type="checkbox"
                  className="size-3.5 accent-primary"
                  checked={query.archived}
                  onChange={(event) => update({ archived: event.target.checked })}
                />
                {copy.list.columns.archived}
              </label>
              <Button
                variant="outline"
                size="sm"
                className="justify-start sm:justify-center"
                aria-label={copy.list.refreshAriaLabel}
                title={copy.list.refreshTitle}
                onClick={result.refresh}
                disabled={loading}
              >
                <Renew
                  data-icon="inline-start"
                  className={
                    result.refreshing ? "motion-safe:animate-spin" : undefined
                  }
                />
              </Button>
            </>
          }
          selection={
            canSelect
              ? {
                  state: selection,
                  rowLabel: (row) => recordName(row),
                  actions: (
                    <BulkActions
                      entity={entity}
                      targets={selectedTargets}
                      archived={query.archived}
                      disabled={!settled}
                      retainFailures={(ids) => {
                        selection.clear();
                        for (const id of ids) selection.toggle(id, true);
                      }}
                      onReport={setReport}
                    />
                  ),
                }
              : undefined
          }
          onRowClick={(row) => {
            if (skipRowOpen.current) return;
            openRecord({ kind: entity, id: row.id });
          }}
          tableClassName="table-fixed min-w-[52rem]"
          empty={
            <div className="flex flex-col items-center gap-2">
              <p className="font-medium text-foreground">
                {filtered
                  ? copy.list.emptyNoMatches
                  : copy.list.emptyNoneYet(entityLowerPlural)}
              </p>
              <p className="text-xs">
                {filtered
                  ? copy.list.emptyAdjustFilters
                  : copy.list.emptyCreateFirst(entityLower)}
              </p>
              {filtered && (
                <Button variant="outline" size="sm" onClick={clear}>
                  {copy.clearFilters}
                </Button>
              )}
            </div>
          }
          meta={
            <span className="flex flex-wrap items-center gap-3">
              <span role="status">
                {result.loading
                  ? copy.list.loadingRecords
                  : result.refreshing
                    ? copy.list.refreshingRecords
                    : copy.list.recordCount(total)}
              </span>
              <label className="flex items-center gap-1.5">
                {copy.list.pageSizeLabel}
                <select
                  aria-label={copy.list.pageSizeLabel}
                  className="h-7 rounded-sm border border-input bg-background px-1.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  value={query.limit}
                  onChange={(event) =>
                    tableQuery.setPageSize(Number(event.target.value))
                  }
                >
                  {pageSizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </span>
          }
        />
      )}
    </div>
  );
}
export function RecordList({ entity }: { entity: RecordEntity }) {
  const dictionary = useDictionary();
  const state = useTableQuery(entity);
  if (!state.ready) return <PageShellLoading />;
  if (state.error)
    return (
      <div role="alert" className="space-y-3">
        <p className="text-xs">{dictionary.recordList.list.invalidLinkMessage}</p>
        <p className="text-xs text-destructive">{dictionary.recordList.list.invalidLinkDetail(state.error.message)}</p>
        <Button variant="outline" onClick={state.clear}>
          {dictionary.recordList.list.clearInvalidFilters}
        </Button>
      </div>
    );
  return <ListContent entity={entity} state={state} />;
}
