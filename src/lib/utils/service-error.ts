import type { ErrorCode, NotFoundCode } from "./error-codes";

export class ServiceError extends Error {
  constructor(public readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415, message: string, public readonly code: ErrorCode) {
    super(message);
    this.name = "ServiceError";
  }
}

const NOT_FOUND = {
  "Activity": "ACTIVITY_NOT_FOUND",
  "Company": "COMPANY_NOT_FOUND",
  "Contact": "CONTACT_NOT_FOUND",
  "Deal": "DEAL_NOT_FOUND",
  "Deal contact": "DEAL_CONTACT_NOT_FOUND",
  "Field": "FIELD_NOT_FOUND",
  "Field option": "FIELD_OPTION_NOT_FOUND",
  "Saved view": "SAVED_VIEW_NOT_FOUND",
  "Target record": "TARGET_RECORD_NOT_FOUND",
} as const satisfies Record<string, NotFoundCode>;

export function requireRecord<T>(record: T | null | undefined, label: keyof typeof NOT_FOUND): T {
  if (record == null) throw new ServiceError(404, `${label} not found`, NOT_FOUND[label]);
  return record;
}

export function translateDatabaseError(error: unknown, conflictMessage = "A record with these unique values already exists", conflictCode: ErrorCode = "UNIQUE_CONFLICT"): never {
  let cause: unknown = error;
  for (let depth = 0; depth < 5 && cause instanceof Error; depth++) {
    if (/UNIQUE constraint failed/.test(cause.message)) throw new ServiceError(409, conflictMessage, conflictCode);
    if (/FOREIGN KEY constraint failed/.test(cause.message)) throw new ServiceError(400, "A referenced record does not exist", "REFERENCE_MISSING");
    cause = (cause as Error & { cause?: unknown }).cause;
  }
  throw error;
}
