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
let directory, document, endpointCatalog, specGET;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'worker-openapi-'));
  const outfile = join(directory, 'openapi.mjs');
  await build({
    stdin: { contents: `export { openApiDocument } from './src/lib/openapi/document.ts'; export { GET } from './src/app/api/openapi/route.ts'; export { default as endpointCatalog } from './src/lib/api-endpoints.ts';`, loader: 'ts', resolveDir: root },
    bundle: true, platform: 'browser', format: 'esm', outfile, logLevel: 'silent',
  });
  const module = await import(pathToFileURL(outfile).href);
  document = module.openApiDocument;
  endpointCatalog = module.endpointCatalog;
  specGET = module.GET;
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
  const paths = (await readdir(join(root, 'src/app/api'), { recursive: true })).filter(path => path.endsWith('route.ts') && path !== 'openapi/route.ts');
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

test('request schemas describe required fields, protected properties and exact field-value types', () => {
  const samples = [
    ['/api/companies', 'post', { name: 'Example' }],
    ['/api/contacts', 'post', { firstName: 'Example' }],
    ['/api/deals', 'post', { name: 'Example', companyId: 'company', ownerId: 'owner', amount: '0.29' }],
    ['/api/deals', 'post', { name: 'Example', companyId: 'company', ownerId: 'owner', currency: 'usd' }],
    ['/api/deals/{id}', 'patch', { currency: ' uSd ' }],
    ['/api/activities', 'post', { type: 'NOTE', companyId: 'company', createdById: 'actor' }],
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
  assert.equal(document.components.securitySchemes.bearerAuth.scheme, 'bearer');
});
