// Stable identifiers for every failure the API reports. The English `message`
// may be reworded; clients and translations key on the code.
export const NOT_FOUND_CODES = [
  "ACTIVITY_NOT_FOUND",
  "COMPANY_NOT_FOUND",
  "CONTACT_NOT_FOUND",
  "DEAL_NOT_FOUND",
  "DEAL_CONTACT_NOT_FOUND",
  "FIELD_NOT_FOUND",
  "FIELD_OPTION_NOT_FOUND",
  "MEMBER_NOT_FOUND",
  "ROLE_NOT_FOUND",
  "SAVED_VIEW_NOT_FOUND",
  "TARGET_RECORD_NOT_FOUND",
] as const;

export const ERROR_CODES = [
  ...NOT_FOUND_CODES,
  "UNAUTHENTICATED",
  "INACTIVE_MEMBERSHIP",
  "FORBIDDEN_ACTION",
  "PERMISSION_REQUIRED",
  "INVALID_REQUEST",
  "INVALID_JSON",
  "INVALID_QUERY",
  "BODY_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "UNIQUE_CONFLICT",
  "COMPANY_DOMAIN_TAKEN",
  "COMPANY_IDENTITY_TAKEN",
  "CONTACT_EMAIL_TAKEN",
  "DEAL_CONTACT_ATTACHED",
  "FIELD_KEY_TAKEN",
  "SAVED_VIEW_NAME_TAKEN",
  "REFERENCE_MISSING",
  "COMPANY_MISSING",
  "CONTACT_MISSING",
  "STALE_REVISION",
  "WORKSPACE_MISSING",
  "SETTINGS_EMPTY",
  "ADMISSION_FAILED",
  "MEMBERSHIP_CHANGED",
  "LAST_SYSTEM_ACCOUNT",
  "SYSTEM_ROLE_PROTECTED",
  "ROLE_ASSIGNED",
  "ROLE_CHANGED_OR_ASSIGNED",
  "ROLE_NAME_TAKEN",
  "FIELD_CHANGED",
  "FIELD_TYPE_LOCKED",
  "FIELD_KEY_UNUSABLE",
  "FIELD_ENTITY_MISMATCH",
  "FIELD_REQUIRED",
  "FIELD_OPTIONS_UNSUPPORTED",
  "FIELD_OPTION_REQUIRED",
  "FIELD_OPTION_MISMATCH",
  "DUPLICATE_ENTRY",
  "FILTER_UNAVAILABLE",
  "ACTIVITY_NOT_TASK",
  "AMOUNT_INVALID",
  "AMOUNT_OUT_OF_RANGE",
] as const;

// Codes carried by individual validation issues. The named ones are declared by
// the schema that raises them; the rest are the validator's own categories.
export const VALIDATION_CODES = [
  "ACTIVITY_NEEDS_ANCHOR",
  "TASK_NEEDS_SUBJECT",
  "DUE_DATE_TASK_ONLY",
  "LOST_REASON_REQUIRED",
  "COMPANY_DOMAIN_INVALID",
  "VALUE_REQUIRED",
  "invalid_type",
  "invalid_string",
  "invalid_enum_value",
  "invalid_date",
  "too_small",
  "too_big",
  "unrecognized_keys",
  "custom",
] as const;

export type ValidationCode = (typeof VALIDATION_CODES)[number];
export type ErrorCode = (typeof ERROR_CODES)[number];
export type NotFoundCode = (typeof NOT_FOUND_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

export function isValidationCode(value: unknown): value is ValidationCode {
  return typeof value === "string" && (VALIDATION_CODES as readonly string[]).includes(value);
}
