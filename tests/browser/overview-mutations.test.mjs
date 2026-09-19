import assert from 'node:assert/strict';
import { test as nodeTest } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { shownCount, shownDecimal } from './browser-harness.mjs';

async function eventually(check, message) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await check()) return; await delay(50); }
  assert.fail(message);
}
const sheet = page => page.getByRole('dialog', { name: /^(Company|Contact|Deal) record$/ });
const feed = page => page.locator('div[aria-label="Recent activity"]');
const card = (page, id) => feed(page).locator(`[data-activity-id="${id}"]`);
async function close(page) {
  await sheet(page).getByRole('button', { name: 'Close record sheet', exact: true }).click();
  await sheet(page).waitFor({ state: 'hidden' });
}
async function edit(page, label, value) {
  await sheet(page).getByRole('button', { name: `Edit ${label.toLowerCase()}`, exact: true }).click();
  await sheet(page).getByLabel(label, { exact: true }).fill(value);
  await sheet(page).getByLabel(label, { exact: true }).press('Enter');
  await sheet(page).getByRole('button', { name: `Edit ${label.toLowerCase()}`, exact: true }).waitFor();
}
async function statsMatch(page, api, currency) {
  const stats = await api(`/api/stats?currency=${currency}`);
  for (const field of ['totalCompanies', 'totalContacts', 'openDeals', 'openDealValue']) {
    const expected = field === 'openDealValue' ? `${currency} ${shownDecimal(stats[field])}` : shownCount(stats[field]);
    await eventually(async () => await page.locator(`[data-stat="${field}"] dd`).first().textContent() === expected, `${field} refreshes to ${expected}`);
  }
  for (const bucket of stats.pipeline) {
    const cells = page.locator(`tr[data-stage="${bucket.stage}"] td`);
    await eventually(async () => (await cells.allTextContents()).join('|') === `${shownCount(bucket.count)}|${shownDecimal(bucket.value)}`, `${bucket.stage} refreshes`);
  }
}

export async function runOverviewMutations(h, { mode, actor }) {
  const api = (path, options) => h.api(actor.context, path, options);
  const company = await api('/api/companies', { method: 'POST', body: { name: `${mode} overview mutation company` } });
  const contact = await api('/api/contacts', { method: 'POST', body: { firstName: `${mode} overview mutation contact`, companyId: company.id } });
  const deal = await api('/api/deals', { method: 'POST', body: { name: `${mode} overview mutation deal`, companyId: company.id, ownerId: actor.user.id, amount: '12.34', currency: 'USD' } });
  const note = await api('/api/activities', { method: 'POST', body: { type: 'NOTE', subject: `${mode} overview mutation note`, companyId: company.id, contactId: contact.id, dealId: deal.id } });
  const task = await api('/api/activities', { method: 'POST', body: { type: 'TASK', subject: `${mode} overview mutation task`, companyId: company.id } });
  const page = await actor.context.newPage();
  const run = (name, fn) => nodeTest(`${mode}: overview ${name}`, async () => {
    try { await fn(); } catch (error) { process.exitCode = 1; console.error(`[scenario] overview ${name}: ${error.message}`); throw error; }
  });
  const open = async name => {
    await card(page, note.id).getByRole('button', { name, exact: true }).click();
    await sheet(page).waitFor();
    await sheet(page).getByRole('button', { name: /Edit (name|first name)/ }).first().waitFor();
  };
  try {
    await page.goto('/?currency=USD');
    await card(page, note.id).waitFor();
    await run('record names and archive state refresh projected links and counts', async () => {
      await statsMatch(page, api, 'USD');
      await open(company.name);
      company.name += ' renamed';
      await edit(page, 'Name', company.name);
      await close(page);
      await card(page, note.id).getByRole('button', { name: company.name, exact: true }).waitFor();
      await open(contact.firstName);
      contact.firstName += ' renamed';
      await edit(page, 'First name', contact.firstName);
      await close(page);
      await card(page, note.id).getByRole('button', { name: contact.firstName, exact: true }).waitFor();
      await open(company.name);
      await sheet(page).getByRole('button', { name: 'Archive record', exact: true }).click();
      await page.getByRole('dialog', { name: 'Archive company?', exact: true }).getByRole('button', { name: 'Archive', exact: true }).click();
      await sheet(page).getByRole('button', { name: 'Restore record', exact: true }).waitFor();
      await close(page);
      await card(page, note.id).getByRole('button', { name: `${company.name} (archived)`, exact: true }).waitFor();
      await statsMatch(page, api, 'USD');
      await open(`${company.name} (archived)`);
      await sheet(page).getByRole('button', { name: 'Restore record', exact: true }).click();
      await sheet(page).getByRole('button', { name: 'Archive record', exact: true }).waitFor();
      await close(page);
      await card(page, note.id).getByRole('button', { name: company.name, exact: true }).waitFor();
      await statsMatch(page, api, 'USD');
    });
    await run('deal amount currency stage and archive refresh exact aggregates', async () => {
      await open(deal.name);
      deal.name += ' renamed';
      await edit(page, 'Name', deal.name);
      await edit(page, 'Amount', '98.76');
      await close(page);
      await statsMatch(page, api, 'USD');
      await open(deal.name);
      await edit(page, 'Currency', 'EUR');
      await close(page);
      await statsMatch(page, api, 'USD');
      await page.getByLabel('Currency', { exact: true }).fill('EUR');
      await page.getByRole('button', { name: 'Apply currency', exact: true }).click();
      await statsMatch(page, api, 'EUR');
      await open(deal.name);
      await sheet(page).getByRole('button', { name: 'Change stage', exact: true }).click();
      const stage = page.getByRole('dialog', { name: 'Change stage', exact: true });
      await stage.getByLabel('Stage', { exact: true }).selectOption('CLOSED_WON');
      await stage.getByRole('button', { name: 'Update stage', exact: true }).click();
      await stage.waitFor({ state: 'hidden' });
      await close(page);
      await statsMatch(page, api, 'EUR');
      await open(deal.name);
      await sheet(page).getByRole('button', { name: 'Archive record', exact: true }).click();
      await page.getByRole('dialog', { name: 'Archive deal?', exact: true }).getByRole('button', { name: 'Archive', exact: true }).click();
      await sheet(page).getByRole('button', { name: 'Restore record', exact: true }).waitFor();
      await close(page);
      await statsMatch(page, api, 'EUR');
      await open(`${deal.name} (archived)`);
      await sheet(page).getByRole('button', { name: 'Restore record', exact: true }).click();
      await sheet(page).getByRole('button', { name: 'Archive record', exact: true }).waitFor();
      await close(page);
      await statsMatch(page, api, 'EUR');
    });
    await run('activity creation deletion and task completion refresh recent activity', async () => {
      await open(company.name);
      const composer = sheet(page).getByRole('form', { name: 'Log activity', exact: true });
      await composer.getByLabel('Subject', { exact: true }).fill(`${mode} overview browser note`);
      const response = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/activities');
      await composer.getByRole('button', { name: 'Add activity', exact: true }).click();
      const saved = await response;
      assert.equal(saved.status(), 201);
      const created = await saved.json();
      await eventually(async () => await composer.getByLabel('Subject', { exact: true }).inputValue() === '', 'Composer clears after save');
      await close(page);
      await card(page, created.id).waitFor();
      await card(page, task.id).getByRole('button', { name: 'Complete task', exact: true }).click();
      await card(page, task.id).getByRole('button', { name: 'Reopen task', exact: true }).waitFor();
      assert.ok((await api(`/api/activities/${task.id}`)).completedAt);
      await card(page, task.id).getByRole('button', { name: 'Reopen task', exact: true }).click();
      await card(page, task.id).getByRole('button', { name: 'Complete task', exact: true }).waitFor();
      assert.equal((await api(`/api/activities/${task.id}`)).completedAt, null);
      await card(page, created.id).getByRole('button', { name: 'Delete activity', exact: true }).click();
      await page.getByRole('dialog', { name: 'Delete activity', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
      await card(page, created.id).waitFor({ state: 'hidden' });
      await statsMatch(page, api, 'EUR');
    });
    await run('dirty sheet Stay Discard and Save defer currency URL and query together', async () => {
      for (const [decision, currency] of [['Discard', 'USD'], ['Save changes', 'EUR']]) {
        const before = new URL(page.url()).searchParams.get('currency');
        await open(company.name);
        // Exercise the deferred form handler beneath the sheet's modal layer.
        await page.locator('#overview-currency').evaluate((input, value) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }, currency);
        assert.equal(await page.locator('#overview-currency').inputValue(), currency);
        // Multiline drafts do not autosave on blur when the guard receives focus.
        await sheet(page).getByRole('button', { name: 'Edit description', exact: true }).click();
        const draft = `${mode} guarded ${decision}`;
        await sheet(page).getByLabel('Description', { exact: true }).fill(draft);
        const submit = () => page.locator('#overview-currency').evaluate(input => input.closest('form').requestSubmit());
        await submit();
        const guard = page.getByRole('dialog', { name: 'Unsaved changes', exact: true });
        await guard.waitFor();
        await guard.getByRole('button', { name: 'Stay', exact: true }).click();
        assert.equal(new URL(page.url()).searchParams.get('currency'), before);
        assert.equal(await page.locator('#overview-currency').inputValue(), currency, 'Stay retains the pending currency input');
        assert.equal(await sheet(page).getByLabel('Description', { exact: true }).inputValue(), draft);
        await submit();
        await guard.getByRole('button', { name: decision, exact: true }).click();
        await guard.waitFor({ state: 'hidden' });
        await eventually(async () => new URL(page.url()).searchParams.get('currency') === currency, `${decision} commits currency ${currency} after guard`);
        assert.ok(new URL(page.url()).searchParams.get('record')?.includes(company.id), 'Currency retains the record sheet');
        await close(page);
        await statsMatch(page, api, currency);
        const stored = await api(`/api/companies/${company.id}`);
        if (decision === 'Save changes') assert.equal(stored.description, draft);
        else assert.notEqual(stored.description, draft);
      }
    });
  } finally { await page.close(); }
}
