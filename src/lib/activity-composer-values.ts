import type { CreateActivityApiInput } from "./server/activity-api-inputs";
import type { RecordRef } from "../components/app/record-sheet/record-navigation";
import { inputDateToUtc } from "../components/app/records/form-values";
import { activityAnchor } from "./activity-presentation";
import { identifier, optionalText } from "./utils/validation";

export const MANUAL_ACTIVITY_TYPES = ["NOTE", "CALL", "EMAIL", "MEETING", "TASK"] as const;
export type ManualActivityType = typeof MANUAL_ACTIVITY_TYPES[number];
export type ActivityRelatedIds = Partial<Pick<CreateActivityApiInput, "companyId" | "contactId" | "dealId">>;
export type ActivityComposerDraft = {
  type: ManualActivityType;
  subject: string;
  body: string;
  occurredAt: string;
  dueAt: string;
};
export type ActivityComposerErrors = Partial<Record<keyof ActivityComposerDraft | "companyId" | "contactId" | "dealId", string>>;

export function emptyActivityDraft(type: ManualActivityType = "NOTE"): ActivityComposerDraft {
  return { type, subject: "", body: "", occurredAt: "", dueAt: "" };
}

export function isActivityDraftDirty(draft: ActivityComposerDraft): boolean {
  return !!(draft.subject || draft.body || draft.occurredAt || (draft.type === "TASK" && draft.dueAt));
}

export class ActivityComposerValidationError extends Error {
  constructor(public readonly fields: ActivityComposerErrors) {
    super("Check the highlighted activity fields.");
    this.name = "ActivityComposerValidationError";
  }
}

/** Date-only controls use UTC; local time controls use the user's timezone. */
export function activityInputDateToUtc(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return inputDateToUtc(value);
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!parts) throw new Error("Choose a valid date and time.");
  inputDateToUtc(value.slice(0, 10));
  const date = new Date(value);
  const [, year, month, day, hour, minute, second = "0"] = parts;
  // Reject overflow and local times skipped by daylight-saving changes.
  if (!Number.isFinite(date.getTime()) || date.getFullYear() !== Number(year) || date.getMonth() + 1 !== Number(month)
    || date.getDate() !== Number(day) || date.getHours() !== Number(hour) || date.getMinutes() !== Number(minute)
    || date.getSeconds() !== Number(second)) throw new Error("Choose a valid local date and time.");
  return date.toISOString();
}

export function buildActivityCreateInput(record: RecordRef, draft: ActivityComposerDraft, relatedIds: ActivityRelatedIds = {}): CreateActivityApiInput {
  const errors: ActivityComposerErrors = {};
  const input: CreateActivityApiInput = { type: draft.type, ...activityAnchor(record) };
  if (!MANUAL_ACTIVITY_TYPES.includes(draft.type)) errors.type = "Choose a manual activity type.";
  for (const field of ["subject", "body"] as const) {
    const result = optionalText.safeParse(draft[field]);
    if (!result.success) errors[field] = "Use at most 100,000 characters.";
    else if (result.data) input[field] = result.data;
  }
  if (draft.type === "TASK" && !draft.subject.trim()) errors.subject = "A task needs a subject.";
  else if (draft.type !== "TASK" && !draft.subject.trim() && !draft.body.trim()) errors.body = "Add a subject or notes before saving.";
  for (const field of ["occurredAt", "dueAt"] as const) {
    if (field === "dueAt" && draft.type !== "TASK") continue;
    if (!draft[field]) continue;
    try { input[field] = activityInputDateToUtc(draft[field]); }
    catch (failure) { errors[field] = failure instanceof Error ? failure.message : "Choose a valid date."; }
  }
  // Explicit links remain independent; the current record always stays the anchor.
  const links = { companyId: relatedIds.companyId, contactId: relatedIds.contactId, dealId: relatedIds.dealId, ...activityAnchor(record) };
  for (const field of ["companyId", "contactId", "dealId"] as const) {
    if (links[field] == null) continue;
    const result = identifier.safeParse(links[field]);
    if (!result.success) errors[field] = "Choose a valid linked record.";
    else input[field] = result.data;
  }
  if (Object.keys(errors).length) throw new ActivityComposerValidationError(errors);
  return input;
}
