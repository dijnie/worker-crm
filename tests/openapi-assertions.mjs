import assert from 'node:assert/strict';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const contexts = new WeakMap();

export function schemaValidator(document, schema) {
  let context = contexts.get(document);
  if (!context) {
    const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: true });
    addFormats(ajv);
    context = { ajv, validators: new WeakMap() };
    contexts.set(document, context);
  }
  let validate = context.validators.get(schema);
  if (!validate) {
    validate = context.ajv.compile({ components: document.components, ...schema });
    context.validators.set(schema, validate);
  }
  return validate;
}

export function assertSchema(document, schema, value, label) {
  const validate = schemaValidator(document, schema);
  assert.equal(validate(value), true, `${label}: ${JSON.stringify(validate.errors)}`);
}

export async function assertApiResponse(document, url, method, response) {
  const pathname = new URL(url).pathname;
  const candidates = Object.entries(document.paths).sort(([a], [b]) => (a.match(/\{/g)?.length ?? 0) - (b.match(/\{/g)?.length ?? 0));
  const entry = candidates.find(([path]) => new RegExp(`^${path.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(pathname));
  assert.ok(entry, `Undocumented path ${pathname}`);
  const operation = entry[1][method.toLowerCase()];
  assert.ok(operation, `Undocumented method ${method} ${pathname}`);
  let result = operation.responses[response.status];
  assert.ok(result, `Undocumented status ${response.status}: ${method} ${pathname}`);
  if (result.$ref) result = document.components.responses[result.$ref.split('/').at(-1)];
  const label = `${method} ${pathname} ${response.status}`;
  if (response.status === 204) {
    assert.equal(await response.clone().text(), '', label);
    assert.equal(result.content, undefined, label);
    return response;
  }
  const schema = result.content?.['application/json']?.schema;
  assert.ok(schema, `Missing JSON schema: ${label}`);
  assertSchema(document, schema, await response.clone().json(), label);
  for (const [name, definition] of Object.entries(result.headers ?? {})) {
    const value = response.headers.get(name);
    assert.notEqual(value, null, `Missing header ${name}: ${label}`);
    if (definition.schema) assertSchema(document, definition.schema, definition.schema.type === 'integer' ? Number(value) : value, `${label} ${name}`);
  }
  return response;
}
