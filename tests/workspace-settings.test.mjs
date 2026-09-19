import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness } from './service-harness.mjs';

const status = expected => error => error.status === expected;
const invalid = error => error.name === 'ZodError';

async function fixture(context) {
  const h = await createHarness(context);
  const now = new Date();
  await h.db.insert(h.schema.user).values(['owner', 'member'].map(id => ({
    id, name: id, email: `${id}@example.test`, emailVerified: true, createdAt: now, updatedAt: now,
  })));
  for (const id of ['owner', 'member']) await h.reconcileSingletonMembership(h.db, id);
  const systemRoleId = (await h.binding.prepare('SELECT id FROM roles WHERE is_system = 1').first()).id;
  await h.db.update(h.schema.singletonMembership).set({ roleId: systemRoleId }).where(h.eq(h.schema.singletonMembership.userId, 'owner'));
  return { ...h, service: new h.WorkspaceService(h.db) };
}

test('a workspace starts in English and a system account can change its language', async t => {
  const h = await fixture(t);
  const initial = await h.service.get();
  assert.equal(initial.locale, 'en');

  const updated = await h.service.update('owner', { locale: 'vi', expectedRevision: initial.revision });
  assert.equal(updated.locale, 'vi');
  assert.equal(updated.reportingCurrency, initial.reportingCurrency, 'changing the language leaves the currency alone');
  assert.equal(updated.revision, initial.revision + 1);
  assert.equal((await h.service.get()).locale, 'vi');
});

test('the currency and the language change independently or together', async t => {
  const h = await fixture(t);
  const first = await h.service.update('owner', { reportingCurrency: 'jpy', expectedRevision: 0 });
  assert.deepEqual([first.reportingCurrency, first.locale], ['JPY', 'en']);
  const second = await h.service.update('owner', { reportingCurrency: 'EUR', locale: 'vi', expectedRevision: first.revision });
  assert.deepEqual([second.reportingCurrency, second.locale], ['EUR', 'vi']);
});

test('language changes keep the guards of every workspace setting', async t => {
  const h = await fixture(t);
  await assert.rejects(h.service.update('member', { locale: 'vi', expectedRevision: 0 }), status(403));
  await assert.rejects(h.service.update('owner', { expectedRevision: 0 }), status(400));
  await assert.rejects(h.service.update('owner', { locale: 'fr', expectedRevision: 0 }), invalid);
  await assert.rejects(h.service.update('owner', { locale: 'VI', expectedRevision: 0 }), invalid);
  await h.service.update('owner', { locale: 'vi', expectedRevision: 0 });
  await assert.rejects(h.service.update('owner', { locale: 'en', expectedRevision: 0 }), status(409));
  assert.equal((await h.service.get()).locale, 'vi');
});

test('the database refuses a language the interface does not have', async t => {
  const h = await fixture(t);
  await assert.rejects(h.binding.prepare("UPDATE singleton_workspace SET locale = 'fr'").run(), /CHECK constraint failed|singleton_workspace_locale_check/);
  assert.equal((await h.service.get()).locale, 'en');
});

test('the workspace keeps its protective triggers after the language column is added', async t => {
  const h = await fixture(t);
  const triggers = (await h.binding.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'singleton_workspace' ORDER BY name").all()).results.map(row => row.name);
  assert.deepEqual(triggers, ['singleton_owner_claim_immutable', 'singleton_owner_claim_verified', 'singleton_workspace_retained']);
  await assert.rejects(h.binding.prepare('DELETE FROM singleton_workspace').run(), /singleton_workspace_retained/);
});
