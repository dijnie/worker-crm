import {
  recordListInput,
  type RecordEntity,
  type RecordListQuery,
} from "@/lib/record-list-contracts";
export interface TableQuery {
  q: string;
  sort: string;
  dir: "asc" | "desc";
  archived: boolean;
  filters: Record<string, string[]>;
  page: number;
  limit: number;
  view?: string;
  companyId?: string;
  stage?: RecordListQuery["stage"];
  currency?: string;
}
export const DEFAULT_TABLE_QUERY: TableQuery = {
  q: "",
  sort: "createdAt",
  dir: "desc",
  archived: false,
  filters: {},
  page: 1,
  limit: 25,
};
const TABLE_KEYS = [
  "q",
  "search",
  "sort",
  "dir",
  "archived",
  "filters",
  "page",
  "limit",
  "view",
  "companyId",
  "stage",
  "currency",
];
export function parseTableQuery(
  entity: RecordEntity,
  search: string,
): TableQuery {
  const params = new URLSearchParams(search);
  for (const key of TABLE_KEYS)
    if (params.getAll(key).length > 1)
      throw new Error(`Duplicate table parameter: ${key}`);
  const input: Record<string, unknown> = {};
  for (const key of ["sort", "dir", "companyId", "stage", "currency"])
    if (params.has(key)) input[key] = params.get(key);
  if (params.has("archived")) {
    const value = params.get("archived");
    if (value !== "true" && value !== "false")
      throw new Error("Invalid archive filter");
    input.archived = value === "true";
  }
  for (const key of ["page", "limit"])
    if (params.has(key)) input[key] = Number(params.get(key));
  if (params.has("filters")) input.filters = JSON.parse(params.get("filters")!);
  input.search = params.get("q") ?? params.get("search") ?? "";
  const parsed = recordListInput(entity).parse(input);
  return {
    ...DEFAULT_TABLE_QUERY,
    ...parsed,
    q: parsed.search ?? "",
    view: params.get("view") ?? undefined,
  };
}
export function tableQueryToApi(query: TableQuery): RecordListQuery {
  return {
    search: query.q,
    sort: query.sort,
    dir: query.dir,
    archived: query.archived,
    filters: query.filters,
    page: query.page,
    limit: query.limit,
    companyId: query.companyId,
    stage: query.stage,
    currency: query.currency,
    includeSummary: true,
  };
}
export function tableQueryUrl(current: string, query: TableQuery): string {
  const url = new URL(current, "http://localhost");
  for (const key of TABLE_KEYS) url.searchParams.delete(key);
  const values = {
    q: query.q || undefined,
    sort: query.sort,
    dir: query.dir,
    archived: query.archived || undefined,
    filters: Object.keys(query.filters).length
      ? JSON.stringify(query.filters)
      : undefined,
    page: query.page > 1 ? query.page : undefined,
    limit: query.limit !== 25 ? query.limit : undefined,
    view: query.view,
    companyId: query.companyId,
    stage: query.stage,
    currency: query.currency,
  };
  for (const [key, value] of Object.entries(values))
    if (value !== undefined) url.searchParams.set(key, String(value));
  return `${url.pathname}${url.search}${url.hash}`;
}
export function savedConfiguration(query: TableQuery) {
  return {
    q: query.q,
    sort: query.sort,
    dir: query.dir,
    archived: query.archived,
    filters: query.filters,
  };
}
