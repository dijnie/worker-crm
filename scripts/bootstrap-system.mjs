import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupDatabase, main as inspectMigrations, runWrangler } from './d1-migrations.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function parseArguments(args) {
  const options = { apply: false, userId: null, help: false };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--apply', '--user-id', '--help'].includes(flag) || seen.has(flag)) throw new Error('Use --help for local system bootstrap usage.');
    seen.add(flag);
    if (flag === '--user-id') {
      const userId = args[++index];
      if (!userId || userId.startsWith('--') || userId.length > 200 || /[\x00-\x1f\x7f]/.test(userId)) throw new Error('An explicit valid user ID is required.');
      options.userId = userId;
    } else options[flag.slice(2)] = true;
  }
  if (!options.help && !options.userId) throw new Error('Select an existing verified account with --user-id.');
  return options;
}
const literal = value => `'${value.replaceAll("'", "''")}'`;
export function bootstrapSql(userId) {
  return `UPDATE singleton_membership SET
    role_id = (SELECT id FROM roles WHERE is_system = 1),
    revision = revision + 1, updated_at = cast(unixepoch('subsecond') * 1000 as integer)
    WHERE user_id = ${literal(userId)} AND role_id IS NULL AND status = 'active'
      AND EXISTS (SELECT 1 FROM user WHERE id = singleton_membership.user_id AND email_verified = 1)
      AND EXISTS (SELECT 1 FROM roles WHERE is_system = 1)
      AND NOT EXISTS (SELECT 1 FROM singleton_membership m JOIN roles r ON r.id = m.role_id
        WHERE m.status = 'active' AND r.is_system = 1);
    SELECT changes() AS changed;`;
}
export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) {
    console.log('Usage: node scripts/bootstrap-system.mjs --user-id ID [--apply]\nLocal only. Default: inspect eligibility. Apply promotes one existing verified active roleless account only when no active system exists. A private D1 export is required before the write.');
    return;
  }
  const migrations = await inspectMigrations([]);
  if (!migrations?.safeToApply || migrations.pending.length) throw new Error('Apply and verify local migrations before bootstrapping system access.');
  const sql = async command => {
    const { stdout } = await runWrangler(['d1', 'execute', 'DB', '--local', '--persist-to', resolve(projectRoot, '.wrangler/state'),
      '--config', resolve(projectRoot, 'wrangler.jsonc'), '--command', command, '--json'], 'system bootstrap');
    let result;
    try { result = JSON.parse(stdout); } catch { throw new Error('Could not verify local bootstrap result.'); }
    if (!Array.isArray(result) || result.some(item => !item.success || !Array.isArray(item.results))) throw new Error('Could not verify local bootstrap result.');
    return result;
  };
  const [state] = await sql(`SELECT
    EXISTS (SELECT 1 FROM singleton_membership m JOIN user u ON u.id = m.user_id
      WHERE m.user_id = ${literal(options.userId)} AND m.role_id IS NULL AND m.status = 'active' AND u.email_verified = 1) AS eligible,
    (SELECT count(*) FROM singleton_membership m JOIN roles r ON r.id = m.role_id WHERE m.status = 'active' AND r.is_system = 1) AS active_system_count`);
  const eligible = state.results[0]?.eligible === 1 && state.results[0]?.active_system_count === 0;
  console.log(JSON.stringify({ target: 'local', eligible, apply: options.apply }));
  if (!eligible) throw new Error('Bootstrap requires a verified active roleless account and no existing active system account.');
  if (!options.apply) return { eligible };
  const backup = await backupDatabase('before-system-bootstrap');
  console.log(`Local database backup: ${backup}`);
  const result = await sql(bootstrapSql(options.userId));
  if (result.at(-1)?.results[0]?.changed !== 1) throw new Error('Access changed before bootstrap; no account was promoted.');
  console.log('Local system bootstrap verified: one account promoted.');
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Local system bootstrap failed.'); process.exitCode = 1; });
}
