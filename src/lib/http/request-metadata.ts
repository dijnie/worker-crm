const requestIds = new WeakMap<Request, string>();

/** Caller headers never establish diagnostic identity. */
export function getRequestId(request: Request): string {
  let id = requestIds.get(request);
  if (!id) { id = crypto.randomUUID(); requestIds.set(request, id); }
  return id;
}

/** Preserve identity when an internal adapter reconstructs the same request. */
export function inheritRequestId(source: Request, target: Request): void {
  requestIds.set(target, getRequestId(source));
}
