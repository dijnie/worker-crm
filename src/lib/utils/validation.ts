import { z } from "zod";

export const identifier = z.string().trim().min(1).max(200);
export const requiredText = z.string().trim().min(1).max(1000);
export const optionalText = z.string().trim().max(100000).transform(value => value || null).nullable().optional();
export const nullableId = identifier.nullable().optional();
export const decimalString = z.string().trim().regex(/^-?\d+(?:\.\d+)?$/, "Expected a decimal string").max(200);
export const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Expected a three-letter currency code");

export const dateTime = z.string().refine(value => {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false;
  const day = value.slice(0, 10);
  const parsedDay = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsedDay.getTime()) && parsedDay.toISOString().slice(0, 10) === day && Number.isFinite(Date.parse(value));
}, "Expected a valid date or ISO timestamp with timezone").transform(value => new Date(value).toISOString());

export const listInput = z.object({
  page: z.number().int().min(1).max(1000000).default(1),
  limit: z.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(1000).optional(),
  archived: z.boolean().default(false),
}).strict();

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, character => `\\${character}`);
}
