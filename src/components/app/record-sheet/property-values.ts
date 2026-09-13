import { z } from "zod/v3";
import { currencyCode, dateTime, identifier, optionalText, requiredText } from "@/lib/utils/validation";
import { inputDateToUtc, COMPANY_FIELDS, CONTACT_FIELDS, DEAL_FIELDS, type RecordEntity } from "../records/form-values";

export const propertyLabels: Record<string, string> = {
  name: "Name", firstName: "First name", lastName: "Last name", domain: "Domain", website: "Website",
  description: "Description", industry: "Industry", city: "City", stateCode: "State / region", country: "Country",
  phone: "Phone", email: "Email", linkedinUrl: "LinkedIn URL", twitterUrl: "Twitter URL", githubUrl: "GitHub URL",
  title: "Title", amount: "Amount", currency: "Currency", expectedCloseDate: "Expected close date", ownerId: "Owner",
  companyId: "Company", primaryContactId: "Primary contact",
};
export const fieldsFor = (entity: RecordEntity) => entity === "company" ? COMPANY_FIELDS : entity === "contact" ? CONTACT_FIELDS : DEAL_FIELDS;
export function parseProperty(entity: RecordEntity, field: string, input: string): string | null {
  if (!(fieldsFor(entity) as readonly string[]).includes(field)) throw new Error("This property is read-only.");
  const value = input.trim();
  if (field === "name" || field === "firstName") return requiredText.parse(value);
  if (field.endsWith("Id")) return !value && entity !== "deal" ? null : identifier.parse(value);
  if (field === "currency") return currencyCode.parse(value);
  if (field === "expectedCloseDate") return value ? inputDateToUtc(dateTime.parse(value)) : null;
  if (field === "amount") {
    if (!value) return null;
    if (value.length > 200 || !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Amount must be nonnegative with at most two decimal places.");
    const [whole, fraction = ""] = value.split(".");
    if (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0")) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount exceeds the supported range.");
    return value;
  }
  if (field === "domain") {
    if (!value) return null;
    if (value.length > 2048) throw new Error("Domain must be at most 2048 characters.");
    const lower = value.toLowerCase();
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(lower) ? lower : `https://${lower}`);
      const domain = url.hostname.replace(/^www\./, "");
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return domain;
    } catch { /* One actionable validation message for all malformed domains. */ }
    throw new Error("Expected a valid company domain.");
  }
  const text = optionalText.parse(value) ?? null;
  return field === "email" && text ? z.string().email().parse(text).toLowerCase() : text;
}
export function safePropertyHref(value: string): string | undefined {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
export function propertyError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues.map(issue => issue.message).join(" ");
  return error instanceof Error ? error.message : "Could not save. Try again.";
}
