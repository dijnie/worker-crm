import assert from 'node:assert/strict';
import { test as nodeTest } from 'node:test';
async function test(name, run) { return nodeTest(name, async () => { try { await run(); } catch (error) { console.error(`[scenario] ${name}: ${error.message}`); throw error; } }); }
import { setTimeout as delay } from 'node:timers/promises';

async function eventually(check, message) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await check()) return; await delay(50); }
  assert.fail(message);
}
const sheet = page => page.getByRole('dialog', { name: /^(Company|Contact|Deal) record$/ });
async function show(page, kind, id, extra = '') {
  await page.goto(`/companies?q=sheets&${extra}record=${encodeURIComponent(`${kind}:${id}`)}`);
  await sheet(page).waitFor();
  await sheet(page).getByRole('button', { name: 'Edit name', exact: true }).or(sheet(page).getByRole('button', { name: 'Edit first name', exact: true })).waitFor();
}
async function edit(page, label, value) {
  const dialog = sheet(page);
  await dialog.getByRole('button', { name: `Edit ${label.toLowerCase()}`, exact: true }).click();
  const input = dialog.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.press('Enter');
  await dialog.getByRole('button', { name: `Edit ${label.toLowerCase()}`, exact: true }).waitFor();
}

export async function runSuite(h, { mode, owner }) {
  const member = await h.signup(`${mode} Sheet Member`);
  const api = (path, options) => h.api(member.context, path, options);
  const company = await api('/api/companies', { method: 'POST', body: { name: `${mode} sheets company`, domain: `${mode}-sheets.example.test`, ownerId: member.user.id } });
  const employer = await api('/api/companies', { method: 'POST', body: { name: `${mode} sheets employer`, domain: `${mode}-employer.example.test` } });
  const contact = await api('/api/contacts', { method: 'POST', body: { firstName: `${mode} sheets person`, companyId: employer.id } });
  await api(`/api/companies/${company.id}`, { method: 'PATCH', body: { primaryContactId: contact.id } });
  const deal = await api('/api/deals', { method: 'POST', body: { name: `${mode} sheets deal`, companyId: company.id, ownerId: member.user.id, amount: '12.34', currency: 'USD' } });
  await api(`/api/deals/${deal.id}/contacts`, { method: 'POST', body: { contactId: contact.id, role: 'Advisor' } });
  for (let i = 0; i < 32; i++) await api('/api/activities', { method: 'POST', body: { type: 'NOTE', subject: `Historical note ${i}`, body: 'Stored timeline body', companyId: company.id, occurredAt: i % 2 ? '2025-01-01T12:00:00Z' : '2025-02-01T12:00:00Z' } });
  await api('/api/activities', { method: 'POST', body: { type: 'TASK', subject: 'Outstanding undated task', companyId: company.id } });
  await api('/api/activities', { method: 'POST', body: { type: 'TASK', subject: 'Overdue task', dueAt: '2020-01-01T00:00:00Z', companyId: company.id } });
  const page = await member.context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await test(`${mode}: direct sheet, reload, primary/employer independence and nested back`, async () => {
      await show(page, 'company', company.id, 'currency=USD&record-tab=old&');
      await sheet(page).getByRole('heading', { name: company.name, exact: true }).waitFor();
      await page.reload();
      await sheet(page).getByRole('heading', { name: company.name, exact: true }).waitFor();
      await sheet(page).getByRole('link', { name: new RegExp(contact.firstName) }).first().click();
      await page.getByRole('dialog', { name: 'Contact record', exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.getAll('record').length, 2);
      assert.equal(new URL(page.url()).searchParams.get('q'), 'sheets');
      assert.equal(new URL(page.url()).searchParams.get('currency'), 'USD');
      assert.equal(new URL(page.url()).searchParams.has('record-tab'), false);
      await sheet(page).getByRole('button', { name: 'Back to previous record' }).click();
      await page.getByRole('dialog', { name: 'Company record', exact: true }).waitFor();
      assert.equal((await api(`/api/contacts/${contact.id}`)).companyId, employer.id);
    });
    await test(`${mode}: inline Enter saves once and Escape cancels only the field`, async () => {
      const writes = [];
      const watch = request => { if (new URL(request.url()).pathname === `/api/companies/${company.id}` && request.method() === 'PATCH') writes.push(request); };
      page.on('request', watch);
      await edit(page, 'Name', `${mode} sheets renamed`);
      await sheet(page).getByRole('button', { name: 'Edit city', exact: true }).click();
      await sheet(page).getByLabel('City', { exact: true }).fill('Draft city');
      await sheet(page).getByLabel('City', { exact: true }).press('Escape');
      await sheet(page).getByRole('button', { name: 'Edit city', exact: true }).waitFor();
      assert.equal(await sheet(page).count(), 1);
      await delay(250);
      assert.equal(writes.length, 1, `Enter and subsequent blur issue exactly one mutation: ${writes.map(request => request.postData()).join('; ')}`);
      assert.equal((await api(`/api/companies/${company.id}`)).city, null);
      page.off('request', watch);
    });
    await test(`${mode}: rejected draft, save failure, stay and discard preserve the confirmed value`, async () => {
      await sheet(page).getByRole('button', { name: 'Edit domain', exact: true }).click();
      await sheet(page).getByLabel('Domain', { exact: true }).fill(employer.domain);
      await sheet(page).getByLabel('Domain', { exact: true }).press('Enter');
      await sheet(page).getByRole('alert').waitFor();
      assert.equal(await sheet(page).getByLabel('Domain', { exact: true }).inputValue(), employer.domain);
      await sheet(page).getByRole('button', { name: 'Close record sheet' }).click();
      const guard = page.getByRole('dialog', { name: 'Unsaved changes', exact: true });
      await guard.waitFor();
      await guard.getByRole('button', { name: 'Save changes', exact: true }).click();
      await guard.getByRole('alert').waitFor();
      await guard.getByRole('button', { name: 'Stay', exact: true }).click();
      assert.equal(await sheet(page).getByLabel('Domain', { exact: true }).inputValue(), employer.domain);
      await sheet(page).getByRole('button', { name: 'Close record sheet' }).click();
      await guard.getByRole('button', { name: 'Discard', exact: true }).click();
      await sheet(page).waitFor({ state: 'hidden' });
      assert.equal((await api(`/api/companies/${company.id}`)).domain, company.domain);
    });
    await test(`${mode}: list opener restores focus and browser history guards dirty drafts`, async () => {
      await page.goto('/companies?q=sheets');
      const row = page.getByRole('link', { name: `${mode} sheets renamed`, exact: true });
      await row.waitFor(); await row.focus(); await row.press('Enter');
      await sheet(page).waitFor();
      await sheet(page).getByRole('button', { name: 'Edit description', exact: true }).click();
      await sheet(page).getByLabel('Description', { exact: true }).fill('Preserved through browser Back');
      await page.evaluate(() => history.back());
      const guard = page.getByRole('dialog', { name: 'Unsaved changes', exact: true });
      await guard.waitFor();
      await guard.getByRole('button', { name: 'Stay', exact: true }).click();
      assert.equal(await sheet(page).getByLabel('Description', { exact: true }).inputValue(), 'Preserved through browser Back');
      await page.evaluate(() => history.back());
      await guard.waitFor();
      await guard.getByRole('button', { name: 'Save changes', exact: true }).click();
      await sheet(page).waitFor({ state: 'hidden' });
      assert.equal((await api(`/api/companies/${company.id}`)).description, 'Preserved through browser Back');
      await eventually(() => page.evaluate(() => document.activeElement?.id === 'main-content' || document.activeElement?.getAttribute('href')?.includes('record=')), 'Focus returns to list opener or safe main fallback');
      await page.goForward(); await sheet(page).waitFor();
      await sheet(page).getByRole('button', { name: 'Close record sheet' }).click();
      await sheet(page).waitFor({ state: 'hidden' });
    });
    await test(`${mode}: exact deal money/date edits and cross-company participation`, async () => {
      await show(page, 'deal', deal.id);
      await edit(page, 'Amount', '90071992547409.91');
      await edit(page, 'Expected close date', '2027-02-28');
      const saved = await api(`/api/deals/${deal.id}`);
      assert.equal(saved.amount, '90071992547409.91');
      assert.equal(saved.expectedCloseDate, '2027-02-28T00:00:00.000Z');
      assert.equal(saved.contacts[0].id, contact.id);
      assert.equal(saved.contacts[0].role, 'Advisor');
      await sheet(page).getByRole('link', { name: new RegExp(contact.firstName) }).first().waitFor();
    });
    await test(`${mode}: timeline full counts, older pages, seven tabs and pinned tasks`, async () => {
      await show(page, 'company', company.id);
      const timeline = page.getByRole('region', { name: 'Record timeline', exact: true });
      await timeline.getByText('Outstanding undated task', { exact: true }).waitFor();
      assert.equal(await timeline.getByText('Outstanding undated task', { exact: true }).count(), 1);
      await timeline.getByRole('tab', { name: 'Notes 32', exact: true }).click();
      await eventually(async () => (await timeline.getByText(/^Historical note \d+$/).count()) === 25, 'First timeline page has 25 records');
      await timeline.getByRole('button', { name: /older|more/i }).click();
      await eventually(async () => (await timeline.getByText(/^Historical note \d+$/).count()) === 32, 'Older page completes all 32 notes');
      assert.equal(await timeline.getByRole('tab').count(), 7);
      await timeline.getByRole('tab', { name: /^Upcoming/ }).click();
      await timeline.getByText('Overdue task', { exact: true }).waitFor();
      await timeline.getByText('Outstanding undated task', { exact: true }).waitFor();
    });
    await test(`${mode}: timeline read failures remain recoverable and full counts refresh`, async () => {
      const timeline = page.getByRole('region', { name: 'Record timeline', exact: true });
      await page.route('**/api/activities/counts?**', route => route.abort('failed'));
      await timeline.getByRole('button', { name: 'Refresh timeline', exact: true }).click();
      await timeline.getByRole('alert').filter({ hasText: 'Activity counts could not load.' }).waitFor();
      await page.unroute('**/api/activities/counts?**');
      await timeline.getByRole('alert').filter({ hasText: 'Activity counts could not load.' }).getByRole('button', { name: 'Retry', exact: true }).click();
      await timeline.getByRole('tab', { name: 'All 34', exact: true }).waitFor();
      await timeline.getByRole('tab', { name: 'Notes 32', exact: true }).click();
      const paths = [];
      const watch = request => { const url = new URL(request.url()); if (url.pathname === '/api/activities' && url.searchParams.get('view') === 'email') paths.push(url.searchParams.get('page')); };
      page.on('request', watch);
      await timeline.getByRole('tab', { name: /^Email/ }).click();
      await timeline.getByText('No activities in this view.', { exact: true }).waitFor();
      assert.deepEqual(paths, ['1'], 'Changing view resets loaded pages');
      page.off('request', watch);
    });
    await test(`${mode}: archive and restore retain a viewable record`, async () => {
      await sheet(page).getByRole('button', { name: 'Archive record', exact: true }).click();
      const confirm = page.getByRole('dialog', { name: /Archive company/ });
      await confirm.getByRole('button', { name: /Archive/, exact: false }).click();
      await sheet(page).getByRole('button', { name: 'Restore record', exact: true }).waitFor();
      assert.ok((await api(`/api/companies/${company.id}`)).archivedAt);
      const duplicate = await api('/api/companies', { method: 'POST', body: { name: `${mode} duplicate identity`, domain: company.domain } });
      await sheet(page).getByRole('button', { name: 'Restore record', exact: true }).click();
      await sheet(page).getByRole('alert').waitFor();
      assert.ok((await api(`/api/companies/${company.id}`)).archivedAt, 'A restore conflict keeps the record archived');
      await api(`/api/companies/${duplicate.id}`, { method: 'DELETE' });
      await sheet(page).getByRole('button', { name: 'Restore record', exact: true }).click();
      await sheet(page).getByRole('button', { name: 'Archive record', exact: true }).waitFor();
      assert.equal((await api(`/api/companies/${company.id}`)).archivedAt, null);
    });
    await test(`${mode}: malformed and missing links have recoverable sheet states`, async () => {
      await page.goto('/companies?record=company:%ZZ');
      await page.getByRole('dialog', { name: 'Invalid record link', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Close invalid link', exact: true }).click();
      assert.equal(new URL(page.url()).searchParams.has('record'), false);
      await page.goto('/companies?record=company:missing-record');
      await sheet(page).getByRole('alert').waitFor();
      await sheet(page).getByRole('button', { name: /Retry/ }).first().waitFor();
      await sheet(page).getByRole('button', { name: 'Close record sheet' }).click();
    });
    await test(`${mode}: mobile tabs, focus trap and no viewport overflow`, async () => {
      await page.setViewportSize({ width: 375, height: 812 });
      await show(page, 'company', company.id);
      await page.getByRole('tab', { name: 'Timeline', exact: true }).click();
      await page.getByRole('region', { name: 'Record timeline', exact: true }).getByRole('tab', { name: /^All/ }).waitFor();
      await page.getByRole('tab', { name: 'Properties & relations', exact: true }).click();
      for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
      assert.equal(await sheet(page).evaluate(element => element.contains(document.activeElement)), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.keyboard.press('Escape');
      await sheet(page).waitFor({ state: 'hidden' });
      await page.setViewportSize({ width: 1280, height: 900 });
    });
    await test(`${mode}: pending edits cannot be discarded while their write is in flight`, async () => {
      await show(page, 'company', company.id);
      let release, captured = false;
      const gate = new Promise(resolve => { release = resolve; });
      const pattern = `**/api/companies/${company.id}`;
      await page.route(pattern, async route => {
        if (route.request().method() !== 'PATCH') return route.continue();
        const response = await route.fetch(); captured = true; await gate; await route.fulfill({ response });
      });
      try {
        await sheet(page).getByRole('button', { name: 'Edit description', exact: true }).click();
        await sheet(page).getByLabel('Description', { exact: true }).fill('Confirmed after a slow write');
        await sheet(page).getByRole('button', { name: 'Save description', exact: true }).click();
        await eventually(() => captured, 'Mutation response is deliberately held');
        await sheet(page).getByRole('button', { name: 'Close record sheet' }).click();
        const guard = page.getByRole('dialog', { name: 'Unsaved changes', exact: true });
        await guard.waitFor();
        assert.equal(await guard.getByRole('button', { name: 'Discard', exact: true }).isDisabled(), true);
        release();
        await eventually(() => guard.getByRole('button', { name: 'Stay', exact: true }).isEnabled(), 'Navigation resumes after the mutation settles');
        await guard.getByRole('button', { name: 'Stay', exact: true }).click();
        assert.equal((await api(`/api/companies/${company.id}`)).description, 'Confirmed after a slow write');
      } finally { release(); await page.unroute(pattern); }
    });
    await test(`${mode}: stack depth failures stay recoverable without discarding table context`, async () => {
      const params = new URLSearchParams({ q: 'sheets' });
      for (let i = 0; i < 9; i++) params.append('record', `company:previous-${i}`);
      params.append('record', `company:${company.id}`);
      await page.goto(`/companies?${params}`);
      await sheet(page).getByRole('link', { name: contact.firstName, exact: true }).click();
      await sheet(page).getByRole('alert').filter({ hasText: 'at most ten records' }).waitFor();
      assert.equal(new URL(page.url()).searchParams.getAll('record').length, 10);
      await sheet(page).getByRole('button', { name: 'Close invalid link', exact: true }).click();
      assert.equal(new URL(page.url()).searchParams.get('q'), 'sheets');
      assert.equal(new URL(page.url()).searchParams.has('record'), false);
    });
    await test(`${mode}: session loss clears protected draft and sheet without retain prompt`, async () => {
      await show(page, 'company', company.id);
      await sheet(page).getByRole('button', { name: 'Edit description', exact: true }).click();
      await sheet(page).getByLabel('Description', { exact: true }).fill('Private unsaved description');
      const members = await h.api(owner.context, '/api/members');
      const membership = members.find(row => row.id === member.user.id);
      await h.api(owner.context, `/api/members/${member.user.id}`, { method: 'PATCH', body: { action: 'revoke', expectedRevision: membership.revision } });
      await sheet(page).getByLabel('Description', { exact: true }).press('Tab');
      await sheet(page).locator('[data-property$=":description"]').getByRole('button', { name: 'Save description', exact: true }).click();
      await page.waitForURL(url => ['/access-revoked', '/sign-in'].includes(url.pathname));
      assert.equal(await page.getByRole('dialog', { name: 'Unsaved changes' }).count(), 0);
      assert.equal(await page.getByText('Private unsaved description', { exact: true }).count(), 0);
    });
    assert.deepEqual(errors, [], 'No browser runtime errors');
  } finally { await page.close(); }
}
