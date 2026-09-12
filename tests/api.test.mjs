import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { assertApiResponse } from './openapi-assertions.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const token = randomUUID();
let directory, runtime, binding, client, unauthorizedClient, ApiError, endpoints, openApiDocument;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'worker-api-'));
  const entries = await readdir(join(root, 'src/app/api'), { recursive: true });
  const paths = entries.filter(path => path.endsWith('route.ts'));
  const definitions = paths.map((path, index) => {
    const pattern = '/' + path.replace(/\/route\.ts$/, '').replace(/\[([^\]]+)\]/g, ':$1');
    return { pattern: '/api' + pattern, index };
  }).sort((a, b) => (a.pattern.match(/:/g)?.length ?? 0) - (b.pattern.match(/:/g)?.length ?? 0));
  const contents = paths.map((path, index) => `import * as route${index} from './src/app/api/${path}';`).join('\n') + `
    const routes = [${definitions.map(({ pattern, index }) => `{pattern:${JSON.stringify(pattern)},handlers:route${index}}`).join(',')}];
    export default { async fetch(request) {
      const pathname = new URL(request.url).pathname;
      for (const {pattern,handlers} of routes) {
        const names = [];
        const expression = pattern.replace(/:([^/]+)/g, (_, name) => { names.push(name); return '([^/]+)'; });
        const match = pathname.match(new RegExp('^' + expression + '$'));
        if (!match) continue;
        const handler = handlers[request.method];
        if (!handler) return new Response(null,{status:405});
        const params = Object.fromEntries(names.map((name,index) => [name,decodeURIComponent(match[index+1])]));
        return handler(request,{params:Promise.resolve(params)});
      }
      return new Response(null,{status:404});
    }};
  `;
  const worker = await build({
    stdin: { contents, resolveDir: root, loader: 'ts' },
    bundle: true, write: false, platform: 'browser', format: 'esm', external: ['cloudflare:workers'], logLevel: 'silent',
  });
  runtime = new Miniflare({
    resourcePersistencePath: join(directory, 'storage'), telemetry: { enabled: false },
    workers: [{ config: {
      type: 'worker', name: 'api-tests', compatibilityDate: '2026-09-11',
      manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: worker.outputFiles[0].text } } },
      env: { DB: { type: 'd1', id: 'api-tests' }, API_TOKEN: { type: 'text', value: token } },
    } }],
  });
  binding = await runtime.getD1Database('DB');
  const specification = await runtime.dispatchFetch('http://api.test/api/openapi');
  assert.equal(specification.status, 200);
  openApiDocument = await specification.json();
  assert.ok(!JSON.stringify(openApiDocument).includes(token));
  const migration = await readFile(join(root, 'migrations/0000_initial_schema.sql'), 'utf8');
  await binding.batch(migration.split('--> statement-breakpoint').map(statement => binding.prepare(statement.trim())).filter(Boolean));
  const clientPath = join(directory, 'client.mjs');
  await build({ stdin: { contents: `export * from './src/lib/api.ts'; export { default as endpoints } from './src/lib/api-endpoints.ts';`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'browser', format: 'esm', outfile: clientPath, logLevel: 'silent' });
  const bundledClient = await import(pathToFileURL(clientPath).href);
  ({ ApiError, endpoints } = bundledClient);
  const fetch = async (url, init) => assertApiResponse(openApiDocument, url, init.method ?? 'GET', await runtime.dispatchFetch(url, init));
  client = bundledClient.createApiClient({ baseUrl: 'http://api.test', headers: { Authorization: `Bearer ${token}` }, fetch });
  unauthorizedClient = bundledClient.createApiClient({ baseUrl: 'http://api.test', fetch });
  const clientSource = await readFile(clientPath, 'utf8');
  assert.doesNotMatch(clientSource, /cloudflare:workers|API_TOKEN|drizzle-orm/);
});

after(async () => {
  try { await runtime?.dispose(); }
  finally { if (directory) await rm(directory, { recursive: true, force: true }); }
});
beforeEach(async () => {
  for (const name of ['activities', 'field_values', 'field_options', 'field_definitions', 'deal_contacts', 'deals', 'companies', 'contacts', 'saved_views']) {
    await binding.prepare(`DELETE FROM ${name}`).run();
  }
});

async function request(path, { method = 'GET', body, authorized = true, headers = {} } = {}) {
  const url = `http://api.test${path}`;
  const response = await runtime.dispatchFetch(url, {
    method,
    headers: { ...(authorized ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  return assertApiResponse(openApiDocument, url, method, response);
}

test('all documented API methods reject requests without authorization before reading input', async () => {
  for (const endpoint of endpoints) {
    const path = endpoint.path.replace(/:id|:optionId/g, 'missing');
    const response = await request(path, { method: endpoint.method, authorized: false, ...(endpoint.method === 'GET' ? {} : { body: '{' }) });
    assert.equal(response.status, 401, `${endpoint.method} ${path}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await binding.prepare('SELECT count(*) AS total FROM companies').first()).total, 0);
  await assert.rejects(unauthorizedClient.companies.list(), error => error instanceof ApiError && error.status === 401);
});

test('empty database returns an array, pagination headers and zero statistics', async () => {
  const response = await request('/api/companies');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
  assert.equal(response.headers.get('x-total-count'), '0');
  assert.equal(response.headers.get('x-page'), '1');
  assert.equal(response.headers.get('x-limit'), '25');
  assert.deepEqual(await client.stats(), { totalCompanies: 0, totalContacts: 0, totalDeals: 0, openDealValue: '0.00', currency: 'USD', activitiesThisWeek: 0 });
  const lowercaseStats = await request('/api/stats?currency=usd');
  assert.equal(lowercaseStats.status, 200);
  assert.equal((await lowercaseStats.json()).currency, 'USD');
});

test('client performs record CRUD, pagination, archive/restore and exact money round trips', async () => {
  const create = await request('/api/companies', { method: 'POST', body: { name: 'Test' } });
  assert.equal(create.status, 201);
  const company = await create.json();
  assert.ok(company.id);
  const contact = await client.contacts.create({ firstName: 'Lin', email: 'LIN@example.com', companyId: company.id });
  assert.equal(contact.email, 'lin@example.com');
  const deal = await client.deals.create({ name: 'License', companyId: company.id, ownerId: 'operator', amount: '0.29', currency: 'usd' });
  assert.equal(deal.amount, '0.29');
  assert.equal(deal.currency, 'USD');
  assert.equal((await client.companies.get(company.id)).deals[0].amount, '0.29');
  assert.equal((await client.contacts.list({ companyId: company.id })).total, 1);
  assert.equal((await client.deals.list({ companyId: company.id })).items[0].amount, '0.29');
  assert.equal((await client.companies.update(company.id, { name: 'Updated' })).name, 'Updated');
  assert.equal((await client.contacts.update(contact.id, { phone: '123' })).phone, '123');
  assert.equal((await client.deals.update(deal.id, { amount: '12.30' })).amount, '12.30');
  assert.ok((await client.deals.update(deal.id, {})).company);
  for (const [resource, id] of [[client.companies, company.id], [client.contacts, contact.id], [client.deals, deal.id]]) {
    await resource.archive(id);
    assert.equal((await resource.list()).total, 0);
    assert.equal((await resource.list({ archived: true })).total, 1);
    await resource.restore(id);
    assert.equal((await resource.list()).total, 1);
  }
  assert.equal((await client.stats()).openDealValue, '12.30');
});

test('API validates JSON, queries, protected writes, missing references and conflicts without SQL leakage', async () => {
  const company = await client.companies.create({ name: 'One', domain: 'example.com' });
  const cases = [
    ['/api/companies', 'POST', '{', 400],
    ['/api/companies', 'POST', { name: ' ', id: 'injected' }, 400],
    ['/api/companies?archived=maybe', 'GET', undefined, 400],
    ['/api/companies?page=0', 'GET', undefined, 400],
    ['/api/companies?page=1&page=2', 'GET', undefined, 400],
    ['/api/companies?limit=101', 'GET', undefined, 400],
    ['/api/companies?lifecycleStage=lead', 'GET', undefined, 400],
    ['/api/companies/missing', 'GET', undefined, 404],
    ['/api/companies', 'POST', { name: 'Duplicate', domain: 'EXAMPLE.COM' }, 409],
    ['/api/contacts', 'POST', { firstName: 'Contact', companyId: 'missing' }, 400],
    ['/api/deals', 'POST', { name: 'Bad', companyId: company.id, ownerId: 'operator', amount: '0.001' }, 400],
  ];
  for (const [path, method, body, status] of cases) {
    const response = await request(path, { method, body });
    assert.equal(response.status, status, path);
    const data = await response.text();
    assert.doesNotMatch(data, /SQLITE|INSERT INTO|SELECT |D1_ERROR|Failed query/);
  }
  await binding.prepare("CREATE TRIGGER reject_company BEFORE INSERT ON companies BEGIN SELECT RAISE(ABORT, 'private database detail'); END").run();
  try {
    const response = await request('/api/companies', { method: 'POST', body: { name: 'Fails' } });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: 'Internal server error' });
  } finally { await binding.prepare('DROP TRIGGER reject_company').run(); }
});

test('stage actions and activity tasks update history and derived company stamps', async () => {
  const company = await client.companies.create({ name: 'Company' });
  const deal = await client.deals.create({ name: 'Deal', companyId: company.id, ownerId: 'operator', amount: '10.00' });
  assert.equal((await client.deals.setStage(deal.id, { stage: 'QUALIFIED_TO_BUY', actorId: 'operator' })).changed, true);
  assert.equal((await client.deals.setStage(deal.id, { stage: 'QUALIFIED_TO_BUY', actorId: 'operator' })).changed, false);
  const history = await client.activities.list({ dealId: deal.id });
  assert.equal(history.total, 1);
  assert.deepEqual(history.items[0].meta, { from: 'DEMO_BOOKED', to: 'QUALIFIED_TO_BUY' });
  const task = await client.activities.create({ type: 'TASK', subject: 'Call', dealId: deal.id, createdById: 'operator' });
  assert.equal(task.companyId, company.id);
  assert.ok((await client.activities.complete(task.id, { completed: true })).completedAt);
  assert.equal((await client.activities.complete(task.id, { completed: false })).completedAt, null);
  assert.equal((await client.activities.get(task.id)).id, task.id);
  await client.activities.delete(task.id);
  await assert.rejects(client.activities.get(task.id), error => error.status === 404);
  assert.ok((await client.companies.get(company.id)).lastActivityAt);
});

test('field endpoints preserve typed values and historical options', async () => {
  const company = await client.companies.create({ name: 'Company' });
  const field = await client.fields.create({ entity: 'COMPANY', label: 'Priority', type: 'SELECT', options: [{ label: 'High' }] });
  const option = field.options[0];
  await client.fields.setValue(field.id, 'COMPANY', company.id, option.id);
  const createdOption = await client.fields.createOption(field.id, { label: 'Low' });
  assert.equal((await client.fields.options(field.id)).length, 2);
  await client.fields.updateOption(field.id, option.id, { archived: true });
  const values = await client.fields.values('COMPANY', company.id);
  assert.equal(values[0].value, option.id);
  assert.ok(values[0].options.some(row => row.id === option.id && row.archivedAt));
  await assert.rejects(client.fields.setValue(field.id, 'COMPANY', company.id, option.id), error => error.status === 400);
  await client.fields.setValue(field.id, 'COMPANY', company.id, createdOption.id);
  await client.fields.update(field.id, { label: 'Importance' });
  assert.equal((await client.fields.get(field.id)).label, 'Importance');
  await client.fields.archive(field.id);
  assert.equal((await client.fields.list('COMPANY')).length, 0);
  assert.equal((await client.fields.list('COMPANY', true)).length, 1);
  await client.fields.restore(field.id);
  await client.fields.setValue(field.id, 'COMPANY', company.id, null);
  assert.equal((await client.fields.values('COMPANY', company.id))[0].value, null);
});
