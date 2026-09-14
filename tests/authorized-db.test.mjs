import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness } from './service-harness.mjs';

async function fixture(t) {
  const h = await createHarness(t), now = new Date();
  await h.db.insert(h.schema.user).values({ id: 'actor', name: 'Actor', email: 'actor@example.test', emailVerified: true, createdAt: now, updatedAt: now });
  await h.reconcileSingletonMembership(h.db, 'actor');
  await h.db.insert(h.schema.roles).values({ id: 'editor', name: 'Editor', createdAt: now, updatedAt: now });
  await h.db.insert(h.schema.rolePermissions).values(['read', 'create', 'update'].map(action => ({ roleId: 'editor', entity: 'company', action })));
  await h.db.update(h.schema.singletonMembership).set({ roleId: 'editor' }).where(h.eq(h.schema.singletonMembership.userId, 'actor'));
  await h.db.insert(h.schema.session).values({ id: 'session', token: 'test-session', userId: 'actor', accessVersion: 0, createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 3600000) });
  await new h.CompanyService(h.db).create({ name: 'Original' });
  const actor = { userId: 'actor', sessionId: 'session', accessVersion: 0, membershipRevision: 0, roleId: 'editor', roleRevision: 0 };
  return { ...h, actor };
}
const forbidden = error => {
  for (let cause = error; cause; cause = cause.cause) if (cause.status === 403) return true;
  return false;
};
function beforeBatch(binding, intervene) {
  let pending = true;
  return new Proxy(binding, { get(target, key) {
    if (key === 'batch') return async statements => { if (pending) { pending = false; await intervene(); } return target.batch(statements); };
    const value = Reflect.get(target, key);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}

test('authorized D1 preserves standalone, relational, raw and batch results without accumulating guard rows', async t => {
  const h = await fixture(t);
  const db = h.createAuthorizedDatabase(h.binding, h.actor, [{ entity: 'company', action: 'create' }]);
  const created = await new h.CompanyService(db).create({ name: 'Authorized' });
  assert.equal(created.name, 'Authorized');
  assert.equal((await db.query.companies.findFirst({ where: h.eq(h.schema.companies.id, created.id) })).name, 'Authorized');
  assert.deepEqual(await db.all(h.sql`SELECT name FROM companies WHERE id = ${created.id}`), [{ name: 'Authorized' }]);
  const contact = await new h.ContactService(h.db).create({ firstName: 'Distinct contact', companyId: created.id });
  const joined = await db.select({ company: h.schema.companies, contact: h.schema.contacts }).from(h.schema.companies).innerJoin(h.schema.contacts, h.eq(h.schema.companies.id, h.schema.contacts.companyId));
  assert.equal(joined[0].company.id, created.id);
  assert.equal(joined[0].contact.id, contact.id);
  assert.equal(joined[0].company.name, 'Authorized');
  assert.equal(joined[0].contact.firstName, 'Distinct contact');
  const [batchedJoin] = await db.batch([db.select({ company: h.schema.companies, contact: h.schema.contacts }).from(h.schema.companies).innerJoin(h.schema.contacts, h.eq(h.schema.companies.id, h.schema.contacts.companyId))]);
  assert.deepEqual(batchedJoin, joined);
  const [rows, counts] = await db.batch([
    db.select({ name: h.schema.companies.name }).from(h.schema.companies).where(h.eq(h.schema.companies.id, created.id)),
    db.select({ total: h.count() }).from(h.schema.companies),
  ]);
  assert.deepEqual(rows, [{ name: 'Authorized' }]);
  assert.equal(counts[0].total, 2);
  assert.equal((await h.binding.prepare('SELECT count(*) AS n FROM request_authorization_guard').first()).n, 0);
});

test('a permission removal immediately before standalone execution prevents the write', async t => {
  const h = await fixture(t);
  const binding = beforeBatch(h.binding, async () => {
    await h.binding.prepare("DELETE FROM role_permissions WHERE role_id = 'editor' AND action = 'create'").run();
  });
  const db = h.createAuthorizedDatabase(binding, h.actor, [{ entity: 'company', action: 'create' }]);
  await assert.rejects(db.insert(h.schema.companies).values({ name: 'Forbidden insert' }).returning(), forbidden);
  assert.equal((await h.binding.prepare("SELECT count(*) AS n FROM companies WHERE name = 'Forbidden insert'").first()).n, 0);
});

test('live role revision change aborts every mutation in a prepared batch atomically', async t => {
  const h = await fixture(t), original = (await h.db.select().from(h.schema.companies))[0];
  const binding = beforeBatch(h.binding, async () => {
    await h.binding.prepare("UPDATE roles SET revision = revision + 1 WHERE id = 'editor'").run();
  });
  const db = h.createAuthorizedDatabase(binding, h.actor, [{ entity: 'company', action: 'update' }]);
  await assert.rejects(db.batch([
    db.update(h.schema.companies).set({ name: 'Must roll back' }).where(h.eq(h.schema.companies.id, original.id)).returning(),
    db.insert(h.schema.companies).values({ name: 'Must not appear' }).returning(),
  ]), forbidden);
  assert.deepEqual(await h.db.select().from(h.schema.companies), [original]);
});

test('membership assignment, access version, expiry and session removal fence stale standalone reads', async t => {
  const h = await fixture(t);
  const attempts = [
    ["UPDATE singleton_membership SET revision = 1 WHERE user_id = 'actor'", "UPDATE singleton_membership SET revision = 0 WHERE user_id = 'actor'"],
    ["UPDATE singleton_membership SET role_id = NULL WHERE user_id = 'actor'", "UPDATE singleton_membership SET role_id = 'editor' WHERE user_id = 'actor'"],
    ["UPDATE singleton_membership SET access_version = 1 WHERE user_id = 'actor'", "UPDATE singleton_membership SET access_version = 0 WHERE user_id = 'actor'"],
    ["UPDATE session SET expires_at = 0 WHERE id = 'session'", `UPDATE session SET expires_at = ${Date.now() + 3600000} WHERE id = 'session'`],
  ];
  for (const [change, restore] of attempts) {
    const binding = beforeBatch(h.binding, () => h.binding.prepare(change).run());
    const db = h.createAuthorizedDatabase(binding, h.actor, [{ entity: 'company', action: 'read' }]);
    await assert.rejects(db.query.companies.findMany(), forbidden);
    await h.binding.prepare(restore).run();
  }
  const binding = beforeBatch(h.binding, () => h.binding.prepare("DELETE FROM session WHERE id = 'session'").run());
  const db = h.createAuthorizedDatabase(binding, h.actor, [{ entity: 'company', action: 'read' }]);
  await assert.rejects(db.all(h.sql`SELECT name FROM companies`), forbidden);
});
