import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

async function scenario(name, run) { await test(name, { timeout: 90_000 }, run); }

async function eventually(check, message) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) { if (await check()) return; await delay(100); }
  assert.fail(message);
}
async function search(page, entity, value) {
  await page.getByRole('textbox', { name: `Search ${entity}`, exact: true }).fill(value);
  await eventually(() => Promise.resolve(new URL(page.url()).searchParams.get('q') === value || new URL(page.url()).searchParams.get('search') === value), 'Search is written to the browser URL');
  await settled(page);
}
async function settled(page) {
  await page.getByRole('table').waitFor();
  await eventually(async () => !(await page.getByText(/^(Loading|Refreshing)( records)?…$/).count()), 'List settles');
}
async function selectOption(control, value) {
  await eventually(() => control.isEnabled(), 'Picker must finish loading');
  await control.selectOption(value);
}
async function createFromForm(h, page, entity, fields, relations = {}) {
  await settled(page);
  await page.getByRole('button', { name: `New ${entity}`, exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: `New ${entity}`, exact: true });
  for (const [label, value] of Object.entries(fields)) await dialog.getByLabel(label, { exact: false }).fill(value);
  for (const [label, value] of Object.entries(relations)) await selectOption(dialog.getByRole('combobox', { name: label, exact: true }), value);
  const path = `/api/${entity === 'company' ? 'companies' : entity === 'contact' ? 'contacts' : 'deals'}`;
  const submitted = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: `Add ${entity}`, exact: true }).click();
  const response = await submitted;
  assert.equal(response.status(), 201, `Create ${entity} returns success`);
  const result = await response.json();
  await dialog.waitFor({ state: 'hidden' });
  return result;
}

export async function runSuite(h, { mode, owner }) {
  const prefix = `${mode} browser`;
  const member = await h.signup(`${mode} Browser Member`);
  const companies = [];
  for (let start = 0; start < 60; start += 4) {
    companies.push(...await Promise.all(Array.from({ length: Math.min(4, 60 - start) }, (_, offset) => {
      const index = start + offset;
      return h.api(owner.context, '/api/companies', { method: 'POST', body: { name: `${prefix} Company ${String(index).padStart(2, '0')}`, industry: index % 2 ? 'Software' : 'Consulting', ownerId: index % 2 ? owner.user.id : member.user.id } });
    })));
  }
  const person = await h.api(owner.context, '/api/contacts', { method: 'POST', body: { firstName: `${prefix} Existing`, lastName: 'Contact', companyId: companies[0].id } });
  const page = await member.context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  try {
    await scenario(`${mode}: ordinary member directory and protected list access`, async () => {
      const directory = await h.api(member.context, '/api/assignees');
      assert.ok(directory.some(row => row.id === owner.user.id));
      assert.ok(directory.some(row => row.id === member.user.id));
      for (const row of directory) assert.deepEqual(Object.keys(row).sort(), ['id', 'image', 'name']);
      await h.api(member.context, '/api/members', { status: 403 });
      await page.goto('/companies');
      await page.getByRole('heading', { name: 'Companies', exact: true }).waitFor();
      await settled(page);
      assert.ok(!page.url().includes('access-revoked'));
    });

    await scenario(`${mode}: server pagination, search, sorting, reload, history and page selection`, async () => {
      await page.goto('/companies');
      await search(page, 'companies', prefix);
      assert.equal(await page.getByRole('checkbox', { name: /^Select / }).count(), 26);
      await page.getByRole('checkbox', { name: 'Select page', exact: true }).check();
      await page.getByRole('button', { name: 'Next page', exact: true }).click();
      await settled(page);
      await eventually(async () => (await page.getByRole('checkbox', { name: /^Select / }).evaluateAll(nodes => nodes.every(node => !node.checked))), 'Selection clears on page navigation');
      await selectOption(page.getByRole('combobox', { name: 'Page size', exact: true }), '100');
      await eventually(async () => (await page.getByRole('checkbox', { name: /^Select / }).count()) === 61, 'Page size exposes sixty real matches');
      await page.getByRole('button', { name: /^Company(?: [↑↓])?$/ }).click();
      await settled(page);
      const ascending = await page.getByRole('link', { name: new RegExp(`${prefix} Company`) }).allTextContents();
      assert.deepEqual(ascending, [...ascending].sort());
      await search(page, 'companies', `${prefix} Company 01`);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await settled(page);
      assert.equal(await page.getByRole('textbox', { name: 'Search companies', exact: true }).inputValue(), `${prefix} Company 01`);
      await search(page, 'companies', `${prefix} Company 02`);
      await page.goBack();
      await settled(page);
      assert.equal(await page.getByRole('textbox', { name: 'Search companies', exact: true }).inputValue(), `${prefix} Company 01`);
    });

    await scenario(`${mode}: complete company/contact/deal creation preserves relations and exact cents`, async () => {
      await page.goto('/companies');
      const company = await createFromForm(h, page, 'company', { Name: `${prefix} Created company`, Domain: `${mode}-created.example.test`, Website: 'https://example.test', Description: 'Created through every manual field', Industry: 'Software', City: 'Hanoi', 'State / region': 'HN', Country: 'VN', Phone: '+84 123456789', Email: `${mode}-company@example.test`, 'LinkedIn URL': 'https://linkedin.com/company/example' }, { Owner: member.user.id, 'Primary contact': person.id });
      assert.equal(company.primaryContactId, person.id);
      assert.equal((await h.api(member.context, `/api/contacts/${person.id}`)).companyId, companies[0].id);
      await page.goto('/contacts');
      const contact = await createFromForm(h, page, 'contact', { 'First name': `${prefix} Created`, 'Last name': 'Person', Email: `${mode}-contact@example.test`, Phone: '+84 987654321', Title: 'Engineer', 'LinkedIn URL': 'https://linkedin.com/in/example', 'Twitter URL': 'https://twitter.com/example', 'GitHub URL': 'https://github.com/example' }, { Company: company.id, Owner: member.user.id });
      assert.equal(contact.companyId, company.id);
      await page.goto('/deals');
      const deal = await createFromForm(h, page, 'deal', { Name: `${prefix} Created deal`, Description: 'Exact money', Amount: '90071992547409.91', Currency: 'USD', 'Expected close date': '2027-03-01' }, { Company: company.id });
      assert.equal(deal.amount, '90071992547409.91');
      assert.equal(deal.expectedCloseDate, '2027-03-01T00:00:00.000Z');
      assert.equal(deal.stage, 'DEMO_BOOKED');
      assert.equal(deal.ownerId, member.user.id);
      const cent = await createFromForm(h, page, 'deal', { Name: `${prefix} One cent`, Amount: '0.01' }, { Company: company.id });
      assert.equal(cent.amount, '0.01');
    });

    await scenario(`${mode}: row keyboard links preserve query, inner selection stays on list, mobile scrolling`, async () => {
      await page.goto('/companies');
      await search(page, 'companies', `${prefix} Company 01`);
      const checkbox = page.getByRole('checkbox', { name: `Select ${prefix} Company 01`, exact: true });
      await checkbox.check();
      assert.equal(new URL(page.url()).searchParams.has('record'), false);
      const link = page.getByRole('link', { name: `${prefix} Company 01`, exact: true });
      await link.focus();
      await page.keyboard.press('Enter');
      await eventually(() => Promise.resolve(new URL(page.url()).searchParams.get('record') === `company:${companies[1].id}`), 'Keyboard row link opens a typed record URL');
      assert.ok(new URL(page.url()).searchParams.get('q') || new URL(page.url()).searchParams.get('search'));
      await page.goBack();
      await settled(page);
      assert.equal(new URL(page.url()).searchParams.has('record'), false);
      await search(page, 'companies', `${prefix} Company`);
      const artifacts = fileURLToPath(new URL('../../../plans/reports/assets/', import.meta.url));
      await mkdir(artifacts, { recursive: true });
      if (mode === 'built') await page.screenshot({ path: `${artifacts}/cloudflare-record-toolbar-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      if (mode === 'built') await page.screenshot({ path: `${artifacts}/cloudflare-record-toolbar-mobile.png`, fullPage: true });
      await eventually(async () => page.getByRole('table').evaluate(table => { let node = table.parentElement; while (node) { if (node.scrollWidth > node.clientWidth && ['auto', 'scroll'].includes(getComputedStyle(node).overflowX)) { node.scrollLeft = 100; return node.scrollLeft > 0; } node = node.parentElement; } return false; }), 'Mobile table scrolls horizontally');
      await page.setViewportSize({ width: 1280, height: 720 });
    });

    await scenario(`${mode}: compact toolbar menus support keyboard dismissal and mobile bounds`, async () => {
      await page.goto('/companies'); await settled(page);
      assert.equal(await page.getByText('0 selected on this page', { exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Archive selected', exact: true }).count(), 0);
      await page.getByRole('textbox', { name: 'Search companies', exact: true }).fill(prefix);
      await page.getByRole('checkbox', { name: 'Archived', exact: true }).check();
      await eventually(() => Promise.resolve(new URL(page.url()).searchParams.get('q') === prefix), 'Pending search is applied');
      assert.equal(new URL(page.url()).searchParams.get('archived'), 'true', 'Debounced search preserves the newer archive choice');
      await page.getByRole('checkbox', { name: 'Archived', exact: true }).uncheck(); await settled(page);
      const columns = page.locator('summary').filter({ hasText: /^Columns$/ });
      await columns.focus(); await page.keyboard.press('Enter');
      await page.getByText('Visible columns', { exact: true }).waitFor();
      await page.keyboard.press('Tab');
      assert.equal(await page.getByRole('checkbox', { name: 'Domain', exact: true }).evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Escape');
      await page.getByText('Visible columns', { exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await columns.evaluate(el => el === document.activeElement), true);
      await columns.click();
      await page.getByRole('textbox', { name: 'Search companies', exact: true }).click();
      await page.getByText('Visible columns', { exact: true }).waitFor({ state: 'hidden' });
      await page.setViewportSize({ width: 390, height: 844 });
      for (const name of [/^Filters/, /^Saved views/, /^Columns$/]) {
        await page.locator('summary').filter({ hasText: name }).click();
        const panel = page.locator('[popover]:popover-open');
        await panel.waitFor();
        const bounds = await panel.boundingBox();
        assert.ok(bounds.x >= 15 && bounds.x + bounds.width <= 375, 'Dropdown fits mobile width');
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844, 'Dropdown fits mobile height');
        if (mode === 'built' && name.source === '^Filters') {
          const artifacts = fileURLToPath(new URL('../../../plans/reports/assets/', import.meta.url));
          await page.screenshot({ path: `${artifacts}/cloudflare-record-toolbar-mobile-filters.png`, fullPage: true });
        }
        await page.keyboard.press('Escape');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Page does not overflow horizontally');
      await page.setViewportSize({ width: 1280, height: 720 });
    });

    await scenario(`${mode}: facet filtering, saved view apply/update/share/private/delete and column preferences`, async () => {
      await page.goto('/companies');
      await search(page, 'companies', `${prefix} Company`);
      await page.locator('summary').filter({ hasText: /^Filters/ }).click();
      const industry = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Industry/ }) }).last();
      await industry.locator('summary').click();
      await industry.getByRole('checkbox', { name: /Software/ }).check();
      await eventually(async () => (await page.getByRole('status').filter({ hasText: /^30 records$/ }).count()) === 1, 'Industry facet filters all three record pages');
      await page.locator('summary').filter({ hasText: /^Saved views/ }).click();
      await page.getByRole('textbox', { name: 'View name', exact: true }).fill(`${prefix} View`);
      await page.getByRole('button', { name: 'Save as new view', exact: true }).click();
      await eventually(() => Promise.resolve(new URL(page.url()).searchParams.has('view')), 'Created saved view becomes active');
      const viewId = new URL(page.url()).searchParams.get('view');
      let views = await h.api(member.context, '/api/saved-views?entity=COMPANY');
      assert.equal(views.find(view => view.id === viewId).mine, true);
      assert.ok(!(await h.api(owner.context, '/api/saved-views?entity=COMPANY')).some(view => view.id === viewId));
      await page.getByRole('button', { name: 'Share view', exact: true }).waitFor();
      let releaseShared, capturedShared;
      const sharedGate = new Promise(resolve => { releaseShared = resolve; });
      const sharedCaptured = new Promise(resolve => { capturedShared = resolve; });
      await page.route('**/api/saved-views?*', async route => {
        const response = await route.fetch(); capturedShared(); await sharedGate;
        await route.fulfill({ response }).catch(() => {});
      });
      try {
        await page.getByRole('button', { name: 'Share view', exact: true }).click();
        await sharedCaptured;
        assert.ok((await h.api(owner.context, '/api/saved-views?entity=COMPANY')).some(view => view.id === viewId), 'Shared view visible to other account');
        await h.api(owner.context, `/api/saved-views/${viewId}`, { method: 'PATCH', body: { name: 'Foreign mutation' }, status: 404 });
        await page.getByRole('textbox', { name: 'View name', exact: true }).fill(`${prefix} Renamed`);
        releaseShared();
        await page.getByRole('button', { name: 'Make private', exact: true }).waitFor();
        assert.equal(await page.getByRole('textbox', { name: 'View name', exact: true }).inputValue(), `${prefix} Renamed`, 'Late sharing refresh preserves the name draft');
      } finally { releaseShared(); await page.unroute('**/api/saved-views?*'); }
      await page.getByRole('button', { name: 'Rename view', exact: true }).click();
      await eventually(async () => (await h.api(member.context, '/api/saved-views?entity=COMPANY')).some(view => view.id === viewId && view.name === `${prefix} Renamed`), 'View rename persisted');
      await search(page, 'companies', `${prefix} Company 01`);
      await page.locator('summary').filter({ hasText: /^Saved views/ }).click();
      await page.getByRole('button', { name: 'Update view configuration', exact: true }).click();
      await eventually(async () => (await h.api(member.context, '/api/saved-views?entity=COMPANY')).find(view => view.id === viewId)?.filters.q === `${prefix} Company 01`, 'Modified view configuration persisted');
      await page.locator('[popover]').getByRole('button', { name: 'Clear filters', exact: true }).click();
      await eventually(async () => (await page.getByRole('textbox', { name: 'View name', exact: true }).inputValue()) === '', 'Clearing the active view resets its name draft');
      assert.equal(await page.getByRole('checkbox', { name: 'Shared view', exact: true }).isChecked(), false, 'Clearing the active view resets sharing');
      await selectOption(page.getByRole('combobox', { name: 'Apply saved view', exact: true }), viewId);
      await eventually(async () => (await page.getByRole('textbox', { name: 'Search companies', exact: true }).inputValue()) === `${prefix} Company 01`, 'Applying view replaces search and filters');
      await page.getByRole('button', { name: 'Make private', exact: true }).click();
      await eventually(async () => !(await h.api(owner.context, '/api/saved-views?entity=COMPANY')).some(view => view.id === viewId), 'Unshared view becomes private');
      await page.getByRole('button', { name: 'Delete view', exact: true }).click();
      await eventually(async () => !(await h.api(member.context, '/api/saved-views?entity=COMPANY')).some(view => view.id === viewId), 'View deleted');
      await page.locator('summary').filter({ hasText: /^Columns$/ }).click();
      const columns = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Columns$/ }) });
      assert.equal(await columns.getByRole('checkbox', { name: 'Company', exact: true }).isDisabled(), true);
      await columns.getByRole('checkbox', { name: 'Domain', exact: true }).uncheck();
      await page.reload(); await settled(page);
      assert.equal(await page.getByRole('columnheader', { name: 'Domain', exact: true }).count(), 0);
      await page.locator('summary').filter({ hasText: /^Columns$/ }).click();
      await page.getByRole('button', { name: 'Reset columns', exact: true }).click();
      await page.getByRole('columnheader', { name: 'Domain', exact: true }).waitFor();
    });

    await scenario(`${mode}: bulk assignment, archive/restore and losing-stage reason use real mutations`, async () => {
      await page.goto('/companies');
      await search(page, 'companies', `${prefix} Company 01`);
      await page.getByRole('checkbox', { name: `Select ${prefix} Company 01`, exact: true }).check();
      await page.getByRole('button', { name: 'Assign owner', exact: true }).click();
      const assignment = page.getByRole('dialog', { name: 'Assign owner', exact: true });
      await selectOption(assignment.getByRole('combobox', { name: 'Owner', exact: true }), member.user.id);
      await assignment.getByRole('button', { name: 'Apply assignment', exact: true }).click();
      await assignment.waitFor({ state: 'hidden' });
      assert.equal((await h.api(member.context, `/api/companies/${companies[1].id}`)).ownerId, member.user.id);
      await page.getByRole('checkbox', { name: `Select ${prefix} Company 01`, exact: true }).check();
      await page.getByRole('button', { name: 'Archive selected', exact: true }).click();
      const archive = page.getByRole('dialog', { name: 'Archive records', exact: true });
      await archive.getByRole('button', { name: 'Archive', exact: true }).click();
      await archive.waitFor({ state: 'hidden' });
      await page.getByText('No matching records', { exact: true }).waitFor();
      await page.getByRole('checkbox', { name: 'Archived', exact: true }).check();
      await settled(page);
      await page.getByRole('checkbox', { name: `Select ${prefix} Company 01`, exact: true }).check();
      await page.getByRole('button', { name: 'Restore selected', exact: true }).click();
      const restore = page.getByRole('dialog', { name: 'Restore records', exact: true });
      await restore.getByRole('button', { name: 'Restore', exact: true }).click();
      await restore.waitFor({ state: 'hidden' });
      assert.equal((await h.api(member.context, `/api/companies/${companies[1].id}`)).archivedAt, null);
      const deal = await h.api(member.context, '/api/deals', { method: 'POST', body: { name: `${prefix} Stage case`, companyId: companies[0].id, ownerId: member.user.id, amount: '0.01' } });
      await page.goto('/deals');
      await search(page, 'deals', deal.name);
      const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: deal.name, exact: true }) });
      await row.getByRole('button', { name: 'Change stage', exact: true }).click();
      const stage = page.getByRole('dialog', { name: 'Change stage', exact: true });
      await stage.getByRole('combobox', { name: 'Stage', exact: true }).selectOption('CLOSED_LOST');
      assert.equal(await stage.getByRole('button', { name: 'Update stage', exact: true }).isDisabled(), true);
      await stage.getByRole('textbox', { name: 'Reason', exact: true }).fill('Budget unavailable');
      const transition = page.waitForRequest(request => request.url().endsWith(`/api/deals/${deal.id}/stage`) && request.method() === 'POST');
      await stage.getByRole('button', { name: 'Update stage', exact: true }).click();
      assert.equal(Object.hasOwn((await transition).postDataJSON(), 'actorId'), false);
      await stage.waitFor({ state: 'hidden' });
      assert.equal((await h.api(member.context, `/api/deals/${deal.id}`)).stage, 'CLOSED_LOST');
    });

    await scenario(`${mode}: contacts and deals search/sort/facet/page controls use server results`, async () => {
      const fixtures = { contacts: [], deals: [] };
      for (let start = 0; start < 26; start += 4) {
        await Promise.all(Array.from({ length: Math.min(4, 26 - start) }, async (_, offset) => {
          const index = start + offset;
          const contact = await h.api(member.context, '/api/contacts', { method: 'POST', body: { firstName: `${prefix} Paging contact ${String(index).padStart(2, '0')}`, companyId: companies[0].id, title: index % 2 ? 'Engineer' : 'Lead' } });
          fixtures.contacts.push(contact);
          fixtures.deals.push(await h.api(member.context, '/api/deals', { method: 'POST', body: { name: `${prefix} Paging deal ${String(index).padStart(2, '0')}`, companyId: companies[0].id, ownerId: member.user.id, amount: `${index}.01`, currency: index % 2 ? 'USD' : 'EUR' } }));
        }));
      }
      for (const entity of ['contacts', 'deals']) {
        await page.goto(`/${entity}`);
        await search(page, entity, `${prefix} Paging ${entity === 'contacts' ? 'contact' : 'deal'}`);
        assert.equal(await page.getByRole('checkbox', { name: /^Select / }).count(), 26);
        await page.getByRole('checkbox', { name: 'Select page', exact: true }).check();
        await page.getByRole('button', { name: 'Next page', exact: true }).click(); await settled(page);
        await eventually(async () => (await page.getByRole('checkbox', { name: /^Select / }).count()) === 2, 'Second page has one real record');
        assert.equal(await page.getByRole('checkbox', { name: 'Select page', exact: true }).isChecked(), false);
        await selectOption(page.getByRole('combobox', { name: 'Page size', exact: true }), '50');
        await eventually(async () => (await page.getByRole('checkbox', { name: /^Select / }).count()) === 27, 'All twenty-six server rows appear at page size fifty');
        if (entity === 'contacts') await page.getByRole('button', { name: /^Name(?: [↑↓])?$/ }).click();
        else {
          await page.getByRole('button', { name: /^Amount \(grouped by currency\)/ }).click();
          await page.getByText('Amounts are grouped by currency and sorted exactly within each currency. No exchange-rate conversion is applied.', { exact: true }).waitFor();
        }
        await settled(page);
        await page.locator('summary').filter({ hasText: /^Filters/ }).click();
        const label = entity === 'contacts' ? 'Title' : 'Currency';
        const facet = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: new RegExp(`^${label}`) }) }).last();
        await facet.locator('summary').click();
        await facet.getByRole('checkbox', { name: entity === 'contacts' ? /Engineer/ : /EUR/ }).check();
        await page.getByRole('status').filter({ hasText: /^13 records$/ }).waitFor();
        await page.reload(); await page.waitForLoadState('networkidle'); await settled(page);
        assert.equal(await page.getByRole('status').filter({ hasText: /^13 records$/ }).count(), 1);
      }
      await page.goto('/contacts'); await search(page, 'contacts', fixtures.contacts[0].firstName);
      await page.getByRole('checkbox', { name: `Select ${fixtures.contacts[0].firstName}`, exact: true }).check();
      await page.getByRole('button', { name: 'Assign company', exact: true }).click();
      let dialog = page.getByRole('dialog', { name: 'Assign company', exact: true });
      await dialog.getByRole('textbox', { name: 'Search company', exact: true }).fill(companies[1].name);
      await selectOption(dialog.getByRole('combobox', { name: 'Company', exact: true }), companies[1].id);
      await dialog.getByRole('button', { name: 'Apply assignment', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
      assert.equal((await h.api(member.context, `/api/contacts/${fixtures.contacts[0].id}`)).companyId, companies[1].id);
      await page.getByRole('checkbox', { name: `Select ${fixtures.contacts[0].firstName}`, exact: true }).check();
      await page.getByRole('button', { name: 'Assign company', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Assign company', exact: true });
      await selectOption(dialog.getByRole('combobox', { name: 'Company', exact: true }), '');
      await dialog.getByRole('button', { name: 'Apply assignment', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
      assert.equal((await h.api(member.context, `/api/contacts/${fixtures.contacts[0].id}`)).companyId, null);
    });

    await scenario(`${mode}: real missing-record bulk response preserves successful siblings and failed selection`, async () => {
      await page.goto('/companies'); await search(page, 'companies', `${prefix} Company 0`);
      for (const index of [8, 9]) await page.getByRole('checkbox', { name: `Select ${companies[index].name}`, exact: true }).check();
      const pattern = `**/api/companies/${companies[9].id}`;
      await page.route(pattern, async route => {
        const response = await route.fetch({ url: new URL('/api/companies/nonexistent-browser-record', route.request().url()).href });
        await route.fulfill({ response });
      });
      try {
        await page.getByRole('button', { name: 'Assign owner', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Assign owner', exact: true });
        await selectOption(dialog.getByRole('combobox', { name: 'Owner', exact: true }), member.user.id);
        await dialog.getByRole('button', { name: 'Apply assignment', exact: true }).click();
        await page.getByText('1 succeeded; 1 failed.', { exact: true }).waitFor();
        await page.getByText(new RegExp(`${companies[9].name}: 404`)).waitFor();
        assert.equal((await h.api(member.context, `/api/companies/${companies[8].id}`)).ownerId, member.user.id);
        await eventually(() => page.getByRole('checkbox', { name: `Select ${companies[9].name}`, exact: true }).isChecked(), 'Only failed record remains selected');
        assert.equal(await page.getByRole('checkbox', { name: `Select ${companies[8].name}`, exact: true }).isChecked(), false);
      } finally { await page.unroute(pattern); }
    });

    await scenario(`${mode}: mixed restore conflict reports successful and failed rows and permits retry`, async () => {
      const conflict = await h.api(member.context, '/api/companies', { method: 'POST', body: { name: `${prefix} Restore conflict`, domain: `${mode}-restore-conflict.example.test` } });
      const good = await h.api(member.context, '/api/companies', { method: 'POST', body: { name: `${prefix} Restore good` } });
      for (const record of [conflict, good]) await h.api(member.context, `/api/companies/${record.id}`, { method: 'DELETE', status: 200 });
      const occupying = await h.api(member.context, '/api/companies', { method: 'POST', body: { name: `${prefix} Occupying company`, domain: conflict.domain } });
      await page.goto('/companies'); await search(page, 'companies', `${prefix} Restore`);
      await page.getByRole('checkbox', { name: 'Archived', exact: true }).check(); await settled(page);
      await page.getByRole('checkbox', { name: 'Select page', exact: true }).check();
      await page.getByRole('button', { name: 'Restore selected', exact: true }).click();
      await page.getByRole('dialog', { name: 'Restore records', exact: true }).getByRole('button', { name: 'Restore', exact: true }).click();
      await page.getByText('1 succeeded; 1 failed.', { exact: true }).waitFor();
      await page.getByText(new RegExp(`${prefix} Restore conflict: 409`)).waitFor();
      assert.equal((await h.api(member.context, `/api/companies/${good.id}`)).archivedAt, null);
      assert.ok((await h.api(member.context, `/api/companies/${conflict.id}`)).archivedAt);
      const retained = page.getByRole('checkbox', { name: `Select ${conflict.name}`, exact: true });
      await eventually(() => retained.isChecked(), 'Failed restore remains selected for retry');
      await h.api(member.context, `/api/companies/${occupying.id}`, { method: 'DELETE', status: 200 });
      await page.getByRole('button', { name: 'Restore selected', exact: true }).click();
      await page.getByRole('dialog', { name: 'Restore records', exact: true }).getByRole('button', { name: 'Restore', exact: true }).click();
      await page.getByText('1 succeeded; 0 failed.', { exact: true }).waitFor();
      assert.equal((await h.api(member.context, `/api/companies/${conflict.id}`)).archivedAt, null);
    });

    await scenario(`${mode}: delayed real search cannot overwrite newer results`, async () => {
      await page.goto('/companies'); await settled(page);
      let release, captured;
      const held = new Promise(resolve => { captured = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      const pattern = '**/api/companies?*';
      await page.route(pattern, async route => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('search') !== `${prefix} Company 03`) return route.continue();
        const response = await route.fetch();
        captured(); await gate;
        await route.fulfill({ response }).catch(() => {});
      });
      try {
        await page.getByRole('textbox', { name: 'Search companies', exact: true }).fill(`${prefix} Company 03`);
        await held;
        await page.getByRole('textbox', { name: 'Search companies', exact: true }).fill(`${prefix} Company 04`);
        await page.getByRole('link', { name: `${prefix} Company 04`, exact: true }).waitFor();
        release(); await settled(page);
        assert.equal(await page.getByRole('link', { name: `${prefix} Company 03`, exact: true }).count(), 0);
      } finally { release(); await page.unroute(pattern); }
    });

    await scenario(`${mode}: forbidden mutation rechecks active membership without claiming revocation`, async () => {
      await page.goto('/companies'); await search(page, 'companies', `${prefix} Company 05`);
      await page.getByRole('checkbox', { name: `Select ${prefix} Company 05`, exact: true }).check();
      await page.getByRole('button', { name: 'Assign owner', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Assign owner', exact: true });
      await selectOption(dialog.getByRole('combobox', { name: 'Owner', exact: true }), owner.user.id);
      const path = `**/api/companies/${companies[5].id}`;
      await page.route(path, async route => {
        const response = await route.fetch({ headers: { ...route.request().headers(), origin: 'http://localhost:3101' } });
        await route.fulfill({ response });
      });
      try {
        const denied = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().endsWith(`/companies/${companies[5].id}`));
        await dialog.getByRole('button', { name: 'Apply assignment', exact: true }).click();
        assert.equal((await denied).status(), 403);
        await eventually(async () => (await page.getByText(/failed|origin|forbidden/i).count()) > 0, 'Denied action is visible');
        assert.equal(new URL(page.url()).pathname, '/companies');
        assert.ok((await h.api(member.context, '/api/assignees')).some(row => row.id === member.user.id));
      } finally { await page.unroute(path); }
    });

    await scenario(`${mode}: warmed owner directory follows member revoke and restore`, async () => {
      const ownerPage = await owner.context.newPage();
      try {
        const openPicker = async () => {
          if (ownerPage.url() === 'about:blank') await ownerPage.goto('/companies');
          else await ownerPage.getByRole('link', { name: 'Companies', exact: true }).click();
          await settled(ownerPage);
          await ownerPage.getByRole('button', { name: 'New company', exact: true }).click();
          const dialog = ownerPage.getByRole('dialog', { name: 'New company', exact: true });
          const picker = dialog.getByRole('combobox', { name: 'Owner', exact: true });
          await eventually(() => picker.isEnabled(), 'Owner directory loads');
          return { dialog, picker };
        };
        let form = await openPicker();
        assert.ok((await form.picker.locator('option').evaluateAll(options => options.map(option => option.value))).includes(member.user.id));
        await form.dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await ownerPage.getByRole('button', { name: 'Account', exact: true }).click();
        await ownerPage.getByRole('link', { name: 'Manage members', exact: true }).click();
        await ownerPage.getByRole('button', { name: `Revoke access for ${member.user.name}`, exact: true }).click();
        await ownerPage.getByRole('dialog').getByRole('button', { name: 'Revoke access', exact: true }).click();
        await ownerPage.getByText('Access revoked. This account has been signed out.', { exact: true }).waitFor();
        form = await openPicker();
        assert.ok(!(await form.picker.locator('option').evaluateAll(options => options.map(option => option.value))).includes(member.user.id));
        await form.dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await ownerPage.getByRole('button', { name: 'Account', exact: true }).click();
        await ownerPage.getByRole('link', { name: 'Manage members', exact: true }).click();
        await ownerPage.getByRole('button', { name: `Restore access for ${member.user.name}`, exact: true }).click();
        await ownerPage.getByText('Access restored as a member. This account must sign in again.', { exact: true }).waitFor();
        form = await openPicker();
        assert.ok((await form.picker.locator('option').evaluateAll(options => options.map(option => option.value))).includes(member.user.id));
        await h.signIn(member.context, member.email);
      } finally { await ownerPage.close(); }
    });

    await scenario(`${mode}: a real delayed member response stays cleared after browser signout`, async () => {
      const context = await h.newContext(); await h.signIn(context, owner.email);
      const memberPage = await context.newPage();
      let release, capture;
      const gate = new Promise(resolve => { release = resolve; });
      const captured = new Promise(resolve => { capture = resolve; });
      try {
        await memberPage.goto('/settings/members');
        await memberPage.getByRole('button', { name: 'Refresh members', exact: true }).waitFor();
        await eventually(() => memberPage.getByRole('button', { name: 'Refresh members', exact: true }).isEnabled(), 'Member list settles');
        await memberPage.route('**/api/members?*', async route => { const response = await route.fetch(); capture(); await gate; await route.fulfill({ response }).catch(() => {}); });
        await memberPage.getByRole('button', { name: 'Refresh members', exact: true }).click();
        await captured;
        await memberPage.getByRole('button', { name: 'Account', exact: true }).click();
        await memberPage.getByRole('button', { name: 'Sign out', exact: true }).click();
        await memberPage.waitForURL('**/sign-in');
        release();
        await memberPage.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
        assert.equal(await memberPage.getByRole('region', { name: 'Workspace members', exact: true }).count(), 0);
        assert.equal(await memberPage.getByText(member.user.name, { exact: true }).count(), 0);
      } finally { release(); await memberPage.close(); await context.close(); }
    });

    await scenario(`${mode}: delayed protected list response cannot repopulate after a real 401`, async () => {
      await page.goto('/companies'); await settled(page);
      let release, capture;
      const gate = new Promise(resolve => { release = resolve; });
      const captured = new Promise(resolve => { capture = resolve; });
      const pattern = '**/api/companies?*';
      await page.route(pattern, async route => {
        if (new URL(route.request().url()).searchParams.get('search') !== `${prefix} Company 06`) return route.continue();
        const response = await route.fetch(); capture(); await gate; await route.fulfill({ response }).catch(() => {});
      });
      try {
        await page.getByRole('textbox', { name: 'Search companies', exact: true }).fill(`${prefix} Company 06`);
        await captured;
        await member.context.clearCookies();
        await page.getByRole('textbox', { name: 'Search companies', exact: true }).fill(`${prefix} Company 07`);
        await page.waitForURL('**/sign-in?**');
        release();
        await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
        assert.equal(await page.getByRole('table').count(), 0);
        assert.equal(await page.getByText(`${prefix} Company 06`, { exact: true }).count(), 0);
      } finally { release(); await page.unroute(pattern); }
    });

    await scenario(`${mode}: no uncaught browser exceptions`, () => assert.deepEqual(pageErrors, []));
  } finally { await page.close(); await member.context.close(); }
}
