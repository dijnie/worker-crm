import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness } from './service-harness.mjs';

const status = expected => error => error.status === expected;
const invalid = error => error.name === 'ZodError';
const databaseError = message => error => {
  for (let cause = error; cause; cause = cause.cause) {
    if (cause.message?.includes(message)) return true;
  }
  return false;
};

async function fixture(context, ids = ['owner', 'member', 'other']) {
  const h = await createHarness(context);
  const now = new Date();
  // Service identity fixtures only; auth.test.mjs proves actual verification links.
  await h.db.insert(h.schema.user).values(ids.map(id => ({
    id, name: id, email: `${id}@example.test`, emailVerified: true, createdAt: now, updatedAt: now,
  })));
  const systemRoleId = (await h.binding.prepare('SELECT id FROM roles WHERE is_system = 1').first()).id;
  return { ...h, systemRoleId, service: new h.MemberService(h.db) };
}

async function admit(h, ...ids) {
  for (const id of ids) await h.reconcileSingletonMembership(h.db, id);
  if (ids.includes('owner')) await h.db.update(h.schema.singletonMembership).set({ roleId: h.systemRoleId }).where(h.eq(h.schema.singletonMembership.userId, 'owner'));
}

async function issue(h, userId, accessVersion = 0) {
  const id = crypto.randomUUID();
  await h.db.insert(h.schema.session).values({ id, token: crypto.randomUUID(), userId, accessVersion,
    createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
  return id;
}

async function sessions(h, userId) {
  return h.db.select().from(h.schema.session).where(h.eq(h.schema.session.userId, userId));
}

// Delay dispatch, then execute the real D1 batch after another real mutation commits.
function beforeBatch(h, intervene) {
  return new Proxy(h.db, { get(target, property) {
    if (property === 'batch') return async statements => { await intervene(); return target.batch(statements); };
    const value = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}

test('concurrent verified admission stays roleless and idempotent, including the first account', async context => {
  const h = await fixture(context, ['first', 'second', 'third', 'unverified']);
  await h.db.update(h.schema.user).set({ emailVerified: false }).where(h.eq(h.schema.user.id, 'unverified'));
  await assert.rejects(h.reconcileSingletonMembership(h.db, 'unverified'), status(403));
  assert.equal(await h.service.getMembership('unverified'), undefined);
  const admitted = await Promise.all(['first', 'second', 'third'].map(id => h.reconcileSingletonMembership(h.db, id)));
  assert.ok(admitted.every(row => row.roleId === null));
  const initial = await h.service.getMembership('second');
  await Promise.all(Array.from({ length: 5 }, () => h.reconcileSingletonMembership(h.db, 'second')));
  assert.deepEqual(await h.service.getMembership('second'), initial);
  await h.db.update(h.schema.singletonMembership).set({ roleId: h.systemRoleId }).where(h.eq(h.schema.singletonMembership.userId, 'first'));
  await h.service.revoke('first', 'second', 0);
  await assert.rejects(h.reconcileSingletonMembership(h.db, 'second'), status(403));
  assert.equal((await h.service.getMembership('second')).status, 'revoked');
});

test('system administration returns safe paginated records and rejects invalid, unknown, and stale changes', async context => {
  const h = await fixture(context);
  await admit(h, 'owner', 'member', 'other');
  const page = await h.service.list('owner', { limit: 2 });
  assert.equal(page.total, 3);
  assert.equal(page.items.length, 2);
  assert.equal((await h.service.list('owner', { page: 2, limit: 2 })).items.length, 1);
  assert.deepEqual(Object.keys(page.items[0]).sort(), ['id', 'name', 'email', 'roleId', 'role', 'status', 'revision', 'createdAt', 'updatedAt', 'revokedAt'].sort());
  assert.match(page.items[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
  for (const input of [{ archived: true }, { actorId: 'owner' }, { page: 0 }, { status: 'unknown' }, { limit: 101 }]) {
    await assert.rejects(h.service.list('owner', input), invalid);
  }
  for (const input of [{ action: 'restore', expectedRevision: -1 }, { action: 'revoke', expectedRevision: 0, actorId: 'owner' },
    { action: 'change-role', role: 'admin', expectedRevision: 0 }, { action: 'restore', expectedRevision: 0.5 }]) {
    assert.equal(h.memberMutationInput.safeParse(input).success, false);
  }
  await assert.rejects(h.service.list('member'), status(403));
  await assert.rejects(h.service.changeRole('member', 'other', 0, h.systemRoleId), status(403));
  await assert.rejects(h.service.revoke('owner', 'missing', 0), status(404));
  await assert.rejects(h.service.restore('owner', 'member', 0), status(409));
  await assert.rejects(h.service.changeRole('owner', 'member', 0, null), status(409));
  assert.equal((await h.service.changeRole('owner', 'member', 0, h.systemRoleId)).revision, 1);
  await assert.rejects(h.service.revoke('owner', 'member', 0), status(409));
});

test('revoke and restore invalidate sessions, restore roleless, fence delayed issuance, and preserve business data', async context => {
  const h = await fixture(context);
  await admit(h, 'owner', 'member', 'other');
  const company = await new h.CompanyService(h.db).create({ name: 'Legacy', ownerId: 'member' });
  await h.db.insert(h.schema.activities).values({ id: 'history', type: 'NOTE', companyId: company.id, createdById: 'member' });
  const beforeCompanies = await h.db.select().from(h.schema.companies);
  const beforeActivities = await h.db.select().from(h.schema.activities);
  await h.service.changeRole('owner', 'member', 0, h.systemRoleId);
  await issue(h, 'member');
  await issue(h, 'member');
  const otherSession = await issue(h, 'other');
  const revoked = await h.service.revoke('owner', 'member', 1);
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.revision, 2);
  assert.ok(revoked.revokedAt);
  assert.equal((await h.service.getMembership('member')).accessVersion, 1);
  assert.deepEqual(await sessions(h, 'member'), []);
  assert.equal((await sessions(h, 'other'))[0].id, otherSession);
  assert.equal((await h.service.list('owner', { status: 'revoked' })).total, 1);
  await assert.rejects(h.service.revoke('owner', 'member', 2), status(409));
  await assert.rejects(issue(h, 'member', 0), databaseError('auth_session_access_denied'));
  const restored = await h.service.restore('owner', 'member', 2);
  assert.equal(restored.roleId, null);
  assert.equal(restored.role, null);
  assert.equal(restored.status, 'active');
  assert.equal(restored.revision, 3);
  assert.equal(restored.revokedAt, null);
  assert.equal((await h.service.getMembership('member')).accessVersion, 2);
  await assert.rejects(issue(h, 'member', 0), databaseError('auth_session_access_denied'));
  await assert.rejects(issue(h, 'member', 1), databaseError('auth_session_access_denied'));
  await issue(h, 'member', 2);
  await assert.rejects(h.service.restore('owner', 'member', 3), status(409));
  assert.equal((await sessions(h, 'member')).length, 1);
  assert.deepEqual(await h.db.select().from(h.schema.companies), beforeCompanies);
  assert.deepEqual(await h.db.select().from(h.schema.activities), beforeActivities);
});

test('actor authority is rechecked inside mutations after concurrent demotion or revocation', async context => {
  const h = await fixture(context);
  await admit(h, 'owner', 'member', 'other');
  await h.service.changeRole('owner', 'member', 0, h.systemRoleId);
  const sessionId = await issue(h, 'other');
  const delayed = new h.MemberService(beforeBatch(h, () => h.service.changeRole('member', 'owner', 0, null)));
  await assert.rejects(delayed.revoke('owner', 'other', 0), status(403));
  assert.equal((await h.service.getMembership('other')).status, 'active');
  assert.equal((await sessions(h, 'other'))[0].id, sessionId);
  const revokedActor = new h.MemberService(beforeBatch(h, () => h.service.revoke('member', 'owner', 1)));
  await assert.rejects(revokedActor.changeRole('owner', 'other', 0, h.systemRoleId), status(403));
  assert.equal((await h.service.getMembership('other')).roleId, null);
});

test('stale changes preserve newer sessions and simultaneous system removals preserve an active system', async context => {
  const h = await fixture(context);
  await admit(h, 'owner', 'member', 'other');
  const delayed = new h.MemberService(beforeBatch(h, async () => {
    await h.service.revoke('owner', 'member', 0);
    await h.service.restore('owner', 'member', 1);
    await issue(h, 'member', 2);
  }));
  await assert.rejects(delayed.revoke('owner', 'member', 0), status(409));
  assert.equal((await sessions(h, 'member')).length, 1);
  await h.service.changeRole('owner', 'member', 2, h.systemRoleId);
  const outcomes = await Promise.allSettled([
    h.service.changeRole('owner', 'owner', 0, null),
    h.service.revoke('member', 'member', 3),
  ]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.status, 409);
  const rows = await h.db.select().from(h.schema.singletonMembership);
  assert.equal(rows.filter(row => row.roleId === h.systemRoleId && row.status === 'active').length, 1);
});

test('self-revocation deletes sessions and database guards reject removal of the last system', async context => {
  const h = await fixture(context);
  await admit(h, 'owner', 'member', 'other');
  await h.service.changeRole('owner', 'member', 0, h.systemRoleId);
  await issue(h, 'owner');
  assert.equal((await h.service.revoke('owner', 'owner', 0)).status, 'revoked');
  assert.deepEqual(await sessions(h, 'owner'), []);
  await assert.rejects(h.reconcileSingletonMembership(h.db, 'owner'), status(403));
  await h.db.insert(h.schema.user).values({ id: 'later', name: 'Later', email: 'later@example.test',
    emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  assert.equal((await h.reconcileSingletonMembership(h.db, 'later')).roleId, null);
  await assert.rejects(h.service.revoke('member', 'member', 1), status(409));
  await assert.rejects(h.service.changeRole('member', 'member', 1, null), status(409));
  await assert.rejects(h.db.delete(h.schema.singletonMembership).where(h.eq(h.schema.singletonMembership.userId, 'member')), databaseError('last_active_system'));
  assert.equal((await h.service.getMembership('member')).revision, 1);
});

test('batch rollback retains membership and sessions when invalidation fails on revoke or restore', async context => {
  const h = await fixture(context);
  await admit(h, 'owner', 'member', 'other');
  const sessionId = await issue(h, 'member');
  const initial = await h.service.getMembership('member');
  await h.binding.prepare("CREATE TRIGGER fail_session_delete BEFORE DELETE ON session BEGIN SELECT RAISE(ABORT, 'injected_session_failure'); END").run();
  await assert.rejects(h.service.revoke('owner', 'member', 0), databaseError('injected_session_failure'));
  assert.deepEqual(await h.service.getMembership('member'), initial);
  assert.equal((await sessions(h, 'member'))[0].id, sessionId);
  // Model a historical lingering session retained while membership was revoked.
  await h.db.update(h.schema.singletonMembership).set({ status: 'revoked', revision: 1, accessVersion: 1, revokedAt: new Date() })
    .where(h.eq(h.schema.singletonMembership.userId, 'member'));
  const revoked = await h.service.getMembership('member');
  await assert.rejects(h.service.restore('owner', 'member', 1), databaseError('injected_session_failure'));
  assert.deepEqual(await h.service.getMembership('member'), revoked);
  assert.equal((await sessions(h, 'member'))[0].id, sessionId);
  await h.binding.prepare('DROP TRIGGER fail_session_delete').run();
  await h.service.restore('owner', 'member', 1);
  assert.deepEqual(await sessions(h, 'member'), []);
});

test('failed admission rolls back the roleless admission; sessions reject unadmitted or unverified identities', async context => {
  const h = await fixture(context);
  await h.binding.prepare("CREATE TRIGGER fail_membership_insert BEFORE INSERT ON singleton_membership BEGIN SELECT RAISE(ABORT, 'injected_admission_failure'); END").run();
  await assert.rejects(h.reconcileSingletonMembership(h.db, 'owner'), databaseError('injected_admission_failure'));
  assert.equal(await h.service.getMembership('owner'), undefined);
  await h.binding.prepare('DROP TRIGGER fail_membership_insert').run();
  await assert.rejects(issue(h, 'owner'), databaseError('auth_session_access_denied'));
  await admit(h, 'owner');
  await h.db.update(h.schema.user).set({ emailVerified: false }).where(h.eq(h.schema.user.id, 'owner'));
  await assert.rejects(issue(h, 'owner'), databaseError('auth_session_access_denied'));
  await assert.rejects(h.reconcileSingletonMembership(h.db, 'owner'), status(403));
});
