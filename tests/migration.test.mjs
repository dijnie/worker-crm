import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createAuthHarness } from './auth-harness.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const businessTables = ['companies', 'contacts', 'deals', 'deal_contacts', 'activities', 'field_definitions', 'field_options', 'field_values', 'saved_views'];
const statements = source => source.split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean);
async function apply(binding, queries) { await binding.batch(queries.map(sql => binding.prepare(sql))); }
async function snapshot(binding) {
  return Object.fromEntries(await Promise.all(businessTables.map(async table => [table, (await binding.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results])));
}
const literal = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;

test('auth upgrade preserves every business column and the pre-upgrade export restores independently', async t => {
  const source = await createAuthHarness(t, { migrate: false });
  const baseline = statements(await readFile(join(root, 'migrations/0000_initial_schema.sql'), 'utf8'));
  await apply(source.binding, baseline);
  await apply(source.binding, [
    "INSERT INTO companies(id,name,owner_id,created_at,updated_at) VALUES('legacy-company','Legacy company','opaque-owner','2024-01-02 03:04:05','2024-06-07 08:09:10')",
    "INSERT INTO contacts(id,first_name,company_id,owner_id) VALUES('legacy-contact','Legacy','legacy-company','opaque-contact-owner')",
    "INSERT INTO deals(id,name,company_id,owner_id,amount) VALUES('legacy-deal','Legacy deal','legacy-company','opaque-deal-owner',29)",
    "INSERT INTO activities(id,type,company_id,deal_id,created_by_id,created_at,updated_at) VALUES('legacy-activity','NOTE','legacy-company','legacy-deal','historical-creator','2023-01-01 00:00:00','2023-01-02 00:00:00')",
    "INSERT INTO saved_views(id,entity,name,owner_id,filters) VALUES('legacy-view','COMPANY','My view','opaque-view-owner','{}')",
  ]);
  const before = await snapshot(source.binding);
  const backup = [...baseline, ...Object.entries(before).flatMap(([table, rows]) => rows.map(row =>
    `INSERT INTO ${table} (${Object.keys(row).map(key => `"${key}"`).join(',')}) VALUES (${Object.values(row).map(literal).join(',')})`))];
  const backupPath = join(source.directory, 'pre-auth-upgrade.sql');
  await writeFile(backupPath, backup.join('\n--> statement-breakpoint\n'), { mode: 0o600 });
  for (const filename of (await readdir(join(root, 'migrations'))).filter(name => name.endsWith('.sql') && !name.startsWith('0000')).sort()) {
    await apply(source.binding, statements(await readFile(join(root, 'migrations', filename), 'utf8')));
  }
  assert.deepEqual(await snapshot(source.binding), before);
  const restored = await createAuthHarness(t, { migrate: false });
  await apply(restored.binding, statements(await readFile(backupPath, 'utf8')));
  assert.deepEqual(await snapshot(restored.binding), before);
  assert.equal((await source.binding.prepare('SELECT COUNT(*) AS count FROM user').first()).count, 0);
  assert.equal((await source.binding.prepare('SELECT COUNT(*) AS count FROM singleton_membership').first()).count, 0);
  assert.equal((await source.binding.prepare('SELECT owner_user_id FROM singleton_workspace').first()).owner_user_id, null);
  for (const table of businessTables) {
    const keys = (await source.binding.prepare(`PRAGMA foreign_key_list(${table})`).all()).results;
    assert.ok(keys.every(key => !['user', 'singleton_membership'].includes(key.table)));
  }
});
