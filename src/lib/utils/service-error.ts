export class ServiceError extends Error {
  constructor(public readonly status: 400 | 401 | 403 | 404 | 409 | 415, message: string) {
    super(message);
    this.name = "ServiceError";
  }
}

export function requireRecord<T>(record: T | null | undefined, label: string): T {
  if (record == null) throw new ServiceError(404, `${label} not found`);
  return record;
}

export function translateDatabaseError(error: unknown, conflictMessage = "A record with these unique values already exists"): never {
  let cause: unknown = error;
  for (let depth = 0; depth < 5 && cause instanceof Error; depth++) {
    if (/UNIQUE constraint failed/.test(cause.message)) throw new ServiceError(409, conflictMessage);
    if (/FOREIGN KEY constraint failed/.test(cause.message)) throw new ServiceError(400, "A referenced record does not exist");
    cause = (cause as Error & { cause?: unknown }).cause;
  }
  throw error;
}
