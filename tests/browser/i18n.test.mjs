import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { origin } from './browser-harness.mjs';

async function eventually(check, message) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await check()) return; await delay(75); }
  assert.fail(message);
}

const htmlLang = page => page.locator('html').getAttribute('lang');

export async function runSuite(h, { mode, owner }) {
  await test(`${mode}: the workspace language changes every screen, the auth pages and nothing in the API contract`, { timeout: 150000 }, async () => {
    const stored = await h.api(owner.context, '/api/settings');
    assert.equal(stored.locale, 'en', 'A workspace starts in English');
    // ISO 4217 reserves XTS and XXX for testing, so no other suite's deals share this pipeline.
    const currency = mode === 'dev' ? 'XTS' : 'XXX';
    const company = await h.api(owner.context, '/api/companies', { method: 'POST', body: { name: `${mode} language company` } });
    await h.api(owner.context, '/api/deals', { method: 'POST', body: { name: `${mode} language deal`, companyId: company.id, ownerId: owner.user.id, amount: '1234567.50', currency } });
    const page = await owner.context.newPage();
    let signedOut;
    try {
      await page.goto(`/?currency=${currency}`);
      await page.getByText('1,234,567.50', { exact: true }).first().waitFor();
      await page.goto('/settings');
      await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
      assert.equal(await htmlLang(page), 'en');
      const language = page.locator('#workspace-language');
      await language.waitFor();
      assert.equal(await language.inputValue(), 'en');
      assert.deepEqual(await language.locator('option').allTextContents(), ['English', 'Tiếng Việt'], 'Each language is named in itself');

      await language.selectOption('vi');
      await Promise.all([
        page.waitForEvent('load'),
        page.getByRole('button', { name: 'Save language', exact: true }).click(),
      ]);
      await page.getByRole('heading', { name: 'Cài đặt', exact: true }).waitFor();
      assert.equal(await htmlLang(page), 'vi', 'The document declares the workspace language');
      assert.equal((await h.api(owner.context, '/api/settings')).locale, 'vi');
      await page.getByRole('button', { name: 'Lưu ngôn ngữ', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Lưu tiền tệ', exact: true }).waitFor();
      assert.equal(await page.getByText('Save currency', { exact: true }).count(), 0, 'No English settings copy remains');

      await page.goto('/companies');
      await page.waitForLoadState('networkidle');
      assert.equal(await htmlLang(page), 'vi');
      await page.getByRole('link', { name: 'Công ty', exact: true }).first().waitFor();
      assert.equal(await page.getByRole('link', { name: 'Companies', exact: true }).count(), 0, 'Navigation is translated');

      await page.goto(`/?currency=${currency}`);
      await page.getByText('1.234.567,50', { exact: true }).first().waitFor();
      assert.equal(await page.getByText('1,234,567.50', { exact: true }).count(), 0, 'Amounts follow the workspace language');

      // A visitor without a session sees the same language: it belongs to the
      // workspace, and the auth pages are rendered per request rather than at build time.
      const browser = await chromium.launch();
      signedOut = browser;
      const visitor = await browser.newPage({ baseURL: origin });
      await visitor.goto('/sign-in');
      await visitor.waitForLoadState('networkidle');
      assert.equal(await htmlLang(visitor), 'vi', 'The sign-in page follows the workspace language');
      await visitor.getByRole('button', { name: 'Đăng nhập', exact: true }).waitFor();
      assert.equal(await visitor.getByRole('button', { name: 'Sign in', exact: true }).count(), 0, 'The sign-in form is not English');

      // The API keeps speaking English and identifies the failure by code.
      const current = await h.api(owner.context, '/api/settings');
      const stale = await owner.context.request.patch('/api/settings', { data: { locale: 'en', expectedRevision: current.revision + 1 }, headers: { Origin: origin } });
      assert.equal(stale.status(), 409);
      assert.deepEqual(await stale.json(), { message: 'The workspace settings changed; reload and try again', code: 'STALE_REVISION' });
      const unsupported = await owner.context.request.patch('/api/settings', { data: { locale: 'fr', expectedRevision: current.revision }, headers: { Origin: origin } });
      assert.equal(unsupported.status(), 400);
      assert.equal((await unsupported.json()).code, 'INVALID_REQUEST');
    } finally {
      await signedOut?.close();
      await page.close();
      const current = await h.api(owner.context, '/api/settings');
      if (current.locale !== stored.locale) {
        await h.api(owner.context, '/api/settings', { method: 'PATCH', body: { locale: stored.locale, expectedRevision: current.revision } });
      }
      await eventually(async () => (await h.api(owner.context, '/api/settings')).locale === stored.locale, 'The suite restores the workspace language');
    }
  });
}
