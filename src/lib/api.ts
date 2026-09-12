import type { z } from "zod";
import type { FieldEntity } from "./db/schema/constants";
import type { CompanyService, CreateCompanyInput, UpdateCompanyInput } from "@services/company.service";
import type { ContactService, CreateContactInput, UpdateContactInput } from "@services/contact.service";
import type { DealService, CreateDealInput, UpdateDealInput, DealListInput, StageInput } from "@services/deal.service";
import type { ActivityService, CreateActivityInput, ActivityListInput, CompleteTaskInput } from "@services/activity.service";
import type { FieldService, createFieldInput, updateFieldInput, createOptionInput, updateOptionInput } from "@services/field.service";
import type { StatsService } from "@services/stats.service";
import type { Page } from "./utils/validation";

export interface RecordListQuery {
  page?: number;
  limit?: number;
  search?: string;
  archived?: boolean;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

type Result<T extends (...args: never[]) => unknown> = Awaited<ReturnType<T>>;

export function createApiClient(options: { baseUrl?: string; headers?: HeadersInit; fetch?: typeof fetch } = {}) {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
  const fetchRequest = options.fetch ?? globalThis.fetch.bind(globalThis);
  const pathId = (id: string) => encodeURIComponent(id);

  async function request(path: string, method = "GET", body?: unknown, query?: object) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) search.set(key, String(value));
    }
    const headers = new Headers(options.headers);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetchRequest(`${baseUrl}${path}${search.size ? `?${search}` : ""}`, {
      method, headers, credentials: "same-origin", cache: "no-store",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const error: unknown = await response.json();
        if (error && typeof error === "object" && "message" in error && typeof error.message === "string") message = error.message;
      } catch { /* Non-JSON failures still retain their HTTP status. */ }
      throw new ApiError(response.status, message);
    }
    return response;
  }

  async function json<T>(path: string, method = "GET", body?: unknown, query?: object): Promise<T> {
    return (await request(path, method, body, query)).json() as Promise<T>;
  }

  async function list<T>(path: string, query?: object): Promise<Page<T>> {
    const response = await request(path, "GET", undefined, query);
    return {
      items: await response.json() as T[],
      total: Number(response.headers.get("X-Total-Count")),
      page: Number(response.headers.get("X-Page")),
      limit: Number(response.headers.get("X-Limit")),
    };
  }

  function records<Row, Detail, Create, Update, Query extends object>(resource: string) {
    const path = `/api/${resource}`;
    return {
      list: (query?: Query) => list<Row>(path, query),
      get: (id: string) => json<Detail>(`${path}/${pathId(id)}`),
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
      ...records<Result<DealService["create"]>, Result<DealService["getById"]>, CreateDealInput, UpdateDealInput, DealListInput>("deals"),
      setStage: (id: string, body: StageInput) => json<Result<DealService["setStage"]>>(`/api/deals/${pathId(id)}/stage`, "POST", body),
    },
    activities: {
      list: (query?: ActivityListInput) => list<Result<ActivityService["getById"]>>("/api/activities", query),
      get: (id: string) => json<Result<ActivityService["getById"]>>(`/api/activities/${pathId(id)}`),
      create: (body: CreateActivityInput) => json<Result<ActivityService["create"]>>("/api/activities", "POST", body),
      complete: (id: string, body: CompleteTaskInput) => json<Result<ActivityService["completeTask"]>>(`/api/activities/${pathId(id)}/complete`, "POST", body),
      delete: async (id: string) => { await request(`/api/activities/${pathId(id)}`, "DELETE"); },
    },
    fields: {
      list: (entity: FieldEntity, includeArchived = false) => json<Result<FieldService["listDefinitions"]>>("/api/fields", "GET", undefined, { entity, includeArchived }),
      get: (id: string) => json<Result<FieldService["getDefinition"]>>(`/api/fields/${pathId(id)}`),
      create: (body: z.input<typeof createFieldInput>) => json<Result<FieldService["createDefinition"]>>("/api/fields", "POST", body),
      update: (id: string, body: z.input<typeof updateFieldInput>) => json<Result<FieldService["updateDefinition"]>>(`/api/fields/${pathId(id)}`, "PATCH", body),
      archive: (id: string) => json<Result<FieldService["archiveDefinition"]>>(`/api/fields/${pathId(id)}`, "DELETE"),
      restore: (id: string) => json<Result<FieldService["restoreDefinition"]>>(`/api/fields/${pathId(id)}/restore`, "POST"),
      options: (id: string, includeArchived = false) => json<Result<FieldService["listOptions"]>>(`/api/fields/${pathId(id)}/options`, "GET", undefined, { includeArchived }),
      createOption: (id: string, body: z.input<typeof createOptionInput>) => json<Result<FieldService["createOption"]>>(`/api/fields/${pathId(id)}/options`, "POST", body),
      updateOption: (id: string, optionId: string, body: z.input<typeof updateOptionInput>) => json<Result<FieldService["updateOption"]>>(`/api/fields/${pathId(id)}/options/${pathId(optionId)}`, "PATCH", body),
      values: (entity: FieldEntity, entityId: string) => json<Result<FieldService["getValues"]>>("/api/fields/values", "GET", undefined, { entity, entityId }),
      setValue: (id: string, entity: FieldEntity, entityId: string, value: unknown) => json<Result<FieldService["upsertValue"]>>(`/api/fields/${pathId(id)}/value`, "PUT", { entity, entityId, value }),
    },
    stats: (currency = "USD") => json<Result<StatsService["getStats"]>>("/api/stats", "GET", undefined, { currency }),
  };
}
