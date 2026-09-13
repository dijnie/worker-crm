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
