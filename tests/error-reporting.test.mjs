import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

let directory, reportRequestFailure;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'worker-error-reporting-'));
  const modulePath = join(directory, 'reporter.mjs');
  await build({ entryPoints: [fileURLToPath(new URL('../src/lib/server/error-reporting.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', outfile: modulePath, logLevel: 'silent' });
  ({ reportRequestFailure } = await import(pathToFileURL(modulePath).href));
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

function capture(t) {
  const events = [];
  t.mock.method(console, 'error', (...args) => events.push(args));
  return events;
}

test('diagnostics contain only allowlisted metadata and independently generated request IDs', async t => {
  const events = capture(t);
  const request = new Request('https://private-host.test/api/deals/private-email%40example.test/contacts/private-token?secret=private-query', {
    method: 'PATCH', headers: { cookie: 'private-cookie', authorization: 'Bearer private-credential', 'X-Request-Id': 'private-incoming-id' }, body: JSON.stringify({ name: 'private-name' }),
  });
  const ids = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = Response.json({ message: 'Internal server error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    assert.equal(reportRequestFailure(request, response, 'api_unexpected'), response);
    ids.push(response.headers.get('x-request-id'));
    assert.match(ids.at(-1), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { message: 'Internal server error' });
  }
  assert.notEqual(ids[0], ids[1]);
  assert.deepEqual(events, ids.map(requestId => [JSON.stringify({
    event: 'request_failure', requestId, route: '/api/deals/:id/contacts/:contactId', method: 'PATCH', status: 500, category: 'api_unexpected',
  })]));
  assert.doesNotMatch(JSON.stringify(events), /private-/);
});

test('static routes win over parameters and unknown paths or methods never enter logs', t => {
  const events = capture(t);
  for (const [path, method, expectedRoute, expectedMethod] of [
    ['/api/fields/values?email=private-email', 'GET', '/api/fields/values', 'GET'],
    ['/api/auth/reset-password/private-reset-token', 'GET', '/api/auth/reset-password/:token', 'GET'],
    ['/api/auth/private-email/private-token', 'private-method', 'unmatched', 'OTHER'],
  ]) {
    reportRequestFailure(new Request(`https://crm.test${path}`, { method }), new Response(null, { status: 500 }), 'auth_unexpected');
    const event = JSON.parse(events.at(-1)[0]);
    assert.equal(event.route, expectedRoute);
    assert.equal(event.method, expectedMethod);
  }
  assert.doesNotMatch(JSON.stringify(events), /private-/);
});

test('expected responses emit no error diagnostics', t => {
  const events = capture(t);
  for (const status of [200, 400, 401, 403, 404, 409, 415, 429]) {
    const response = new Response(null, { status });
    reportRequestFailure(new Request('https://crm.test/api/companies'), response, 'api_unexpected');
    assert.equal(response.headers.get('x-request-id'), null);
  }
  assert.deepEqual(events, []);
});

test('a failing log sink preserves response status, body, no-store and correlation ID', async t => {
  t.mock.method(console, 'error', () => { throw new Error('Logging is unavailable'); });
  const response = Response.json({ message: 'Internal server error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  assert.equal(reportRequestFailure(new Request('https://crm.test/api/companies'), response, 'api_unexpected'), response);
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(response.headers.get('x-request-id'));
  assert.deepEqual(await response.json(), { message: 'Internal server error' });
});
