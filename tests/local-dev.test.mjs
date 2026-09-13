import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { assertConfigurationParity, migrationCompatibility, parseArguments, parseConfiguration } from '../scripts/d1-migrations.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);
const { env: environment } = process;
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

test('real local runner backs up before upgrading, shares built state, and aborts on backup failure', { timeout: 120000 }, async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'worker-crm-local-dev-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const project = join(directory, 'project');
  const home = join(directory, 'home');
  await mkdir(join(project, 'scripts'), { recursive: true });
  await mkdir(join(project, 'migrations'));
  await mkdir(join(project, 'dist/server'), { recursive: true });
  await mkdir(home);
  await copyFile(join(root, 'scripts/d1-migrations.mjs'), join(project, 'scripts/d1-migrations.mjs'));
  await symlink(join(root, 'node_modules'), join(project, 'node_modules'), 'dir');
  await writeFile(join(project, 'wrangler.jsonc'), JSON.stringify(configuration));
  await writeFile(join(project, 'dist/server/wrangler.json'), JSON.stringify({ ...configuration, d1_databases: [{ ...configuration.d1_databases[0], migrations_dir: '../../migrations' }] }));
  await writeFile(join(project, 'migrations/0000_initial_schema.sql'), "CREATE TABLE companies(id TEXT PRIMARY KEY, name TEXT); INSERT INTO companies VALUES('fixture-id','preserved-fixture');");
  const run = (args, selectedHome = home) => execute(process.execPath, [join(project, 'scripts/d1-migrations.mjs'), ...args], {
    cwd: directory, env: { ...environment, HOME: selectedHome, CI: 'true', WRANGLER_SEND_METRICS: 'false' }, maxBuffer: 1024 * 1024,
  });
  const inspect = JSON.parse((await run([])).stdout);
  assert.equal(inspect.persistence, join(project, '.wrangler/state'));
  assert.equal(inspect.pending.length, 1);
  assert.match((await run(['--apply'])).stdout, /0 pending/);
  const backupRoot = join(home, '.worker-crm/backups');
  const firstBackups = await readdir(backupRoot);
  assert.equal(firstBackups.length, 1);
  await writeFile(join(project, 'migrations/0001_auth_membership.sql'), 'CREATE TABLE rate_limit(id TEXT PRIMARY KEY);');
  const upgraded = await run(['--apply', '--built']);
  assert.match(upgraded.stdout, /0 pending/);
  assert.doesNotMatch(upgraded.stdout, /preserved-fixture|INSERT INTO/);
  const backups = await readdir(backupRoot);
  assert.equal(backups.length, 2);
  const backup = join(backupRoot, backups.find(name => !firstBackups.includes(name)), 'database.sql');
  const exportSql = await readFile(backup, 'utf8');
  assert.match(exportSql, /preserved-fixture/);
  assert.doesNotMatch(exportSql, /CREATE TABLE.*rate_limit/);
  assert.equal((await stat(backup)).mode & 0o777, 0o600);
  assert.equal((await stat(dirname(backup))).mode & 0o777, 0o700);
  assert.equal((await stat(backupRoot)).mode & 0o777, 0o700);
  assert.deepEqual(JSON.parse((await run([])).stdout).pending, []);
  await run(['--apply']);
  assert.equal((await readdir(backupRoot)).length, 2);

  await writeFile(join(project, 'migrations/0002_later.sql'), 'CREATE TABLE later(id TEXT);');
  const blockedHome = join(directory, 'blocked-home');
  await mkdir(blockedHome);
  await writeFile(join(blockedHome, '.worker-crm'), 'not a directory');
  await assert.rejects(run(['--apply'], blockedHome), error => {
    assert.match(error.stderr, /backup failed.*No migrations were applied/);
    return true;
  });
  assert.deepEqual(JSON.parse((await run([])).stdout).pending, ['0002_later.sql']);
});
