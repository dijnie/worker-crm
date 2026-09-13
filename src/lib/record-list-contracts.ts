import { z } from "zod/v3";
import { DEAL_STAGES, ENRICHMENT_STATUSES, RECORD_SOURCES } from "./db/schema/constants";
import { currencyCode, identifier, listInput } from "./utils/validation";

export const RECORD_ENTITIES = ["company", "contact", "deal"] as const;
export type RecordEntity = typeof RECORD_ENTITIES[number];
export const RECORD_SORTS = {
  company: ["name", "domain", "industry", "owner", "contacts", "deals", "createdAt", "lastActivity", "archivedAt"],
  contact: ["name", "title", "email", "company", "owner", "createdAt", "lastActivity", "archivedAt"],
  deal: ["name", "company", "stage", "amount", "owner", "expectedCloseDate", "createdAt", "lastActivity", "archivedAt"],
} as const;
export const RECORD_FACETS = {
  company: ["owner", "industry", "source", "enrichment", "activity"],
  contact: ["owner", "company", "title", "seniority", "persona", "source", "activity"],
  deal: ["owner", "stage", "status", "closing", "currency"],
} as const;
export const CLOSED_STAGES = ["CLOSED_WON", "CLOSED_LOST", "UNQUALIFIED_TO_BUY"] as const;
export const CLOSING_WINDOWS = ["overdue", "this-month", "next-month", "later", "none"] as const;
export interface FacetOption { value: string; label: string; count: number }
export interface RecordFacets {
  facetCounts: Record<string, FacetOption[]>;
  facetPages: Record<string, { total: number; page: number; limit: number }>;
}
export interface OwnerSummary { id: string; name: string; image: string | null }
export interface CompanySummary { id: string; name: string; archivedAt: string | null }
export type RecordFieldValue = string | boolean | null;
export interface RecordFields { fields?: Record<string, RecordFieldValue> }
export function isCustomFieldFacet(key: string): boolean {
  return /^field:[a-z][a-z0-9_]{0,199}$/.test(key);
}
export interface RecordSummary {
  owner?: OwnerSummary | null;
  company?: CompanySummary | null;
  contactCount?: number;
  openDealCount?: number;
}

export function recordFiltersInput(entity: RecordEntity) {
  const facetKey = z.string().superRefine((key, context) => {
    if (!(RECORD_FACETS[entity] as readonly string[]).includes(key) && !isCustomFieldFacet(key)) {
      context.addIssue({ code: "custom", message: "Unsupported facet" });
    }
  });
  return z.record(facetKey, z.array(z.string().trim().min(1).max(1000)).max(50)).superRefine((filters, context) => {
    if (JSON.stringify(filters).length > 32768) context.addIssue({ code: "custom", message: "Filters exceed 32768 characters" });
    for (const [key, values] of Object.entries(filters)) {
      const choices: readonly string[] | undefined = key === "stage" ? DEAL_STAGES : key === "status" ? ["all", "open", "closed"] : key === "closing" ? CLOSING_WINDOWS : key === "activity" ? ["7", "30", "90"] : key === "enrichment" ? ENRICHMENT_STATUSES : key === "source" ? RECORD_SOURCES : undefined;
      values.forEach((value, index) => {
        if ((choices && !choices.includes(value)) || (key === "currency" && !/^[A-Z]{3}$/.test(value)) || ((["owner", "company"].includes(key) || isCustomFieldFacet(key)) && value.length > 200)) {
          context.addIssue({ code: "custom", path: [key, index], message: "Unsupported facet value" });
        }
      });
    }
  });
}

export function recordListInput(entity: RecordEntity) {
  return listInput.extend({
    sort: z.string().refine(value => (RECORD_SORTS[entity] as readonly string[]).includes(value), "Unsupported sort key").default("createdAt"),
    dir: z.enum(["asc", "desc"]).default("desc"),
    filters: recordFiltersInput(entity).default({}),
    includeSummary: z.boolean().default(false),
    includeFields: z.boolean().default(false),
    companyId: entity === "company" ? z.never().optional() : identifier.optional(),
    stage: entity === "deal" ? z.enum(DEAL_STAGES).optional() : z.never().optional(),
    currency: entity === "deal" ? currencyCode.optional() : z.never().optional(),
  }).strict();
}
export function recordFacetInput(entity: RecordEntity) {
  return recordListInput(entity).extend({
    facet: z.string().refine(value => (RECORD_FACETS[entity] as readonly string[]).includes(value) || isCustomFieldFacet(value), "Unsupported facet").optional(),
    facetSearch: z.string().trim().max(1000).optional(),
    facetPage: z.number().int().min(1).max(1000000).default(1),
    facetLimit: z.number().int().min(1).max(100).default(50),
  }).strict();
}
export type RecordListQuery = z.input<ReturnType<typeof recordListInput>>;
export type RecordFacetQuery = z.input<ReturnType<typeof recordFacetInput>>;
export type ParsedRecordListQuery = z.output<ReturnType<typeof recordListInput>>;
