import type { CreateCompanyInput } from "@services/company.service";
import type { CreateContactInput } from "@services/contact.service";
import type { CreateDealInput } from "@services/deal.service";
export type RecordEntity = "company" | "contact" | "deal";
export type RecordDraft = Record<string, string>;
export const COMPANY_FIELDS = [
  "name",
  "domain",
  "website",
  "description",
  "industry",
  "city",
  "stateCode",
  "country",
  "phone",
  "email",
  "linkedinUrl",
  "ownerId",
  "primaryContactId",
] as const;
export const CONTACT_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "title",
  "linkedinUrl",
  "twitterUrl",
  "githubUrl",
  "companyId",
  "ownerId",
] as const;
export const DEAL_FIELDS = [
  "name",
  "companyId",
  "ownerId",
  "description",
  "amount",
  "currency",
  "expectedCloseDate",
] as const;
export function inputDateToUtc(value: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (
    !Number.isFinite(parsed.getTime()) ||
    (dateOnly && parsed.toISOString().slice(0, 10) !== value)
  )
    throw new Error("Choose a valid date.");
  return parsed.toISOString();
}
export function buildCreateInput(
  entity: "company",
  draft: RecordDraft,
): CreateCompanyInput;
export function buildCreateInput(
  entity: "contact",
  draft: RecordDraft,
): CreateContactInput;
export function buildCreateInput(
  entity: "deal",
  draft: RecordDraft,
): CreateDealInput;
export function buildCreateInput(
  entity: RecordEntity,
  draft: RecordDraft,
): CreateCompanyInput | CreateContactInput | CreateDealInput {
  const fields =
    entity === "company"
      ? COMPANY_FIELDS
      : entity === "contact"
        ? CONTACT_FIELDS
        : DEAL_FIELDS;
  const values: Record<string, string | null> = {};
  for (const key of fields) {
    const value = draft[key]?.trim();
    if (value) values[key] = value;
  }
  const required =
    entity === "contact"
      ? ["firstName"]
      : entity === "deal"
        ? ["name", "companyId", "ownerId"]
        : ["name"];
  for (const key of required)
    if (!values[key])
      throw new Error(
        `${key === "firstName" ? "First name" : key.replace(/Id$/, "")} is required.`,
      );
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
    throw new Error("Enter a valid email address.");
  if (entity === "deal") {
    if (values.amount && !/^\d+(?:\.\d{1,2})?$/.test(values.amount))
      throw new Error(
        "Amount must be nonnegative with at most two decimal places.",
      );
    values.currency = (values.currency ?? "USD").toUpperCase();
    if (!/^[A-Z]{3}$/.test(values.currency))
      throw new Error("Currency must be a three-letter code.");
    if (values.expectedCloseDate)
      values.expectedCloseDate = inputDateToUtc(values.expectedCloseDate);
  }
  return values as unknown as
    CreateCompanyInput | CreateContactInput | CreateDealInput;
}
export const RECORD_INVALIDATIONS = [
  "companies",
  "contacts",
  "deals",
  "company",
  "contact",
  "deal",
  "facets",
  "details",
  "relations",
  "activities",
  "recent-feed",
  "stats",
];
