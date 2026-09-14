import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { createAuthHarness } from './auth-harness.mjs';
import { authTables, businessTables, migrationNames, snapshot, seedBusiness, seedAuthHistory, assertPopulatedBusiness, createMigrationProject } from './upgrade-preservation-harness.mjs';

const preservedTables = [...businessTables, ...authTables, 'd1_migrations'];

async function assertAccess(h, identities) {
  assert.equal((await h.request('/api/companies', { cookie: identities.owner.cookie })).status, 200);
  assert.equal((await h.request('/api/companies', { cookie: identities.member.cookie })).status, 403);
  assert.equal((await h.request('/api/account', { cookie: identities.member.cookie })).status, 200);
  assert.equal((await h.request('/api/companies', { cookie: identities.invalidCookie })).status, 401);
}

test('populated baseline upgrades preserve all business data and restore the actual guarded export', { timeout: 180000 }, async t => {
  const h = await createAuthHarness(t, { migrate: false });
  const names = await migrationNames();
  const project = await createMigrationProject(t, { harness: h, names: names.slice(0, 1) });
  await project.run(['--apply']);
  await project.backup('before-historical-fixtures');
  await seedBusiness(h.binding);
  const before = await snapshot(h.binding, [...businessTables, 'd1_migrations']);
  assertPopulatedBusiness(before);
  const backupsBefore = await readdir(project.backupRoot);
  for (const name of names.slice(1)) await project.addMigration(name);
  await project.run(['--apply', '--built']);
  assert.deepEqual(await snapshot(h.binding), Object.fromEntries(businessTables.map(table => [table, before[table]])));
  assert.equal((await h.binding.prepare('SELECT COUNT(*) AS count FROM user').first()).count, 0);
  assert.equal((await h.binding.prepare('SELECT COUNT(*) AS count FROM singleton_membership').first()).count, 0);
  assert.equal((await h.binding.prepare('SELECT owner_user_id FROM singleton_workspace').first()).owner_user_id, null);
  for (const table of businessTables) {
    const keys = (await h.binding.prepare(`PRAGMA foreign_key_list(${table})`).all()).results;
    assert.ok(keys.every(key => !['user', 'singleton_membership'].includes(key.table)));
  }
  const backups = (await readdir(project.backupRoot)).filter(name => !backupsBefore.includes(name));
  assert.equal(backups.length, 1);
  const backup = join(project.backupRoot, backups[0], 'database.sql');
  assert.match(await readFile(backup, 'utf8'), /legacy-deal/);
  const restored = await createMigrationProject(t);
  await restored.restore(backup);
  assert.deepEqual(await restored.snapshot([...businessTables, 'd1_migrations']), before);
  // A baseline copy may acquire accounts normally after the additive auth upgrade.
  const identities = await seedAuthHistory(h);
  const current = await snapshot(h.binding, preservedTables);
  await project.run(['--apply']);
  assert.deepEqual(await snapshot(h.binding, preservedTables), current);
  await assertAccess(h, identities);
});

test('fresh all-migration database retains populated auth history and exact business data on repeat apply', { timeout: 120000 }, async t => {
  const h = await createAuthHarness(t, { migrate: false });
  const project = await createMigrationProject(t, { harness: h });
  await project.run(['--apply']);
  await project.backup('before-historical-fixtures');
  await seedBusiness(h.binding);
  const identities = await seedAuthHistory(h);
  const before = await snapshot(h.binding, preservedTables);
  assertPopulatedBusiness(before);
  assert.deepEqual(before.d1_migrations.map(row => row.name), await migrationNames());
  const backups = await readdir(project.backupRoot);
  await project.run(['--apply', '--built']);
  await project.run(['--apply']);
  assert.deepEqual(await snapshot(h.binding, preservedTables), before);
  assert.deepEqual(await readdir(project.backupRoot), backups);
  await assertAccess(h, identities);
});

test('dynamic role migration preserves populated auth history while owners become system and members become roleless', async t => {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdtemp, copyFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const directory = await mkdtemp(join(tmpdir(), 'rbac-upgrade-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'before.sqlite');
  let db = new DatabaseSync(path);
  try {
    const names = await migrationNames();
    for (const name of names.filter(name => name < '0002')) db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
    for (const id of ['owner', 'member', 'revoked']) db.prepare('INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)').run(id, id, `${id}@example.test`);
    db.exec("UPDATE singleton_workspace SET owner_user_id = 'owner'");
    for (const [id, role, status, revision, accessVersion] of [['owner', 'owner', 'active', 3, 4], ['member', 'member', 'active', 8, 7], ['revoked', 'member', 'revoked', 6, 5]]) {
      db.prepare('INSERT INTO singleton_membership(user_id,role,status,revision,access_version,created_at,updated_at,revoked_at) VALUES(?,?,?,?,?,1000,2000,?)').run(id, role, status, revision, accessVersion, status === 'revoked' ? 2000 : null);
    }
    db.prepare('INSERT INTO session(id,token,user_id,access_version,expires_at,updated_at) VALUES(?,?,?,?,?,2000)').run('retained-session','retained-token','member',7,Date.now()+3600000);
    db.exec("INSERT INTO companies(id,name,owner_id) VALUES('retained-company','Retained','member')");
    const memberships = db.prepare('SELECT * FROM singleton_membership ORDER BY user_id').all();
    const session = db.prepare('SELECT * FROM session').get();
    const company = db.prepare('SELECT * FROM companies').get();
    db.close();
    await copyFile(path, join(directory, 'backup.sqlite'));
    db = new DatabaseSync(path);
    for (const name of names.filter(name => name >= '0002')) db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
    assert.deepEqual(db.prepare('SELECT * FROM singleton_membership ORDER BY user_id').all().map(row => ({ ...row })), memberships.map(({ role, ...row }) => ({ ...row, role_id: role === 'owner' ? 'system' : null })));
    assert.deepEqual(db.prepare('SELECT * FROM session').get(), session);
    assert.deepEqual(db.prepare('SELECT * FROM companies').get(), company);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('SELECT count(*) AS n FROM roles').get().n, 1);
    assert.throws(() => db.exec("UPDATE singleton_membership SET role_id = NULL WHERE user_id = 'owner'"), /last_active_system/);
    const backup = new DatabaseSync(join(directory, 'backup.sqlite'), { readOnly: true });
    try { assert.deepEqual(backup.prepare('SELECT * FROM singleton_membership ORDER BY user_id').all(), memberships); }
    finally { backup.close(); }
  } finally { db.close(); }
});
