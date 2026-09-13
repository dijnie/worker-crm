import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createAuthHarness } from './auth-harness.mjs';
import { assertApiResponse } from './openapi-assertions.mjs';
let h, owner, member, spec;
before(async () => { h = await createAuthHarness(); owner = await h.signupVerified(); member = await h.signupVerified(); spec = await (await h.request('/api/openapi')).json(); });
after(async () => h?.dispose());
async function call(account, path, method = 'GET', body) {
  const response = await h.request(path, { cookie: account.cookie, method, body });
  return assertApiResponse(spec, `https://crm.test${path}`, method, response);
}
test('saved views preserve creator privacy and reject forged identity, invalid filters and duplicate names', async () => {
  const create = await call(member, '/api/saved-views', 'POST', { entity: 'COMPANY', name: 'My companies', filters: { q: 'Acme', sort: 'name', dir: 'asc', archived: false, filters: { owner: ['unassigned'] } } });
  assert.equal(create.status, 201); const view = await create.json(); assert.equal(view.ownerId, member.user.id); assert.equal(view.mine, true);
  assert.deepEqual(await (await call(owner, '/api/saved-views?entity=COMPANY')).json(), []);
  for (const method of ['PATCH', 'DELETE']) assert.equal((await call(owner, `/api/saved-views/${view.id}`, method, method === 'PATCH' ? { shared: true } : undefined)).status, 404);
  assert.equal((await call(member, '/api/saved-views', 'POST', { entity: 'COMPANY', name: view.name, filters: {} })).status, 409);
  for (const extra of [{ ownerId: owner.user.id }, { actorId: owner.user.id }, { filters: { page: 2 } }, { filters: { filters: { 'field:missing': ['x'] } } }, { filters: { sort: 'amount' } }]) {
    assert.equal((await call(member, '/api/saved-views', 'POST', { entity: 'COMPANY', name: 'Bad', filters: {}, ...extra })).status, 400);
  }
  const shared = await call(member, `/api/saved-views/${view.id}`, 'PATCH', { shared: true, name: 'Team companies' }); assert.equal(shared.status, 200);
  const visible = await (await call(owner, '/api/saved-views?entity=COMPANY')).json(); assert.equal(visible[0].mine, false); assert.equal(visible[0].filters.q, 'Acme');
  assert.equal((await call(member, `/api/saved-views/${view.id}`, 'PATCH', { filters: { q: 'Changed' } })).status, 200);
  assert.equal((await call(member, `/api/saved-views/${view.id}`, 'DELETE')).status, 204);
  assert.equal((await call(member, `/api/saved-views/${view.id}`, 'DELETE')).status, 404);
});
test('legacy shared unknown-owner views stay readable and private views stay hidden', async () => {
  await h.binding.prepare('INSERT INTO saved_views (id,entity,name,shared,filters,owner_id) VALUES (?,?,?,?,?,?)').bind('legacy-shared','CONTACT','Historical',1,JSON.stringify({filters:{'field:retired':['v']}}),'external').run();
  await h.binding.prepare('INSERT INTO saved_views (id,entity,name,shared,filters,owner_id) VALUES (?,?,?,?,?,?)').bind('legacy-private','CONTACT','Private',0,'{}','external').run();
  const views = await (await call(owner, '/api/saved-views?entity=CONTACT')).json(); assert.equal(views.length, 1); assert.equal(views[0].mine, false); assert.deepEqual(views[0].filters.filters, {'field:retired':['v']});
  assert.equal((await call(owner, '/api/saved-views/legacy-shared', 'PATCH', {shared:false})).status,404);
});

test('saved-view queries and updates reject unsupported entities, fields and invalid facet selections', async () => {
  for (const query of ['', '?entity=company', '?entity=COMPANY&entity=CONTACT', '?entity=COMPANY&page=1', '?entity=COMPANY&ownerId=external']) {
    assert.equal((await call(owner, `/api/saved-views${query}`)).status, 400, query);
  }
  const created = await call(owner, '/api/saved-views', 'POST', { entity: 'DEAL', name: 'Strict deal view', filters: { filters: { status: ['open'], currency: ['USD'] } } });
  assert.equal(created.status, 201);
  const view = await created.json();
  for (const body of [{ entity: 'COMPANY' }, { ownerId: member.user.id }, { actorId: member.user.id }, { filters: { record: 'deal:x' } }, { filters: { filters: { status: ['lost'] } } }, { filters: { filters: { owner: Array(51).fill('id') } } }, { filters: { filters: { unknown: ['x'] } } }]) {
    assert.equal((await call(owner, `/api/saved-views/${view.id}`, 'PATCH', body)).status, 400, JSON.stringify(body));
  }
  const oversized = await call(owner, '/api/saved-views', 'POST', { entity: 'COMPANY', name: 'Too large', filters: { filters: { industry: Array(50).fill('x'.repeat(1000)) } } });
  assert.equal(oversized.status, 400);
});

test('saved-view writes reject prototype-named unknown facets without silently dropping them', async () => {
  const filters = JSON.parse('{"filters":{"__proto__":["x"]}}');
  const response = await call(owner, '/api/saved-views', 'POST', { entity: 'COMPANY', name: 'Unknown facet', filters });
  assert.equal(response.status, 400);
});

test('custom saved views retain stable keys and retired options, while stale views remain readable for repair', async () => {
  const definitionResponse = await call(member, '/api/fields', 'POST', { entity: 'COMPANY', key: 'saved_segment', label: 'Segment', type: 'SELECT', showOnFilter: true, showOnTable: true, options: [{ label: 'Priority' }, { label: 'Other' }] });
  assert.equal(definitionResponse.status, 201);
  const definition = await definitionResponse.json();
  const option = definition.options[0];
  const filters = { filters: { 'field:saved_segment': [option.id] } };
  const created = await call(member, '/api/saved-views', 'POST', { entity: 'COMPANY', name: 'Custom segment', shared: true, filters });
  assert.equal(created.status, 201);
  const view = await created.json();
  assert.equal((await call(owner, `/api/saved-views/${view.id}`, 'PATCH', { name: 'Not mine' })).status, 404);
  assert.equal((await call(member, `/api/fields/${definition.id}`, 'PATCH', { label: 'Renamed segment' })).status, 200);
  assert.equal((await call(member, `/api/fields/${definition.id}/options/${option.id}`, 'PATCH', { archived: true })).status, 200);
  assert.equal((await call(member, `/api/saved-views/${view.id}`, 'PATCH', { filters })).status, 200);
  const personal = await call(owner, '/api/saved-views', 'POST', { entity: 'COMPANY', name: 'Personal custom segment', filters });
  assert.equal(personal.status, 201);
  const personalView = await personal.json();
  assert.equal((await (await call(member, '/api/saved-views?entity=COMPANY')).json()).some(item => item.id === personalView.id), false);
  for (const body of [
    { entity: 'CONTACT', name: 'Wrong entity', filters },
    { entity: 'COMPANY', name: 'Wrong option', filters: { filters: { 'field:saved_segment': ['foreign-option'] } } },
  ]) assert.equal((await call(member, '/api/saved-views', 'POST', body)).status, 400);
  assert.equal((await call(member, `/api/fields/${definition.id}`, 'DELETE')).status, 200);
  const retained = (await (await call(owner, '/api/saved-views?entity=COMPANY')).json()).find(item => item.id === view.id);
  assert.deepEqual(retained.filters, filters);
  assert.equal((await call(member, `/api/saved-views/${view.id}`, 'PATCH', { name: 'Repair later' })).status, 200);
  assert.equal((await call(member, `/api/saved-views/${view.id}`, 'PATCH', { filters })).status, 400);
  assert.equal((await call(member, `/api/companies?filters=${encodeURIComponent(JSON.stringify(filters.filters))}`)).status, 400);
  assert.equal((await call(member, `/api/saved-views/${view.id}`, 'PATCH', { filters: { filters: {} } })).status, 200);
  assert.equal((await call(member, `/api/fields/${definition.id}/restore`, 'POST')).status, 200);
  assert.equal((await call(member, `/api/saved-views/${view.id}`, 'PATCH', { filters })).status, 200);
});
