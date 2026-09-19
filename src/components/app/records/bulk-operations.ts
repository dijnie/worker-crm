export interface BulkOutcome {
  id: string;
  ok: boolean;
  error?: string;
  status?: number;
}
/** The copy `runBulkOperation` reports; callers pass their dictionary strings, tests rely on the English default. */
export interface BulkOperationStrings {
  stopped: string;
  accessChanged: string;
  operationFailed: string;
}
const DEFAULT_BULK_STRINGS: BulkOperationStrings = {
  stopped: "Stopped because workspace access changed.",
  accessChanged: "Workspace access changed; refresh before retrying.",
  operationFailed: "Operation failed",
};
export async function runBulkOperation(
  ids: readonly string[],
  action: (id: string) => Promise<unknown>,
  options: { isCurrent?: () => boolean; onSuccess?: (id: string) => void; strings?: BulkOperationStrings; describe?: (failure: unknown) => string } = {},
): Promise<BulkOutcome[]> {
  const strings = options.strings ?? DEFAULT_BULK_STRINGS;
  const unique = [...new Set(ids)];
  if (unique.length > 100 || unique.some((id) => !id.trim() || id.length > 200))
    throw new Error("Select between one and 100 valid records.");
  const outcomes: BulkOutcome[] = new Array(unique.length);
  let cursor = 0;
  let stopped = false;
  async function worker() {
    while (cursor < unique.length) {
      const index = cursor++;
      const id = unique[index];
      if (stopped || options.isCurrent?.() === false) {
        outcomes[index] = {
          id,
          ok: false,
          error: strings.stopped,
        };
        continue;
      }
      try {
        await action(id);
        if (options.isCurrent?.() === false) {
          stopped = true;
          outcomes[index] = {
            id,
            ok: false,
            error: strings.accessChanged,
          };
        } else {
          outcomes[index] = { id, ok: true };
          options.onSuccess?.(id);
        }
      } catch (error) {
        const status =
          error &&
          typeof error === "object" &&
          "status" in error &&
          typeof error.status === "number"
            ? error.status
            : undefined;
        outcomes[index] = {
          id,
          ok: false,
          // `describe` puts a record's failure in the interface language; without it the raw message stands.
          error: options.describe ? options.describe(error) : error instanceof Error ? error.message : strings.operationFailed,
          status,
        };
        if (status === 401 || status === 403) stopped = true;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, unique.length) }, worker));
  return outcomes;
}
