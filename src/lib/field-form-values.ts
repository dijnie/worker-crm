import type { createApiClient } from "./api";
import type { FieldType } from "./db/schema/constants";
export type FieldDefinition = Awaited<ReturnType<ReturnType<typeof createApiClient>["fields"]["get"]>>;
export type FieldValue = string | boolean | null;
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  TEXT: "Text", LONG_TEXT: "Long text", NUMBER: "Number", DATE: "Date", CHECKBOX: "Checkbox",
  SELECT: "Select", URL: "URL", EMAIL: "Email", PHONE: "Phone", USER: "User",
};
export function derivedFieldKey(label: string): string {
  const key = label.trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^([0-9])/, "f_$1").slice(0, 60);
  return ["id", "createdat", "updatedat", "fields", "owner", "ownerid", "new"].includes(key) ? `${key}_field` : key;
}
export function fieldDateInput(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}
export function fieldDraft(type: FieldType, value: unknown): FieldValue {
  if (value == null) return null;
  if (type === "CHECKBOX") return value === true;
  return type === "DATE" ? fieldDateInput(String(value)) : String(value);
}
export function parseFieldDraft(type: FieldType, value: FieldValue, required = false): FieldValue {
  if (value === null || typeof value === "string" && !value.trim()) {
    if (required) throw new Error("A required field cannot be cleared.");
    return null;
  }
  if (type === "CHECKBOX") {
    if (typeof value !== "boolean") throw new Error("Choose a checkbox value.");
    return value;
  }
  if (typeof value !== "string") throw new Error("Enter a valid value.");
  const text = value.trim();
  const limit = type === "NUMBER" || type === "USER" || type === "SELECT" ? 200 : type === "EMAIL" || type === "PHONE" ? 1000 : 100000;
  if (text.length > limit) throw new Error(`Use at most ${limit} characters.`);
  if (type === "NUMBER" && !/^-?\d+(?:\.\d+)?$/.test(text)) throw new Error("Enter a decimal number without exponent notation.");
  if (type === "DATE") {
    const parsed = new Date(`${text}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new Error("Choose a valid calendar date.");
    return parsed.toISOString();
  }
  if (type === "URL" && !safeFieldHref("URL", text)) throw new Error("Enter an HTTP or HTTPS URL.");
  if (type === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error("Enter a valid email address.");
  return text;
}
export function safeFieldHref(type: FieldType, value: string): string | undefined {
  if (/[\u0000-\u001f\u007f]/.test(value)) return;
  if (type === "EMAIL") return /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(value) ? `mailto:${encodeURIComponent(value).replace(/%40/g, "@")}` : undefined;
  if (type !== "URL") return;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : undefined; } catch { return; }
}
export function fieldValueText(definition: Pick<FieldDefinition, "type" | "options">, value: unknown, userLabel?: string): string {
  if (value == null || value === "") return "Not set";
  if (definition.type === "CHECKBOX") return value === true ? "Yes" : "No";
  if (definition.type === "SELECT") {
    const option = definition.options.find(option => option.id === value);
    return option ? `${option.label}${option.archivedAt ? " (retired)" : ""}` : `Unavailable / retired option (${String(value)})`;
  }
  if (definition.type === "USER") return userLabel ?? `Unavailable / historical (${String(value)})`;
  if (definition.type === "DATE") return fieldDateInput(String(value)) || String(value);
  return String(value);
}
