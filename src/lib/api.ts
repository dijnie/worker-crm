export type { ActivityView, ActivityCounts, ActivityCountsInput, ActivityListInput } from "@services/activity.service";
import type { DealContactService, AttachDealContactInput, UpdateDealContactRoleInput } from "@services/deal-contact.service";
import type { z } from "zod/v3";
import type { FieldEntity, FieldType } from "./db/schema/constants";
import type { CompanyService, CreateCompanyInput, UpdateCompanyInput } from "@services/company.service";
import type { ContactService, CreateContactInput, UpdateContactInput } from "@services/contact.service";
import type { DealService, CreateDealInput, UpdateDealInput, DealListInput } from "@services/deal.service";
import type { ActivityService, ActivityListInput, ActivityCountsInput, ActivityCounts, CompleteTaskInput } from "@services/activity.service";
import type { FieldService, createFieldInput, updateFieldInput, createOptionInput, updateOptionInput } from "@services/field.service";
import type { StatsService } from "@services/stats.service";
import type { CreateActivityApiInput } from "./server/activity-api-inputs";
import type { StageApiInput } from "./server/deal-api-inputs";
import type { MemberListInput, MemberMutationInput, MemberRecord } from "@services/member.service";
import type { Page } from "./utils/validation";

export type { RecordListQuery } from "./record-list-contracts";
import type { RecordListQuery, RecordFacetQuery, RecordFacets, RecordSummary, RecordFields, RecordFieldValue } from "./record-list-contracts";
import type { Assignee, AssigneeListInput } from "@services/assignee.service";
import type { SavedView, CreateSavedViewInput, UpdateSavedViewInput } from "@services/saved-view.service";
export interface ApiRequestOptions { signal?: AbortSignal }
export interface ApiIssue { path: (string | number)[]; message: string }
export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly issues?: ApiIssue[], public readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

type Result<T extends (...args: never[]) => unknown> = Awaited<ReturnType<T>>;

export function createApiClient(options: { baseUrl?: string; headers?: HeadersInit; fetch?: typeof fetch; onError?: (error: ApiError, path: string) => void | Promise<void> } = {}) {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
  const fetchRequest = options.fetch ?? globalThis.fetch.bind(globalThis);
  const pathId = (id: string) => encodeURIComponent(id);

  async function request(path: string, method = "GET", body?: unknown, query?: object, transport?: ApiRequestOptions) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) search.set(key, key === "filters" ? JSON.stringify(value) : String(value));
    }
    const headers = new Headers(options.headers);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetchRequest(`${baseUrl}${path}${search.size ? `?${search}` : ""}`, {
      method, headers, credentials: "same-origin", cache: "no-store", signal: transport?.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      let issues: ApiIssue[] | undefined;
      let code: string | undefined;
      try {
        const error: unknown = await response.json();
        if (error && typeof error === "object") {
          if ("message" in error && typeof error.message === "string") message = error.message;
          if ("code" in error && typeof error.code === "string" && /^[A-Z_]{1,80}$/.test(error.code)) code = error.code;
          if ("issues" in error && Array.isArray(error.issues)) issues = error.issues.filter((issue): issue is ApiIssue =>
            !!issue && typeof issue === "object" && typeof issue.message === "string" && Array.isArray(issue.path) &&
            issue.path.every((part: unknown) => typeof part === "string" || (typeof part === "number" && Number.isInteger(part))));
        }
      } catch { /* Non-JSON failures still retain their HTTP status. */ }
      const error = new ApiError(response.status, message, issues, code);
      await options.onError?.(error, path);
      throw error;
    }
    return response;
  }

  async function json<T>(path: string, method = "GET", body?: unknown, query?: object, transport?: ApiRequestOptions): Promise<T> {
    return (await request(path, method, body, query, transport)).json() as Promise<T>;
  }

  async function list<T>(path: string, query?: object, transport?: ApiRequestOptions): Promise<Page<T>> {
    const response = await request(path, "GET", undefined, query, transport);
    return {
      items: await response.json() as T[],
      total: Number(response.headers.get("X-Total-Count")),
      page: Number(response.headers.get("X-Page")),
      limit: Number(response.headers.get("X-Limit")),
    };
  }

  function records<Row, Detail, Create, Update, Query extends object>(resource: string) {
    const path = `/api/${resource}`;
    function recordList(query: Query & { includeFields: true }, transport?: ApiRequestOptions): Promise<Page<Row & RecordSummary & { fields: Record<string, RecordFieldValue> }>>;
    function recordList(query?: Query, transport?: ApiRequestOptions): Promise<Page<Row & RecordSummary & RecordFields>>;
    function recordList(query?: Query, transport?: ApiRequestOptions) { return list<Row & RecordSummary & RecordFields>(path, query, transport); }
    return {
      list: recordList,
      facets: (query?: RecordFacetQuery, transport?: ApiRequestOptions) => json<RecordFacets>(`${path}/facets`, "GET", undefined, query, transport),
      get: (id: string, transport?: ApiRequestOptions) => json<Detail>(`${path}/${pathId(id)}`, "GET", undefined, undefined, transport),
      create: (body: Create) => json<Row>(path, "POST", body),
      update: (id: string, body: Update) => json<Row>(`${path}/${pathId(id)}`, "PATCH", body),
      archive: (id: string) => json<Row>(`${path}/${pathId(id)}`, "DELETE"),
      restore: (id: string) => json<Row>(`${path}/${pathId(id)}/restore`, "POST"),
    };
  }

  return {
    companies: records<Result<CompanyService["create"]>, Result<CompanyService["getById"]>, CreateCompanyInput, UpdateCompanyInput, RecordListQuery>("companies"),
    contacts: records<Result<ContactService["create"]>, Result<ContactService["getById"]>, CreateContactInput, UpdateContactInput, RecordListQuery & { companyId?: string }>("contacts"),
    deals: {
      attachContact: (id: string, body: AttachDealContactInput) => json<Result<DealContactService["attach"]>>(`/api/deals/${pathId(id)}/contacts`, "POST", body),
      updateContactRole: (id: string, contactId: string, body: UpdateDealContactRoleInput) => json<Result<DealContactService["updateRole"]>>(`/api/deals/${pathId(id)}/contacts/${pathId(contactId)}`, "PATCH", body),
      detachContact: async (id: string, contactId: string) => { await request(`/api/deals/${pathId(id)}/contacts/${pathId(contactId)}`, "DELETE"); },
      ...records<Result<DealService["create"]>, Result<DealService["getById"]>, CreateDealInput, UpdateDealInput, DealListInput>("deals"),
      setStage: (id: string, body: StageApiInput) => json<Result<DealService["setStage"]>>(`/api/deals/${pathId(id)}/stage`, "POST", body),
    },
    activities: {
      list: (query?: ActivityListInput, transport?: ApiRequestOptions) => list<Result<ActivityService["getById"]>>("/api/activities", query, transport),
      counts: (query?: ActivityCountsInput, transport?: ApiRequestOptions) => json<ActivityCounts>("/api/activities/counts", "GET", undefined, query, transport),
      get: (id: string) => json<Result<ActivityService["getById"]>>(`/api/activities/${pathId(id)}`),
      create: (body: CreateActivityApiInput) => json<Result<ActivityService["create"]>>("/api/activities", "POST", body),
      complete: (id: string, body: CompleteTaskInput) => json<Result<ActivityService["completeTask"]>>(`/api/activities/${pathId(id)}/complete`, "POST", body),
      delete: async (id: string) => { await request(`/api/activities/${pathId(id)}`, "DELETE"); },
    },
    fields: {
      list: (entity: FieldEntity, includeArchived = false, transport?: ApiRequestOptions) => json<Result<FieldService["listDefinitions"]>>("/api/fields", "GET", undefined, { entity, includeArchived }, transport),
      get: (id: string, transport?: ApiRequestOptions) => json<Result<FieldService["getDefinition"]>>(`/api/fields/${pathId(id)}`, "GET", undefined, undefined, transport),
      reorder: (body: { entity: FieldEntity; ids: string[] }) => json<Result<FieldService["listDefinitions"]>>("/api/fields/reorder", "POST", body),
      create: (body: z.input<typeof createFieldInput>) => json<Result<FieldService["createDefinition"]>>("/api/fields", "POST", body),
      update: (id: string, body: z.input<typeof updateFieldInput>) => json<Result<FieldService["updateDefinition"]>>(`/api/fields/${pathId(id)}`, "PATCH", body),
      archive: (id: string) => json<Result<FieldService["archiveDefinition"]>>(`/api/fields/${pathId(id)}`, "DELETE"),
      restore: (id: string) => json<Result<FieldService["restoreDefinition"]>>(`/api/fields/${pathId(id)}/restore`, "POST"),
      options: (id: string, includeArchived = false, transport?: ApiRequestOptions) => json<Result<FieldService["listOptions"]>>(`/api/fields/${pathId(id)}/options`, "GET", undefined, { includeArchived }, transport),
      createOption: (id: string, body: z.input<typeof createOptionInput>) => json<Result<FieldService["createOption"]>>(`/api/fields/${pathId(id)}/options`, "POST", body),
      updateOption: (id: string, optionId: string, body: z.input<typeof updateOptionInput>) => json<Result<FieldService["updateOption"]>>(`/api/fields/${pathId(id)}/options/${pathId(optionId)}`, "PATCH", body),
      values: (entity: FieldEntity, entityId: string, transport?: ApiRequestOptions) => json<Result<FieldService["getValues"]>>("/api/fields/values", "GET", undefined, { entity, entityId }, transport),
      setValue: (id: string, entity: FieldEntity, entityId: string, value: unknown, expectedType?: FieldType) => json<Result<FieldService["upsertValue"]>>(`/api/fields/${pathId(id)}/value`, "PUT", { entity, entityId, value, ...(expectedType ? { expectedType } : {}) }),
    },
    assignees: { list: (query?: AssigneeListInput, transport?: ApiRequestOptions) => list<Assignee>("/api/assignees", query, transport) },
    savedViews: {
      list: (entity: FieldEntity, transport?: ApiRequestOptions) => json<SavedView[]>("/api/saved-views", "GET", undefined, { entity }, transport),
      create: (body: CreateSavedViewInput) => json<SavedView>("/api/saved-views", "POST", body),
      update: (id: string, body: UpdateSavedViewInput) => json<SavedView>(`/api/saved-views/${pathId(id)}`, "PATCH", body),
      delete: async (id: string) => { await request(`/api/saved-views/${pathId(id)}`, "DELETE"); },
    },
    members: {
      list: (query?: MemberListInput, transport?: ApiRequestOptions) => list<MemberRecord>("/api/members", query, transport),
      update: (id: string, body: MemberMutationInput) => json<MemberRecord>(`/api/members/${pathId(id)}`, "PATCH", body),
    },
    stats: (currency = "USD") => json<Result<StatsService["getStats"]>>("/api/stats", "GET", undefined, { currency }),
  };
}
