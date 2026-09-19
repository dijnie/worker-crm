import { isErrorCode, isValidationCode } from "@/lib/utils/error-codes";
import type { AppDictionary } from "./dictionary";

interface ReportedFailure { message: string; status?: number; code?: string }
interface ReportedIssue { message: string; code?: string }

/** The text to show for a failed request, in the interface language. */
export function errorMessage(failure: unknown, dictionary: AppDictionary): string {
  const { errors } = dictionary;
  if (!isReported(failure)) return errors.unreachable;
  const translated = errors.server && isErrorCode(failure.code) ? errors.server[failure.code] : undefined;
  if (translated) return translated;
  // Without a code the server's English text is all there is; an unexplained
  // server failure reads better as the generic line than as "Request failed (500)".
  if (errors.server && (failure.status ?? 0) >= 500) return errors.unexpected;
  return failure.message;
}

/** The text to show under one rejected field. */
export function issueMessage(issue: ReportedIssue, dictionary: AppDictionary): string {
  const { validation } = dictionary.errors;
  return validation && isValidationCode(issue.code) ? validation[issue.code] : issue.message;
}

function isReported(failure: unknown): failure is ReportedFailure {
  return failure instanceof Error && "status" in failure && typeof failure.status === "number";
}
