import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

let directory, readJsonBody, MAX_JSON_BODY_BYTES;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'worker-http-json-body-'));
  const modulePath = join(directory, 'json-body.mjs');
  await build({ entryPoints: [fileURLToPath(new URL('../src/lib/http/json-body.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', outfile: modulePath, logLevel: 'silent' });
  ({ readJsonBody, MAX_JSON_BODY_BYTES } = await import(pathToFileURL(modulePath).href));
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

function request(body, headers = { 'Content-Type': 'application/json' }) {
  const result = new Request('https://crm.test/api/companies', { method: 'POST', headers, body, ...(body instanceof ReadableStream ? { duplex: 'half' } : {}) });
  // Request adds text/plain for string bodies; explicitly absent means absent.
  if (!Object.keys(headers).some(key => key.toLowerCase() === 'content-type')) result.headers.delete('Content-Type');
  return result;
}
function status(expected) {
  return error => { assert.equal(error.name, 'ServiceError'); assert.equal(error.status, expected); return true; };
}

test('accepts JSON media type case, whitespace and parameters', async () => {
  for (const contentType of ['application/json', 'Application/JSON', ' application/json ; charset=UTF-8']) {
    assert.deepEqual(await readJsonBody(request('{"name":"Acme"}', { 'Content-Type': contentType })), { name: 'Acme' });
  }
});

test('required bodies reject absent or unsupported content types', async () => {
  for (const headers of [{}, { 'Content-Type': 'text/plain' }, { 'Content-Type': 'application/jsonp' }, { 'Content-Type': 'application/problem+json' }]) {
    await assert.rejects(readJsonBody(request('{}', headers)), status(415));
    await assert.rejects(readJsonBody(request(null, headers)), status(415));
  }
});

test('malformed JSON and empty required JSON bodies are 400; JSON null remains valid', async () => {
  for (const body of ['', ' ', '{', 'undefined', '{"secret": invalid}']) {
    const error = await readJsonBody(request(body)).catch(error => error);
    assert.equal(error.status, 400);
    assert.equal(error.message, 'Expected a valid JSON body');
  }
  await assert.rejects(readJsonBody(request(null)), status(400));
  assert.equal(await readJsonBody(request('null')), null);
  assert.equal(await readJsonBody(request('null'), { allowEmpty: true }), null);
});

test('optional bodies permit null and zero bytes without a content type, but nonempty bodies require JSON', async () => {
  for (const body of [null, '', new Uint8Array(0)]) {
    assert.equal(await readJsonBody(request(body, {}), { allowEmpty: true }), undefined);
  }
  assert.equal(await readJsonBody(request('', { 'Content-Type': 'text/plain' }), { allowEmpty: true }), undefined);
  for (const headers of [{}, { 'Content-Type': 'text/plain' }]) {
    await assert.rejects(readJsonBody(request('{}', headers), { allowEmpty: true }), status(415));
  }
  await assert.rejects(readJsonBody(request(' '), { allowEmpty: true }), status(400));
});

test('required and optional empty-body interpretation is independent in both call orders', async () => {
  for (const headers of [{}, { 'Content-Type': 'application/json' }]) {
    const requiredStatus = Object.keys(headers).length ? 400 : 415;
    for (const body of [null, '']) {
      const optionalFirst = request(body, headers);
      assert.equal(await readJsonBody(optionalFirst, { allowEmpty: true }), undefined);
      await assert.rejects(readJsonBody(optionalFirst), status(requiredStatus));
      const requiredFirst = request(body, headers);
      await assert.rejects(readJsonBody(requiredFirst), status(requiredStatus));
      assert.equal(await readJsonBody(requiredFirst, { allowEmpty: true }), undefined);
    }
  }
});

test('zero-byte stream chunks preserve optional empty-body behavior', async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(0)); controller.close(); } });
  const input = request(stream, {});
  assert.equal(await readJsonBody(input, { allowEmpty: true }), undefined);
  await assert.rejects(readJsonBody(input), status(415));
  assert.equal(stream.locked, false);
});

test('concurrent permission and handler reads share one stream read and parsed object', async () => {
  let pulls = 0;
  const stream = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new TextEncoder().encode('{"nested":{"name":"Acme"}}')); controller.close(); } }, { highWaterMark: 0 });
  const input = request(stream);
  const [permission, handler] = await Promise.all([readJsonBody(input, { allowEmpty: true }), readJsonBody(input)]);
  assert.equal(permission, handler);
  assert.equal(await readJsonBody(input), handler);
  assert.deepEqual(handler, { nested: { name: 'Acme' } });
  assert.equal(pulls, 1);
  assert.equal(input.bodyUsed, true);
  assert.equal(input.body.locked, false);
});

test('failed parsing is cached and does not reread the original stream', async () => {
  const input = request('{');
  const first = await readJsonBody(input).catch(error => error);
  const second = await readJsonBody(input, { allowEmpty: true }).catch(error => error);
  assert.equal(first, second);
  assert.equal(first.status, 400);
});

test('accepts exactly 1 MiB and rejects one extra byte with absent, correct and lying lengths', async () => {
  assert.equal(MAX_JSON_BODY_BYTES, 1024 * 1024);
  const text = `"${'a'.repeat(MAX_JSON_BODY_BYTES - 2)}"`;
  for (const length of [undefined, String(MAX_JSON_BODY_BYTES), '0', '2']) {
    const headers = { 'Content-Type': 'application/json', ...(length === undefined ? {} : { 'Content-Length': length }) };
    assert.equal((await readJsonBody(request(text, headers))).length, MAX_JSON_BODY_BYTES - 2);
    await assert.rejects(readJsonBody(request(`${text} `, headers)), status(413));
  }
});

test('bounds UTF-8 bytes, including a multibyte character split between chunks', async () => {
  const text = `"${'é'.repeat((MAX_JSON_BODY_BYTES - 2) / 2)}"`;
  assert.equal(new TextEncoder().encode(text).byteLength, MAX_JSON_BODY_BYTES);
  assert.equal(await readJsonBody(request(text)), text.slice(1, -1));
  await assert.rejects(readJsonBody(request(`${text} `)), status(413));
  const bytes = new TextEncoder().encode('"é😊"');
  const stream = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  assert.equal(await readJsonBody(request(stream)), 'é😊');
});

test('rejects declared oversize before attempting any stream read', async () => {
  let pulls = 0;
  const stream = new ReadableStream({ pull() { pulls++; return new Promise(() => {}); } }, { highWaterMark: 0 });
  await assert.rejects(readJsonBody(request(stream, { 'Content-Type': 'application/json', 'Content-Length': String(MAX_JSON_BODY_BYTES + 1) })), status(413));
  assert.equal(pulls, 0);
});

test('chunk overflow cancels without awaiting stalled cancellation and releases the reader', { timeout: 1000 }, async () => {
  let pulls = 0, cancellations = 0;
  const stream = new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(pulls === 1 ? MAX_JSON_BODY_BYTES : 1)); },
    cancel() { cancellations++; return new Promise(() => {}); },
  }, { highWaterMark: 0 });
  const input = request(stream, { 'Content-Type': 'application/json', 'Content-Length': '1' });
  await assert.rejects(readJsonBody(input), status(413));
  assert.equal(pulls, 2);
  assert.equal(cancellations, 1);
  assert.equal(stream.locked, false);
});

test('stream failures use the JSON error contract and release the reader', async () => {
  const stream = new ReadableStream({ pull(controller) { controller.error(new Error('private transport details')); } });
  const error = await readJsonBody(request(stream)).catch(error => error);
  assert.equal(error.status, 400);
  assert.equal(error.message, 'Expected a valid JSON body');
  assert.equal(stream.locked, false);
});
