import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parse } from 'jsonc-parser';
import { chromium } from 'playwright';

export const origin = 'http://localhost:3100';
const root = fileURLToPath(new URL('../../', import.meta.url));
const password = 'Browser-test-password-42!';
const sourceEntries = new Set(['src', 'services', 'migrations', 'public', 'scripts', 'tests', 'package.json', 'package-lock.json', 'next-env.d.ts', 'next.config.ts', 'postcss.config.mjs', 'tsconfig.json', 'vite.config.ts', 'wrangler.jsonc', 'worker-configuration.d.ts']);

async function fingerprint(path) {
  const hash = createHash('sha256');
  async function visit(current) {
    const stat = await lstat(current).catch(error => { if (error.code !== 'ENOENT') throw error; });
    hash.update(relative(path, current));
    if (!stat) { hash.update('absent'); return; }
    if (stat.isSymbolicLink()) hash.update(await readlink(current));
    else if (stat.isDirectory()) for (const entry of (await readdir(current)).sort()) {
      // An independently running user server appends telemetry; it is not application persistence.
      if (relative(path, join(current, entry)) === 'v3/observability') continue;
      await visit(join(current, entry));
    }
    else hash.update(await readFile(current));
  }
  await visit(path);
  return hash.digest('hex');
}

export async function assertPortFree() {
  for (const host of ['127.0.0.1', '::1']) {
    const server = createServer();
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ port: 3100, host, ipv6Only: true }, resolve); });
    } catch (error) {
      if (error.code === 'EAFNOSUPPORT') continue;
      let owner = 'owner information unavailable';
      try { owner = execFileSync('lsof', ['-nP', '-iTCP:3100', '-sTCP:LISTEN'], { encoding: 'utf8' }).trim(); } catch { /* lsof is optional */ }
      throw new Error(`Browser port 3100 is occupied; stop its owner before retrying. ${owner}`);
    } finally { if (server.listening) await new Promise(resolve => server.close(resolve)); }
  }
}

export async function createBrowserHarness({ onCleanup = () => {} } = {}) {
  await assertPortFree();
  const protectedPaths = ['.wrangler/state', 'wrangler.jsonc', 'vite.config.ts', '.dev.vars', '.env'];
  const before = await Promise.all(protectedPaths.map(path => fingerprint(join(root, path))));
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'worker-browser-')));
  const app = join(directory, 'app');
  const state = join(app, '.wrangler/state');
  const processes = new Set();
  const contexts = new Set();
  let browser, active, cleanupPromise;
  const logs = [];
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SYSTEMROOT', 'PLAYWRIGHT_BROWSERS_PATH'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { CI: '1', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' });

  function launch(label, binary, args) {
    const child = spawn(binary, args, { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    processes.add(child);
    child.on('error', error => logs.push(`${label}: ${error.message}`));
    child.once('exit', () => processes.delete(child));
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { logs.push(chunk.toString()); if (logs.length > 1000) logs.shift(); });
    console.log(`[browser] ${label}: PID ${child.pid}; port 3100; cwd ${app}; storage ${state}`);
    return child;
  }
  async function stop(child) {
    if (!child) return;
    const kill = signal => { try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
    kill('SIGTERM');
    for (let attempt = 0; attempt < 100 && child.exitCode === null && child.signalCode === null; attempt++) await delay(100);
    // The owned process group also includes workerd descendants after the CLI exits.
    kill('SIGKILL');
    processes.delete(child);
  }
  async function command(label, binary, args) {
    const child = launch(label, binary, args);
    const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    if (result.code !== 0) throw new Error(`${label} failed (${result.code ?? result.signal}). ${safeLogs()}`);
  }
  function safeLogs() {
    return logs.join('').slice(-6000).replace(/https?:\/\/[^\s<>"']+/g, '[URL redacted]').replace(/(BETTER_AUTH_SECRET[^\n]*|token[^\n]*|cookie[^\n]*)/gi, '[credential redacted]');
  }
  async function dispose() {
    cleanupPromise ??= (async () => {
      for (const context of contexts) await context.close().catch(() => {});
      await browser?.close().catch(() => {});
      for (const child of [...processes]) await stop(child);
      await stop(active);
      try {
        const after = await Promise.all(protectedPaths.map(path => fingerprint(join(root, path))));
        assert.deepEqual(after, before, 'Source configuration, secrets and user persistence must remain untouched');
        console.log('[browser] Verified source configuration, private environment and user D1/R2 state unchanged (independent dev observability excluded).');
        await assertPortFree();
      } finally { await rm(directory, { recursive: true, force: true }); }
      console.log('[browser] Owned processes stopped; disposable application, email, secret and storage removed.');
    })();
    return cleanupPromise;
  }

  onCleanup(dispose);
  try {
    await cp(root, app, { recursive: true, filter: async source => {
      const name = basename(source);
      const entry = relative(root, source).split('/')[0];
      if (entry && !sourceEntries.has(entry)) return false;
      if (['node_modules', '.git', '.wrangler', 'dist', '.next', '.vite', '.vinext', 'tsconfig.tsbuildinfo', 'coverage', 'test-results', 'playwright-report'].includes(name)) return false;
      if (/^(?:\.env|\.dev\.vars)/.test(name) || /\.(?:pem|key|sqlite|sqlite3|db)(?:-wal|-shm)?$/i.test(name)) return false;
      return !(await lstat(source)).isSymbolicLink();
    } });
    await mkdir(join(app, 'node_modules'));
    for (const entry of await readdir(join(root, 'node_modules'))) {
      if (entry.startsWith('.')) continue;
      await symlink(join(root, 'node_modules', entry), join(app, 'node_modules', entry), 'dir');
    }
    const config = parse(await readFile(join(app, 'wrangler.jsonc'), 'utf8'));
    config.vars = { ...config.vars, AUTH_BASE_URL: origin, AUTH_EMAIL_FROM: 'noreply@example.invalid' };
    config.send_email = [{ name: 'EMAIL', allowed_sender_addresses: ['noreply@example.invalid'], remote: false }];
    for (const binding of [...(config.d1_databases ?? []), ...(config.r2_buckets ?? [])]) delete binding.remote;
    await writeFile(join(app, 'wrangler.jsonc'), JSON.stringify(config, null, 2));
    const vitePath = join(app, 'vite.config.ts');
    const viteSource = await readFile(vitePath, 'utf8');
    assert.ok(viteSource.includes('server: { strictPort: true }'), 'Update the isolated Vite override when project server configuration changes');
    await writeFile(vitePath, viteSource.replace('server: { strictPort: true }', `server: { strictPort: true, fs: { allow: [${JSON.stringify(app)}, ${JSON.stringify(join(root, 'node_modules'))}] } }`));
    await writeFile(join(app, '.dev.vars'), `BETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}\n`, { mode: 0o600 });
    await mkdir(state, { recursive: true });
    await cp(state, join(directory, 'pre-migration-backup'), { recursive: true });
    console.log(`[browser] Fresh disposable store backed up before migrations: ${directory}/pre-migration-backup`);
    await command('migrate disposable D1', process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state, '--config', 'wrangler.jsonc']);
    browser = await chromium.launch({ headless: true });
  } catch (error) { await dispose(); throw error; }

  async function start(mode) {
    await assertPortFree();
    if (mode === 'built') await command('build disposable app', process.execPath, [join(root, 'node_modules/vinext/dist/cli.js'), 'build']);
    const args = mode === 'dev'
      ? [join(root, 'node_modules/vinext/dist/cli.js'), 'dev', '--port', '3100']
      : [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--config', 'dist/server/wrangler.json', '--persist-to', state, '--port', '3100', '--local-protocol', 'http', '--var', `AUTH_BASE_URL:${origin}`];
    active = launch(`${mode} server`, process.execPath, args);
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      if (active.exitCode !== null || active.signalCode !== null) throw new Error(`${mode} server exited. ${safeLogs()}`);
      try { const response = await fetch(`${origin}/api/openapi`, { signal: AbortSignal.timeout(2000) }); if (response.ok) return; } catch { /* compiling */ }
      await delay(250);
    }
    throw new Error(`${mode} server readiness timed out. ${safeLogs()}`);
  }
  async function stopServer() { await stop(active); active = undefined; await assertPortFree(); }
  async function newContext() { const context = await browser.newContext({ baseURL: origin }); context.setDefaultTimeout(15_000); contexts.add(context); return context; }
  async function api(context, path, { method = 'GET', body, status } = {}) {
    const response = await context.request.fetch(path, { method, headers: { Origin: origin }, ...(body === undefined ? {} : { data: body }) });
    assert.equal(response.status(), status ?? (method === 'POST' ? 201 : 200), `${method} ${path.split('?')[0]} status: ${response.status()}`);
    return response.status() === 204 ? undefined : response.json();
  }
  async function signIn(context, email) {
    const page = await context.newPage();
    await page.goto('/sign-in?returnTo=%2Fcompanies');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/companies');
    await page.close();
  }
  async function signup(name) {
    const context = await newContext();
    const email = `${randomUUID()}@example.test`;
    const mailRoots = [join(app, '.wrangler/tmp/email'), join(app, 'dist/server/.wrangler/tmp/email')];
    const emailFiles = async () => (await Promise.all(mailRoots.map(async root => (await readdir(root, { recursive: true }).catch(() => [])).map(entry => join(root, entry))))).flat();
    const existing = new Set(await emailFiles());
    const page = await context.newPage();
    await page.goto('/sign-up');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.waitForURL('**/verify-email');
    let verification;
    for (let attempt = 0; attempt < 100 && !verification; attempt++) {
      for (const path of await emailFiles()) {
        if (existing.has(path)) continue;
        if (!(await lstat(path)).isFile()) continue;
        const content = await readFile(path, 'utf8');
        const match = content.match(/http:\/\/localhost:3100\/api\/auth\/verify-email\?[^\s<>"']+/);
        if (match) { verification = match[0].replaceAll('&amp;', '&'); break; }
      }
      if (!verification) await delay(100);
    }
    assert.ok(verification, 'Native simulated email must contain an actual verification link');
    await page.goto(verification);
    await page.waitForURL('**/sign-in?**');
    assert.equal(new URL(page.url()).searchParams.get('error'), null, 'Verification link must be accepted');
    await page.close();
    await signIn(context, email);
    const session = await api(context, '/api/auth/get-session');
    assert.equal(session.user.emailVerified, true);
    console.log(`[browser] Native simulated verification consumed; verified ${name} signed in through browser.`);
    return { context, email, user: session.user };
  }
  return { directory, app, state, browser, start, stopServer, dispose, newContext, signup, signIn, api, safeLogs };
}
