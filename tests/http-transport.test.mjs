import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createAuthHarness, password } from './auth-harness.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let harness, account, transport;

before(async () => {
  harness = await createAuthHarness();
  account = await harness.signupSystem();
  const modulePath = join(harness.directory, 'http-transport.mjs');
  await build({
    stdin: { contents: `export * from './src/lib/http/request-metadata.ts'; export * from './src/lib/http/response.ts'; export * from './src/lib/http/json-body.ts'; export * from './src/lib/server/error-reporting.ts'; export * from './src/lib/api.ts';`, resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', outfile: modulePath, logLevel: 'silent',
  });
  transport = await import(pathToFileURL(modulePath).href);
});
after(async () => { await harness?.dispose(); });

function assertTransport(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.match(response.headers.get('x-request-id') ?? '', uuid);
  return response.headers.get('x-request-id');
}

test('canonical request inheritance preserves one UUID through finalization and sanitized failure logging', async t => {
  const events = [];
  t.mock.method(console, 'error', (...args) => events.push(args));
  const incoming = new Request('http://crm.test/api/auth/sign-in/email?secret=private-query', {
    method: 'POST', headers: { 'x-request-id': 'private-incoming-id', 'cf-ray': 'private-caller-ray' }, body: '{}',
  });
  const requestId = transport.getRequestId(incoming);
  const canonical = new Request('https://crm.test/api/auth/sign-in/email', { method: 'POST', body: '{}' });
  transport.inheritRequestId(incoming, canonical);
  const failed = transport.finalizeHttpResponse(canonical, transport.reportRequestFailure(canonical,
    Response.json({ message: 'Unavailable' }, { status: 500, headers: { 'cache-control': 'no-store' } }), 'auth_unexpected'));
  assert.equal(assertTransport(failed, 500), requestId);
  assert.equal(transport.getRequestId(canonical), requestId);
  assert.deepEqual(events, [[JSON.stringify({ event: 'request_failure', requestId,
    route: '/api/auth/sign-in/email', method: 'POST', status: 500, category: 'auth_unexpected' })]]);
  assert.doesNotMatch(JSON.stringify(events), /private-/);
  const requests = Array.from({ length: 12 }, () => new Request(incoming.url, { headers: incoming.headers }));
  const ids = await Promise.all(requests.map(async request => transport.getRequestId(request)));
  assert.equal(new Set([requestId, ...ids]).size, 13);
  for (const id of ids) assert.match(id, uuid);
});

test('API transport rejects invalid and oversized bodies after authentication and before any write', async () => {
  const oversized = JSON.stringify({ name: 'x'.repeat(transport.MAX_JSON_BODY_BYTES) });
  const cases = [
    { body: '{', status: 400 },
    { body: '', status: 400 },
    { body: '{}', headers: { 'content-type': 'text/plain' }, status: 415 },
    { body: oversized, status: 413 },
  ];
  const beforeCount = await harness.binding.prepare('SELECT count(*) AS total FROM companies').first();
  for (const { status, ...options } of cases) {
    const response = await harness.request('/api/companies', { method: 'POST', cookie: account.cookie,
      ...options, headers: { 'x-request-id': 'caller-id', ...options.headers } });
    assertTransport(response, status);
  }
  // Pace a large upload so an early denial is observable before the HTTP peer
  // closes the unread upload; eager megabyte writes can reset Miniflare's socket.
  const upload = () => {
    let offset = 0, cancelled = false;
    const bytes = new TextEncoder().encode(oversized);
    return new ReadableStream({
      async pull(controller) {
        await new Promise(resolve => setTimeout(resolve, 5));
        if (cancelled) return;
        if (offset === bytes.length) { controller.close(); return; }
        controller.enqueue(bytes.subarray(offset, offset + 4096));
        offset = Math.min(offset + 4096, bytes.length);
      },
      cancel() { cancelled = true; },
    });
  };
  const unauthorized = await harness.runtime.dispatchFetch(`${harness.baseUrl}/api/companies`, {
    method: 'POST', duplex: 'half', body: upload(),
    headers: { 'content-type': 'application/json', origin: harness.baseUrl },
  });
  assertTransport(unauthorized, 401);
  const deniedOrigin = await harness.runtime.dispatchFetch(`${harness.baseUrl}/api/companies`, {
    method: 'POST', duplex: 'half', body: upload(),
    headers: { 'content-type': 'application/json', cookie: account.cookie, origin: 'https://attacker.test' },
  });
  assertTransport(deniedOrigin, 403);
  assert.deepEqual(await harness.binding.prepare('SELECT count(*) AS total FROM companies').first(), beforeCount);
});

test('shared permission parsing preserves valid writes, pagination, bodyless mutations and 204 responses', async () => {
  const created = await harness.request('/api/companies', { method: 'POST', cookie: account.cookie,
    headers: { 'content-type': 'application/json; charset=utf-8' }, body: { name: 'Transport company' } });
  assertTransport(created, 201);
  const company = await created.json();
  const listed = await harness.request('/api/companies?limit=1', { cookie: account.cookie });
  assertTransport(listed, 200);
  assert.equal(listed.headers.get('x-total-count'), '1');
  assert.equal(listed.headers.get('x-page'), '1');
  assert.equal(listed.headers.get('x-limit'), '1');
  assert.equal((await listed.json())[0].id, company.id);
  const removed = await harness.request(`/api/companies/${company.id}`, { method: 'DELETE', cookie: account.cookie });
  assertTransport(removed, 200);
  assert.ok((await removed.json()).archivedAt);
  const restored = await harness.request(`/api/companies/${company.id}/restore`, { method: 'POST', cookie: account.cookie });
  assertTransport(restored, 200);
  assert.equal((await restored.json()).archivedAt, null);
  const note = await harness.request('/api/activities', { method: 'POST', cookie: account.cookie,
    body: { type: 'NOTE', companyId: company.id, body: 'Transport note' } });
  assertTransport(note, 201);
  const deleted = await harness.request(`/api/activities/${(await note.json()).id}`, { method: 'DELETE', cookie: account.cookie });
  assertTransport(deleted, 204);
  assert.equal(await deleted.text(), '');
  const identity = await harness.request('/api/account', { cookie: account.cookie });
  assertTransport(identity, 200);
  assert.equal(Object.hasOwn(await identity.json(), 'requestId'), false);
});

test('typed API errors retain the actual server request ID and concurrent responses get distinct IDs', async () => {
  let serverId;
  const client = transport.createApiClient({ baseUrl: harness.baseUrl, fetch: async (url, options) => {
    const response = await harness.runtime.dispatchFetch(url, options);
    serverId = response.headers.get('x-request-id');
    return response;
  } });
  await assert.rejects(client.companies.list(), error => {
    assert.ok(error instanceof transport.ApiError);
    assert.equal(error.status, 401);
    assert.equal(error.requestId, serverId);
    assert.match(error.requestId, uuid);
    return true;
  });
  const responses = await Promise.all(Array.from({ length: 6 }, () => harness.request('/api/account', {
    cookie: account.cookie, headers: { 'x-request-id': 'identical-caller-id', 'cf-ray': 'identical-caller-ray' },
  })));
  assert.equal(new Set(responses.map(response => assertTransport(response, 200))).size, responses.length);
});

test('auth errors, verification redirects and delivery diagnostics retain headers and request correlation', async () => {
  for (const body of ['{', '{}']) {
    const response = await harness.request('/api/auth/sign-in/email', { method: 'POST', body });
    assertTransport(response, 400);
    assert.deepEqual(await response.json(), { message: 'Invalid request' });
  }
  for (const path of ['/api/auth/sign-in/email', '/api/auth/reset-password']) {
    const response = await harness.request(path, { method: 'POST', body: JSON.stringify({
      email: 'oversized@example.test', password: 'x'.repeat(transport.MAX_JSON_BODY_BYTES),
    }) });
    assertTransport(response, 413);
  }
  const email = 'transport-verification@example.test';
  const signup = await harness.request('/api/auth/sign-up/email', { method: 'POST', ip: '198.51.100.201',
    body: { email, password, name: 'Transport user', callbackURL: '/sign-in' } });
  assertTransport(signup, 200);
  const link = (await harness.outbox()).find(message => message.to === email).url;
  const verification = await harness.request(link, { ip: '198.51.100.202' });
  assertTransport(verification, 302);
  assert.ok(verification.headers.get('location')?.endsWith('/sign-in'));
  const before = (await harness.errorEvents()).length;
  await harness.request('/__test/email-failure', { method: 'POST', body: { enabled: true } });
  try {
    const reset = await harness.request('/api/auth/request-password-reset', { method: 'POST',
      ip: '198.51.100.204', body: { email: account.email, redirectTo: '/reset-password' },
      headers: { 'x-request-id': 'untrusted-auth-id' } });
    const requestId = assertTransport(reset, 503);
    assert.deepEqual((await harness.errorEvents()).slice(before), [[JSON.stringify({ event: 'request_failure', requestId,
      route: '/api/auth/request-password-reset', method: 'POST', status: 503, category: 'email_delivery_failed' })]]);
  } finally {
    await harness.request('/__test/email-failure', { method: 'POST', body: { enabled: false } });
  }
});
