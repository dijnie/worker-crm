import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';

const root = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);
export const businessTables = ['companies', 'contacts', 'deals', 'deal_contacts', 'activities', 'field_definitions', 'field_options', 'field_values', 'saved_views'];
export const authTables = ['user', 'account', 'session', 'verification', 'rate_limit', 'singleton_workspace', 'singleton_membership'];
export const fieldTypes = ['TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'CHECKBOX', 'SELECT', 'URL', 'EMAIL', 'PHONE', 'USER'];
export const savedFilters = { q: 'Việt Nam\nO\'Brien', sort: 'amount', dir: 'desc', archived: 'all', filters: { currency: ['USD'], 'field:select': ['deal-option'], 'field:user': ['historical-user'] } };
export const migrationNames = async () => (await readdir(join(root, 'migrations'))).filter(name => name.endsWith('.sql')).sort();

export async function snapshot(binding, tables = businessTables) {
  const results = await binding.batch(tables.map(table => binding.prepare(`SELECT * FROM "${table}" ORDER BY rowid`)));
  return Object.fromEntries(tables.map((table, index) => [table, results[index].results]));
}

/** Synthetic historical records deliberately retain opaque identity IDs and exact values. */
export async function seedBusiness(binding) {
  const insert = async (table, row) => binding.prepare(`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).bind(...Object.values(row)).run();
  const stamps = { created_at: '2024-01-02 03:04:05', updated_at: '2024-06-07 08:09:10' };
  const archived_at = '2025-02-03 04:05:06';
  await insert('companies', { id: 'legacy-company', name: "Việt Nam O'Brien\nCompany", owner_id: 'opaque-owner', archived_at, ...stamps });
  await insert('companies', { id: 'employer', name: 'Independent employer', ...stamps });
  await insert('contacts', { id: 'legacy-contact', first_name: 'Legacy', company_id: 'employer', owner_id: 'opaque-contact-owner', archived_at, ...stamps });
  await binding.prepare('UPDATE companies SET primary_contact_id = ? WHERE id = ?').bind('legacy-contact', 'legacy-company').run();
  await insert('deals', { id: 'legacy-deal', name: 'Legacy deal', company_id: 'legacy-company', owner_id: 'opaque-deal-owner', amount: 99999999999999, currency: 'USD', base_amount: '99999999999999999999.9999', base_currency: 'VND', fx_rate: '1234567890.1234567890', expected_close_date: '2024-03-04T00:00:00.000Z', archived_at, ...stamps });
  await insert('deal_contacts', { deal_id: 'legacy-deal', contact_id: 'legacy-contact', role: "Buyer's advocate" });
  await insert('activities', { id: 'legacy-activity', type: 'NOTE', company_id: 'legacy-company', contact_id: 'legacy-contact', deal_id: 'legacy-deal', created_by_id: 'historical-creator', body: 'Retained\nactivity', meta: JSON.stringify({ nested: { reason: "O'Brien", retained: true } }), ...stamps });
  for (const entity of ['COMPANY', 'CONTACT', 'DEAL']) {
    for (const [position, type] of fieldTypes.entries()) {
      const prefix = entity.toLowerCase();
      const fieldId = `${prefix}-${type.toLowerCase()}`;
      await insert('field_definitions', { id: fieldId, entity, key: type.toLowerCase(), label: `${entity} ${type}`, type, position, agent_filled: 0, agent_brief: 'Preserved instructions', required: 1, show_on_sheet: 1, show_on_table: 1, show_on_filter: ['SELECT', 'USER'].includes(type) ? 1 : 0, archived_at, ...stamps });
      const column = ['NUMBER', 'DATE', 'CHECKBOX', 'SELECT', 'USER'].includes(type) ? { NUMBER: 'number', DATE: 'date', CHECKBOX: 'bool', SELECT: 'option_id', USER: 'user_id' }[type] : 'text';
      const value = { NUMBER: '-99999999999999999999.9999', DATE: '2024-02-29T00:00:00.000Z', CHECKBOX: 0, SELECT: `${prefix}-option`, USER: 'historical-user', URL: 'https://example.test/a?b=c', EMAIL: 'legacy@example.test', PHONE: '+84 123456789', TEXT: "O'Brien — Việt Nam", LONG_TEXT: 'Line one\nLine two' }[type];
      if (type === 'SELECT') await insert('field_options', { id: value, field_id: fieldId, label: 'Retired choice', position: 7, archived_at });
      await insert('field_values', { id: `${fieldId}-value`, field_id: fieldId, [`${prefix}_id`]: `legacy-${prefix}`, [column]: value, updated_at: stamps.updated_at });
    }
  }
  await insert('saved_views', { id: 'legacy-view', entity: 'DEAL', name: 'Historical pipeline', owner_id: 'opaque-view-owner', shared: 1, filters: JSON.stringify(savedFilters), ...stamps });
}

export function assertPopulatedBusiness(rows) {
  for (const table of businessTables) assert.ok(rows[table].length, `${table} must have preservation evidence`);
  assert.equal(rows.field_definitions.length, 30);
  assert.equal(rows.field_options.length, 3);
  assert.equal(rows.field_values.length, 30);
  for (const entity of ['COMPANY', 'CONTACT', 'DEAL']) assert.deepEqual(rows.field_definitions.filter(row => row.entity === entity).map(row => row.type), fieldTypes);
  assert.equal(rows.deals[0].amount, 99999999999999);
  assert.equal(rows.deals[0].base_amount, '99999999999999999999.9999');
  assert.equal(rows.deals[0].fx_rate, '1234567890.1234567890');
  assert.equal(rows.field_values.find(row => row.id === 'deal-checkbox-value').bool, 0);
  assert.equal(rows.field_values.find(row => row.id === 'deal-number-value').number, '-99999999999999999999.9999');
  assert.deepEqual(JSON.parse(rows.saved_views[0].filters), savedFilters);
}

export async function seedAuthHistory(h) {
  const owner = await h.signupSystem('upgrade-owner@example.test', 'Upgrade Owner');
  const member = await h.signupAuthorized('upgrade-member@example.test', 'Upgrade Member');
  for (const [expectedRevision, action] of ['revoke', 'restore'].entries()) {
    const result = await h.request(`/api/members/${member.user.id}`, { method: 'PATCH', cookie: owner.cookie, body: { action, expectedRevision } });
    assert.equal(result.status, 200, await result.clone().text());
  }
  assert.equal((await h.request('/api/companies', { cookie: member.cookie })).status, 401);
  const currentMember = await h.signIn(member.email);
  const reset = await h.request('/api/auth/request-password-reset', { method: 'POST', body: { email: member.email, redirectTo: '/reset-password' } });
  assert.equal(reset.status, 200, await reset.clone().text());
  assert.ok((await h.outbox()).some(message => message.kind === 'reset'));
  const rows = await snapshot(h.binding, authTables);
  assert.equal(rows.user.length, 2);
  assert.ok(rows.user.every(user => user.email_verified === 1));
  assert.equal(rows.account.length, 2);
  assert.ok(rows.account.every(account => account.provider_id === 'credential' && account.password));
  assert.equal(rows.session.length, 2);
  assert.ok(rows.verification.length > 0);
  assert.ok(rows.rate_limit.length > 0);
  const membership = rows.singleton_membership.find(row => row.user_id === member.user.id);
  assert.equal(membership.revision, 2);
  assert.equal(membership.access_version, 2);
  return { owner, member: currentMember, invalidCookie: member.cookie };
}

/** Run the unmodified guard against only a temporary project and private home. */
export async function createMigrationProject(t, { harness, names } = {}) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'worker-crm-upgrade-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const project = join(directory, 'project');
  const privateHome = join(directory, 'home');
  await mkdir(join(project, 'scripts'), { recursive: true });
  await mkdir(join(project, 'migrations'));
  await mkdir(join(project, 'dist/server'), { recursive: true });
  await mkdir(privateHome);
  await copyFile(join(root, 'scripts/d1-migrations.mjs'), join(project, 'scripts/d1-migrations.mjs'));
  await symlink(join(root, 'node_modules'), join(project, 'node_modules'), 'dir');
  if (harness) {
    await mkdir(join(project, '.wrangler/state'), { recursive: true });
    await symlink(join(harness.directory, 'storage'), join(project, '.wrangler/state/v3'), 'dir');
  }
  const config = { name: 'upgrade-tests', d1_databases: [{ binding: 'DB', database_name: 'upgrade-tests', database_id: harness ? 'auth-tests' : 'restore-tests', migrations_dir: 'migrations' }] };
  await writeFile(join(project, 'wrangler.jsonc'), JSON.stringify(config));
  await writeFile(join(project, 'dist/server/wrangler.json'), JSON.stringify({ ...config, d1_databases: [{ ...config.d1_databases[0], migrations_dir: '../../migrations' }] }));
  const addMigration = name => copyFile(join(root, 'migrations', name), join(project, 'migrations', name));
  for (const name of names ?? await migrationNames()) await addMigration(name);
  const options = selectedHome => ({ cwd: project, env: { ...process.env, HOME: selectedHome ?? privateHome, CI: 'true', WRANGLER_SEND_METRICS: 'false' }, maxBuffer: 4 * 1024 * 1024, timeout: 45000 });
  const run = (args = [], selectedHome) => execute(process.execPath, [join(project, 'scripts/d1-migrations.mjs'), ...args], options(selectedHome));
  const wrangler = args => execute(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), ...args, '--config', join(project, 'wrangler.jsonc')], options());
  const backupRoot = join(privateHome, '.worker-crm/backups');
  const backup = async name => {
    const path = join(directory, `${name}.sql`);
    await writeFile(path, '', { mode: 0o600, flag: 'wx' });
    await wrangler(['d1', 'export', 'DB', '--local', '--output', path]);
    assert.ok((await readFile(path, 'utf8')).length);
    return path;
  };
  const restore = async path => {
    // Wrangler has exited before native SQLite opens this newly created target.
    // Disable constraints only during cyclic-table import; check all keys before reopening D1.
    await wrangler(['d1', 'execute', 'DB', '--local', '--command', 'SELECT 1', '--json']);
    const storage = join(project, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
    const databases = (await readdir(storage)).filter(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite');
    assert.equal(databases.length, 1);
    const database = new DatabaseSync(join(storage, databases[0]), { enableForeignKeyConstraints: false });
    try {
      database.exec(await readFile(path, 'utf8'));
      assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    } finally { database.close(); }
  };
  const readSnapshot = async tables => {
    const result = JSON.parse((await wrangler(['d1', 'execute', 'DB', '--local', '--command', tables.map(table => `SELECT * FROM "${table}" ORDER BY rowid;`).join('\n'), '--json'])).stdout);
    assert.ok(result.every(query => query.success));
    assert.equal(result.length, tables.length);
    return Object.fromEntries(tables.map((table, index) => [table, result[index].results]));
  };
  return { project, directory, privateHome, backupRoot, run, wrangler, addMigration, backup, restore, snapshot: readSnapshot };
}
