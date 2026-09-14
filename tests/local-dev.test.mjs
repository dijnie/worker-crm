import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { assertConfigurationParity, migrationCompatibility, parseArguments, parseConfiguration } from '../scripts/d1-migrations.mjs';

import { createAuthHarness } from './auth-harness.mjs';
import { authTables, businessTables, snapshot, seedBusiness, seedAuthHistory, assertPopulatedBusiness, createMigrationProject } from './upgrade-preservation-harness.mjs';

const history = ['0000_initial_schema.sql', '0001_auth_membership.sql'];
const configuration = { name: 'local-test', d1_databases: [{ binding: 'DB', database_name: 'local-test', database_id: '00000000-0000-0000-0000-000000000001', migrations_dir: 'migrations' }] };

test('arguments default to inspection and reject remote or alternate persistence', () => {
  assert.deepEqual(parseArguments([]), { apply: false, built: false });
  assert.deepEqual(parseArguments(['--built', '--apply']), { apply: true, built: true });
  for (const args of [['--remote'], ['--persist-to', '/tmp/state'], ['--apply', '--apply'], ['--target', 'local']]) {
    assert.throws(() => parseArguments(args));
  }
});

test('history must be an exact prefix, including baseline filename and order', () => {
  for (const ledger of [['0000_legacy.sql'], [history[1]], [...history, '0002_unknown.sql'], [history[0], history[0]]]) {
    assert.equal(migrationCompatibility(history, ledger, ['d1_migrations']).safeToApply, false);
  }
  assert.deepEqual(migrationCompatibility(history, [history[0]], ['d1_migrations', 'companies']), { safeToApply: true, pending: [history[1]] });
  assert.deepEqual(migrationCompatibility(history, history, ['d1_migrations', 'companies']), { safeToApply: true, pending: [] });
});

test('populated schema without applied ledger is refused, internal tables are ignored', () => {
  assert.equal(migrationCompatibility(history, [], ['companies']).safeToApply, false);
  assert.equal(migrationCompatibility(history, [], ['d1_migrations', 'companies']).safeToApply, false);
  assert.deepEqual(migrationCompatibility(history, [], ['_cf_KV', '_cf_METADATA', 'sqlite_sequence']), { safeToApply: true, pending: history });
});

test('configuration requires explicit binding and migration authority', () => {
  assert.equal(parseConfiguration(JSON.stringify(configuration)).database.binding, 'DB');
  assert.equal(parseConfiguration('{ // comment\n "name":"test", "d1_databases":[{"binding":"DB","database_id":"id","migrations_dir":"migrations",}],}').worker, 'test');
  for (const patch of [{ database_id: '' }, { migrations_dir: '' }, { migrations_table: 'custom' }, { migrations_pattern: '*.sql' }]) {
    assert.throws(() => parseConfiguration(JSON.stringify({ ...configuration, d1_databases: [{ ...configuration.d1_databases[0], ...patch }] })));
  }
  assert.throws(() => parseConfiguration('{invalid}'));
  assert.throws(() => parseConfiguration(JSON.stringify({ ...configuration, env: { preview: {} } })));
  assert.throws(() => parseConfiguration(JSON.stringify({ ...configuration, d1_databases: [] })));
});

test('built worker must match source worker, database and migration filenames', () => {
  const source = parseConfiguration(JSON.stringify(configuration));
  assert.doesNotThrow(() => assertConfigurationParity(source, source, history, history));
  assert.throws(() => assertConfigurationParity(source, { ...source, worker: 'other' }, history, history), /Rebuild/);
  assert.throws(() => assertConfigurationParity(source, { ...source, database: { ...source.database, database_id: 'other' } }, history, history), /Rebuild/);
  assert.throws(() => assertConfigurationParity(source, source, history, history.slice(0, 1)), /Rebuild/);
});

test('real runner exports and restores populated auth, rolls back failed migrations, and aborts when backup fails', { timeout: 180000 }, async t => {
  const h = await createAuthHarness(t, { migrate: false });
  const project = await createMigrationProject(t, { harness: h });
  await project.run(['--apply']);
  await project.backup('before-historical-fixtures');
  await seedBusiness(h.binding);
  const identities = await seedAuthHistory(h);
  const tables = [...businessTables, ...authTables, 'd1_migrations'];
  const before = await snapshot(h.binding, tables);
  assertPopulatedBusiness(before);
  const initialBackups = await readdir(project.backupRoot);
  const pendingName = '9999_guarded_runner_probe.sql';
  const migration = join(project.project, 'migrations', pendingName);
  await writeFile(migration, "CREATE TABLE upgrade_probe(id TEXT PRIMARY KEY); INSERT INTO upgrade_probe VALUES('must-roll-back'); INSERT INTO missing_table VALUES('failure');");
  await assert.rejects(project.run(['--apply']), error => {
    assert.match(error.stderr, /migration apply failed.*withheld/);
    assert.doesNotMatch(error.stderr, /must-roll-back|INSERT INTO/);
    return true;
  });
  assert.deepEqual(await snapshot(h.binding, tables), before);
  assert.equal(await h.binding.prepare("SELECT name FROM sqlite_schema WHERE name='upgrade_probe'").first(), null);
  assert.deepEqual(JSON.parse((await project.run()).stdout).pending, [pendingName]);
  const createdBackups = (await readdir(project.backupRoot)).filter(name => !initialBackups.includes(name));
  assert.equal(createdBackups.length, 1);
  const backup = join(project.backupRoot, createdBackups[0], 'database.sql');
  const sql = await readFile(backup, 'utf8');
  assert.match(sql, /legacy-deal/);
  assert.match(sql, /CREATE TABLE.*session/);
  assert.doesNotMatch(sql, /CREATE TABLE.*upgrade_probe/);
  assert.equal((await stat(backup)).mode & 0o777, 0o600);
  assert.equal((await stat(dirname(backup))).mode & 0o777, 0o700);
  assert.equal((await stat(project.backupRoot)).mode & 0o777, 0o700);
  const restored = await createMigrationProject(t);
  await restored.restore(backup);
  assert.deepEqual(await restored.snapshot(tables), before);

  const blockedHome = join(project.directory, 'blocked-home');
  await mkdir(blockedHome);
  await writeFile(join(blockedHome, '.worker-crm'), 'not a directory');
  // Correct only the disposable test migration, after proving its failed batch rolled back.
  await writeFile(migration, 'CREATE TABLE upgrade_probe(id TEXT PRIMARY KEY);');
  await assert.rejects(project.run(['--apply'], blockedHome), error => {
    assert.match(error.stderr, /backup failed.*No migrations were applied/);
    return true;
  });
  assert.deepEqual(await snapshot(h.binding, tables), before);
  assert.equal(await h.binding.prepare("SELECT name FROM sqlite_schema WHERE name='upgrade_probe'").first(), null);
  assert.deepEqual(JSON.parse((await project.run()).stdout).pending, [pendingName]);
  const upgraded = await project.run(['--apply', '--built']);
  assert.match(upgraded.stdout, /0 pending/);
  assert.doesNotMatch(upgraded.stdout, /legacy-deal|INSERT INTO|session_token/);
  assert.deepEqual(await snapshot(h.binding, [...businessTables, ...authTables]), Object.fromEntries([...businessTables, ...authTables].map(table => [table, before[table]])));
  const ledger = (await snapshot(h.binding, ['d1_migrations'])).d1_migrations;
  assert.deepEqual(ledger.slice(0, -1), before.d1_migrations);
  assert.equal(ledger.at(-1).name, pendingName);
  const after = await snapshot(h.binding, tables);
  const backupsAfter = await readdir(project.backupRoot);
  assert.equal(backupsAfter.length, initialBackups.length + 2);
  await project.run(['--apply']);
  assert.deepEqual(await snapshot(h.binding, tables), after);
  assert.deepEqual(await readdir(project.backupRoot), backupsAfter);
  assert.equal((await h.request('/api/companies', { cookie: identities.owner.cookie })).status, 200);
  assert.equal((await h.request('/api/companies', { cookie: identities.member.cookie })).status, 200);
  assert.equal((await h.request('/api/companies', { cookie: identities.invalidCookie })).status, 401);
});
