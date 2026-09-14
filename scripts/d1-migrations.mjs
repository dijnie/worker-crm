import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parse } from 'jsonc-parser';

const execute = promisify(execFile);
const { env: environment } = process;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceConfig = resolve(projectRoot, 'wrangler.jsonc');
const persistence = resolve(projectRoot, '.wrangler/state');

export function parseArguments(args) {
  const options = { apply: false, built: false };
  const seen = new Set();
  for (const flag of args) {
    if (!['--apply', '--built', '--help'].includes(flag)) throw new Error('Unknown option. Use --help for local migration usage.');
    if (seen.has(flag)) throw new Error('Duplicate option.');
    seen.add(flag);
    options[flag.slice(2)] = true;
  }
  return options;
}

export function parseConfiguration(text) {
  const errors = [];
  const configuration = parse(text, errors, { allowTrailingComma: true });
  if (errors.length) throw new Error('Invalid Wrangler configuration.');
  const bindings = configuration?.d1_databases?.filter(binding => binding.binding === 'DB');
  if (typeof configuration?.name !== 'string' || !configuration.name || bindings?.length !== 1) {
    throw new Error('Configuration must name one Worker and exactly one DB binding.');
  }
  const database = bindings[0];
  if (typeof database.database_id !== 'string' || !database.database_id ||
      typeof database.migrations_dir !== 'string' || !database.migrations_dir) {
    throw new Error('DB requires an explicit database_id and migrations_dir.');
  }
  if ('env' in configuration || database.migrations_pattern ||
      (database.migrations_table && database.migrations_table !== 'd1_migrations')) {
    throw new Error('Local migrations require top-level DB configuration, a flat migration directory, and the default d1_migrations ledger.');
  }
  return { worker: configuration.name, database };
}

export function migrationCompatibility(expected, ledger, tables) {
  if (ledger.some((name, index) => name !== expected[index])) {
    return { safeToApply: false, reason: 'Applied migration history is not an exact prefix of the source migration history. Inspect and verify recovery manually; the ledger is never rewritten automatically.' };
  }
  const applicationTables = tables.filter(name =>
    !name.startsWith('sqlite_') && !name.startsWith('_cf_') && name !== 'd1_migrations');
  if (!ledger.length && applicationTables.length) {
    return { safeToApply: false, reason: 'Application tables exist without an applied migration ledger. Inspect and verify recovery before applying the baseline.' };
  }
  return { safeToApply: true, pending: expected.slice(ledger.length) };
}

export function assertConfigurationParity(source, selected, sourceNames, selectedNames) {
  if (source.worker !== selected.worker ||
      source.database.database_id !== selected.database.database_id ||
      JSON.stringify(sourceNames) !== JSON.stringify(selectedNames)) {
    throw new Error('Built Worker binding or migration history differs from source. Rebuild before local preview.');
  }
}

async function migrationNames(configPath, database) {
  const directory = resolve(dirname(configPath), database.migrations_dir);
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries.filter(entry => entry.isFile() && entry.name.endsWith('.sql')).map(entry => entry.name).sort();
  if (!names.length) throw new Error('No SQL migrations found in the configured migration directory.');
  return names;
}

export async function runWrangler(args, operation) {
  try {
    return await execute(process.execPath, [resolve(projectRoot, 'node_modules/wrangler/bin/wrangler.js'), ...args], {
      cwd: projectRoot,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...environment, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    });
  } catch {
    // Wrangler can include SQL values and local secrets in failed command output.
    throw new Error(`Local D1 ${operation} failed. Child output is withheld to protect database contents.`);
  }
}

export async function backupDatabase(prefix = 'before-migrations') {
  try {
    const backupRoot = resolve(homedir(), '.worker-crm/backups');
    await mkdir(backupRoot, { recursive: true, mode: 0o700 });
    await chmod(backupRoot, 0o700);
    const directory = await mkdtemp(resolve(backupRoot, `${prefix}-${new Date().toISOString().replaceAll(':', '-')}-`));
    await chmod(directory, 0o700);
    const output = resolve(directory, 'database.sql');
    await writeFile(output, '', { flag: 'wx', mode: 0o600 });
    // Export has no --persist-to flag: source config must use its default state.
    await runWrangler(['d1', 'export', 'DB', '--local', '--config', sourceConfig, '--output', output], 'backup');
    await chmod(output, 0o600);
    if (!(await stat(output)).size) throw new Error('Empty export.');
    return output;
  } catch {
    throw new Error('Local D1 backup failed. No migrations were applied. Check access to ~/.worker-crm/backups and local Wrangler export.');
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) {
    console.log('Usage: node scripts/d1-migrations.mjs [--apply] [--built]\nDefault: inspect only. Local DB always uses project-root .wrangler/state. Pending apply requires a private backup in ~/.worker-crm/backups. --built checks dist/server/wrangler.json against source.');
    return;
  }
  const source = parseConfiguration(await readFile(sourceConfig, 'utf8'), sourceConfig);
  const sourceNames = await migrationNames(sourceConfig, source.database);
  const configPath = options.built ? resolve(projectRoot, 'dist/server/wrangler.json') : sourceConfig;
  const selected = options.built ? parseConfiguration(await readFile(configPath, 'utf8'), configPath) : source;
  const selectedNames = await migrationNames(configPath, selected.database);
  assertConfigurationParity(source, selected, sourceNames, selectedNames);
  const flags = ['--local', '--persist-to', persistence, '--config', configPath];
  const sql = async command => {
    const { stdout } = await runWrangler(['d1', 'execute', 'DB', ...flags, '--command', command, '--json'], 'inspection');
    let result;
    try { result = JSON.parse(stdout); } catch { throw new Error('Unable to parse local D1 inspection response.'); }
    if (!Array.isArray(result) || result.length !== 1 || !result[0]?.success || !Array.isArray(result[0].results)) {
      throw new Error('Unable to inspect local D1 database.');
    }
    return result[0].results;
  };
  const inspect = async () => {
    const tables = (await sql("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")).map(row => row.name);
    const ledger = tables.includes('d1_migrations') ? (await sql('SELECT name FROM d1_migrations ORDER BY id')).map(row => row.name) : [];
    return migrationCompatibility(sourceNames, ledger, tables);
  };
  const before = await inspect();
  console.log(JSON.stringify({ target: 'local', configPath, persistence, ...before }, null, 2));
  if (!options.apply) return before;
  if (!before.safeToApply) throw new Error(before.reason);
  if (!before.pending.length) return before;
  const backup = await backupDatabase();
  console.log(`Local database backup: ${backup}`);
  await runWrangler(['d1', 'migrations', 'apply', 'DB', ...flags], 'migration apply');
  const after = await inspect();
  if (!after.safeToApply || after.pending.length) throw new Error('Local migration verification did not reach the complete source ledger.');
  console.log('Local migrations verified: 0 pending.');
  return after;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Local migration runner failed.');
    process.exitCode = 1;
  });
}
