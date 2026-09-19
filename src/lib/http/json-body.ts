import { ServiceError } from "../utils/service-error";

export const MAX_JSON_BODY_BYTES = 1024 * 1024;

type JsonBody = { empty: true } | { empty: false; value: unknown };
const bodies = new WeakMap<Request, Promise<JsonBody>>();

function hasJsonContentType(request: Request): boolean {
  return request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() === "application/json";
}

async function parseBody(request: Request): Promise<JsonBody> {
  const length = request.headers.get("Content-Length");
  if (length !== null && /^\d+$/.test(length) && Number(length) > MAX_JSON_BODY_BYTES) {
    throw new ServiceError(413, "JSON body is too large", "BODY_TOO_LARGE");
  }
  if (request.body === null) return { empty: true };

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let complete = false;
  try {
    reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) { complete = true; break; }
      if (value.byteLength === 0) continue;
      bytes += value.byteLength;
      if (bytes > MAX_JSON_BODY_BYTES) throw new ServiceError(413, "JSON body is too large", "BODY_TOO_LARGE");
      if (!hasJsonContentType(request)) throw new ServiceError(415, "Expected application/json", "UNSUPPORTED_MEDIA_TYPE");
      chunks.push(value);
    }
    if (bytes === 0) return { empty: true };
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { empty: false, value: JSON.parse(new TextDecoder().decode(data)) };
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(400, "Expected a valid JSON body", "INVALID_JSON");
  } finally {
    if (reader) {
      // Cancellation may never settle for an untrusted stream.
      if (!complete) {
        try { void reader.cancel().catch(() => {}); } catch { /* Preserve the body error. */ }
      }
      try { reader.releaseLock(); } catch { /* Preserve the body error. */ }
    }
  }
}

export async function readJsonBody(request: Request, options?: { allowEmpty?: boolean }): Promise<unknown> {
  if (!options?.allowEmpty && !hasJsonContentType(request)) throw new ServiceError(415, "Expected application/json", "UNSUPPORTED_MEDIA_TYPE");
  let body = bodies.get(request);
  if (!body) {
    body = parseBody(request);
    bodies.set(request, body);
  }
  const result = await body;
  if (!result.empty) return result.value;
  if (options?.allowEmpty) return undefined;
  throw new ServiceError(400, "Expected a valid JSON body", "INVALID_JSON");
}
