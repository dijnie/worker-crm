import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, realpath, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// A scoped SQLite rejection exercises the real HTTP 500 boundary and browser retry.
// The source database and its configuration can never be targets of this helper.
export async function rejectCompanyInsert(h, mode, name) {
  const directory = await realpath(h.directory), app = await realpath(h.app), state = await realpath(h.state);
  assert.ok(basename(directory).startsWith('worker-browser-'));
  assert.equal(app, join(directory, 'app'));
  assert.equal(state, join(app, '.wrangler/state'));
  const cli = fileURLToPath(new URL('../../node_modules/wrangler/bin/wrangler.js', import.meta.url));
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SYSTEMROOT'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { CI: '1', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' });
  const command = args => execFileSync(process.execPath, [cli, 'd1', ...args], { cwd: app, env, stdio: 'pipe', timeout: 30000 });
  const backup = async label => {
    const path = join(directory, `${mode}-${label}-insert-rejection.sql`);
    command(['export', 'DB', '--local', '--config', join(app, 'wrangler.jsonc'), '--output', path]);
    await chmod(path, 0o600);
    console.log(`[browser] Private disposable D1 export before ${label} trigger: ${path}`);
  };
  const execute = async (label, sql) => {
    const path = join(directory, `${mode}-${label}-trigger.sql`);
    await writeFile(path, sql, { mode: 0o600 });
    command(['execute', 'DB', '--local', '--persist-to', state, '--config', join(app, 'wrangler.jsonc'), '--file', path, '--yes']);
  };
  const quoted = `'${name.replaceAll("'", "''")}'`;
  await backup('create');
  await execute('create', `CREATE TRIGGER browser_reject_named_company BEFORE INSERT ON companies WHEN NEW.name=${quoted} BEGIN SELECT RAISE(ABORT, 'private browser database detail'); END;`);
  let removed = false;
  return async () => {
    if (removed) return;
    await backup('drop');
    await execute('drop', 'DROP TRIGGER browser_reject_named_company;');
    removed = true;
  };
}
