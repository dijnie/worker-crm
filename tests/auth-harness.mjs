import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHmac } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const root = fileURLToPath(new URL('../', import.meta.url));
export const password = 'A-real-local-test-password-42!';

/** All state and recording controls exist only in this disposable workerd harness. */
export async function createAuthHarness(context, { baseUrl = 'https://crm.test', migrate = true, sharedAuth = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'worker-auth-'));
  const secret = randomUUID() + randomUUID();
  let runtime;
  const dispose = async () => { try { await runtime?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); } };
  try {
    const paths = (await readdir(join(root, 'src/app/api'), { recursive: true })).filter(path => path.endsWith('route.ts'));
    const definitions = paths.map((path, index) => {
      const names = [];
      const expression = ('/api/' + path.replace(/\/route\.ts$/, '')).replace(/\[\.\.\.([^\]]+)\]/g, (_, name) => { names.push(name); return '(.*)'; }).replace(/\[([^\]]+)\]/g, (_, name) => { names.push(name); return '([^/]+)'; });
      return { expression, names, index, rank: path.includes('[...') ? 2 : path.includes('[') ? 1 : 0 };
    }).sort((a, b) => a.rank - b.rank);
    const contents = paths.map((path, index) => `import * as route${index} from './src/app/api/${path}';`).join('\n') + `
      const routes = [${definitions.map(({ expression, names, index }) => `{expression:${JSON.stringify(expression)},names:${JSON.stringify(names)},handlers:route${index}}`).join(',')}];
      globalThis.__authOutbox = [];
      globalThis.__authEmailFailure = false;
      globalThis.__authFailureRecipient = null;
      globalThis.__authSessionPause = null;
      export default { async fetch(request) {
        const pathname = new URL(request.url).pathname;
        if(pathname === '/__test/outbox') return Response.json(globalThis.__authOutbox);
        if(pathname === '/__test/email-failure') { const body = await request.json(); globalThis.__authEmailFailure = body.enabled; globalThis.__authFailureRecipient = body.email ?? null; return Response.json({ok:true}); }
        if(pathname === '/__test/session-pause') {
          if(request.method === 'GET') return Response.json({paused:globalThis.__authSessionPause?.paused ?? false});
          const body = await request.json();
          if(body.release) { globalThis.__authSessionPause = null; }
          else { globalThis.__authSessionPause = {userId:body.userId,paused:false}; }
          return Response.json({ok:true});
        }
        for (const {expression,names,handlers} of routes) {
          const match = pathname.match(new RegExp('^' + expression + '$'));
          if(!match) continue;
          const handler = handlers[request.method];
          if(!handler) return new Response(null,{status:405});
          const params = Object.fromEntries(names.map((name,index) => [name,decodeURIComponent(match[index+1])]));
          return handler(request,{params:Promise.resolve(params)});
        }
        return new Response(null,{status:404});
      }};
    `;
    const worker = await build({
      stdin: { contents, resolveDir: root, loader: 'ts' },
      bundle: true, write: false, platform: 'browser', format: 'esm', external: ['cloudflare:workers', 'node:*'], logLevel: 'silent',
      plugins: [{ name: 'isolated-email-capture', setup(builder) {
        builder.onLoad({ filter: /[/\\]auth[/\\]auth\.ts$/ }, async args => ({ loader: 'ts', resolveDir: join(root, 'src/lib/auth'), contents: (await readFile(args.path,'utf8')).replace(
          'const membership = await reconcileSingletonMembership(db, data.userId);',
          'const membership = await reconcileSingletonMembership(db, data.userId); if(globalThis.__authSessionPause?.userId === data.userId) { globalThis.__authSessionPause.paused = true; while(globalThis.__authSessionPause?.userId === data.userId) await new Promise(resolve => setTimeout(resolve, 5)); }'
        ) }));
        if(sharedAuth) builder.onLoad({ filter: /request-context\.ts$/ }, async args => ({ loader: 'ts', resolveDir: join(root, 'src/lib/auth'), contents: (await readFile(args.path, 'utf8')).replace('return createAuth(db,', 'return globalThis.__sharedAuth ??= createAuth(db,') }));
        builder.onLoad({ filter: /cloudflare-email-adapter\.ts$/ }, () => ({ loader: 'ts', contents: `
          export class CloudflareEmailAdapter {
            constructor(options) {}
            async sendVerification(message) { await this.send('verification',message); }
            async sendPasswordReset(message) { await this.send('reset',message); }
            async send(kind,message) {
              await Promise.resolve();
              if(globalThis.__authEmailFailure && (!globalThis.__authFailureRecipient || globalThis.__authFailureRecipient === message.to)) throw new Error('Injected email transport failure');
              globalThis.__authOutbox.push({kind,...message});
            }
          }
        ` }));
      } }],
    });
    runtime = new Miniflare({
      resourcePersistencePath: join(directory, 'storage'), telemetry: { enabled: false },
      workers: [{ config: {
        type: 'worker', name: 'auth-tests', compatibilityDate: '2026-09-11', compatibilityFlags: ['nodejs_compat'],
        manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: worker.outputFiles[0].text } } },
        env: {
          DB: { type: 'd1', id: 'auth-tests' },
          AUTH_BASE_URL: { type: 'text', value: baseUrl },
          AUTH_EMAIL_FROM: { type: 'text', value: 'test@example.invalid' },
          BETTER_AUTH_SECRET: { type: 'text', value: secret },
        },
      } }],
    });
    const binding = await runtime.getD1Database('DB');
    for (const filename of (migrate ? await readdir(join(root, 'migrations')) : []).filter(name => name.endsWith('.sql')).sort()) {
      const migration = await readFile(join(root, 'migrations', filename), 'utf8');
      const statements = migration.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean);
      await binding.batch(statements.map(statement => binding.prepare(statement)));
    }
    let ipCounter = 1;
    const request = (path, { method = 'GET', body, cookie, ip = '192.0.2.1', headers = {}, origin = baseUrl } = {}) => runtime.dispatchFetch(new URL(path, baseUrl), {
      method, redirect: 'manual', headers: { ...(method === 'GET' ? {} : { 'content-type': 'application/json', ...(origin ? { origin } : {}) }), ...(ip ? { 'cf-connecting-ip': ip } : {}), ...(cookie ? { cookie } : {}), ...headers },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
    const outbox = async () => (await request('/__test/outbox')).json();
    const signIn = async (email, options = {}) => {
      const response = await request('/api/auth/sign-in/email', { method: 'POST', body: { email, password, ...options.body }, ip: options.ip ?? `198.51.100.${ipCounter++}` });
      assert.equal(response.status, 200, await response.clone().text());
      const cookie = response.headers.get('set-cookie')?.split(';')[0];
      assert.ok(cookie);
      return { response, cookie, ...(await response.json()) };
    };
    const signupVerified = async (email = `person-${randomUUID()}@example.test`, name = 'Local Test') => {
      const ip = `198.51.100.${ipCounter++}`;
      const response = await request('/api/auth/sign-up/email', { method: 'POST', body: { email, password, name, callbackURL: '/sign-in' }, ip });
      assert.equal(response.status, 200, await response.clone().text());
      const message = (await outbox()).findLast(message => message.kind === 'verification' && message.to === email.trim().toLowerCase());
      assert.ok(message);
      const verification = await request(message.url, { ip });
      assert.ok([200,302].includes(verification.status), await verification.text());
      return { email: email.trim().toLowerCase(), ...(await signIn(email, { ip })) };
    };
    const expireVerificationLink = (value) => {
      const url = new URL(value), parts = url.searchParams.get('token').split('.');
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
      parts[1] = Buffer.from(JSON.stringify({ ...claims, exp: Math.floor(Date.now()/1000)-60 })).toString('base64url');
      parts[2] = createHmac('sha256', secret).update(parts.slice(0,2).join('.')).digest('base64url');
      url.searchParams.set('token', parts.join('.'));
      return url.toString();
    };
    context?.after(dispose);
    return { runtime, binding, request, outbox, signIn, signupVerified, expireVerificationLink, dispose, baseUrl, directory };
  } catch (error) { await dispose(); throw error; }
}
