import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import SwaggerParser from '@apidevtools/swagger-parser';
import { assertSchema, schemaValidator } from './openapi-assertions.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let directory, document, endpointCatalog, specGET, createActivityApiInput, stageApiInput;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'worker-openapi-'));
  const outfile = join(directory, 'openapi.mjs');
  await build({
    stdin: { contents: `export { openApiDocument } from './src/lib/openapi/document.ts'; export { GET } from './src/app/api/openapi/route.ts'; export { default as endpointCatalog } from './src/lib/api-endpoints.ts'; export { createActivityApiInput } from './src/lib/server/activity-api-inputs.ts'; export { stageApiInput } from './src/lib/server/deal-api-inputs.ts';`, loader: 'ts', resolveDir: root },
    bundle: true, platform: 'browser', format: 'esm', outfile, logLevel: 'silent',
  });
  const module = await import(pathToFileURL(outfile).href);
  document = module.openApiDocument;
  endpointCatalog = module.endpointCatalog;
  specGET = module.GET;
  createActivityApiInput = module.createActivityApiInput;
  stageApiInput = module.stageApiInput;
  const source = await readFile(outfile, 'utf8');
  assert.doesNotMatch(source, /cloudflare:workers|process\.env|from\s+["']node:/);
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

test('the public OpenAPI response is valid and independent of Worker environment or database', async () => {
  const response = await specGET(new Request('http://example.test/api/openapi'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), JSON.parse(JSON.stringify(document)));
  assert.equal(document.openapi, '3.0.3');
  const valid = await SwaggerParser.validate(structuredClone(document));
  assert.equal(valid.info.title, document.info.title);
  assert.deepEqual(document.servers.map(server => server.url), ['/']);
});

test('every business route operation is documented once and agrees with the endpoint catalog', async () => {
  const paths = (await readdir(join(root, 'src/app/api'), { recursive: true })).filter(path => path.endsWith('route.ts') && path !== 'openapi/route.ts' && !path.startsWith('auth/'));
  const actual = [];
  for (const file of paths) {
    const source = await readFile(join(root, 'src/app/api', file), 'utf8');
    const path = '/api/' + file.replace(/\/route\.ts$/, '').replace(/\[([^\]]+)\]/g, '{$1}');
    for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) actual.push(`${match[1]} ${path}`);
  }
  const described = [];
  const operationIds = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      described.push(`${method.toUpperCase()} ${path}`);
      assert.ok(operation.operationId);
      operationIds.push(operation.operationId);
      for (const name of [...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1])) {
        const parameter = [...item.parameters ?? [], ...operation.parameters ?? []].find(parameter => parameter.name === name && parameter.in === 'path');
        assert.ok(parameter?.required, `${method} ${path} requires ${name}`);
        assert.notEqual(parameter.schema?.format, 'uuid');
      }
      assert.ok((operation.security ?? document.security)?.length, `${method} ${path} needs authentication`);
    }
  }
  const catalog = endpointCatalog.map(endpoint => `${endpoint.method} ${endpoint.path.replace(/:([^/]+)/g, '{$1}')}`);
  assert.deepEqual(described.sort(), actual.sort());
  assert.deepEqual(described.sort(), catalog.sort());
  assert.equal(new Set(operationIds).size, operationIds.length);
});

function requestSchema(path, method) {
  return document.paths[path][method].requestBody.content['application/json'].schema;
}

test('unexpected failures document an opaque correlation header without changing error bodies', () => {
  for (const item of Object.values(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const failure = operation.responses['500'];
      assert.deepEqual(failure.headers['X-Request-Id']?.schema, { type: 'string', format: 'uuid' });
      assertSchema(document, failure.content['application/json'].schema, { message: 'Internal server error' }, 'generic failure body');
      assert.equal(operation.responses['400'].headers['X-Request-Id'], undefined);
    }
  }
});

test('request schemas describe required fields, protected properties and exact field-value types', () => {
  const samples = [
    ['/api/companies', 'post', { name: 'Example' }],
    ['/api/contacts', 'post', { firstName: 'Example' }],
    ['/api/deals', 'post', { name: 'Example', companyId: 'company', ownerId: 'owner', amount: '0.29' }],
    ['/api/deals', 'post', { name: 'Example', companyId: 'company', ownerId: 'owner', currency: 'usd' }],
    ['/api/deals/{id}', 'patch', { currency: ' uSd ' }],
    ['/api/activities', 'post', { type: 'NOTE', companyId: 'company' }],
    ['/api/deals/{id}/stage', 'post', { stage: 'CLOSED_WON' }],
    ['/api/members/{id}', 'patch', { action: 'change-role', role: 'owner', expectedRevision: 0 }],
    ['/api/members/{id}', 'patch', { action: 'revoke', expectedRevision: 1 }],
    ['/api/members/{id}', 'patch', { action: 'restore', expectedRevision: 2 }],
    ['/api/fields', 'post', { entity: 'COMPANY', type: 'TEXT', label: 'Region' }],
    ['/api/fields/{id}/value', 'put', { entity: 'COMPANY', entityId: 'company', value: '12345678901234567890.12345' }],
    ['/api/fields/{id}/value', 'put', { entity: 'COMPANY', entityId: 'company', value: false }],
    ['/api/fields/{id}/value', 'put', { entity: 'COMPANY', entityId: 'company', value: null }],
  ];
  for (const [path, method, input] of samples) assertSchema(document, requestSchema(path, method), input, `${method} ${path}`);
  const currencyQuery = document.paths['/api/stats'].get.parameters.find(parameter => parameter.name === 'currency').schema;
  assertSchema(document, currencyQuery, ' usd ', 'stats currency input normalization');
  assert.equal(schemaValidator(document, currencyQuery)('US'), false);
  assert.equal(schemaValidator(document, requestSchema('/api/companies', 'post'))({ name: 'Example', id: 'injected' }), false);
  assert.equal(schemaValidator(document, requestSchema('/api/deals', 'post'))({ name: 'Deal', companyId: 'company', ownerId: 'owner', amount: 0.29 }), false);
  assert.equal(schemaValidator(document, requestSchema('/api/fields/{id}/value', 'put'))({ entity: 'COMPANY', entityId: 'company' }), false);
  assert.equal(schemaValidator(document, requestSchema('/api/fields/{id}/value', 'put'))({ entity: 'COMPANY', entityId: 'company', value: 12.5 }), false);
});
test('custom field ordering, projections and editor-time type preconditions are documented additively', () => {
  assert.ok(document.paths['/api/fields/reorder'].post);
  const reorder = schemaValidator(document, requestSchema('/api/fields/reorder', 'post'));
  assert.equal(reorder({ entity: 'COMPANY', ids: ['a', 'b'] }), true);
  assert.equal(reorder({ entity: 'COMPANY', ids: ['a'], actorId: 'forged' }), false);
  const value = schemaValidator(document, requestSchema('/api/fields/{id}/value', 'put'));
  assert.equal(value({ entity: 'CONTACT', entityId: 'contact', value: false, expectedType: 'CHECKBOX' }), true);
  assert.equal(value({ entity: 'CONTACT', entityId: 'contact', value: null }), true);
  assert.equal(value({ entity: 'CONTACT', entityId: 'contact', value: 'draft', expectedType: 'OTHER' }), false);
  for (const entity of ['Company','Contact','Deal']) {
    assert.equal(schemaValidator(document, document.components.schemas[`${entity}Query`])({ includeFields: true }), true);
    assert.ok(document.components.schemas[`${entity}ListRow`].properties.fields);
    assert.equal(document.components.schemas[`${entity}ListRow`].required.includes('fields'), false);
  }
});

test('overview schemas distinguish global counts, currency-local pipeline and optional activity links', () => {
  const stats = document.components.schemas.Stats;
  assert.ok(stats.required.includes('openDeals'));
  assert.ok(stats.required.includes('pipeline'));
  assert.equal(stats.properties.pipeline.minItems, 7);
  assert.equal(stats.properties.pipeline.maxItems, 7);
  assert.equal(schemaValidator(document, stats.properties.pipeline.items)({ stage: 'DEMO_BOOKED', count: 3, value: '180143985094819.82' }), true);
  assert.equal(schemaValidator(document, stats.properties.pipeline.items)({ stage: 'DEMO_BOOKED', count: 3, value: 0.3 }), false);
  const linksQuery = document.paths['/api/activities'].get.parameters.find(parameter => parameter.name === 'includeLinks');
  assert.equal(linksQuery.schema.type, 'boolean');
  assert.equal(linksQuery.schema.default, false);
  const row = document.components.schemas.ActivityListRow;
  assert.ok(row.properties.links); assert.equal(row.required.includes('links'), false);
  assert.equal(Object.hasOwn(document.components.schemas.Activity.properties, 'links'), false);
  assert.equal(schemaValidator(document, document.components.schemas.ActivityLink)({ kind: 'contact', id: 'legacy', name: 'Unavailable / historical (legacy)', archivedAt: null }), true);
  assert.equal(schemaValidator(document, document.components.schemas.ActivityLink)({ kind: 'user', id: 'legacy', name: 'Former', archivedAt: null }), false);
});

test('request examples satisfy their documented schemas and destructive activity deletion has no response body', () => {
  let exampleCount = 0;
  function checkExamples(schema, label) {
    if (!schema || schema.$ref) return;
    if (schema.example !== undefined) {
      assertSchema(document, schema, schema.example, label);
      exampleCount++;
    }
    for (const [name, property] of Object.entries(schema.properties ?? {})) checkExamples(property, `${label}.${name}`);
    if (schema.items) checkExamples(schema.items, `${label}[]`);
  }
  for (const [name, schema] of Object.entries(document.components.schemas)) checkExamples(schema, name);
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      const content = operation.requestBody?.content?.['application/json'];
      if (!content) continue;
      if (content.example !== undefined) {
        assertSchema(document, content.schema, content.example, `${method} ${path} example`);
        exampleCount++;
      }
      for (const example of Object.values(content.examples ?? {})) {
        if (example.value !== undefined) {
          assertSchema(document, content.schema, example.value, `${method} ${path} example`);
          exampleCount++;
        }
      }
    }
  }
  assert.ok(exampleCount > 0, 'the document provides validated examples');
  assert.equal(document.paths['/api/activities/{id}'].delete.responses['204'].content, undefined);
  assert.deepEqual(document.security, [{ sessionCookie: [] }, { secureSessionCookie: [] }]);
  assert.equal(document.components.securitySchemes.sessionCookie.in, 'cookie');
  assert.equal(document.components.securitySchemes.sessionCookie.name, 'better-auth.session_token');
  assert.equal(document.components.securitySchemes.secureSessionCookie.name, '__Secure-better-auth.session_token');
  assert.equal(document.components.securitySchemes.bearerAuth, undefined);
  assert.equal(document.components.securitySchemes.apiKeyAuth, undefined);
});


test('public actor schemas reject forged identities and preserve activity refinements', () => {
  const activity = { type: 'NOTE', companyId: 'company' };
  const stage = { stage: 'CLOSED_WON' };
  assert.equal(createActivityApiInput.safeParse(activity).success, true);
  assert.equal(stageApiInput.safeParse(stage).success, true);
  for (const input of [{ ...activity, createdById: 'actor' }, { ...activity, actorId: 'actor' }]) {
    assert.equal(createActivityApiInput.safeParse(input).success, false);
    assert.equal(schemaValidator(document, requestSchema('/api/activities', 'post'))(input), false);
  }
  assert.equal(stageApiInput.safeParse({ ...stage, actorId: 'actor' }).success, false);
  assert.equal(schemaValidator(document, requestSchema('/api/deals/{id}/stage', 'post'))({ ...stage, actorId: 'actor' }), false);
  for (const input of [
    { type: 'NOTE' },
    { type: 'TASK', companyId: 'company', subject: ' ' },
    { ...activity, dueAt: '2026-09-13' },
  ]) assert.equal(createActivityApiInput.safeParse(input).success, false);
  assert.equal(createActivityApiInput.parse({ type: 'TASK', companyId: 'company', subject: ' Follow up ', dueAt: '2026-09-13' }).subject, 'Follow up');
});

test('member mutations require revisions and expose only safe member records', () => {
  const validate = schemaValidator(document, requestSchema('/api/members/{id}', 'patch'));
  for (const input of [
    { action: 'revoke' },
    { action: 'revoke', expectedRevision: -1 },
    { action: 'revoke', expectedRevision: 1.5 },
    { action: 'change-role', expectedRevision: 0 },
    { action: 'restore', role: 'owner', expectedRevision: 0 },
    { action: 'revoke', expectedRevision: 0, actorId: 'actor' },
  ]) assert.equal(validate(input), false, JSON.stringify(input));
  const member = { id: 'member', name: 'Member', email: 'member@example.test', role: 'member', status: 'active', revision: 0, createdAt: '2026-09-13T00:00:00.000Z', updatedAt: '2026-09-13T00:00:00.000Z', revokedAt: null };
  assertSchema(document, document.components.schemas.Member, member, 'safe member');
  assert.equal(schemaValidator(document, document.components.schemas.Member)({ ...member, accessVersion: 0 }), false);
  assert.ok(document.paths['/api/members'].get.responses['403']);
  assert.ok(document.paths['/api/members/{id}'].patch.responses['409']);
  assert.equal(document.paths['/api/auth/{...all}'], undefined);
});

test('timeline views/counts and deal participation document strict additive contracts', () => {
  const views = ['all', 'history', 'notes', 'upcoming', 'done', 'email', 'meetings'];
  assert.deepEqual(document.paths['/api/activities'].get.parameters.find(parameter => parameter.name === 'view').schema.enum, views);
  assert.deepEqual(document.paths['/api/activities/counts'].get.parameters.map(parameter => parameter.name), ['companyId', 'contactId', 'dealId', 'type']);
  assertSchema(document, document.components.schemas.ActivityCounts, Object.fromEntries(views.map(view => [view, 0])), 'empty counts');
  assert.equal(schemaValidator(document, document.components.schemas.ActivityCounts)({ all: 0 }), false);
  const attach = schemaValidator(document, requestSchema('/api/deals/{id}/contacts', 'post'));
  assert.equal(attach({ contactId: 'contact', role: null }), true);
  assert.equal(attach({ contactId: 'contact' }), true);
  assert.equal(attach({ contactId: 'contact', actorId: 'actor' }), false);
  const role = schemaValidator(document, requestSchema('/api/deals/{id}/contacts/{contactId}', 'patch'));
  assert.equal(role({ role: null }), true);
  assert.equal(role({ role: ' ' }), true);
  assert.equal(role({}), false);
  assert.equal(role({ role: 'x'.repeat(81) }), false);
  assert.equal(document.paths['/api/deals/{id}/contacts/{contactId}'].delete.responses['204'].content, undefined);
});
