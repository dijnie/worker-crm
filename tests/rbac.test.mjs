import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthHarness } from './auth-harness.mjs';

const grants = (entity, ...actions) => actions.map(action => ({ entity, action }));
async function call(h, actor, path, method = 'GET', body, expected = 200) {
  const response = await h.request(path, { cookie: actor.cookie, method, body });
  assert.equal(response.status, expected, `${method} ${path}: ${await response.clone().text()}`);
  return response.status === 204 ? undefined : response.json();
}
async function roleFor(h, system, actor, permissions, name = crypto.randomUUID()) {
  const role = await call(h, system, '/api/roles', 'POST', { name, permissions }, 201);
  const row = await h.binding.prepare('SELECT revision FROM singleton_membership WHERE user_id = ?').bind(actor.user.id).first();
  await call(h, system, `/api/members/${actor.user.id}`, 'PATCH', { action: 'change-role', roleId: role.id, expectedRevision: row.revision });
  return role;
}

test('first and later verified signups remain roleless and cannot access any CRM surface', async t => {
  const h = await createAuthHarness(t);
  for (const actor of [await h.signupVerified(), await h.signupVerified()]) {
    const identity = await call(h, actor, '/api/account');
    assert.equal(identity.role, null);
    assert.deepEqual(identity.permissions, []);
    assert.equal((await h.binding.prepare('SELECT role_id FROM singleton_membership WHERE user_id = ?').bind(actor.user.id).first()).role_id, null);
    for (const path of ['/api/companies', '/api/contacts', '/api/deals', '/api/activities', '/api/activities/counts', '/api/stats', '/api/assignees', '/api/members', '/api/roles', '/api/companies/missing', '/api/companies/facets', '/api/fields?entity=COMPANY', '/api/fields/values?entity=COMPANY&entityId=missing', '/api/saved-views?entity=COMPANY']) {
      await call(h, actor, path, 'GET', undefined, 403);
    }
    for (const [path, method, body] of [
      ['/api/companies', 'POST', { name: 'Must not exist' }],
      ['/api/companies/missing', 'PATCH', { name: 'Must not change' }],
      ['/api/companies/missing', 'DELETE'],
      ['/api/fields', 'POST', { entity: 'COMPANY', label: 'Forbidden', type: 'TEXT' }],
      ['/api/roles', 'POST', { name: 'Forbidden' }],
    ]) await call(h, actor, path, method, body, 403);
  }
  assert.equal((await h.binding.prepare('SELECT count(*) AS n FROM companies').first()).n, 0);
  assert.equal((await h.binding.prepare('SELECT count(*) AS n FROM singleton_membership WHERE role_id IS NOT NULL').first()).n, 0);
});

test('custom entity actions are independent, field definitions stay system-only, and role changes affect retained sessions', async t => {
  const h = await createAuthHarness(t), system = await h.signupSystem(), actor = await h.signupVerified();
  const permissions = [...grants('company', 'read', 'create', 'update'), ...grants('contact', 'read', 'archive')];
  const role = await roleFor(h, system, actor, permissions, 'Sales editor');
  const company = await call(h, actor, '/api/companies', 'POST', { name: 'Editable' }, 201);
  await call(h, actor, `/api/companies/${company.id}`, 'PATCH', { name: 'Changed' });
  await call(h, actor, `/api/companies/${company.id}`, 'DELETE', undefined, 403);
  const contact = await call(h, system, '/api/contacts', 'POST', { firstName: 'Archivable' }, 201);
  await call(h, actor, `/api/contacts/${contact.id}`, 'DELETE');
  await call(h, actor, `/api/contacts/${contact.id}/restore`, 'POST', undefined, 403);
  await call(h, actor, '/api/contacts', 'POST', { firstName: 'Forbidden' }, 403);
  await call(h, actor, '/api/deals', 'GET', undefined, 403);
  await call(h, actor, '/api/fields', 'POST', { entity: 'COMPANY', label: 'Forbidden', type: 'TEXT' }, 403);
  const definition = await call(h, system, '/api/fields', 'POST', { entity: 'COMPANY', key: 'detail', label: 'Detail', type: 'TEXT' }, 201);
  await call(h, actor, `/api/fields/${definition.id}/value`, 'PUT', { entity: 'COMPANY', entityId: company.id, value: 'Allowed data entry' });
  await call(h, actor, `/api/fields/${definition.id}`, 'PATCH', { label: 'Forbidden rename' }, 403);
  const sessions = await h.binding.prepare('SELECT id FROM session WHERE user_id = ? ORDER BY id').bind(actor.user.id).all();
  const changed = await call(h, system, `/api/roles/${role.id}`, 'PATCH', { name: role.name, permissions: grants('contact', 'read'), expectedRevision: role.revision });
  assert.equal(changed.revision, role.revision + 1);
  await call(h, actor, `/api/companies/${company.id}`, 'GET', undefined, 403);
  await call(h, actor, `/api/companies/${company.id}`, 'PATCH', { name: 'Stale authority' }, 403);
  await call(h, actor, '/api/contacts');
  assert.deepEqual((await h.binding.prepare('SELECT id FROM session WHERE user_id = ? ORDER BY id').bind(actor.user.id).all()).results, sessions.results);
  const identity = await call(h, actor, '/api/account');
  assert.deepEqual(identity.permissions, grants('contact', 'read'));
  await call(h, system, `/api/members/${actor.user.id}`, 'PATCH', { action: 'change-role', roleId: null, expectedRevision: identity.membershipRevision });
  assert.equal((await call(h, actor, '/api/account')).role, null);
  await call(h, actor, '/api/contacts', 'GET', undefined, 403);
});

test('role management enforces revisions, read dependencies, protected system and assigned-role deletion', async t => {
  const h = await createAuthHarness(t), system = await h.signupSystem(), actor = await h.signupVerified();
  await call(h, actor, '/api/roles', 'POST', { name: 'Escalation' }, 403);
  await call(h, system, '/api/roles', 'POST', { name: 'No read', permissions: grants('company', 'update') }, 400);
  await call(h, system, '/api/roles', 'POST', { name: 'Unknown', permissions: grants('company', 'delete') }, 400);
  const role = await roleFor(h, system, actor, grants('company', 'read'));
  await call(h, system, `/api/roles/${role.id}`, 'PATCH', { name: role.name, permissions: [], expectedRevision: role.revision + 1 }, 409);
  await call(h, system, `/api/roles/${role.id}`, 'DELETE', { expectedRevision: role.revision }, 409);
  await call(h, system, '/api/roles/system', 'PATCH', { name: 'Reduced', permissions: [], expectedRevision: 0 }, 409);
  await call(h, system, '/api/roles/system', 'DELETE', { expectedRevision: 0 }, 409);
  await call(h, system, `/api/members/${system.user.id}`, 'PATCH', { action: 'change-role', roleId: null, expectedRevision: 0 }, 409);
  const identity = await call(h, actor, '/api/account');
  await call(h, system, `/api/members/${actor.user.id}`, 'PATCH', { action: 'change-role', roleId: null, expectedRevision: identity.membershipRevision });
  await call(h, system, `/api/roles/${role.id}`, 'DELETE', { expectedRevision: role.revision }, 204);
  assert.equal(await h.binding.prepare('SELECT id FROM roles WHERE id = ?').bind(role.id).first(), null);
});

test('hidden related entities cannot leak through details, mutation returns, lists, search, facets or stats', async t => {
  const h = await createAuthHarness(t), system = await h.signupSystem(), actor = await h.signupVerified();
  const secretCompany = await call(h, system, '/api/companies', 'POST', { name: 'Confidential employer' }, 201);
  const contact = await call(h, system, '/api/contacts', 'POST', { firstName: 'Visible contact', companyId: secretCompany.id }, 201);
  const deal = await call(h, system, '/api/deals', 'POST', { name: 'Visible deal', companyId: secretCompany.id, ownerId: system.user.id }, 201);
  await call(h, system, `/api/deals/${deal.id}/contacts`, 'POST', { contactId: contact.id }, 201);
  await roleFor(h, system, actor, [...grants('contact', 'read', 'update', 'archive', 'restore'), ...grants('deal', 'read', 'update')]);
  const assertNoCompany = value => {
    const json = JSON.stringify(value);
    assert.ok(!json.includes(secretCompany.id), 'Hidden company ID must be omitted');
    assert.ok(!json.includes(secretCompany.name), 'Hidden company name must be omitted');
  };
  for (const path of [`/api/contacts/${contact.id}`, `/api/deals/${deal.id}`, '/api/contacts?includeSummary=true', '/api/deals?includeSummary=true']) assertNoCompany(await call(h, actor, path));
  for (const [path, method, body] of [
    [`/api/contacts/${contact.id}`, 'PATCH', { firstName: 'Updated visible contact' }],
    [`/api/contacts/${contact.id}`, 'PATCH', {}],
    [`/api/contacts/${contact.id}`, 'DELETE'],
    [`/api/contacts/${contact.id}`, 'DELETE'],
    [`/api/contacts/${contact.id}/restore`, 'POST'],
    [`/api/deals/${deal.id}`, 'PATCH', {}],
  ]) assertNoCompany(await call(h, actor, path, method, body));
  const searched = await call(h, actor, '/api/deals?search=Confidential');
  assert.deepEqual(searched, []);
  for (const path of ['/api/deals?sort=company', '/api/contacts/facets?facet=company', `/api/contacts?companyId=${secretCompany.id}`]) await call(h, actor, path, 'GET', undefined, 403);
  const stats = await call(h, actor, '/api/stats');
  assert.equal(stats.totalCompanies, null);
  assert.equal(stats.activitiesThisWeek, null);
  assert.equal(stats.totalContacts, 1);
  assertNoCompany(stats);
});

test('activity scope filters every linked entity before pagination/counts and guards inferred company links', async t => {
  const h = await createAuthHarness(t), system = await h.signupSystem(), actor = await h.signupVerified();
  const company = await call(h, system, '/api/companies', 'POST', { name: 'Secret company' }, 201);
  const linkedContact = await call(h, system, '/api/contacts', 'POST', { firstName: 'Linked contact', companyId: company.id }, 201);
  const unlinkedContact = await call(h, system, '/api/contacts', 'POST', { firstName: 'Standalone contact' }, 201);
  const hidden = await call(h, system, '/api/activities', 'POST', { type: 'TASK', subject: 'Secret task', contactId: linkedContact.id }, 201);
  const visible = await call(h, system, '/api/activities', 'POST', { type: 'TASK', subject: 'Visible task', contactId: unlinkedContact.id }, 201);
  await roleFor(h, system, actor, [...grants('contact', 'read'), ...grants('activity', 'read', 'create', 'complete', 'delete')]);
  const response = await h.request('/api/activities?limit=1&includeLinks=true', { cookie: actor.cookie });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-total-count'), '1');
  const rows = await response.json();
  assert.deepEqual(rows.map(row => row.id), [visible.id]);
  assert.ok(!JSON.stringify(rows).includes(company.id));
  assert.equal((await call(h, actor, '/api/activities/counts')).all, 1);
  for (const [method, path, body] of [['GET', `/api/activities/${hidden.id}`], ['POST', `/api/activities/${hidden.id}/complete`, { completed: true }], ['DELETE', `/api/activities/${hidden.id}`]]) await call(h, actor, path, method, body, 404);
  await call(h, actor, '/api/activities', 'POST', { type: 'NOTE', body: 'Must not create inferred link', contactId: linkedContact.id }, 403);
  assert.equal((await h.binding.prepare('SELECT count(*) AS n FROM activities').first()).n, 2);
  await call(h, actor, `/api/activities/${visible.id}/complete`, 'POST', { completed: true });
  await call(h, actor, `/api/activities/${visible.id}`, 'DELETE', undefined, 204);
  assert.equal(await h.binding.prepare('SELECT id FROM activities WHERE id = ?').bind(visible.id).first(), null);
  assert.ok(await h.binding.prepare('SELECT id FROM activities WHERE id = ?').bind(hidden.id).first());
  const deal = await call(h, system, '/api/deals', 'POST', { name: 'Hidden activity deal', companyId: company.id, ownerId: system.user.id }, 201);
  await call(h, system, '/api/activities', 'POST', { type: 'NOTE', body: 'Hidden deal activity', dealId: deal.id }, 201);
  for (const body of ['Company note one', 'Company note two']) await call(h, system, '/api/activities', 'POST', { type: 'NOTE', body, companyId: company.id }, 201);
  await roleFor(h, system, actor, [...grants('company', 'read'), ...grants('activity', 'read')]);
  const scopedStats = await call(h, actor, '/api/stats');
  assert.equal(scopedStats.activitiesThisWeek, 2, 'Visible company-only activities count; links to hidden contacts or deals do not');
  assert.equal(scopedStats.totalContacts, null);
  assert.equal(scopedStats.totalDeals, null);
  assert.equal((await call(h, actor, '/api/activities/counts')).all, 2);
  await roleFor(h, system, actor, grants('company', 'read'));
  assert.equal((await call(h, actor, '/api/stats')).activitiesThisWeek, null, 'Missing activity read is unavailable, not zero');
});
