import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { createAuthHarness } from './auth-harness.mjs';
import { authTables, businessTables, migrationNames, snapshot, seedBusiness, seedAuthHistory, assertPopulatedBusiness, createMigrationProject } from './upgrade-preservation-harness.mjs';

const preservedTables = [...businessTables, ...authTables, 'd1_migrations'];

async function assertAccess(h, identities) {
  for (const identity of [identities.owner, identities.member]) {
    assert.equal((await h.request('/api/companies', { cookie: identity.cookie })).status, 200);
  }
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
