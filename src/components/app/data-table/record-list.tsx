"use client";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import type { RecordEntity, RecordSummary, RecordFields } from "@/lib/record-list-contracts";
import type { Page } from "@/lib/utils/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppData, useAppQuery } from "../app-data-provider";
import { CreateRecordDialog } from "../records/record-form";
import { BulkActions } from "../records/bulk-actions";
import { stageLabel } from "../records/stage-change";
import { selectClass } from "../records/record-picker";
import {
  buildRecordUrl,
  openRecord,
  parseRecordStack,
  writeRecordStack,
  type RecordRef,
} from "../record-sheet/record-navigation";
import Search from "@carbon/icons-react/es/Search";
import Renew from "@carbon/icons-react/es/Renew";
import Column from "@carbon/icons-react/es/Column";
import Close from "@carbon/icons-react/es/Close";
import { ToolbarMenu } from "./toolbar-menu";
import { FacetFilters, facetLabels } from "./facet-filters";
import { SavedViews } from "./saved-views";
import { useTableQuery } from "./use-table-query";
import { tableQueryToApi } from "./table-query";
import { useFieldDefinitions } from "../fields/use-field-definitions";
import { fieldColumns } from "../fields/field-columns";
import { fieldFilterLabel, fieldFilterValues, supportedFieldFilter } from "../fields/field-facets";
import { useAssigneeDirectory } from "../records/use-assignee-directory";
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
/** Field projections supply typed, display-only columns through this boundary. */
export interface RecordColumnExtension {
  id: `field:${string}`;
  label: string;
  render: (row: RecordListRow) => React.ReactNode;
}
const emptyRows: RecordListRow[] = [];
const labels = { company: "Companies", contact: "Contacts", deal: "Deals" };
export function recordName(row: RecordListRow) {
  return row.name ?? [row.firstName, row.lastName].filter(Boolean).join(" ");
}
function date(value: string | null | undefined, dayOnly = false) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : dayOnly
      ? parsed.toLocaleDateString(undefined, { timeZone: "UTC" })
      : parsed.toLocaleString();
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
function ListContent({
  entity,
  state,
  extraColumns = [],
}: {
  entity: RecordEntity;
  state: ReturnType<typeof useTableQuery>;
  extraColumns?: RecordColumnExtension[];
}) {
  const { api, account, generation } = useAppData();
  const { query, update, clear, write } = state;
  const fieldQuery = useFieldDefinitions(entity);
  const directory = useAssigneeDirectory();
  const directoryStatus = directory.error ? "User directory unavailable" : directory.loading ? "Loading user…" : undefined;
  const customColumns = useMemo(() => fieldColumns(fieldQuery.data ?? [], directory.data ?? [], directoryStatus), [fieldQuery.data, directory.data, directoryStatus]);
  const displayColumns = useMemo(() => [...customColumns, ...extraColumns.filter(column => !customColumns.some(field => field.id === column.id))], [customColumns, extraColumns]);
  const unavailableFilters = fieldQuery.data ? Object.keys(query.filters).filter(key => !supportedFieldFilter(entity, key, fieldQuery.data!)) : [];
  const resource =
    entity === "company"
      ? "companies"
      : entity === "contact"
        ? "contacts"
        : "deals";
  const apiQuery = { ...tableQueryToApi(query), includeFields: customColumns.length > 0 };
  const result = useAppQuery<Page<RecordListRow>>(
    resource,
    apiQuery,
    (signal) => api[resource].list(apiQuery, { signal }),
  );
  const [search, setSearch] = useState(query.q);
  const [creating, setCreating] = useState(false);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [selectionKey, setSelectionKey] = useState("");
  const [visibility, setVisibility] = useState<VisibilityState>({
    createdAt: false,
    enrichment: false,
  });
  const queryKey = JSON.stringify(apiQuery);
  const preferenceKey = `crm:columns:${account.id}:${entity}`;
  useEffect(() => {
    setSearch(query.q);
  }, [query.q]);
  useEffect(() => {
    if (search === query.q) return;
    const timer = setTimeout(() => update({ q: search }), 350);
    return () => clearTimeout(timer);
  }, [search, query]);
  useEffect(() => {
    setSelection({});
    setSelectionKey(queryKey);
  }, [queryKey, generation]);
  useEffect(() => {
    setCreating(false);
  }, [generation]);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(preferenceKey) ?? "null",
      );
      if (saved && typeof saved === "object" && !Array.isArray(saved))
        setVisibility(
          Object.fromEntries(
            Object.entries(saved).filter(
              ([key, value]) => key !== "name" && typeof value === "boolean",
            ),
          ),
        );
      else setVisibility({ createdAt: false, enrichment: false });
    } catch {
      setVisibility({ createdAt: false, enrichment: false });
    }
  }, [preferenceKey]);
  const rows = result.data?.items ?? emptyRows;
  const total = result.data?.total ?? 0;
  const settled =
    !result.loading &&
    !result.refreshing &&
    !result.error &&
    !!result.data &&
    !state.error;
  const maxPage = Math.max(1, Math.ceil(total / query.limit));
  useEffect(() => {
    if (settled && query.page > maxPage)
      write({ ...query, page: maxPage }, true);
  }, [settled, query.page, maxPage]);
  const safeSelection =
    selectionKey === queryKey
      ? Object.fromEntries(
          Object.entries(selection).filter(
            ([id, checked]) => checked && rows.some((row) => row.id === id),
          ),
        )
      : {};
  const columns = useMemo<ColumnDef<RecordListRow>[]>(() => {
    const column = (
      id: string,
      header: string,
      cell: (row: RecordListRow) => React.ReactNode,
      sortable = true,
    ): ColumnDef<RecordListRow> => ({
      id,
      header,
      accessorFn: (row) => row.id,
      enableSorting: sortable,
      cell: (context) => cell(context.row.original),
    });
    const company = (row: RecordListRow) =>
      row.companyId ? (
        <RecordLink reference={{ kind: "company", id: row.companyId }}>
          {row.company?.name ?? `Unknown company (${row.companyId})`}
          {row.company?.archivedAt ? " (archived)" : ""}
        </RecordLink>
      ) : (
        "—"
      );
    const owner = (row: RecordListRow) =>
      row.owner?.name ??
      (row.ownerId
        ? `Unavailable / historical (${row.ownerId})`
        : "Unassigned");
    const base: ColumnDef<RecordListRow>[] = [
      {
        ...column(
          "name",
          entity === "contact"
            ? "Name"
            : entity === "company"
              ? "Company"
              : "Deal",
          (row) => (
            <RecordLink reference={{ kind: entity, id: row.id }}>
              {recordName(row)}
            </RecordLink>
          ),
        ),
        enableHiding: false,
      },
    ];
    if (entity === "company")
      base.push(
        column("domain", "Domain", (row) => row.domain ?? "—"),
        column("industry", "Industry", (row) => row.industry ?? "—"),
        column("owner", "Owner", owner),
        column("contacts", "Contacts", (row) => row.contactCount ?? "—"),
        column("deals", "Open deals", (row) => row.openDealCount ?? "—"),
      );
    if (entity === "contact")
      base.push(
        column("title", "Title", (row) => row.title ?? "—"),
        column("email", "Email", (row) => row.email ?? "—"),
        column("company", "Company", company),
        column("owner", "Owner", owner),
      );
    if (entity === "deal")
      base.push(
        column("company", "Company", company),
        column("stage", "Stage", (row) =>
          stageLabel(row.stage ?? "DEMO_BOOKED"),
        ),
        column("amount", "Amount (grouped by currency)", (row) =>
          row.amount == null ? "—" : `${row.currency} ${row.amount}`,
        ),
        column("owner", "Owner", owner),
        column("expectedCloseDate", "Close date", (row) =>
          date(row.expectedCloseDate, true),
        ),
      );
    base.push(
      column("createdAt", "Created", (row) => date(row.createdAt)),
      column("lastActivity", "Last activity", (row) =>
        date(row.lastActivityAt),
      ),
    );
    if (entity === "company")
      base.push(
        column(
          "enrichment",
          "Enrichment",
          (row) =>
            row.enrichmentStatus ? stageLabel(row.enrichmentStatus) : "—",
          false,
        ),
      );
    if (query.archived)
      base.push(
        column("archivedAt", "Archived", (row) => date(row.archivedAt)),
      );
    base.push(
      ...displayColumns.map((extension) =>
        column(extension.id, extension.label, extension.render, false),
      ),
    );
    return base;
  }, [entity, query.archived, displayColumns]);
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    pageCount: maxPage,
    state: {
      sorting: [{ id: query.sort, desc: query.dir === "desc" }],
      pagination: { pageIndex: query.page - 1, pageSize: query.limit },
      columnVisibility: { ...visibility, name: true },
      rowSelection: safeSelection,
    },
    enableRowSelection: settled,
    onRowSelectionChange: (change) => {
      if (settled) {
        setSelection(
          typeof change === "function" ? change(safeSelection) : change,
        );
        setSelectionKey(queryKey);
      }
    },
    onColumnVisibilityChange: (change) => {
      const next = typeof change === "function" ? change(visibility) : change;
      next.name = true;
      setVisibility(next);
      try {
        localStorage.setItem(preferenceKey, JSON.stringify(next));
      } catch {
        /* Column preferences remain usable without local storage. */
      }
    },
    onSortingChange: (change) => {
      const sorting =
        typeof change === "function"
          ? change(table.getState().sorting)
          : change;
      const sort = sorting[0];
      update({
        sort: sort?.id ?? "createdAt",
        dir: sort?.desc === false ? "asc" : "desc",
      });
    },
    enableSortingRemoval: false,
  });
  let recordError = "";
  try {
    parseRecordStack(window.location.search);
  } catch (error) {
    recordError =
      error instanceof Error ? error.message : "Invalid record link";
  }
  const filtered =
    !!query.q ||
    query.archived ||
    Object.keys(query.filters).length > 0 ||
    !!query.companyId ||
    !!query.stage ||
    !!query.currency;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {labels[entity]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {query.archived
              ? "Archived records"
              : "Manage your workspace records"}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>New {entity}</Button>
      </header>
      {recordError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 p-3 text-sm"
        >
          {recordError}{" "}
          <Button
            size="sm"
            variant="outline"
            onClick={() => writeRecordStack([])}
          >
            Close invalid record link
          </Button>
        </div>
      )}
      {fieldQuery.error ? <p role="alert" className="text-sm text-destructive">Custom field definitions could not load. {fieldQuery.error instanceof Error ? fieldQuery.error.message : "Request failed."} <button type="button" className="underline" onClick={fieldQuery.refresh}>Retry custom fields</button></p> : fieldQuery.loading && <p role="status" className="text-sm text-muted-foreground">Loading custom fields…</p>}
      {!!directory.error && fieldQuery.data?.some(field => field.type === "USER" && (field.showOnTable || field.showOnFilter) && !field.archivedAt) && <p role="alert" className="text-sm text-destructive">User directory unavailable. <button type="button" className="underline" onClick={directory.refresh}>Retry user directory</button></p>}
      {unavailableFilters.length > 0 && <div role="alert" className="space-y-2 rounded border border-destructive/30 p-3 text-sm"><p>A selected custom field is retired or no longer supports filtering. Repair the filters to continue.</p><Button variant="outline" onClick={() => update({ filters: Object.fromEntries(Object.entries(query.filters).filter(([key]) => !unavailableFilters.includes(key))) })}>Remove unavailable field filters</Button></div>}
      <section
        aria-label={`${labels[entity]} records`}
        className="rounded-lg border bg-card"
      >
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative w-full md:w-auto md:min-w-48 md:max-w-sm md:flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="h-11 pl-9 shadow-none md:h-9"
              aria-label={`Search ${labels[entity].toLowerCase()}`}
              placeholder={`Search ${labels[entity].toLowerCase()}…`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <FacetFilters
            entity={entity}
            query={apiQuery}
            fieldDefinitions={fieldQuery.data}
            onChange={(filters) => update({ filters })}
          />
          <SavedViews
            entity={entity}
            query={query}
            apply={(next) => write(next)}
            clear={clear}
            fieldDefinitions={fieldQuery.data}
        definitionsReady={!fieldQuery.loading && !fieldQuery.refreshing && !fieldQuery.error}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 px-2 text-sm text-muted-foreground md:min-h-9">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={query.archived}
                onChange={(event) => update({ archived: event.target.checked })}
              />
              Archived
            </label>
            <ToolbarMenu label="Columns" icon={<Column aria-hidden="true" />}>
              <p className="mb-3 text-xs text-muted-foreground">
                Visible columns
              </p>
              <div className="space-y-1">
                {table.getAllLeafColumns().map((column) => (
                  <label
                    key={column.id}
                    className="flex min-h-9 cursor-pointer items-center gap-3 rounded px-2 text-sm hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={column.getIsVisible()}
                      disabled={!column.getCanHide()}
                      onChange={column.getToggleVisibilityHandler()}
                    />
                    {String(column.columnDef.header)}
                  </label>
                ))}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="mt-3 w-full border-t"
                onClick={() => {
                  setVisibility({ createdAt: false, enrichment: false });
                  try {
                    localStorage.removeItem(preferenceKey);
                  } catch {}
                }}
              >
                Reset columns
              </Button>
            </ToolbarMenu>
            <Button
              variant="outline"
              size="icon"
              className="size-11 shadow-none md:size-9"
              aria-label="Refresh"
              title="Refresh records"
              onClick={result.refresh}
              disabled={result.loading || result.refreshing}
            >
              <Renew
                aria-hidden="true"
                className={
                  result.refreshing ? "motion-safe:animate-spin" : undefined
                }
              />
            </Button>
          </div>
        </div>
        {Object.keys(query.filters ?? {}).length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <span className="text-xs text-muted-foreground">Filtered by</span>
            {Object.entries(query.filters ?? {}).map(([facet, values]) => (
              <button
                key={facet}
                type="button"
                aria-label={`Remove ${facetLabels[facet] ?? fieldFilterLabel(facet, fieldQuery.data ?? [])} filter`}
                className="inline-flex max-w-full items-center gap-2 rounded border border-primary/20 bg-primary/5 px-2 py-1 text-xs text-link hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  const filters = { ...query.filters };
                  delete filters[facet];
                  update({ filters });
                }}
              >
                <span className="truncate">
                  {facetLabels[facet] ?? fieldFilterLabel(facet, fieldQuery.data ?? [])}:{" "}
                  {facet === "owner" || facet === "company"
                    ? `${values.length} selected`
                    : facet.startsWith("field:") ? fieldFilterValues(facet, values, fieldQuery.data ?? [], directory.data ?? [], directoryStatus) : values.join(", ")}
                </span>
                <Close aria-hidden="true" className="size-3 shrink-0" />
              </button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={clear}
            >
              Clear filters
            </Button>
          </div>
        )}
        {query.sort === "amount" && (
          <p className="border-b px-4 py-2 text-xs text-muted-foreground">
            Amounts are grouped by currency and sorted exactly within each
            currency. No exchange-rate conversion is applied.
          </p>
        )}
        <BulkActions
          entity={entity}
          targets={rows
            .filter((row) => safeSelection[row.id])
            .map((row) => ({ id: row.id, name: recordName(row) }))}
          archived={query.archived}
          disabled={!settled}
          retainFailures={(ids) => {
            setSelection(Object.fromEntries(ids.map((id) => [id, true])));
            setSelectionKey(queryKey);
          }}
        />
        {result.error ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 p-6"
          >
            <p>
              {result.error instanceof Error
                ? result.error.message
                : "Could not load records."}
            </p>
            <Button variant="outline" className="mt-3" onClick={result.refresh}>
              Retry records
            </Button>
          </div>
        ) : (
          <div>
            <div
              role="status"
              aria-live="polite"
              className="border-b px-4 py-2 text-xs text-muted-foreground"
            >
              {result.loading
                ? "Loading records…"
                : result.refreshing
                  ? "Refreshing records…"
                  : `${total} ${total === 1 ? "record" : "records"}`}
            </div>
            <Table
              aria-label={`${labels[entity]} list`}
              aria-busy={result.loading || result.refreshing}
            >
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Select page"
                        disabled={!settled || !rows.length}
                        checked={
                          rows.length > 0 &&
                          rows.every((row) => safeSelection[row.id])
                        }
                        onChange={table.getToggleAllPageRowsSelectedHandler()}
                      />
                    </TableHead>
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="whitespace-nowrap"
                        aria-sort={
                          header.column.getIsSorted() === "asc"
                            ? "ascending"
                            : header.column.getIsSorted() === "desc"
                              ? "descending"
                              : undefined
                        }
                      >
                        {header.column.getCanSort() ? (
                          <button
                            className="rounded py-2 text-left focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {header.column.getIsSorted() === "asc"
                              ? " ↑"
                              : header.column.getIsSorted() === "desc"
                                ? " ↓"
                                : ""}
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )
                        )}
                      </TableHead>
                    ))}
                    {entity === "deal" && <TableHead>Actions</TableHead>}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    tabIndex={0}
                    aria-label={`Open ${recordName(row.original)}`}
                    onKeyDown={(event) => {
                      if (
                        event.target === event.currentTarget &&
                        (event.key === "Enter" || event.key === " ") &&
                        !recordError
                      ) {
                        event.preventDefault();
                        openRecord({ kind: entity, id: row.id });
                      }
                    }}
                    onClick={(event) => {
                      if (
                        (event.target as HTMLElement).closest(
                          "a,button,input,select,textarea,summary",
                        ) ||
                        recordError
                      )
                        return;
                      if (
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      )
                        return;
                      openRecord({ kind: entity, id: row.id });
                    }}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${recordName(row.original)}`}
                        checked={row.getIsSelected()}
                        disabled={!settled}
                        onChange={row.getToggleSelectedHandler()}
                      />
                    </TableCell>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="max-w-80 whitespace-nowrap"
                        data-label={String(cell.column.columnDef.header)}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                    {entity === "deal" && (
                      <TableCell>
                        <BulkActions
                          stageOnly
                          entity="deal"
                          targets={[
                            { id: row.id, name: recordName(row.original) },
                          ]}
                          archived={query.archived}
                          disabled={!settled}
                          retainFailures={() => {}}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {settled && !rows.length && (
                  <TableRow>
                    <TableCell
                      colSpan={
                        table.getVisibleLeafColumns().length +
                        (entity === "deal" ? 2 : 1)
                      }
                      className="h-40 text-center"
                    >
                      <p className="font-medium">
                        {filtered
                          ? "No matching records"
                          : `No ${labels[entity].toLowerCase()} yet`}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {filtered
                          ? "Adjust your search or filters to find records."
                          : `Create your first ${entity} to get started.`}
                      </p>
                      {filtered ? (
                        <Button
                          className="mt-3"
                          variant="outline"
                          onClick={clear}
                        >
                          Clear filters
                        </Button>
                      ) : (
                        <Button
                          className="mt-3"
                          onClick={() => setCreating(true)}
                        >
                          New {entity}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-sm">
          <label className="flex items-center gap-2">
            Page size
            <select
              aria-label="Page size"
              className={`${selectClass} w-24`}
              value={query.limit}
              onChange={(event) =>
                update({ limit: Number(event.target.value) })
              }
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              aria-label="Previous page"
              disabled={query.page <= 1 || !settled}
              onClick={() => update({ page: query.page - 1 }, false)}
            >
              Previous
            </Button>
            <span>
              Page {query.page} of {maxPage}
            </span>
            <Button
              size="sm"
              variant="outline"
              aria-label="Next page"
              disabled={query.page >= maxPage || !settled}
              onClick={() => update({ page: query.page + 1 }, false)}
            >
              Next
            </Button>
          </div>
        </footer>
      </section>
      <CreateRecordDialog
        entity={entity}
        open={creating}
        onOpenChange={setCreating}
      />
    </div>
  );
}
export function RecordList({
  entity,
  extraColumns,
}: {
  entity: RecordEntity;
  extraColumns?: RecordColumnExtension[];
}) {
  const state = useTableQuery(entity);
  return (
    <main className="mx-auto w-full max-w-screen-2xl p-4 sm:p-6 lg:p-8">
      {!state.ready ? (
        <p role="status">Loading {labels[entity].toLowerCase()}…</p>
      ) : state.error ? (
        <div role="alert" className="space-y-3">
          <h1 className="text-2xl font-semibold">{labels[entity]}</h1>
          <p>
            This table link contains an unsupported or invalid query. Your
            filters have not been applied.
          </p>
          <p className="text-sm text-destructive">{state.error.message}</p>
          <Button variant="outline" onClick={state.clear}>
            Clear invalid filters
          </Button>
        </div>
      ) : (
        <ListContent
          entity={entity}
          state={state}
          extraColumns={extraColumns}
        />
      )}
    </main>
  );
}
