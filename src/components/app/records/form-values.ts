import type { CreateCompanyInput } from "@services/company.service";
import type { CreateContactInput } from "@services/contact.service";
import type { CreateDealInput } from "@services/deal.service";
import type { FieldEntity } from "@/lib/db/schema/constants";
import type { RecordFieldErrorReason } from "@/lib/i18n/dictionaries/record-sheet";
export type RecordEntity = "company" | "contact" | "deal";
export type RecordDraft = Record<string, string>;
/** The `FieldEntity` (and `dictionary.crm.entities`) key for a lowercase `RecordEntity`. */
export function recordEntityKey(entity: RecordEntity): FieldEntity {
  return entity.toUpperCase() as FieldEntity;
}
/**
 * Thrown by manual property edits and create-form submissions that fail
 * before ever reaching the API. `message` stays the exact English text
 * developers and tests already rely on; `reason` lets the component that
 * catches it show the matching dictionary string for the interface language.
 */
export class RecordFieldError extends Error {
  constructor(message: string, public readonly reason: RecordFieldErrorReason) {
    super(message);
    this.name = "RecordFieldError";
  }
}
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
/** Same calendar-day validation as `inputDateToUtc`, tagged for display in the interface language. */
function parseExpectedCloseDate(value: string): string {
  try {
    return inputDateToUtc(value);
  } catch (error) {
    throw new RecordFieldError(error instanceof Error ? error.message : "Choose a valid date.", "invalidDateValue");
  }
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
    if (!values[key]) {
      const reason: RecordFieldErrorReason =
        key === "firstName" ? "requiredFirstName" : key === "name" ? "requiredName" : key === "companyId" ? "requiredCompany" : "requiredOwner";
      throw new RecordFieldError(
        `${key === "firstName" ? "First name" : key.replace(/Id$/, "")} is required.`,
        reason,
      );
    }
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
    throw new RecordFieldError("Enter a valid email address.", "invalidEmailAddress");
  if (entity === "deal") {
    if (values.amount && !/^\d+(?:\.\d{1,2})?$/.test(values.amount))
      throw new RecordFieldError(
        "Amount must be nonnegative with at most two decimal places.",
        "invalidAmountFormat",
      );
    values.currency = (values.currency ?? "USD").toUpperCase();
    if (!/^[A-Z]{3}$/.test(values.currency))
      throw new RecordFieldError("Currency must be a three-letter code.", "invalidCurrencyFormat");
    if (values.expectedCloseDate)
      values.expectedCloseDate = parseExpectedCloseDate(values.expectedCloseDate);
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
