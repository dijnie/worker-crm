import { z } from "zod/v3";
import { currencyCode, dateTime, identifier, optionalText, requiredText } from "@/lib/utils/validation";
import { inputDateToUtc, COMPANY_FIELDS, CONTACT_FIELDS, DEAL_FIELDS, RecordFieldError, type RecordEntity } from "../records/form-values";
import { errorMessage } from "@/lib/i18n/error-message";
import type { AppDictionary } from "@/lib/i18n/dictionary";
import type { RecordFieldErrorReason } from "@/lib/i18n/dictionaries/record-sheet";

export const fieldsFor = (entity: RecordEntity) => entity === "company" ? COMPANY_FIELDS : entity === "contact" ? CONTACT_FIELDS : DEAL_FIELDS;

function parseBounded(schema: typeof requiredText | typeof identifier, value: string, tooLongReason: RecordFieldErrorReason): string {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new RecordFieldError(issue.message, issue.code === "too_small" ? "required" : tooLongReason);
}
function parseOptional(value: string): string | null {
  const result = optionalText.safeParse(value);
  if (result.success) return result.data ?? null;
  throw new RecordFieldError(result.error.issues[0].message, "valueTooLong");
}
function parseCurrency(value: string): string {
  const result = currencyCode.safeParse(value);
  if (result.success) return result.data;
  throw new RecordFieldError(result.error.issues[0].message, "invalidCurrency");
}
function parseExpectedCloseDate(value: string): string {
  const result = dateTime.safeParse(value);
  if (!result.success) throw new RecordFieldError(result.error.issues[0].message, "invalidDateFormat");
  try { return inputDateToUtc(result.data); }
  catch (error) { throw new RecordFieldError(error instanceof Error ? error.message : "Choose a valid date.", "invalidDateValue"); }
}
function parseEmail(value: string): string {
  const result = z.string().email().safeParse(value);
  if (!result.success) throw new RecordFieldError(result.error.issues[0].message, "invalidEmail");
  return result.data.toLowerCase();
}

export function parseProperty(entity: RecordEntity, field: string, input: string): string | null {
  if (!(fieldsFor(entity) as readonly string[]).includes(field)) throw new RecordFieldError("This property is read-only.", "readOnly");
  const value = input.trim();
  if (field === "name" || field === "firstName") return parseBounded(requiredText, value, "nameTooLong");
  if (field.endsWith("Id")) return !value && entity !== "deal" ? null : parseBounded(identifier, value, "idTooLong");
  if (field === "currency") return parseCurrency(value);
  if (field === "expectedCloseDate") return value ? parseExpectedCloseDate(value) : null;
  if (field === "amount") {
    if (!value) return null;
    if (value.length > 200 || !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new RecordFieldError("Amount must be nonnegative with at most two decimal places.", "invalidAmountFormat");
    const [whole, fraction = ""] = value.split(".");
    if (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0")) > BigInt(Number.MAX_SAFE_INTEGER)) throw new RecordFieldError("Amount exceeds the supported range.", "amountOutOfRange");
    return value;
  }
  if (field === "domain") {
    if (!value) return null;
    if (value.length > 2048) throw new RecordFieldError("Domain must be at most 2048 characters.", "domainTooLong");
    const lower = value.toLowerCase();
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(lower) ? lower : `https://${lower}`);
      const domain = url.hostname.replace(/^www\./, "");
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return domain;
    } catch { /* One actionable validation message for all malformed domains. */ }
    throw new RecordFieldError("Expected a valid company domain.", "invalidDomain");
  }
  const text = parseOptional(value);
  return field === "email" && text ? parseEmail(text) : text;
}
export function safePropertyHref(value: string): string | undefined {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
/** The text to show for a failed manual edit or record mutation, in the interface language. */
export function propertyFailureMessage(failure: unknown, dictionary: AppDictionary): string {
  if (failure instanceof RecordFieldError) return dictionary.recordSheet.validation[failure.reason];
  return errorMessage(failure, dictionary);
}
