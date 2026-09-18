import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { origin } from './browser-harness.mjs';

const password = 'Browser-test-password-42!';
const sheet = page => page.getByRole('dialog', { name: /^(Company|Contact|Deal) record$/ });
async function eventually(check, message) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await check()) return; await delay(50); }
  assert.fail(message);
}
async function scenario(mode, name, run) {
  await test(`${mode}: integration ${name}`, { timeout: 150000 }, async () => {
    try { await run(); } catch (error) {
      process.exitCode = 1;
      // Playwright navigation errors can contain a real verification/reset token.
      const safe = new Error(String(error.message).split('\n')[0].replace(/https?:\/\/\S+/g, '[URL redacted]'));
      if (['boolean', 'number'].includes(typeof error.actual) && ['boolean', 'number'].includes(typeof error.expected)) {
        safe.message += ` Expected ${error.expected}; actual ${error.actual}.`;
      }
      if (String(error.message).startsWith('locator.click:')) {
        safe.message += '\n' + String(error.message).split('\n').slice(1).join('\n').slice(-6000)
          .replace(/https?:\/\/\S+/g, '[URL redacted]').replace(/value=(["']).*?\1/g, 'value=[redacted]');
      }
      safe.stack += '\n' + String(error.stack).split('\n').filter(line => /^\s+at /.test(line)).join('\n').replace(/https?:\/\/\S+/g, '[URL redacted]');
      throw safe;
    }
  });
  if (process.exitCode) throw new Error(`Integration scenario failed: ${name}`);
}
async function login(page, email, secret = password, destination = '/companies') {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(destination)}`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(secret);
  const submit = async () => {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/sign-in/email');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    return pending;
  };
  let response = await submit();
  if (response.status() === 429) {
    const seconds = Number(response.headers()['retry-after'] ?? 60);
    assert.ok(Number.isFinite(seconds) && seconds >= 0 && seconds <= 120, 'Auth retry window is bounded');
    console.log(`[browser] Real sign-in rate limit reached; respecting Retry-After (${seconds}s) before one explicit retry.`);
    await delay((seconds + 1) * 1000);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(secret);
    response = await submit();
    assert.notEqual(response.status(), 429, 'Sign-in retry succeeds after the server rate window');
  }
  if (response.status() === 200) {
    await page.waitForURL(url => url.pathname !== '/sign-in');
    await page.waitForLoadState('networkidle');
  }
}
async function emailFiles(h) {
  return (await Promise.all(['.wrangler/tmp/email', 'dist/server/.wrangler/tmp/email'].map(async path => {
    const root = join(h.app, path);
    return (await readdir(root, { recursive: true }).catch(() => [])).map(entry => join(root, entry));
  }))).flat();
}
async function resetLink(h, existing) {
  let link;
  await eventually(async () => {
    for (const path of await emailFiles(h)) {
      if (existing.has(path) || !(await lstat(path)).isFile()) continue;
      const text = await readFile(path, 'utf8');
      const match = text.match(/http:\/\/localhost:3100\/api\/auth\/reset-password\/[^\s<>"']+/);
      if (match) { link = match[0].replaceAll('&amp;', '&'); return true; }
    }
    return false;
  }, 'Native simulated email contains the actual password-reset link');
  return link;
}

async function authAndDocs(h, { mode, owner }) {
  await scenario(mode, 'public Swagger executes anonymous and verified same-origin requests', async () => {
    const context = await h.newContext();
    const page = await context.newPage();
    const external = [];
    page.on('request', request => { if (new URL(request.url()).origin !== origin) external.push(new URL(request.url()).origin); });
    try {
      const document = await context.request.get('/api/openapi');
      assert.equal(document.status(), 200);
      assert.equal((await document.json()).openapi, '3.0.3');
      for (const status of [401, 200]) {
        if (status === 200) {
          await login(page, owner.email, password, '/docs');
          await page.waitForURL('**/docs');
        } else await page.goto('/docs');
        await page.getByRole('region', { name: 'Interactive API reference', exact: true }).waitFor();
        await page.locator('.models').waitFor();
        assert.equal(await page.getByRole('navigation', { name: 'Primary', exact: true }).count(), 0);
        assert.equal(await page.locator('.authorize').count(), 0);
        const operation = page.locator('.opblock-get').filter({ has: page.locator('.opblock-summary-path').filter({ hasText: /^\/api\/companies$/ }) });
        await operation.locator('.opblock-summary-control').click();
        await operation.getByRole('button', { name: 'Try it out', exact: true }).click();
        const result = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/companies');
        await operation.getByRole('button', { name: 'Execute', exact: true }).click();
        const response = await result;
        assert.equal(response.status(), status);
        assert.match(response.headers()['cache-control'], /no-store/);
        await operation.locator('.responses-inner .response-col_status').filter({ hasText: String(status) }).first().waitFor();
      }
      assert.deepEqual(external, [], 'Swagger assets and requests stay on the application origin');
    } finally { await context.close(); }
  });

  await scenario(mode, 'native reset is one-use, revokes old sessions and returns safely to a queried record', async () => {
    const actor = await h.signupAuthorized(`${mode} Reset Member`);
    const oldContext = await h.newContext();
    await oldContext.addCookies(await actor.context.cookies());
    const publicContext = await h.newContext();
    const page = await publicContext.newPage();
    const company = await h.api(actor.context, '/api/companies', { method: 'POST', body: { name: `${mode} Reset return company` } });
    const destination = `/companies?q=${encodeURIComponent(company.name)}&pageSize=50&record=company%3A${company.id}`;
    const nextPassword = 'Reset-browser-password-93!';
    try {
      await page.goto(destination);
      await page.waitForURL('**/sign-in?**');
      assert.equal(new URL(page.url()).searchParams.get('returnTo'), destination);
      assert.equal(await page.getByRole('navigation', { name: 'Primary', exact: true }).count(), 0);
      const existing = new Set(await emailFiles(h));
      await page.getByRole('link', { name: 'Forgot your password?', exact: true }).click();
      await page.waitForURL(url => url.pathname === '/forgot-password');
      await page.waitForLoadState('networkidle');
      await page.getByLabel('Email', { exact: true }).fill(actor.email);
      const requested = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/request-password-reset');
      await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
      assert.equal((await requested).status(), 200);
      await page.getByRole('status').filter({ hasText: 'If an account matches this email' }).waitFor();
      await page.goto(await resetLink(h, existing));
      await page.waitForLoadState('networkidle');
      await page.getByLabel('New password', { exact: true }).waitFor();
      const resetPage = page.url();
      await page.getByLabel('New password', { exact: true }).fill(nextPassword);
      await page.getByLabel('Confirm new password', { exact: true }).fill('Different-password-42!');
      await page.getByRole('button', { name: 'Reset password', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'passwords do not match' }).waitFor();
      await page.getByLabel('Confirm new password', { exact: true }).fill(nextPassword);
      await page.getByRole('button', { name: 'Reset password', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Your password has been reset.' }).waitFor();
      assert.equal(new URL(page.url()).search, '', 'Successful reset removes token from URL');
      assert.equal((await oldContext.request.get('/api/companies')).status(), 401);
      await page.goto(resetPage);
      await page.waitForLoadState('networkidle');
      await page.getByLabel('New password', { exact: true }).fill('Attempted-replay-password-42!');
      await page.getByLabel('Confirm new password', { exact: true }).fill('Attempted-replay-password-42!');
      await page.getByRole('button', { name: 'Reset password', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'already been used' }).waitFor();
      await login(page, actor.email, password, destination);
      await page.getByRole('alert').filter({ hasText: 'Unable to sign in' }).waitFor();
      await login(page, actor.email, nextPassword, destination);
      await sheet(page).getByRole('button', { name: 'Edit name', exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('q'), company.name);
      assert.equal(new URL(page.url()).searchParams.get('record'), `company:${company.id}`);
      await page.reload();
      await sheet(page).getByRole('button', { name: 'Edit name', exact: true }).waitFor();
      await sheet(page).getByRole('button', { name: 'Close record sheet', exact: true }).click();
      await page.getByRole('button', { name: 'Account', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
      await page.waitForURL(url => url.pathname === '/sign-in');
      await login(page, actor.email, nextPassword, '//example.test/escape');
      await page.waitForURL(url => url.origin === origin && url.pathname === '/');
    } finally { await publicContext.close(); await oldContext.close(); await actor.context.close(); }
  });
}

async function memberLifecycle(h, { mode, owner }) {
  await scenario(mode, 'dynamic roles, last-system guard, revoke restore and signin changes protect warmed data', async () => {
    const actor = await h.signupAuthorized(`${mode} Lifecycle Member`);
    const other = await h.signupAuthorized(`${mode} Replacement Member`);
    const oldContext = await h.newContext();
    await oldContext.addCookies(await actor.context.cookies());
    const ownerPage = await owner.context.newPage();
    const page = await actor.context.newPage();
    try {
      await page.goto('/settings/members');
      await page.getByText('Your role does not allow access to this page. Contact a system account to request access.', { exact: true }).waitFor();
      assert.equal((await actor.context.request.get('/api/members')).status(), 403);
      await ownerPage.goto('/settings/members');
      await ownerPage.getByRole('combobox', { name: `Role for ${owner.user.name}`, exact: true }).selectOption('');
      await ownerPage.getByRole('alert').filter({ hasText: 'At least one active system account must remain' }).waitFor();
      await ownerPage.getByRole('combobox', { name: `Role for ${actor.user.name}`, exact: true }).selectOption('system');
      await eventually(async () => (await ownerPage.getByRole('combobox', { name: `Role for ${actor.user.name}`, exact: true }).inputValue()) === 'system', 'Role promotion is visible');
      assert.equal((await actor.context.request.get('/api/members')).status(), 200);
      await ownerPage.getByRole('combobox', { name: `Role for ${actor.user.name}`, exact: true }).selectOption(actor.roleId);
      await eventually(async () => (await ownerPage.getByRole('combobox', { name: `Role for ${actor.user.name}`, exact: true }).inputValue()) === actor.roleId, 'Custom role assignment is visible');
      assert.equal((await actor.context.request.get('/api/members')).status(), 403);
      const company = await h.api(actor.context, '/api/companies', { method: 'POST', body: { name: `${mode} Revocation warm company` } });
      await page.goto(`/companies?q=${encodeURIComponent(company.name)}&record=company%3A${company.id}`);
      await sheet(page).getByRole('button', { name: 'Edit name', exact: true }).click();
      const rejectedDraft = `${mode} Never commit after revocation`;
      await sheet(page).getByLabel('Name', { exact: true }).fill(rejectedDraft);
      await ownerPage.getByRole('button', { name: `Revoke access for ${actor.user.name}`, exact: true }).click();
      await ownerPage.getByRole('dialog').getByRole('button', { name: 'Revoke access', exact: true }).click();
      await ownerPage.getByText('Access revoked. This account has been signed out.', { exact: true }).waitFor();
      await sheet(page).getByLabel('Name', { exact: true }).press('Enter');
      await page.waitForURL(url => ['/access-revoked', '/sign-in'].includes(url.pathname));
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await page.getByRole('table').count(), 0);
      assert.equal((await oldContext.request.get('/api/companies')).status(), 401);
      assert.equal((await h.api(owner.context, `/api/companies/${company.id}`)).name, company.name);
      await login(page, actor.email);
      await page.waitForURL('**/access-revoked');
      await page.getByRole('heading', { name: 'Workspace access revoked', exact: true }).waitFor();
      await ownerPage.getByRole('button', { name: `Restore access for ${actor.user.name}`, exact: true }).click();
      await ownerPage.getByText('Access restored with no role. This account must sign in again and be assigned a role.', { exact: true }).waitFor();
      await ownerPage.getByRole('combobox', { name: `Role for ${actor.user.name}`, exact: true }).selectOption(actor.roleId);
      await eventually(async () => (await ownerPage.getByRole('combobox', { name: `Role for ${actor.user.name}`, exact: true }).inputValue()) === actor.roleId, 'Restored account explicitly receives its role');
      assert.equal((await oldContext.request.get('/api/companies')).status(), 401, 'Restoration never revives the old session');
      await login(page, actor.email);
      await page.waitForURL('**/companies');
      assert.equal((await actor.context.request.get('/api/members')).status(), 403);
      // Account-private saved views provide a meaningful privacy boundary in a shared CRM.
      await page.getByRole('textbox', { name: 'Search companies', exact: true }).fill(company.name);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: /^Saved views/ }).click();
      const privateName = `${mode} Private lifecycle view`;
      await page.getByRole('textbox', { name: 'View name', exact: true }).fill(privateName);
      await page.getByRole('button', { name: 'Save as new view', exact: true }).click();
      await eventually(() => !!new URL(page.url()).searchParams.get('view'), 'Private view saved');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Account', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
      await page.waitForURL(url => url.pathname === '/sign-in');
      await login(page, other.email);
      await page.waitForURL('**/companies');
      await page.getByRole('button', { name: /^Saved views/ }).click();
      await eventually(() => page.getByRole('combobox', { name: 'Apply saved view', exact: true }).isEnabled(), 'New identity views load');
      assert.ok(!(await page.getByRole('combobox', { name: 'Apply saved view', exact: true }).locator('option').allTextContents()).some(label => label.includes(privateName)));
      assert.equal(await page.getByRole('textbox', { name: 'View name', exact: true }).inputValue(), '');
      assert.equal(await page.getByText(rejectedDraft, { exact: true }).count(), 0);
    } finally { await ownerPage.close(); await oldContext.close(); await actor.context.close(); await other.context.close(); }
  });
}

async function createRecord(page, kind, fields, relations = {}) {
  await page.getByRole('button', { name: `New ${kind}`, exact: true }).first().click();
  const form = page.getByRole('dialog', { name: `New ${kind}`, exact: true });
  for (const [label, value] of Object.entries(fields)) await form.getByLabel(label, { exact: false }).fill(value);
  for (const [label, value] of Object.entries(relations)) {
    const picker = form.getByRole('combobox', { name: label, exact: true });
    await eventually(() => picker.isEnabled(), 'Real relation directory loads');
    await picker.selectOption(value);
  }
  const path = `/api/${kind === 'company' ? 'companies' : `${kind}s`}`;
  const pending = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === path);
  await form.getByRole('button', { name: `Add ${kind}`, exact: true }).click();
  const response = await pending;
  assert.equal(response.status(), 201);
  const record = await response.json();
  await form.waitFor({ state: 'hidden' });
  await page.getByRole('link', { name: kind === 'contact' ? record.firstName : record.name, exact: true }).waitFor();
  return record;
}
export async function crossScreenJourney(h, { mode, owner }) {
  await scenario(mode, 'system configures fields and carries linked record edits through activities and overview', async () => {
    const actor = await h.signupSystem(`${mode} Journey System`);
    const api = (path, options) => h.api(actor.context, path, options);
    const page = await actor.context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto('/companies');
      await page.getByRole('table').waitFor();
      const company = await createRecord(page, 'company', { Name: `${mode} Journey company`, Domain: `${mode}-journey.example.test` }, { Owner: actor.user.id });
      await page.getByRole('button', { name: 'New company', exact: true }).first().click();
      const duplicate = page.getByRole('dialog', { name: 'New company', exact: true });
      await duplicate.getByLabel('Name', { exact: false }).fill(`${mode} Duplicate draft`);
      await duplicate.getByLabel('Domain', { exact: false }).fill(company.domain);
      const conflict = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/companies');
      await duplicate.getByRole('button', { name: 'Add company', exact: true }).click();
      assert.equal((await conflict).status(), 409);
      assert.equal(await duplicate.getByLabel('Name', { exact: false }).inputValue(), `${mode} Duplicate draft`);
      await duplicate.getByRole('button', { name: 'Cancel', exact: true }).click();
      await duplicate.waitFor({ state: 'hidden' });
      await page.getByRole('link', { name: 'Contacts', exact: true }).click();
      await page.getByRole('table').waitFor();
      const contact = await createRecord(page, 'contact', { 'First name': `${mode} Journey contact` }, { Company: company.id, Owner: actor.user.id });
      await page.getByRole('link', { name: 'Deals', exact: true }).click();
      await page.getByRole('table').waitFor();
      const deal = await createRecord(page, 'deal', { Name: `${mode} Journey deal`, Amount: '123456789.01', Currency: 'EUR', 'Expected close date': '2027-03-01' }, { Company: company.id });
      assert.equal(deal.ownerId, actor.user.id);
      assert.equal(deal.amount, '123456789.01');
      assert.equal(deal.expectedCloseDate, '2027-03-01T00:00:00.000Z');
      await page.getByRole('link', { name: deal.name, exact: true }).click();
      await sheet(page).getByRole('button', { name: 'Attach existing contact', exact: true }).click();
      const attach = page.getByRole('dialog', { name: 'Attach contact', exact: true });
      await attach.getByLabel('Search participant', { exact: true }).fill(contact.firstName);
      const participant = attach.getByLabel('Participant', { exact: true });
      await eventually(() => participant.isEnabled(), 'Contact picker loads');
      await participant.selectOption(contact.id);
      await attach.getByLabel('Participant role', { exact: true }).fill('Decision maker');
      await attach.getByRole('button', { name: 'Attach contact', exact: true }).click();
      await attach.waitFor({ state: 'hidden' });
      assert.equal((await api(`/api/deals/${deal.id}`)).contacts.find(row => row.id === contact.id).role, 'Decision maker');
      for (const closeName of ['Close record sheet', 'Close all']) {
        await sheet(page).getByRole('link', { name: company.name, exact: true }).first().click();
        await page.getByRole('dialog', { name: 'Company record', exact: true }).waitFor();
        assert.equal(new URL(page.url()).searchParams.getAll('record').length, 2);
        await sheet(page).getByRole('button', { name: closeName, exact: true }).click();
        if (closeName === 'Close record sheet') {
          await page.getByRole('dialog', { name: 'Deal record', exact: true }).waitFor();
          assert.equal(new URL(page.url()).searchParams.get('record'), `deal:${deal.id}`);
        } else {
          await sheet(page).waitFor({ state: 'hidden' });
          assert.equal(new URL(page.url()).searchParams.has('record'), false);
          await page.getByRole('link', { name: deal.name, exact: true }).click();
        }
      }
      const manageFields = sheet(page).getByRole('link', { name: 'Manage fields', exact: true });
      const returnToRecords = new URL(await manageFields.getAttribute('href'), origin).searchParams.get('returnTo');
      await manageFields.click();
      await page.waitForURL(url => url.pathname === '/settings');
      await sheet(page).waitFor({ state: 'hidden' });
      const settings = page.getByRole('region', { name: 'Custom field settings', exact: true });
      await settings.waitFor();
      await page.waitForLoadState('networkidle');
      await settings.getByRole('button', { name: 'Deal', exact: true }).click();
      await settings.getByRole('button', { name: 'New field', exact: true }).click();
      const definition = page.getByRole('dialog', { name: 'New field', exact: true });
      await definition.getByLabel('Field label', { exact: true }).fill(`${mode} Journey score`);
      await definition.getByLabel('Field type', { exact: true }).selectOption('NUMBER');
      await definition.getByLabel('Show on table', { exact: true }).check();
      const fieldResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/fields');
      await definition.getByRole('button', { name: 'Save field', exact: true }).click();
      const response = await fieldResponse;
      assert.equal(response.status(), 201);
      const field = await response.json();
      await definition.waitFor({ state: 'hidden' });
      await page.getByRole('link', { name: 'Return to records', exact: true }).click();
      const row = sheet(page).locator(`[data-custom-field="${field.key}"]`);
      await row.getByRole('button', { name: `Edit ${field.label.toLowerCase()}`, exact: true }).click();
      assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, returnToRecords);
      assert.equal(new URL(page.url()).searchParams.get('record'), `deal:${deal.id}`);
      await row.getByLabel(field.label, { exact: true }).fill('9007199254740993.000000001');
      await row.getByRole('button', { name: `Save ${field.label.toLowerCase()}`, exact: true }).click();
      await row.getByRole('button', { name: `Edit ${field.label.toLowerCase()}`, exact: true }).waitFor();
      const composer = sheet(page).getByRole('form', { name: 'Log activity', exact: true });
      await composer.getByLabel('Subject', { exact: true }).fill(`${mode} Journey note`);
      const activityResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/activities');
      await composer.getByRole('button', { name: 'Add activity', exact: true }).click();
      const activity = await (await activityResponse).json();
      assert.equal(activity.companyId, company.id);
      assert.equal(activity.dealId, deal.id);
      assert.equal(activity.createdById, actor.user.id);
      await eventually(async () => await composer.getByLabel('Subject', { exact: true }).inputValue() === '', 'Successful activity clears draft');
      await sheet(page).getByRole('button', { name: 'Close record sheet', exact: true }).click();
      await page.getByRole('row').filter({ has: page.getByRole('link', { name: deal.name, exact: true }) }).getByRole('cell', { name: '9007199254740993.000000001', exact: true }).waitFor();
      await page.getByRole('link', { name: 'Overview', exact: true }).click();
      await page.getByLabel('Currency', { exact: true }).fill('EUR');
      await page.getByRole('button', { name: 'Apply currency', exact: true }).click();
      const { statsMatch } = await import('./overview.test.mjs');
      await statsMatch(page, api, 'EUR');
      const card = page.locator(`[data-activity-id="${activity.id}"]`);
      await card.getByRole('button', { name: deal.name, exact: true }).click();
      await sheet(page).getByRole('button', { name: 'Edit name', exact: true }).click();
      const renamed = `${deal.name} renamed`;
      await sheet(page).getByLabel('Name', { exact: true }).fill(renamed);
      await sheet(page).getByLabel('Name', { exact: true }).press('Enter');
      await sheet(page).getByRole('button', { name: 'Edit name', exact: true }).waitFor();
      await sheet(page).getByRole('button', { name: 'Close record sheet', exact: true }).click();
      await card.getByRole('button', { name: renamed, exact: true }).waitFor();
      await page.getByRole('link', { name: 'Deals', exact: true }).click();
      await page.getByRole('link', { name: renamed, exact: true }).waitFor();
      assert.deepEqual(errors, []);
    } catch (error) {
      const state = await page.evaluate(() => {
        const button = [...document.querySelectorAll('[aria-label="Field entity"] button')].find(node => node.textContent === 'Deal');
        const bounds = button?.getBoundingClientRect();
        return {
          path: location.pathname, queryKeys: [...new URLSearchParams(location.search).keys()],
          recordDepth: new URLSearchParams(location.search).getAll('record').length,
          bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
          dialogs: [...document.querySelectorAll('[role="dialog"]')].map(node => ({ label: node.getAttribute('aria-label'), state: node.getAttribute('data-state'), sheet: node.hasAttribute('data-record-sheet') })),
          dealButton: button ? { disabled: button.disabled, visibility: getComputedStyle(button).visibility, pointerEvents: getComputedStyle(button).pointerEvents } : null,
          covering: bounds ? document.elementsFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2).map(node => ({ tag: node.tagName, role: node.getAttribute('role'), class: node.getAttribute('class') })) : [],
        };
      }).catch(() => ({ documentUnavailable: true }));
      console.error(`[browser] Journey failure UI state: ${JSON.stringify(state)}`);
      throw error;
    } finally {
      const identity = await h.api(actor.context, '/api/account');
      await h.api(owner.context, `/api/members/${actor.user.id}`, { method: 'PATCH', body: { action: 'change-role', roleId: null, expectedRevision: identity.membershipRevision } });
      await actor.context.close();
    }
  });
}

async function shellInteraction(h, { mode, owner }) {
  await scenario(mode, 'chrome geometry, reduced motion and mobile navigation preserve layout', async () => {
    const page = await owner.context.newPage();
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/companies');
      await page.getByRole('table').waitFor();
      const header = page.getByRole('banner');
      const rail = page.getByRole('navigation', { name: 'Primary', exact: true });
      const main = page.locator('#main-content');
      const railBox = await rail.boundingBox();
      assert.equal(Math.round((await header.boundingBox()).height), 48, 'The header keeps its 48px band');
      assert.equal(Math.round(railBox.width), 56, 'The rail keeps its 56px band');
      assert.ok(Math.abs((await main.boundingBox()).x - (railBox.x + railBox.width)) <= 1, 'Content starts at the rail edge');
      assert.equal(await rail.evaluate(node => getComputedStyle(node).transitionDuration), '0s', 'Reduced motion leaves the rail without transitions');
      await rail.getByRole('link', { name: 'Contacts', exact: true }).click();
      await page.waitForURL('**/contacts');
      await page.getByRole('table').waitFor();
      assert.equal(await rail.getByRole('link', { name: 'Contacts', exact: true }).getAttribute('aria-current'), 'page');
      for (const theme of ['light', 'dark']) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
        assert.equal(await rail.isVisible(), false, 'The rail hides below the md breakpoint');
        const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
        await opener.click();
        const navigation = page.getByRole('dialog', { name: 'Navigation', exact: true });
        await navigation.waitFor();
        await page.keyboard.press('Escape');
        await navigation.waitFor({ state: 'hidden' });
        await eventually(() => opener.evaluate(node => node === document.activeElement), 'Closing mobile navigation restores focus to its opener');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
    } finally { await page.close(); }
  });
}

async function serverFailure(h, { mode, owner }) {
  await scenario(mode, 'real server 500 keeps the create draft private and explicit retry creates exactly once', async () => {
    const page = await owner.context.newPage();
    const name = `${mode} Server failure draft`;
    const { rejectCompanyInsert } = await import('./integration-d1-failure.mjs');
    const restore = await rejectCompanyInsert(h, mode, name);
    try {
      await page.goto('/companies');
      await page.getByRole('table').waitFor();
      await page.getByRole('button', { name: 'New company', exact: true }).first().click();
      const form = page.getByRole('dialog', { name: 'New company', exact: true });
      await form.getByLabel('Name', { exact: false }).fill(name);
      const matches = response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/companies';
      const failed = page.waitForResponse(matches);
      await form.getByRole('button', { name: 'Add company', exact: true }).click();
      const response = await failed;
      assert.equal(response.status(), 500);
      assert.deepEqual(await response.json(), { message: 'Internal server error' });
      assert.match(response.headers()['cache-control'], /no-store/);
      await form.getByRole('alert').filter({ hasText: 'Internal server error' }).waitFor();
      assert.equal(await form.getByLabel('Name', { exact: false }).inputValue(), name);
      assert.doesNotMatch(await page.locator('body').innerText(), /private browser database detail|SQLITE|D1_ERROR|CREATE TRIGGER/);
      assert.equal((await h.api(owner.context, `/api/companies?search=${encodeURIComponent(name)}`)).length, 0);
      await restore();
      const retried = page.waitForResponse(matches);
      await form.getByRole('button', { name: 'Add company', exact: true }).click();
      assert.equal((await retried).status(), 201);
      await form.waitFor({ state: 'hidden' });
      await page.getByRole('link', { name, exact: true }).waitFor();
      assert.equal((await h.api(owner.context, `/api/companies?search=${encodeURIComponent(name)}`)).length, 1);
    } finally { await restore(); await page.close(); }
  });
}

export async function runSuite(h, context) {
  await shellInteraction(h, context);
  await serverFailure(h, context);
  await crossScreenJourney(h, context);
  await authAndDocs(h, context);
  await memberLifecycle(h, context);
  for (const name of ['overview', 'lists', 'record-sheets', 'record-sheet-relations', 'activities', 'fields']) {
    await (await import(`./${name}.test.mjs`)).runSuite(h, context);
    if (process.exitCode) throw new Error(`Composed integration suite failed: ${name}`);
  }
}
