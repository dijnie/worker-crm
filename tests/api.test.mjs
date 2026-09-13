import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createAuthHarness } from './auth-harness.mjs';
import { assertApiResponse } from './openapi-assertions.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseUrl = 'https://crm.test';
let harness, binding, client, unauthorizedClient, ApiError, endpoints, openApiDocument, account;

before(async () => {
  harness = await createAuthHarness();
  binding = harness.binding;
  const specification = await harness.request('/api/openapi');
  assert.equal(specification.status, 200);
  openApiDocument = await specification.json();
  account = await harness.signupVerified();
  const clientPath = join(harness.directory, 'client.mjs');
  await build({ stdin: { contents: `export * from './src/lib/api.ts'; export { default as endpoints } from './src/lib/api-endpoints.ts';`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'browser', format: 'esm', outfile: clientPath, logLevel: 'silent' });
  const bundledClient = await import(pathToFileURL(clientPath).href);
  ({ ApiError, endpoints } = bundledClient);
  const fetch = async (url, init) => assertApiResponse(openApiDocument, url, init.method ?? 'GET', await harness.runtime.dispatchFetch(url, init));
  client = bundledClient.createApiClient({ baseUrl, headers: { cookie: account.cookie, origin: baseUrl }, fetch });
  unauthorizedClient = bundledClient.createApiClient({ baseUrl, fetch });
  const clientSource = await readFile(clientPath, 'utf8');
  assert.doesNotMatch(clientSource, /cloudflare:workers|BETTER_AUTH_SECRET|drizzle-orm/);
});

after(async () => { await harness?.dispose(); });
beforeEach(async () => {
  for (const name of ['activities', 'field_values', 'field_options', 'field_definitions', 'deal_contacts', 'deals', 'companies', 'contacts', 'saved_views']) {
    await binding.prepare(`DELETE FROM ${name}`).run();
  }
});

async function request(path, { method = 'GET', body, authorized = true, headers = {}, origin = baseUrl } = {}) {
  const response = await harness.request(path, { method, body, cookie: authorized ? account.cookie : undefined, headers, origin });
  return assertApiResponse(openApiDocument, `${baseUrl}${path}`, method, response);
}

test('all documented API methods reject requests without authorization before reading input', async () => {
  for (const endpoint of endpoints) {
    const path = endpoint.path.replace(/:id|:optionId|:contactId/g, 'missing');
    const response = await request(path, { method: endpoint.method, authorized: false, ...(endpoint.method === 'GET' ? {} : { body: '{' }) });
    assert.equal(response.status, 401, `${endpoint.method} ${path}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await binding.prepare('SELECT count(*) AS total FROM companies').first()).total, 0);
  await assert.rejects(unauthorizedClient.companies.list(), error => error instanceof ApiError && error.status === 401);
});

test('empty database returns an array, pagination headers and zero statistics', async () => {
  const response = await request('/api/companies');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
  assert.equal(response.headers.get('x-total-count'), '0');
  assert.equal(response.headers.get('x-page'), '1');
  assert.equal(response.headers.get('x-limit'), '25');
  assert.deepEqual(await client.stats(), { totalCompanies: 0, totalContacts: 0, totalDeals: 0, openDealValue: '0.00', currency: 'USD', activitiesThisWeek: 0 });
  const lowercaseStats = await request('/api/stats?currency=usd');
  assert.equal(lowercaseStats.status, 200);
  assert.equal((await lowercaseStats.json()).currency, 'USD');
});

test('field ordering, editor preconditions and opt-in custom projections agree with protected HTTP and OpenAPI', async () => {
  const company = await client.companies.create({ name: 'Custom placement' });
  const select = await client.fields.create({ entity: 'COMPANY', key: 'tier', label: 'Tier', type: 'SELECT', showOnTable: true, showOnFilter: true, options: [{ label: 'High' }, { label: 'Low' }] });
  const number = await client.fields.create({ entity: 'COMPANY', label: 'Exact score', type: 'NUMBER', showOnTable: true });
  const checkbox = await client.fields.create({ entity: 'COMPANY', label: 'Reviewed', type: 'CHECKBOX', required: true, showOnTable: true });
  await client.fields.setValue(select.id, 'COMPANY', company.id, select.options[0].id, 'SELECT');
  await client.fields.setValue(number.id, 'COMPANY', company.id, '-900719925474099312345.00123', 'NUMBER');
  await client.fields.setValue(checkbox.id, 'COMPANY', company.id, false, 'CHECKBOX');
  assert.equal(Object.hasOwn((await client.companies.list()).items[0], 'fields'), false);
  const projected = await client.companies.list({ includeFields: true, filters: { 'field:tier': [select.options[0].id] } });
  assert.equal(projected.total, 1);
  assert.deepEqual(projected.items[0].fields, { tier: select.options[0].id, exact_score: '-900719925474099312345.00123', reviewed: false });
  const facets = await client.companies.facets({ facet: 'field:tier', filters: { 'field:tier': [select.options[0].id] } });
  assert.equal(facets.facetCounts['field:tier'].find(option => option.value === select.options[0].id).count, 1);
  const ids = [checkbox.id, number.id, select.id];
  assert.deepEqual((await client.fields.reorder({ entity: 'COMPANY', ids })).map(field => field.id), ids);
  await assert.rejects(client.fields.reorder({ entity: 'COMPANY', ids: [select.id, select.id] }), error => error.status === 400);
  await assert.rejects(client.fields.reorder({ entity: 'COMPANY', ids: [select.id] }), error => error.status === 409);
  assert.deepEqual((await client.fields.list('COMPANY')).map(field => field.id), ids);
  const stale = await client.fields.create({ entity: 'COMPANY', label: 'Changing', type: 'TEXT' });
  await client.fields.update(stale.id, { type: 'NUMBER' });
  await assert.rejects(client.fields.setValue(stale.id, 'COMPANY', company.id, '12', 'TEXT'), error => error.status === 409);
  assert.equal((await client.fields.values('COMPANY', company.id)).find(field => field.id === stale.id).value, null);
  await client.fields.setValue(stale.id, 'COMPANY', company.id, '12');
  assert.equal((await client.fields.values('COMPANY', company.id)).find(field => field.id === stale.id).value, '12');
  assert.equal((await request(`/api/fields/${stale.id}/value`, { method: 'PUT', body: { entity: 'COMPANY', entityId: company.id, value: '13', expectedType: 'UNKNOWN' } })).status, 400);
  const view = await client.savedViews.create({ entity: 'COMPANY', name: 'High tier', filters: { filters: { 'field:tier': [select.options[0].id] } } });
  await client.fields.archive(select.id);
  assert.equal((await client.savedViews.list('COMPANY')).find(item => item.id === view.id).filters.filters['field:tier'][0], select.options[0].id);
  await assert.rejects(client.companies.list({ filters: { 'field:tier': [select.options[0].id] } }), error => error.status === 400);
  assert.equal((await request('/api/companies?includeFields=maybe')).status, 400);
});

test('client performs record CRUD, pagination, archive/restore and exact money round trips', async () => {
  const create = await request('/api/companies', { method: 'POST', body: { name: 'Test' } });
  assert.equal(create.status, 201);
  const company = await create.json();
  assert.ok(company.id);
  const contact = await client.contacts.create({ firstName: 'Lin', email: 'LIN@example.com', companyId: company.id });
  assert.equal(contact.email, 'lin@example.com');
  const deal = await client.deals.create({ name: 'License', companyId: company.id, ownerId: 'operator', amount: '0.29', currency: 'usd' });
  assert.equal(deal.amount, '0.29');
  assert.equal(deal.currency, 'USD');
  assert.equal((await client.companies.get(company.id)).deals[0].amount, '0.29');
  assert.equal((await client.contacts.list({ companyId: company.id })).total, 1);
  assert.equal((await client.deals.list({ companyId: company.id })).items[0].amount, '0.29');
  assert.equal((await client.companies.update(company.id, { name: 'Updated' })).name, 'Updated');
  assert.equal((await client.contacts.update(contact.id, { phone: '123' })).phone, '123');
  assert.equal((await client.deals.update(deal.id, { amount: '12.30' })).amount, '12.30');
  assert.ok((await client.deals.update(deal.id, {})).company);
  for (const [resource, id] of [[client.companies, company.id], [client.contacts, contact.id], [client.deals, deal.id]]) {
    await resource.archive(id);
    assert.equal((await resource.list()).total, 0);
    assert.equal((await resource.list({ archived: true })).total, 1);
    await resource.restore(id);
    assert.equal((await resource.list()).total, 1);
  }
  assert.equal((await client.stats()).openDealValue, '12.30');
});

test('API validates JSON, queries, protected writes, missing references and conflicts without SQL leakage', async () => {
  const company = await client.companies.create({ name: 'One', domain: 'example.com' });
  const cases = [
    ['/api/companies', 'POST', '{', 400],
    ['/api/companies', 'POST', { name: ' ', id: 'injected' }, 400],
    ['/api/companies?archived=maybe', 'GET', undefined, 400],
    ['/api/companies?page=0', 'GET', undefined, 400],
    ['/api/companies?page=1&page=2', 'GET', undefined, 400],
    ['/api/companies?limit=101', 'GET', undefined, 400],
    ['/api/companies?lifecycleStage=lead', 'GET', undefined, 400],
    ['/api/companies?__proto__=ignored', 'GET', undefined, 400],
    ['/api/companies/missing', 'GET', undefined, 404],
    ['/api/companies', 'POST', { name: 'Duplicate', domain: 'EXAMPLE.COM' }, 409],
    ['/api/contacts', 'POST', { firstName: 'Contact', companyId: 'missing' }, 400],
    ['/api/deals', 'POST', { name: 'Bad', companyId: company.id, ownerId: 'operator', amount: '0.001' }, 400],
  ];
  for (const [path, method, body, status] of cases) {
    const response = await request(path, { method, body });
    assert.equal(response.status, status, path);
    const data = await response.text();
    assert.doesNotMatch(data, /SQLITE|INSERT INTO|SELECT |D1_ERROR|Failed query/);
  }
  await binding.prepare("CREATE TRIGGER reject_company BEFORE INSERT ON companies BEGIN SELECT RAISE(ABORT, 'private database detail'); END").run();
  try {
    const response = await request('/api/companies', { method: 'POST', body: { name: 'Fails' } });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: 'Internal server error' });
  } finally { await binding.prepare('DROP TRIGGER reject_company').run(); }
});

test('stage actions and activity tasks update history and derived company stamps', async () => {
  const company = await client.companies.create({ name: 'Company' });
  const deal = await client.deals.create({ name: 'Deal', companyId: company.id, ownerId: 'operator', amount: '10.00' });
  assert.equal((await client.deals.setStage(deal.id, { stage: 'QUALIFIED_TO_BUY' })).changed, true);
  assert.equal((await client.deals.setStage(deal.id, { stage: 'QUALIFIED_TO_BUY' })).changed, false);
  const history = await client.activities.list({ dealId: deal.id });
  assert.equal(history.total, 1);
  assert.equal(history.items[0].createdById, account.user.id);
  assert.deepEqual(history.items[0].meta, { from: 'DEMO_BOOKED', to: 'QUALIFIED_TO_BUY' });
  const task = await client.activities.create({ type: 'TASK', subject: 'Call', dealId: deal.id });
  assert.equal(task.companyId, company.id);
  assert.equal(task.createdById, account.user.id);
  assert.ok((await client.activities.complete(task.id, { completed: true })).completedAt);
  assert.equal((await client.activities.complete(task.id, { completed: false })).completedAt, null);
  assert.equal((await client.activities.get(task.id)).id, task.id);
  await client.activities.delete(task.id);
  await assert.rejects(client.activities.get(task.id), error => error.status === 404);
  assert.ok((await client.companies.get(company.id)).lastActivityAt);
});

test('field endpoints preserve typed values and historical options', async () => {
  const company = await client.companies.create({ name: 'Company' });
  const field = await client.fields.create({ entity: 'COMPANY', label: 'Priority', type: 'SELECT', options: [{ label: 'High' }] });
  const option = field.options[0];
  await client.fields.setValue(field.id, 'COMPANY', company.id, option.id);
  const createdOption = await client.fields.createOption(field.id, { label: 'Low' });
  assert.equal((await client.fields.options(field.id)).length, 2);
  await client.fields.updateOption(field.id, option.id, { archived: true });
  const values = await client.fields.values('COMPANY', company.id);
  assert.equal(values[0].value, option.id);
  assert.ok(values[0].options.some(row => row.id === option.id && row.archivedAt));
  await assert.rejects(client.fields.setValue(field.id, 'COMPANY', company.id, option.id), error => error.status === 400);
  await client.fields.setValue(field.id, 'COMPANY', company.id, createdOption.id);
  await client.fields.update(field.id, { label: 'Importance' });
  assert.equal((await client.fields.get(field.id)).label, 'Importance');
  await client.fields.archive(field.id);
  assert.equal((await client.fields.list('COMPANY')).length, 0);
  assert.equal((await client.fields.list('COMPANY', true)).length, 1);
  await client.fields.restore(field.id);
  await client.fields.setValue(field.id, 'COMPANY', company.id, null);
  assert.equal((await client.fields.values('COMPANY', company.id))[0].value, null);
});

test('private writes require canonical Origin and JSON and token headers grant no access', async () => {
  for (const endpoint of endpoints) {
    const path = endpoint.path.replace(/:id|:optionId|:contactId/g, 'missing');
    for (const headers of [{ authorization: 'Bearer old-token' }, { authorization: 'Token old-token' }, { authorization: 'old-token' }, { 'x-api-token': 'old-token' }]) {
      assert.equal((await request(path, { method: endpoint.method, authorized: false, headers })).status, 401, path);
    }
    if (endpoint.method === 'GET') continue;
    for (const origin of [null, 'https://attacker.test']) {
      assert.equal((await request(path, { method: endpoint.method, origin, body: '{' })).status, 403, path);
    }
    assert.equal((await request(path, { method: endpoint.method, body: '{}', headers: { 'content-type': 'text/plain' } })).status, 415, path);
  }
});

test('public actor properties are rejected even when they match the current user', async () => {
  const company = await client.companies.create({ name: 'Attribution' });
  const deal = await client.deals.create({ name: 'History', companyId: company.id, ownerId: 'legacy-owner' });
  for (const actor of ['forged-user', account.user.id]) {
    assert.equal((await request('/api/activities', { method: 'POST', body: { type: 'NOTE', companyId: company.id, createdById: actor } })).status, 400);
    assert.equal((await request(`/api/deals/${deal.id}/stage`, { method: 'POST', body: { stage: 'QUALIFIED_TO_BUY', actorId: actor } })).status, 400);
  }
  assert.equal((await client.activities.list()).total, 0);
  assert.equal((await client.deals.get(deal.id)).ownerId, 'legacy-owner');
});

test('owner member API enforces revisions, revocation, restoration and current permissions', async () => {
  const member = await harness.signupVerified();
  const asMember = (path, options = {}) => harness.request(path, { cookie: member.cookie, ...options });
  assert.equal((await asMember('/api/companies')).status, 200);
  assert.equal((await asMember('/api/members')).status, 403);
  assert.equal((await asMember(`/api/members/${account.user.id}`, { method: 'PATCH', body: { action: 'revoke', expectedRevision: 0 } })).status, 403);
  const page = await client.members.list({ status: 'active' });
  const row = page.items.find(row => row.id === member.user.id);
  assert.ok(row);
  assert.doesNotMatch(JSON.stringify(row), /password|token|accessVersion|secret/);
  await assert.rejects(client.members.update(row.id, { action: 'revoke', expectedRevision: row.revision + 1 }), error => error.status === 409);
  const promoted = await client.members.update(row.id, { action: 'change-role', role: 'owner', expectedRevision: row.revision });
  assert.equal((await asMember('/api/members')).status, 200);
  const revoked = await client.members.update(row.id, { action: 'revoke', expectedRevision: promoted.revision });
  assert.equal(revoked.status, 'revoked');
  assert.equal((await asMember('/api/companies')).status, 401);
  const restored = await client.members.update(row.id, { action: 'restore', expectedRevision: revoked.revision });
  assert.equal(restored.role, 'member');
  assert.equal((await asMember('/api/companies')).status, 401);
  const signedIn = await harness.signIn(member.email);
  assert.equal((await harness.request('/api/companies', { cookie: signedIn.cookie })).status, 200);
  assert.equal((await harness.request('/api/members', { cookie: signedIn.cookie })).status, 403);
  await assert.rejects(client.members.update('missing', { action: 'revoke', expectedRevision: 0 }), error => error.status === 404);
  await assert.rejects(client.members.update(account.user.id, { action: 'revoke', expectedRevision: 0 }), error => error.status === 409);
});

test('ordinary members attach external participants, update roles and detach through strict protected APIs', async () => {
  const member = await harness.signupVerified();
  const memberRequest = async (path, options = {}) => assertApiResponse(openApiDocument, `${baseUrl}${path}`, options.method ?? 'GET', await harness.request(path, { cookie: member.cookie, ...options }));
  const company = await client.companies.create({ name: 'Deal company' });
  const employer = await client.companies.create({ name: 'External employer' });
  const contact = await client.contacts.create({ firstName: 'Advisor', companyId: employer.id });
  const deal = await client.deals.create({ name: 'Deal', companyId: company.id, ownerId: 'historical' });
  const path = `/api/deals/${deal.id}/contacts`;
  const response = await memberRequest(path, { method: 'POST', body: { contactId: contact.id, role: '  Advisor  ' } });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { dealId: deal.id, contactId: contact.id, role: 'Advisor' });
  assert.equal((await client.deals.get(deal.id)).contacts[0].firstName, 'Advisor');
  assert.equal((await client.contacts.get(contact.id)).companyId, employer.id);
  await assert.rejects(client.deals.attachContact(deal.id, { contactId: contact.id }), error => error.status === 409);
  assert.equal((await client.deals.updateContactRole(deal.id, contact.id, { role: ' ' })).role, null);
  assert.equal((await memberRequest(`${path}/${contact.id}`, { method: 'PATCH', body: { role: 'Buyer' } })).status, 200);
  for (const body of [{}, { role: 'x'.repeat(81) }, { role: null, actorId: member.user.id }]) {
    assert.equal((await memberRequest(`${path}/${contact.id}`, { method: 'PATCH', body })).status, 400);
  }
  assert.equal((await memberRequest(`${path}/${contact.id}`, { method: 'DELETE' })).status, 204);
  await assert.rejects(client.deals.detachContact(deal.id, contact.id), error => error.status === 404);
  assert.equal((await memberRequest(path, { method: 'POST', body: { contactId: 'missing' } })).status, 400);
  assert.equal((await memberRequest('/api/deals/missing/contacts', { method: 'POST', body: { contactId: contact.id } })).status, 404);
  const attempts = await Promise.all(Array.from({ length: 3 }, () => memberRequest(path, { method: 'POST', body: { contactId: contact.id } })));
  assert.deepEqual(attempts.map(result => result.status).sort(), [201, 409, 409]);
  await client.deals.detachContact(deal.id, contact.id);
  assert.equal((await client.deals.get(deal.id)).contacts.length, 0);
});

test('activity view HTTP pagination, counts, strict filters and abortable client reads match the public contract', async () => {
  const company = await client.companies.create({ name: 'Timeline' });
  for (let index = 0; index < 31; index++) await client.activities.create({ type: 'NOTE', body: `Note ${index}`, companyId: company.id });
  const task = await client.activities.create({ type: 'TASK', subject: 'Old outstanding', dueAt: '2000-01-01', companyId: company.id });
  await client.activities.create({ type: 'EMAIL', companyId: company.id });
  await client.activities.create({ type: 'MEETING', companyId: company.id });
  const done = await client.activities.create({ type: 'TASK', subject: 'Completed', companyId: company.id });
  await client.activities.complete(done.id, { completed: true });
  const context = { companyId: company.id };
  assert.deepEqual(await client.activities.counts(context), { all: 35, history: 34, notes: 31, upcoming: 1, done: 1, email: 1, meetings: 1 });
  const page = await client.activities.list({ ...context, view: 'notes', page: 2, limit: 30 });
  assert.equal(page.total, 31);
  assert.equal(page.items.length, 1);
  assert.equal(page.page, 2);
  assert.equal(page.limit, 30);
  assert.equal((await client.activities.list({ ...context, view: 'upcoming' })).items[0].id, task.id);
  assert.equal((await client.activities.list({ ...context, view: 'upcoming', type: 'NOTE' })).total, 0);
  for (const query of ['view=all', 'page=1', 'limit=10', 'companyId=a&companyId=b', 'type=BAD']) {
    assert.equal((await request(`/api/activities/counts?${query}`)).status, 400);
  }
  assert.equal((await request('/api/activities?view=unknown')).status, 400);
  const member = await harness.signupVerified();
  const memberCounts = await harness.request(`/api/activities/counts?companyId=${company.id}`, { cookie: member.cookie });
  assert.equal(memberCounts.status, 200);
  assert.equal(memberCounts.headers.get('cache-control'), 'no-store');
  assert.equal((await memberCounts.json()).all, 35);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.activities.counts(context, { signal: controller.signal }));
  await assert.rejects(client.activities.list(context, { signal: controller.signal }));
});
