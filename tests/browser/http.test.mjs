import assert from 'node:assert/strict';
import { test } from 'node:test';
import { origin } from './browser-harness.mjs';

function assertSecurityHeaders(response, mode, { privateApi = false } = {}) {
  const headers = response.headers();
  assert.equal(headers['x-content-type-options'], 'nosniff', `${new URL(response.url()).pathname} status ${response.status()} has nosniff`);
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['permissions-policy'], 'camera=(), microphone=(), geolocation=()');
  assert.equal(headers['strict-transport-security'], undefined, 'Local HTTP does not advertise HSTS');
  const policy = headers['content-security-policy'];
  assert.ok(policy?.includes("frame-ancestors 'none'"));
  assert.ok(!policy.includes('unsafe-eval'));
  assert.equal(policy.includes("connect-src 'self' ws: wss:"), mode === 'dev');
  if (privateApi) {
    assert.match(headers['cache-control'], /no-store/);
    assert.match(headers['x-request-id'], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.notEqual(headers['x-request-id'], 'caller-supplied-id');
  }
}

export async function runSuite(h, { mode, owner }) {
  await test(`${mode}: HTTP headers preserve sign-in, Swagger, private API and client navigation`, { timeout: 120000 }, async () => {
    const context = await h.newContext();
    const violations = [], errors = [];
    await context.exposeBinding('__reportSecurityViolation', (_, directive) => violations.push(directive));
    await context.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', event => {
        // Record directives only: blocked URLs may contain credentials or user input.
        const target = ['inline', 'eval', 'wasm-eval'].includes(event.blockedURI) ? event.blockedURI : 'resource';
        const source = event.sourceFile ? new URL(event.sourceFile, location.origin).pathname : 'unknown';
        void window.__reportSecurityViolation(`${event.effectiveDirective}:${target} in ${location.pathname} from ${source}:${event.lineNumber}`);
      });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.name));
    try {
      const signIn = await page.goto('/sign-in');
      assert.equal(signIn.status(), 200);
      assertSecurityHeaders(signIn, mode);
      await page.getByLabel('Email', { exact: true }).waitFor();
      await page.waitForLoadState('networkidle');

      const document = await context.request.get('/api/openapi');
      assert.equal(document.status(), 200);
      assertSecurityHeaders(document, mode);
      assert.equal((await document.json()).openapi, '3.0.3');

      const unauthorized = await context.request.get('/api/companies', { headers: { 'x-request-id': 'caller-supplied-id' } });
      assert.equal(unauthorized.status(), 401);
      assertSecurityHeaders(unauthorized, mode, { privateApi: true });

      const docs = await page.goto('/docs');
      assert.equal(docs.status(), 200);
      assertSecurityHeaders(docs, mode);
      await page.getByRole('region', { name: 'Interactive API reference', exact: true }).waitFor();
      await page.locator('.models').waitFor();
      const operation = page.locator('.opblock-get').filter({ has: page.locator('.opblock-summary-path').filter({ hasText: /^\/api\/companies$/ }) });
      await operation.locator('.opblock-summary-control').click();
      await operation.getByRole('button', { name: 'Try it out', exact: true }).click();
      for (const status of [401, 200]) {
        if (status === 200) await context.addCookies(await owner.context.cookies());
        const pending = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/companies');
        await operation.getByRole('button', { name: 'Execute', exact: true }).click();
        const response = await pending;
        assert.equal(response.status(), status);
        assertSecurityHeaders(response, mode, { privateApi: true });
        await operation.locator('.responses-inner .response-col_status').filter({ hasText: String(status) }).first().waitFor();
      }

      const malformed = await context.request.post('/api/companies', { headers: { Origin: origin, 'Content-Type': 'application/json' }, data: '{' });
      assert.equal(malformed.status(), 400);
      assertSecurityHeaders(malformed, mode, { privateApi: true });
      const oversized = await context.request.post('/api/companies', { headers: { Origin: origin, 'Content-Type': 'application/json' }, data: JSON.stringify({ name: 'x'.repeat(1024 * 1024) }) });
      assert.equal(oversized.status(), 413);
      assertSecurityHeaders(oversized, mode, { privateApi: true });
      const companies = await page.goto('/companies');
      assertSecurityHeaders(companies, mode);
      await page.getByRole('heading', { name: 'Companies', exact: true }).waitFor();
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => { window.__httpNavigationMarker = true; });
      await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'Contacts', exact: true }).click();
      await page.waitForURL('**/contacts');
      await page.getByRole('heading', { name: 'Contacts', exact: true }).waitFor();
      await page.waitForLoadState('networkidle');
      assert.equal(await page.evaluate(() => window.__httpNavigationMarker), true, 'RSC navigation retains the browser document');
      assert.ok(await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].some(font => font.family.includes('Geist') && font.status === 'loaded'); }), 'Local Geist font loads under CSP');
      // React's development RSC client probes eval for reconstructed debug stacks
      // and catches failures with an ordinary function fallback. Keep eval blocked;
      // only these verified dev diagnostics are expected. Production allows none.
      const unexpectedViolations = mode === 'dev'
        ? violations.filter(value => !/^script-src:eval in \/[^ ]* from \/node_modules\/\.vite\/deps\/react-server-dom-webpack_client__browser\.js:\d+$/.test(value))
        : violations;
      assert.deepEqual(unexpectedViolations, [], 'No unexpected CSP directives block browser resources or scripts');
      assert.deepEqual(errors, [], 'Browser JavaScript runs without uncaught errors');
      const forbidden = await context.request.post('/api/companies', { headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, data: '{}' });
      assert.equal(forbidden.status(), 403);
      if (mode === 'dev') {
        // Vinext's dev server rejects foreign Origins before app middleware runs.
        // Its stock response has no app metadata; the built Worker exercises the
        // application Origin check and must carry the complete header contract.
        assert.equal(forbidden.headers()['content-type'], 'text/plain');
        assert.equal(forbidden.headers()['x-request-id'], undefined);
        assert.equal(await forbidden.text(), 'Forbidden');
      } else {
        assertSecurityHeaders(forbidden, mode, { privateApi: true });
      }
    } catch (error) {
      process.exitCode = 1;
      const message = String(error.message).split('\n')[0].replace(/https?:\/\/\S+/g, '[URL redacted]');
      const comparison = ['number', 'boolean'].includes(typeof error.actual) && ['number', 'boolean'].includes(typeof error.expected)
        ? ` Expected ${error.expected}; actual ${error.actual}.` : '';
      const location = String(error.stack).split('\n').filter(line => line.includes('http.test.mjs:')).map(line => line.trim()).join(' ');
      throw new Error(`${message}${comparison} ${location}; CSP directives: ${[...new Set(violations)].join(', ') || 'none'}; page error types: ${errors.join(', ') || 'none'}`);
    } finally {
      await context.close();
    }
  });
  if (process.exitCode) throw new Error('HTTP browser scenario failed');
}
