export const RECORD_KINDS = ["company", "contact", "deal"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
export interface RecordRef {
  kind: RecordKind;
  id: string;
}
export class RecordLinkError extends Error {
  constructor(
    message = "This record link is invalid. Close it and open the record again.",
  ) {
    super(message);
    this.name = "RecordLinkError";
  }
}
export function isRecordKind(value: unknown): value is RecordKind {
  return RECORD_KINDS.some((kind) => kind === value);
}
function validate(ref: RecordRef): RecordRef {
  if (
    !isRecordKind(ref.kind) ||
    typeof ref.id !== "string" ||
    !ref.id.trim() ||
    ref.id.length > 200
  )
    throw new RecordLinkError();
  return ref;
}
export function normalizeRecordStack(refs: readonly RecordRef[]): RecordRef[] {
  if (refs.length > 10)
    throw new RecordLinkError("A record link can contain at most ten records.");
  const seen = new Set<string>();
  return [...refs]
    .reverse()
    .filter((ref) => {
      validate(ref);
      const key = `${ref.kind}:${ref.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .reverse();
}
export function parseRecordStack(
  params: URLSearchParams | string,
): RecordRef[] {
  if (typeof params === "string") {
    // URLSearchParams tolerates broken percent escapes. A record link must be
    // decodable without silently changing the requested identity.
    for (const entry of params.replace(/^\?/, "").split("&")) {
      const separator = entry.indexOf("=");
      const key = separator < 0 ? entry : entry.slice(0, separator);
      if (new URLSearchParams(`${key}=`).has("record")) {
        try { decodeURIComponent(entry.slice(separator + 1).replace(/\+/g, " ")); }
        catch { throw new RecordLinkError(); }
      }
    }
  }
  const search =
    typeof params === "string" ? new URLSearchParams(params) : params;
  return normalizeRecordStack(
    search.getAll("record").map((value) => {
      const separator = value.indexOf(":");
      const kind = value.slice(0, separator);
      if (separator < 1 || !isRecordKind(kind)) throw new RecordLinkError();
      return { kind, id: value.slice(separator + 1) };
    }),
  );
}
export function serializeRecordStack(
  refs: readonly RecordRef[],
  existing = new URLSearchParams(),
): URLSearchParams {
  const result = new URLSearchParams(existing);
  for (const key of ["record", "record-tab", "record-view", "record-add"])
    result.delete(key);
  for (const ref of normalizeRecordStack(refs))
    result.append("record", `${ref.kind}:${ref.id}`);
  return result;
}
export function buildRecordUrl(
  current: string | URL,
  ref: RecordRef,
  origin?: string,
): string {
  const base = new URL(
    current,
    origin ??
      (typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin),
  );
  const expectedOrigin =
    origin ??
    (typeof window === "undefined" ? base.origin : window.location.origin);
  if (base.origin !== expectedOrigin)
    throw new RecordLinkError("Record links must stay in this workspace.");
  const stack = parseRecordStack(base.searchParams).filter(
    (item) => item.kind !== ref.kind || item.id !== ref.id,
  );
  base.search = serializeRecordStack(
    [...stack, validate(ref)],
    base.searchParams,
  ).toString();
  return `${base.pathname}${base.search}${base.hash}`;
}
export function writeRecordStack(
  refs: readonly RecordRef[],
  mode: "push" | "replace" = "replace",
) {
  const url = new URL(window.location.href);
  url.search = serializeRecordStack(refs, url.searchParams).toString();
  window.history[mode === "push" ? "pushState" : "replaceState"](
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export const RECORD_OPEN_EVENT = "workspace-record-open";
export function openRecord(ref: RecordRef) {
  const action = () => {
    const previous = parseRecordStack(window.location.search);
    const stack = previous.filter(
      (item) => item.kind !== ref.kind || item.id !== ref.id,
    );
    writeRecordStack([...stack, ref], previous.length ? "replace" : "push");
  };
  // The mounted sheet host guards every opener, including timeline links.
  const event = new CustomEvent(RECORD_OPEN_EVENT, { cancelable: true, detail: action });
  if (window.dispatchEvent(event) !== false) action();
}
