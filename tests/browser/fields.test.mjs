import assert from 'node:assert/strict';
import { test as nodeTest } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

async function test(name, run) {
  return nodeTest(name, async () => {
    try { await run(); } catch (error) { process.exitCode = 1; console.error(`[scenario] ${name}: ${error.message}`); throw error; }
  });
}
async function eventually(check, message) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await check()) return; await delay(50); }
  assert.fail(message);
}
const sheet = page => page.getByRole('dialog', { name: /^(Company|Contact|Deal) record$/ });
const panel = page => sheet(page).getByRole('region', { name: 'Custom fields', exact: true });
const fieldRow = (page, field) => panel(page).locator(`[data-custom-field="${field.key}"]`);
const settings = page => page.getByRole('region', { name: 'Custom field settings', exact: true });
const fieldDialog = page => page.getByRole('dialog', { name: /^(New|Edit) field$/ });
const entities = [['COMPANY', 'company', 'companies', 'Company'], ['CONTACT', 'contact', 'contacts', 'Contact'], ['DEAL', 'deal', 'deals', 'Deal']];
const types = ['TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'CHECKBOX', 'SELECT', 'URL', 'EMAIL', 'PHONE', 'USER'];
const exactNumber = '-900719925474099312345.12345678901234567890';
async function show(page, kind, id) {
  await page.goto(`/companies?record=${encodeURIComponent(`${kind}:${id}`)}`);
  await page.waitForURL(url => url.pathname === '/companies' && url.searchParams.get('record') === `${kind}:${id}`);
  await sheet(page).getByRole('button', { name: kind === 'contact' ? 'Edit first name' : 'Edit name', exact: true }).waitFor();
  await panel(page).waitFor();
}
async function openField(page, field) {
  await fieldRow(page, field).getByRole('button', { name: `Edit ${field.label.toLowerCase()}`, exact: true }).click();
  return fieldRow(page, field).getByLabel(field.label, { exact: true });
}
async function enterValue(page, field, value) {
  const input = await openField(page, field);
  if (field.type === 'CHECKBOX') {
    if (value === false) await fieldRow(page, field).getByRole('button', { name: 'Set to No', exact: true }).click();
    else await input.check();
  } else if (field.type === 'SELECT' || field.type === 'USER') await input.selectOption(value);
  else await input.fill(value);
}
async function saveField(page, field, keyboard = false) {
  const response = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === `/api/fields/${field.id}/value`);
  if (keyboard) await fieldRow(page, field).getByLabel(field.label, { exact: true }).press('Control+Enter');
  else await fieldRow(page, field).getByRole('button', { name: `Save ${field.label.toLowerCase()}`, exact: true }).click();
  const saved = await response;
  assert.equal(saved.status(), 200);
  assert.equal(saved.request().postDataJSON().expectedType, field.type);
  await fieldRow(page, field).getByRole('button', { name: `Edit ${field.label.toLowerCase()}`, exact: true }).waitFor();
  return { result: await saved.json(), input: saved.request().postDataJSON() };
}
async function openSettings(page, entity = 'Company') {
  await page.goto('/settings'); await settings(page).waitFor();
  // Definition rows are populated by the authenticated client query, so their
  // arrival also confirms the server-rendered entity buttons are hydrated.
  await settings(page).locator('[data-field-id]').first().waitFor();
  await settings(page).getByRole('button', { name: entity, exact: true }).click();
  await eventually(async () => await settings(page).getByRole('button', { name: entity, exact: true }).getAttribute('aria-pressed') === 'true', 'Field entity selection is active');
  await settings(page).getByRole('button', { name: 'New field', exact: true }).waitFor();
}
async function saveDefinition(page, method = 'PATCH') {
  const response = page.waitForResponse(response => response.request().method() === method && /^\/api\/fields(?:\/[^/]+)?$/.test(new URL(response.url()).pathname));
  await fieldDialog(page).getByRole('button', { name: 'Save field', exact: true }).click();
  const saved = await response;
  assert.equal(saved.status(), method === 'POST' ? 201 : 200);
  const definition = await saved.json();
  await fieldDialog(page).waitFor({ state: 'hidden' });
  if (method === 'PATCH') {
    assert.equal(Object.hasOwn(saved.request().postDataJSON(), 'key'), false);
    assert.equal(Object.hasOwn(saved.request().postDataJSON(), 'entity'), false);
    assert.equal(Object.hasOwn(saved.request().postDataJSON(), 'agentFilled'), false);
    assert.equal(Object.hasOwn(saved.request().postDataJSON(), 'agentBrief'), false);
  }
  return definition;
}

export async function runSuite(h, { mode, owner }) {
  const member = await h.signup(`${mode} Field Member`);
  const api = (path, options) => h.api(member.context, path, options);
  const company = await api('/api/companies', { method: 'POST', body: { name: `${mode} fields company` } });
  const contact = await api('/api/contacts', { method: 'POST', body: { firstName: `${mode} fields contact`, companyId: company.id } });
  const deal = await api('/api/deals', { method: 'POST', body: { name: `${mode} fields deal`, companyId: company.id, ownerId: member.user.id, currency: 'USD' } });
  const records = { COMPANY: company, CONTACT: contact, DEAL: deal };
  const definitions = {};
  for (const [entity, kind] of entities) {
    definitions[entity] = {};
    for (const type of types) definitions[entity][type] = await api('/api/fields', { method: 'POST', body: {
      entity, type, label: `${mode} ${kind} ${type}`, key: `${mode}_${kind}_${type.toLowerCase()}`,
      showOnSheet: true, showOnTable: true, showOnFilter: ['SELECT', 'USER'].includes(type), required: type === 'CHECKBOX',
      agentFilled: true, agentBrief: 'Retain stored agent metadata',
      ...(type === 'SELECT' ? { options: [{ label: `${mode} First choice` }, { label: `${mode} Second choice` }] } : {}),
    } });
  }
  const page = await member.context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const values = (entity, id = records[entity].id) => api(`/api/fields/values?${new URLSearchParams({ entity, entityId: id })}`);
  try {
    await test(`${mode}: ordinary members manage fields while only owners see member management`, async () => {
      await openSettings(page);
      assert.equal(await page.getByRole('link', { name: 'Manage members', exact: true }).count(), 0);
      const ownerPage = await owner.context.newPage();
      try { await ownerPage.goto('/settings'); await ownerPage.getByRole('link', { name: 'Manage members', exact: true }).waitFor(); await settings(ownerPage).waitFor(); }
      finally { await ownerPage.close(); }
      for (const [, , , label] of entities) {
        await settings(page).getByRole('button', { name: label, exact: true }).click();
        await settings(page).getByRole('button', { name: new RegExp(`^Edit field ${mode} ${label.toLowerCase()} TEXT$`) }).waitFor();
      }
    });

    await test(`${mode}: all ten editors preserve exact types and explicit editor preconditions on every entity`, async () => {
      for (const [entity, kind] of entities) {
        await show(page, kind, records[entity].id);
        const fields = definitions[entity];
        const sample = { TEXT: '  Unicode 雨 text  ', LONG_TEXT: 'First line\nSecond line <script>plain text</script> 雨', NUMBER: exactNumber, DATE: '2024-02-29', CHECKBOX: false, SELECT: fields.SELECT.options[0].id, URL: 'https://example.test/path?q=1', EMAIL: 'field@example.test', PHONE: '+001 020 0030', USER: member.user.id };
        for (const type of types) {
          const field = fields[type];
          await enterValue(page, field, sample[type]);
          const { result, input } = await saveField(page, field, type === 'LONG_TEXT');
          const expected = type === 'DATE' ? '2024-02-29T00:00:00.000Z' : type === 'TEXT' ? sample[type].trim() : sample[type];
          assert.equal(result.value, expected);
          assert.equal(input.entity, entity); assert.equal(input.entityId, records[entity].id);
          assert.equal((await values(entity)).find(row => row.id === field.id)?.value, expected);
          if (type === 'URL') {
            const link = fieldRow(page, field).getByRole('link', { name: sample[type], exact: true });
            assert.equal(await link.getAttribute('href'), sample[type]); assert.equal(await link.getAttribute('target'), '_blank');
          }
          if (type === 'LONG_TEXT') assert.equal(await fieldRow(page, field).locator('script').count(), 0);
          if (type === 'CHECKBOX') await fieldRow(page, field).getByText('No', { exact: true }).waitFor();
        }
        await page.reload();
        await fieldRow(page, fields.NUMBER).getByText(exactNumber, { exact: true }).waitFor();
        const date = await openField(page, fields.DATE);
        assert.equal(await date.inputValue(), '2024-02-29');
        await fieldRow(page, fields.DATE).getByRole('button', { name: 'Cancel', exact: true }).click();
      }
    });

    await test(`${mode}: definition and option lifecycle preserves identities, ordering and stored values`, async () => {
      await openSettings(page);
      await settings(page).getByRole('button', { name: 'New field', exact: true }).click();
      await fieldDialog(page).getByLabel('Field label', { exact: true }).fill(`${mode} lifecycle choice`);
      await fieldDialog(page).getByLabel('Field key (optional)', { exact: true }).fill(`${mode}_lifecycle_choice`);
      await fieldDialog(page).getByLabel('Field type', { exact: true }).selectOption('SELECT');
      for (const label of ['Show on table', 'Show on filter']) await fieldDialog(page).getByLabel(label, { exact: true }).check();
      for (const [index, label] of ['Original option', 'Remaining option'].entries()) {
        await fieldDialog(page).getByRole('button', { name: 'Add option', exact: true }).click();
        await fieldDialog(page).getByLabel(`Option ${index + 1} label`, { exact: true }).fill(label);
      }
      const definition = await saveDefinition(page, 'POST');
      const optionId = definition.options[0].id;
      await api(`/api/fields/${definition.id}/value`, { method: 'PUT', body: { entity: 'COMPANY', entityId: company.id, value: optionId, expectedType: 'SELECT' } });
      const edit = () => settings(page).getByRole('button', { name: `Edit field ${definition.label}`, exact: true }).click();
      await edit();
      assert.equal(await fieldDialog(page).getByLabel('Field key (optional)', { exact: true }).count(), 0);
      await fieldDialog(page).getByText(definition.key, { exact: true }).waitFor();
      await fieldDialog(page).getByLabel('Option 1 label', { exact: true }).fill('Renamed option');
      await fieldDialog(page).getByRole('button', { name: 'Move option 1 down', exact: true }).click();
      let saved = await saveDefinition(page);
      assert.equal(saved.options[1].id, optionId); assert.equal(saved.options[1].label, 'Renamed option');
      await edit();
      await fieldDialog(page).getByRole('button', { name: 'Archive option 2', exact: true }).click();
      await saveDefinition(page);
      const archived = await api(`/api/fields/${definition.id}/options?includeArchived=true`);
      assert.ok(archived.find(option => option.id === optionId)?.archivedAt);
      await show(page, 'company', company.id);
      await fieldRow(page, definition).getByText('Renamed option (retired)', { exact: true }).waitFor();
      const selection = await openField(page, definition);
      assert.equal(await selection.inputValue(), optionId);
      assert.equal(await selection.locator(`option[value="${optionId}"]`).isDisabled(), true);
      await fieldRow(page, definition).getByRole('button', { name: 'Cancel', exact: true }).click();
      await openSettings(page); await edit();
      await fieldDialog(page).getByLabel('Show archived options', { exact: true }).check();
      await fieldDialog(page).getByRole('button', { name: 'Restore option Renamed option', exact: true }).click();
      saved = await saveDefinition(page);
      assert.equal(saved.options.find(option => option.id === optionId)?.archivedAt, null);
      const before = await api('/api/fields?entity=COMPANY');
      const index = before.findIndex(field => field.id === definition.id);
      const expected = before.map(field => field.id); [expected[index - 1], expected[index]] = [expected[index], expected[index - 1]];
      await settings(page).getByRole('button', { name: `Move field ${definition.label} up`, exact: true }).click();
      await settings(page).getByText('Field order saved.', { exact: true }).waitFor();
      assert.deepEqual((await api('/api/fields?entity=COMPANY')).map(field => field.id), expected);
      await page.reload();
      await eventually(async () => JSON.stringify(await settings(page).locator('[data-field-id]').evaluateAll(rows => rows.map(row => row.dataset.fieldId))) === JSON.stringify(expected), 'Atomic order survives reload');
      await settings(page).getByRole('button', { name: `Archive field ${definition.label}`, exact: true }).click();
      await settings(page).getByRole('button', { name: `Edit field ${definition.label}`, exact: true }).waitFor({ state: 'hidden' });
      await settings(page).getByLabel('Include archived fields', { exact: true }).check();
      await settings(page).getByRole('button', { name: `Restore field ${definition.label}`, exact: true }).waitFor();
      await show(page, 'company', company.id);
      assert.equal(await fieldRow(page, definition).count(), 0);
      await openSettings(page);
      await settings(page).getByLabel('Include archived fields', { exact: true }).check();
      await settings(page).getByRole('button', { name: `Restore field ${definition.label}`, exact: true }).click();
      await settings(page).getByRole('button', { name: `Edit field ${definition.label}`, exact: true }).waitFor();
      assert.equal((await values('COMPANY')).find(field => field.id === definition.id)?.value, optionId);
    });

    await test(`${mode}: definition conflicts retain edits and immutable keys while stored agent metadata survives rename`, async () => {
      await openSettings(page, 'Contact');
      const field = definitions.CONTACT.TEXT;
      await settings(page).getByRole('button', { name: `Edit field ${field.label}`, exact: true }).click();
      assert.equal(await fieldDialog(page).getByLabel('Show on filter', { exact: true }).isDisabled(), true);
      await fieldDialog(page).getByLabel('Field type', { exact: true }).selectOption('NUMBER');
      const rejected = page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/fields/${field.id}`);
      await fieldDialog(page).getByRole('button', { name: 'Save field', exact: true }).click();
      assert.equal((await rejected).status(), 409);
      await fieldDialog(page).getByRole('alert').waitFor();
      assert.equal(await fieldDialog(page).getByLabel('Field type', { exact: true }).inputValue(), 'NUMBER');
      await page.keyboard.press('Escape');
      await fieldDialog(page).getByText('Keep editing or discard your unsaved field changes.', { exact: true }).waitFor();
      await fieldDialog(page).getByRole('button', { name: 'Keep editing', exact: true }).click();
      await fieldDialog(page).getByLabel('Field type', { exact: true }).selectOption('TEXT');
      await fieldDialog(page).getByLabel('Field label', { exact: true }).fill(`${field.label} renamed`);
      const saved = await saveDefinition(page);
      assert.equal(saved.key, field.key); assert.equal(saved.entity, field.entity);
      assert.equal(saved.agentFilled, true); assert.equal(saved.agentBrief, 'Retain stored agent metadata');
      definitions.CONTACT.TEXT = saved;
      await settings(page).getByRole('button', { name: 'New field', exact: true }).click();
      await fieldDialog(page).getByLabel('Field label', { exact: true }).fill('優先度');
      await fieldDialog(page).getByRole('button', { name: 'Save field', exact: true }).click();
      await fieldDialog(page).getByRole('alert').waitFor();
      await fieldDialog(page).getByLabel('Field key (optional)', { exact: true }).fill(field.key);
      const conflict = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/fields');
      await fieldDialog(page).getByRole('button', { name: 'Save field', exact: true }).click();
      assert.equal((await conflict).status(), 409);
      assert.equal(await fieldDialog(page).getByLabel('Field label', { exact: true }).inputValue(), '優先度');
      await fieldDialog(page).getByLabel('Field key (optional)', { exact: true }).fill(`${mode}_explicit_unicode`);
      assert.equal((await saveDefinition(page, 'POST')).key, `${mode}_explicit_unicode`);
    });

    await test(`${mode}: sheet edits refresh custom columns and SELECT/USER saved filters on every list`, async () => {
      for (const [entity, kind, plural] of entities) {
        const field = definitions[entity].SELECT;
        const user = definitions[entity].USER;
        const record = records[entity];
        const name = kind === 'contact' ? record.firstName : record.name;
        await page.goto(`/${plural}?q=${encodeURIComponent(`${mode} fields`)}`);
        const row = page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });
        await row.waitFor();
        await page.getByRole('columnheader', { name: definitions[entity].NUMBER.label, exact: true }).waitFor();
        await row.getByRole('cell', { name: exactNumber, exact: true }).waitFor();
        assert.equal(await page.getByRole('columnheader', { name: definitions[entity].NUMBER.label, exact: true }).getByRole('button').count(), 0, 'Custom decimals are display-only columns');
        const requests = [];
        const watch = request => { if (new URL(request.url()).pathname === '/api/fields/values') requests.push(request.url()); };
        page.on('request', watch);
        await row.getByRole('link', { name, exact: true }).click();
        await enterValue(page, field, field.options[1].id);
        await saveField(page, field);
        await sheet(page).getByRole('button', { name: 'Close record sheet', exact: true }).click();
        await sheet(page).waitFor({ state: 'hidden' });
        await row.getByRole('cell', { name: field.options[1].label, exact: true }).waitFor();
        assert.ok(requests.length < 4, 'Values requests belong to the opened sheet, not every list row');
        page.off('request', watch);
        for (const [definition, optionLabel] of [[field, field.options[1].label], [user, member.user.name]]) {
          await page.locator('summary').filter({ hasText: /^Filters/ }).click();
          const facet = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: new RegExp(`^${definition.label}`) }) }).last();
          await facet.locator('summary').click();
          await facet.getByRole('checkbox', { name: `${optionLabel} 1`, exact: true }).check();
          await page.keyboard.press('Escape');
          await page.getByRole('button', { name: `Remove ${definition.label} filter`, exact: true }).waitFor();
        }
        await page.waitForLoadState('networkidle');
        await eventually(async () => !(await page.getByText(/^(Loading|Refreshing) records…$/).count()), 'Filtered list finishes its current URL and data update');
        await page.locator('summary').filter({ hasText: /^Saved views/ }).click();
        await page.getByRole('textbox', { name: 'View name', exact: true }).fill(`${mode} ${kind} custom view`);
        await page.getByRole('button', { name: 'Save as new view', exact: true }).click().catch(async error => {
          const state = await page.evaluate(() => ({ pathname: location.pathname, search: location.search, title: document.title, readyState: document.readyState, openRecord: document.querySelector('[data-record-sheet]')?.getAttribute('aria-label'), viewName: document.querySelector('[aria-label="View name"]')?.value }));
          throw new Error(`${error.message}; page state: ${JSON.stringify(state)}`);
        });
        await eventually(() => !!new URL(page.url()).searchParams.get('view'), 'Custom saved view becomes active');
        const viewId = new URL(page.url()).searchParams.get('view');
        const saved = (await api(`/api/saved-views?entity=${entity}`)).find(view => view.id === viewId);
        assert.deepEqual(saved.filters.filters[`field:${field.key}`], [field.options[1].id]);
        assert.deepEqual(saved.filters.filters[`field:${user.key}`], [member.user.id]);
        await page.getByRole('button', { name: 'Share view', exact: true }).click();
        await eventually(async () => (await h.api(owner.context, `/api/saved-views?entity=${entity}`)).some(view => view.id === viewId), 'Other members can load the shared custom view');
        await page.reload();
        await row.waitFor();
        await page.getByRole('button', { name: `Remove ${field.label} filter`, exact: true }).waitFor();
        const projected = await api(`/api/${plural}?includeFields=true&limit=100&search=${encodeURIComponent(`${mode} fields`)}`);
        assert.equal(projected.find(item => item.id === record.id).fields[definitions[entity].NUMBER.key], exactNumber);
        assert.equal(projected.find(item => item.id === record.id).fields[definitions[entity].CHECKBOX.key], false);
        const ordinary = await api(`/api/${plural}?limit=100&search=${encodeURIComponent(`${mode} fields`)}`);
        assert.equal(Object.hasOwn(ordinary.find(item => item.id === record.id), 'fields'), false);
      }
    });

    await test(`${mode}: optional null is distinct from false and required fields reject explicit blank`, async () => {
      await show(page, 'company', company.id);
      const text = definitions.COMPANY.TEXT;
      await openField(page, text);
      await fieldRow(page, text).getByRole('button', { name: `Clear ${text.label.toLowerCase()}`, exact: true }).click();
      const cleared = await saveField(page, text);
      assert.equal(cleared.input.value, null); assert.equal(cleared.result.value, null);
      const checkbox = definitions.COMPANY.CHECKBOX;
      await openField(page, checkbox);
      assert.equal(await fieldRow(page, checkbox).getByRole('button', { name: `Clear ${checkbox.label.toLowerCase()}`, exact: true }).count(), 0);
      assert.equal((await values('COMPANY')).find(row => row.id === checkbox.id)?.value, false);
      await fieldRow(page, checkbox).getByRole('button', { name: 'Cancel', exact: true }).click();
      const required = await api('/api/fields', { method: 'POST', body: { entity: 'COMPANY', type: 'TEXT', label: `${mode} required text`, required: true } });
      await page.reload();
      const input = await openField(page, required); await input.fill(' ');
      await fieldRow(page, required).getByRole('button', { name: `Save ${required.label.toLowerCase()}`, exact: true }).click();
      await fieldRow(page, required).getByRole('alert').waitFor();
      assert.equal(await input.inputValue(), ' ');
      assert.equal((await values('COMPANY')).find(row => row.id === required.id)?.value, null, 'Required does not backfill earlier empty records');
      await fieldRow(page, required).getByRole('button', { name: 'Cancel', exact: true }).click();
    });

    await test(`${mode}: stale type preconditions retain the original draft after a real409`, async () => {
      const stale = await api('/api/fields', { method: 'POST', body: { entity: 'CONTACT', type: 'TEXT', label: `${mode} stale draft` } });
      await show(page, 'contact', contact.id);
      const input = await openField(page, stale); await input.fill('Text typed before conversion');
      await api(`/api/fields/${stale.id}`, { method: 'PATCH', body: { type: 'NUMBER' } });
      const response = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === `/api/fields/${stale.id}/value`);
      await fieldRow(page, stale).getByRole('button', { name: `Save ${stale.label.toLowerCase()}`, exact: true }).click();
      const rejected = await response; assert.equal(rejected.status(), 409); assert.equal(rejected.request().postDataJSON().expectedType, 'TEXT');
      await fieldRow(page, stale).getByRole('alert').filter({ hasText: /draft uses TEXT|type changed/i }).first().waitFor();
      assert.equal(await input.inputValue(), 'Text typed before conversion');
      assert.equal((await values('CONTACT')).find(row => row.id === stale.id)?.value, null);
      await fieldRow(page, stale).getByRole('button', { name: 'Cancel', exact: true }).click();
      await enterValue(page, { ...stale, type: 'NUMBER' }, '0');
      assert.equal((await saveField(page, { ...stale, type: 'NUMBER' })).result.value, '0');
    });

    await test(`${mode}: real400 and dropped committed responses retain drafts without automatic replay`, async () => {
      const field = definitions.CONTACT.EMAIL;
      await show(page, 'contact', contact.id);
      await enterValue(page, field, 'recovery@example.test');
      let transport = false, requests = 0;
      const pattern = `**/api/fields/${field.id}/value`;
      await page.route(pattern, async route => {
        requests++;
        const response = await route.fetch(transport ? {} : { postData: { ...route.request().postDataJSON(), value: 'invalid-email' } });
        assert.equal(response.status(), transport ? 200 : 400);
        if (transport) return route.abort('failed');
        await route.fulfill({ response });
      });
      try {
        for (const failure of [false, true]) {
          transport = failure;
          await fieldRow(page, field).getByRole('button', { name: `Save ${field.label.toLowerCase()}`, exact: true }).click();
          await fieldRow(page, field).getByRole('alert').waitFor();
          await eventually(() => fieldRow(page, field).getByRole('button', { name: `Save ${field.label.toLowerCase()}`, exact: true }).isEnabled(), 'Failure permits explicit recovery');
          assert.equal(await fieldRow(page, field).getByLabel(field.label, { exact: true }).inputValue(), 'recovery@example.test');
        }
        await delay(200); assert.equal(requests, 2);
        assert.equal((await values('CONTACT')).find(row => row.id === field.id)?.value, 'recovery@example.test');
        await fieldRow(page, field).getByRole('button', { name: 'Cancel', exact: true }).click();
      } finally { await page.unroute(pattern); }
    });
    await test(`${mode}: visibility flags hide layouts without deleting values and historical users remain readable`, async () => {
      const field = definitions.DEAL.TEXT;
      await openSettings(page, 'Deal');
      await settings(page).getByRole('button', { name: `Edit field ${field.label}`, exact: true }).click();
      await fieldDialog(page).getByLabel('Show on sheet', { exact: true }).uncheck();
      await fieldDialog(page).getByLabel('Show on table', { exact: true }).uncheck();
      await saveDefinition(page);
      await show(page, 'deal', deal.id);
      assert.equal(await fieldRow(page, field).count(), 0);
      assert.equal((await values('DEAL')).find(item => item.id === field.id)?.value, 'Unicode 雨 text');
      await page.goto('/deals');
      await page.getByRole('link', { name: deal.name, exact: true }).waitFor();
      assert.equal(await page.getByRole('columnheader', { name: field.label, exact: true }).count(), 0);
      await openSettings(page, 'Deal');
      await settings(page).getByRole('button', { name: `Edit field ${field.label}`, exact: true }).click();
      await fieldDialog(page).getByLabel('Show on sheet', { exact: true }).check();
      await fieldDialog(page).getByLabel('Show on table', { exact: true }).check();
      await saveDefinition(page);
      const user = definitions.DEAL.USER;
      await api(`/api/fields/${user.id}/value`, { method: 'PUT', body: { entity: 'DEAL', entityId: deal.id, value: 'former-field-user', expectedType: 'USER' } });
      await show(page, 'deal', deal.id);
      await fieldRow(page, field).getByText('Unicode 雨 text', { exact: true }).waitFor();
      await fieldRow(page, user).getByText('Unavailable / historical (former-field-user)', { exact: true }).waitFor();
      const picker = await openField(page, user);
      assert.equal(await picker.inputValue(), 'former-field-user');
      assert.match(await picker.locator('option[value="former-field-user"]').innerText(), /Unavailable|historical/);
      await picker.selectOption(member.user.id); await saveField(page, user);
      const checkbox = definitions.COMPANY.CHECKBOX;
      await api(`/api/fields/${checkbox.id}`, { method: 'PATCH', body: { required: false } });
      await show(page, 'company', company.id); await openField(page, checkbox);
      await fieldRow(page, checkbox).getByRole('button', { name: `Clear ${checkbox.label.toLowerCase()}`, exact: true }).click();
      assert.equal((await saveField(page, checkbox)).result.value, null);
    });

    await test(`${mode}: pending keyboard saves deduplicate and dirty navigation waits for the actual value response`, async () => {
      const field = definitions.CONTACT.LONG_TEXT;
      await show(page, 'contact', contact.id);
      const input = await openField(page, field); await input.fill('First line');
      await input.press('End'); await input.press('Enter'); await input.press('S');
      assert.equal(await input.inputValue(), 'First line\nS');
      await input.press('Escape');
      assert.equal(await input.inputValue(), 'First line\nS');
      let release, captured = false, requests = 0;
      const gate = new Promise(resolve => { release = resolve; });
      const pattern = `**/api/fields/${field.id}/value`;
      await page.route(pattern, async route => {
        requests++;
        const response = await route.fetch(); captured = true; await gate;
        await route.fulfill({ response }).catch(() => {});
      });
      try {
        await input.press('Control+Enter');
        await eventually(() => captured, 'Real value committed behind a delayed response');
        assert.equal(await fieldRow(page, field).getByRole('button', { name: `Save ${field.label.toLowerCase()}`, exact: true }).isDisabled(), true);
        await page.keyboard.press('Control+Enter'); await page.keyboard.press('Meta+Enter');
        await sheet(page).getByRole('button', { name: 'Close record sheet', exact: true }).click();
        const guard = page.getByRole('dialog', { name: 'Unsaved changes', exact: true });
        await guard.waitFor();
        assert.equal(await guard.getByRole('button', { name: 'Discard', exact: true }).isDisabled(), true);
        release();
        await eventually(() => guard.getByRole('button', { name: 'Stay', exact: true }).isEnabled(), 'Navigation unlocks when the value save completes');
        await guard.getByRole('button', { name: 'Stay', exact: true }).click();
        await fieldRow(page, field).getByRole('button', { name: `Edit ${field.label.toLowerCase()}`, exact: true }).waitFor();
        assert.equal(requests, 1);
        assert.equal((await values('CONTACT')).find(item => item.id === field.id)?.value, 'First line\nS');
      } finally { release(); await page.unroute(pattern); }
    });

    await test(`${mode}: a late value response cannot overwrite a newly opened record draft`, async () => {
      const other = await api('/api/contacts', { method: 'POST', body: { firstName: `${mode} other field contact` } });
      const field = definitions.CONTACT.PHONE;
      await show(page, 'contact', contact.id); await enterValue(page, field, '+000 111');
      let release, captured = false;
      const gate = new Promise(resolve => { release = resolve; });
      const pattern = `**/api/fields/${field.id}/value`;
      await page.route(pattern, async route => {
        const response = await route.fetch(); captured = true; await gate;
        await route.fulfill({ response }).catch(() => {});
      });
      try {
        await fieldRow(page, field).getByRole('button', { name: `Save ${field.label.toLowerCase()}`, exact: true }).click();
        await eventually(() => captured, 'Old record value response captured');
        const acceptUnload = dialog => void dialog.accept(); page.on('dialog', acceptUnload);
        try { await show(page, 'contact', other.id); } finally { page.off('dialog', acceptUnload); }
        await enterValue(page, field, '+000 222');
        release(); await delay(250);
        assert.equal(await fieldRow(page, field).getByLabel(field.label, { exact: true }).inputValue(), '+000 222');
        assert.equal((await values('CONTACT', other.id)).find(item => item.id === field.id)?.value, null);
        assert.equal((await values('CONTACT')).find(item => item.id === field.id)?.value, '+000 111');
        await fieldRow(page, field).getByRole('button', { name: 'Cancel', exact: true }).click();
      } finally { release(); await page.unroute(pattern); }
    });

    await test(`${mode}: a retired saved custom filter requires explicit repair and cannot broaden rows silently`, async () => {
      const field = definitions.COMPANY.SELECT;
      const view = (await api('/api/saved-views?entity=COMPANY')).find(view => view.name === `${mode} company custom view`);
      assert.ok(view);
      await api(`/api/fields/${field.id}`, { method: 'DELETE', status: 200 });
      await page.goto('/companies');
      await page.locator('summary').filter({ hasText: /^Saved views/ }).click();
      await page.getByRole('combobox', { name: 'Apply saved view', exact: true }).selectOption(view.id);
      await page.getByText(/unsupported filters|retired or unsupported field/).first().waitFor();
      assert.equal(new URL(page.url()).searchParams.get('view'), null, 'An unsupported view is not silently applied');
      await page.getByRole('button', { name: 'Remove unsupported field filters', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Remove unsupported field filters', exact: true }).click();
      await eventually(() => new URL(page.url()).searchParams.get('view') === view.id, 'User explicitly approves a repaired view');
      await page.getByRole('button', { name: 'Remove unsupported field filters', exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await page.getByText(/unsupported filters|retired or unsupported field/).count(), 0, 'Repair warnings clear once the active configuration is valid');
      await api(`/api/fields/${field.id}/restore`, { method: 'POST', status: 200 });
    });

    await test(`${mode}: directory failures stay distinct from historical users and recover through explicit retry`, async () => {
      const field = definitions.COMPANY.USER;
      const pattern = '**/api/assignees?*';
      await page.route(pattern, route => route.abort('failed'));
      try {
        await show(page, 'company', company.id);
        await fieldRow(page, field).getByText(`User directory unavailable (${member.user.id})`, { exact: true }).waitFor();
        assert.equal(await fieldRow(page, field).getByText(/Unavailable \/ historical/).count(), 0);
        await panel(page).getByRole('button', { name: 'Retry user directory', exact: true }).waitFor();
      } finally { await page.unroute(pattern); }
      await panel(page).getByRole('button', { name: 'Retry user directory', exact: true }).click();
      await fieldRow(page, field).getByText(member.user.name, { exact: true }).waitFor();
      await panel(page).getByRole('button', { name: 'Retry user directory', exact: true }).waitFor({ state: 'hidden' });
    });

    await test(`${mode}: date inputs round-trip in opposite timezones and mobile editors work in both themes`, async () => {
      const field = definitions.CONTACT.DATE;
      for (const timezoneId of ['Asia/Ho_Chi_Minh', 'America/Los_Angeles']) {
        const context = await h.browser.newContext({ baseURL: 'http://localhost:3100', timezoneId, storageState: await member.context.storageState() });
        context.setDefaultTimeout(15000);
        const dated = await context.newPage();
        try {
          await show(dated, 'contact', contact.id);
          const input = await openField(dated, field);
          assert.equal(await input.inputValue(), '2024-02-29');
          await input.fill('2024-03-01');
          assert.equal((await saveField(dated, field)).result.value, '2024-03-01T00:00:00.000Z');
          await enterValue(dated, field, '2024-02-29'); await saveField(dated, field);
        } finally { await context.close(); }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      try {
        await show(page, 'company', company.id);
        const colors = [];
        for (const dark of [false, true]) {
          await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
          const number = definitions.COMPANY.NUMBER;
          await enterValue(page, number, dark ? '0.000001' : '-0.000001');
          colors.push(await sheet(page).evaluate(node => getComputedStyle(node).backgroundColor));
          await saveField(page, number, true);
          await eventually(() => fieldRow(page, number).getByRole('button', { name: `Edit ${number.label.toLowerCase()}`, exact: true }).evaluate(node => node === document.activeElement), 'Save returns keyboard focus to the field edit button');
          assert.equal(await sheet(page).evaluate(node => node.scrollWidth <= node.clientWidth), true);
        }
        assert.notEqual(colors[0], colors[1], 'Light and dark themes use distinct sheet surfaces');
      } finally { await page.evaluate(() => document.documentElement.classList.remove('dark')); await page.setViewportSize({ width: 1280, height: 720 }); }
    });

    await test(`${mode}: field-specific403 rechecks membership and401 clears protected drafts without replay`, async () => {
      const field = definitions.CONTACT.PHONE;
      await show(page, 'contact', contact.id); await enterValue(page, field, '+000 denied');
      const pattern = `**/api/fields/${field.id}/value`;
      await page.route(pattern, async route => {
        const response = await route.fetch({ headers: { ...route.request().headers(), origin: 'http://localhost:3101' } });
        assert.equal(response.status(), 403); await route.fulfill({ response });
      });
      try {
        await fieldRow(page, field).getByRole('button', { name: `Save ${field.label.toLowerCase()}`, exact: true }).click();
        await page.getByRole('alert').filter({ hasText: /origin|forbidden/i }).first().waitFor();
        assert.equal(new URL(page.url()).pathname, '/companies');
        assert.ok((await api('/api/assignees')).some(user => user.id === member.user.id));
      } finally { await page.unroute(pattern); }
      const context = await h.newContext(); await h.signIn(context, member.email);
      const expired = await context.newPage();
      try {
        await show(expired, 'contact', contact.id); await enterValue(expired, field, '+000 expired');
        await context.clearCookies();
        await fieldRow(expired, field).getByRole('button', { name: `Save ${field.label.toLowerCase()}`, exact: true }).click();
        await expired.waitForURL('**/sign-in?**');
        assert.equal(await expired.getByRole('dialog').count(), 0);
        assert.notEqual((await values('CONTACT')).find(item => item.id === field.id)?.value, '+000 expired');
      } finally { await context.close(); }
    });

    await test(`${mode}: confirmed membership loss clears field definition drafts and settings overlays`, async () => {
      await openSettings(page);
      await settings(page).getByRole('button', { name: 'New field', exact: true }).click();
      await fieldDialog(page).getByLabel('Field label', { exact: true }).fill(`${mode} revoked definition draft`);
      const membership = (await h.api(owner.context, '/api/members')).find(user => user.id === member.user.id);
      await h.api(owner.context, `/api/members/${member.user.id}`, { method: 'PATCH', body: { action: 'revoke', expectedRevision: membership.revision } });
      await fieldDialog(page).getByRole('button', { name: 'Save field', exact: true }).click();
      await page.waitForURL(url => ['/access-revoked', '/sign-in'].includes(url.pathname));
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await page.getByRole('region', { name: 'Custom field settings', exact: true }).count(), 0);
    });
    assert.deepEqual(errors, [], 'No uncaught browser runtime errors');
  } finally { await page.close(); await member.context.close(); }
}
