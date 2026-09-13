import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'jsonc-parser';
import { getPlatformProxy } from 'wrangler';

test('Wrangler loads all required auth settings from the documented local environment file', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'worker-local-environment-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const configPath = join(directory, 'wrangler.jsonc');
  // Reuse the application's variable-loading policy without provisioning CRM resources.
  await writeFile(configPath, JSON.stringify({ name: 'local-environment-test', compatibility_date: source.compatibility_date,
    compatibility_flags: source.compatibility_flags, vars: source.vars, secrets: source.secrets }));
  const settings = { BETTER_AUTH_SECRET: 'local-environment-test-secret-at-least-32-characters',
    AUTH_BASE_URL: 'http://localhost:3100', AUTH_EMAIL_FROM: 'noreply@example.invalid' };
  await writeFile(join(directory, '.dev.vars'), Object.entries(settings).map(([key, value]) => `${key}=${value}\n`).join(''), { mode: 0o600 });
  const platform = await getPlatformProxy({ configPath, persist: false, remoteBindings: false });
  try {
    for (const [key, value] of Object.entries(settings)) assert.equal(platform.env[key], value, `${key} must reach the Worker`);
  } finally { await platform.dispose(); }
});
