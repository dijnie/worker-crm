import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness } from './service-harness.mjs';

test('custom table projections preserve all ten types, placement and page bounds across entities', async t => {
  const h = await createHarness(t);
  const fields = new h.FieldService(h.db);
  const cases = [
    ['TEXT', 'Plain text'], ['LONG_TEXT', 'Line one\nUnicode: Việt'],
    ['NUMBER', '-123456789012345678901234567890.000000000000000000123'],
    ['DATE', '2026-09-13T00:00:00.000Z'], ['CHECKBOX', false], ['SELECT', null],
    ['URL', 'https://example.test/path'], ['EMAIL', 'person@example.test'],
    ['PHONE', '+00123456'], ['USER', 'former-user'],
  ];
  for (const entity of ['COMPANY', 'CONTACT', 'DEAL']) {
    const service = new h[`${entity[0]}${entity.slice(1).toLowerCase()}Service`](h.db);
    const table = entity === 'COMPANY' ? h.schema.companies : entity === 'CONTACT' ? h.schema.contacts : h.schema.deals;
    for (let i = 0; i < 36; i++) await h.db.insert(table).values({ id: `${entity}-${i}`, [entity === 'CONTACT' ? 'firstName' : 'name']: `Record ${String(i).padStart(2, '0')}`, ...(entity === 'DEAL' ? { companyId: 'COMPANY-0', ownerId: 'former-user' } : {}) });
    const expected = {};
    for (const [type, raw] of cases) {
      const definition = await fields.createDefinition({ entity, key: type.toLowerCase(), label: type, type, showOnTable: true, required: type === 'CHECKBOX', ...(type === 'SELECT' ? { options: [{ label: 'Chosen' }] } : {}) });
      const value = type === 'SELECT' ? definition.options[0].id : raw;
      await fields.upsertValue(definition.id, entity, `${entity}-35`, value);
      expected[definition.key] = value;
      if (type === 'NUMBER') await fields.upsertValue(definition.id, entity, `${entity}-34`, '0');
    }
    const hidden = await fields.createDefinition({ entity, label: 'Hidden', type: 'TEXT' });
    await fields.upsertValue(hidden.id, entity, `${entity}-35`, 'Hidden value');
    const archived = await fields.createDefinition({ entity, label: 'Archived', type: 'TEXT', showOnTable: true });
    await fields.upsertValue(archived.id, entity, `${entity}-35`, 'Historical value');
    await fields.archiveDefinition(archived.id);
    assert.equal(Object.hasOwn((await service.list()).items[0], 'fields'), false);
    const result = await service.list({ includeFields: true, includeSummary: true, sort: 'name', dir: 'asc', limit: 35, page: 2 });
    assert.equal(result.total, 36);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, `${entity}-35`);
    assert.deepEqual(result.items[0].fields, expected);
    const empty = await service.list({ includeFields: true, sort: 'name', dir: 'asc', limit: 1 });
    assert.deepEqual(empty.items[0].fields, Object.fromEntries(cases.map(([type]) => [type.toLowerCase(), null])));
    assert.deepEqual((await service.list({ includeFields: true, page: 100 })).items, []);
    assert.equal((await service.list({ includeFields: true, search: 'Record 34' })).items[0].fields.number, '0');
    const definitions = await fields.listDefinitions(entity);
    await fields.reorder({ entity, ids: definitions.map(field => field.id).reverse() });
    assert.deepEqual((await service.list({ includeFields: true, search: 'Record 35' })).items[0].fields, expected);
    await assert.rejects(service.list({ sort: 'field:number' }));
  }
});

test('custom SELECT and USER facets count full matching sets, retain historical selections, and reject stale definitions', async t => {
  const h = await createHarness(t);
  const fields = new h.FieldService(h.db);
  const companies = new h.CompanyService(h.db);
  const select = await fields.createDefinition({ entity: 'COMPANY', key: 'segment', label: 'Segment', type: 'SELECT', showOnFilter: true, showOnTable: true,
    options: Array.from({ length: 65 }, (_, i) => ({ label: `Option ${String(i).padStart(2, '0')}` })) });
  const assignee = await fields.createDefinition({ entity: 'COMPANY', key: 'reviewer', label: 'Reviewer', type: 'USER', showOnFilter: true });
  await h.db.insert(h.schema.user).values({ id: 'active', name: 'Active Reviewer', email: 'reviewer@example.test', emailVerified: true });
  await h.db.insert(h.schema.singletonMembership).values({ userId: 'active', role: 'member', status: 'active', createdAt: new Date(), updatedAt: new Date() });
  for (let i = 0; i < 65; i++) {
    await h.db.insert(h.schema.companies).values({ id: `c${i}`, name: `Company ${String(i).padStart(2, '0')}`, industry: i < 40 ? 'Tech' : 'Finance' });
    await fields.upsertValue(select.id, 'COMPANY', `c${i}`, select.options[i].id);
    await fields.upsertValue(assignee.id, 'COMPANY', `c${i}`, i < 40 ? 'active' : 'former');
  }
  const first = select.options[0].id;
  const last = select.options[64].id;
  const filter = { 'field:reviewer': ['active'], industry: ['Tech'] };
  const page = await companies.list({ filters: filter, page: 2, limit: 30, includeFields: true });
  assert.equal(page.total, 40);
  assert.equal(page.items.length, 10);
  assert.equal((await companies.list({ filters: { ...filter, 'field:segment': [last] } })).total, 0);
  assert.equal((await companies.list({ filters: { 'field:segment': select.options.slice(0, 50).map(option => option.id) } })).total, 50);
  const all = await companies.facets({ limit: 1, page: 999 });
  assert.equal(all.facetCounts['field:segment'].length, 50);
  assert.deepEqual(all.facetPages['field:segment'], { total: 65, page: 1, limit: 50 });
  const counted = await companies.facets({ facet: 'field:segment', filters: { ...filter, 'field:segment': [last] }, facetLimit: 30, facetPage: 2 });
  assert.equal(counted.facetCounts['field:segment'].length, 11);
  assert.deepEqual(counted.facetPages['field:segment'], { total: 40, page: 2, limit: 30 });
  assert.deepEqual(counted.facetCounts['field:segment'].at(-1), { value: last, label: 'Option 64', count: 0 });
  const otherFacet = await companies.facets({ facet: 'industry', filters: { 'field:reviewer': ['former'], industry: ['Tech'] } });
  assert.deepEqual(otherFacet.facetCounts.industry.map(option => [option.value, option.count]), [['Finance', 25], ['Tech', 0]]);
  await fields.updateOption(select.id, first, { label: 'Renamed', archived: true });
  const retired = await companies.facets({ facet: 'field:segment', facetSearch: 'no results', filters: { 'field:segment': [first] } });
  assert.deepEqual(retired.facetCounts['field:segment'], [{ value: first, label: 'Renamed (retired)', count: 1 }]);
  assert.equal(retired.facetPages['field:segment'].total, 0);
  assert.equal((await companies.list({ filters: { 'field:segment': [first] }, includeFields: true })).items[0].fields.segment, first);
  const former = await companies.facets({ facet: 'field:reviewer', facetSearch: 'Active', filters: { 'field:reviewer': ['former'], industry: ['Tech'] } });
  assert.deepEqual(former.facetCounts['field:reviewer'], [{ value: 'active', label: 'Active Reviewer', count: 40 }, { value: 'former', label: 'Unavailable / former user', count: 0 }]);
  await fields.updateDefinition(select.id, { label: 'Renamed field' });
  assert.equal((await companies.list({ filters: { 'field:segment': [first] } })).total, 1);
  for (const input of [{ filters: { 'field:segment': ['foreign'] } }, { filters: { 'field:missing': [] } }, { filters: { 'field:reviewer': ['x'.repeat(201)] } }, { filters: { 'field:bad-key': ['x'] } }]) await assert.rejects(companies.list(input));
  const text = await fields.createDefinition({ entity: 'COMPANY', label: 'Text', type: 'TEXT', showOnFilter: true });
  await assert.rejects(companies.list({ filters: { [`field:${text.key}`]: ['x'] } }), /Repair/);
  await assert.rejects(new h.ContactService(h.db).list({ filters: { 'field:segment': [first] } }), /Repair/);
  await fields.updateDefinition(assignee.id, { showOnFilter: false });
  await assert.rejects(companies.facets({ facet: 'field:reviewer' }), /Repair/);
  await fields.archiveDefinition(select.id);
  await assert.rejects(companies.list({ filters: { 'field:segment': [first] } }), /Repair/);
  await assert.rejects(companies.facets({ facet: 'field:segment' }), /Repair/);
  assert.equal(Object.hasOwn((await companies.list({ includeFields: true })).items[0].fields, 'segment'), false);
  await fields.restoreDefinition(select.id);
  assert.equal((await companies.list({ filters: { 'field:segment': [first] } })).total, 1);
});

test('many custom predicates and a maximum page stay below D1 parameter limits', async t => {
  const h = await createHarness(t);
  const companies = new h.CompanyService(h.db);
  for (let i = 0; i < 100; i++) await h.db.insert(h.schema.companies).values({ id: `page-${i}`, name: `Page ${i}` });
  const filters = {};
  for (let i = 0; i < 55; i++) {
    await h.db.insert(h.schema.fieldDefinitions).values({ id: `field-${i}`, entity: 'COMPANY', key: `reviewer_${i}`, label: `Reviewer ${i}`, type: 'USER', position: i, showOnTable: true, showOnFilter: true });
    await h.db.insert(h.schema.fieldValues).values({ fieldId: `field-${i}`, companyId: 'page-0', userId: 'former' });
    filters[`field:reviewer_${i}`] = ['former'];
  }
  const projected = await companies.list({ includeFields: true, limit: 100 });
  assert.equal(projected.items.length, 100);
  assert.equal(Object.keys(projected.items[0].fields).length, 55);
  const selected = await companies.list({ filters, includeFields: true });
  assert.equal(selected.total, 1);
  assert.equal(selected.items[0].id, 'page-0');
  const facet = await companies.facets({ facet: 'field:reviewer_0', filters });
  assert.deepEqual(facet.facetCounts['field:reviewer_0'], [{ value: 'former', label: 'Unavailable / former user', count: 1 }]);
});

test('ordinary members use custom projections and facets over HTTP for every entity', async t => {
  const { createAuthHarness } = await import('./auth-harness.mjs');
  const { assertApiResponse } = await import('./openapi-assertions.mjs');
  const h = await createAuthHarness(t);
  await h.signupVerified();
  const member = await h.signupVerified();
  const spec = await (await h.request('/api/openapi')).json();
  const request = async (path, method = 'GET', body) => {
    const response = await h.request(path, { cookie: member.cookie, method, body });
    return assertApiResponse(spec, `https://crm.test${path}`, method, response);
  };
  let companyId;
  for (const [resource, entity] of [['companies', 'COMPANY'], ['contacts', 'CONTACT'], ['deals', 'DEAL']]) {
    const created = await request(`/api/${resource}`, 'POST', entity === 'CONTACT' ? { firstName: 'Placement' } : entity === 'DEAL' ? { name: 'Placement', companyId, ownerId: member.user.id } : { name: 'Placement' });
    assert.equal(created.status, 201);
    const record = await created.json();
    if (entity === 'COMPANY') companyId = record.id;
    const definition = await (await request('/api/fields', 'POST', { entity, key: 'http_reviewer', label: 'Reviewer', type: 'USER', showOnTable: true, showOnFilter: true })).json();
    assert.equal((await request(`/api/fields/${definition.id}/value`, 'PUT', { entity, entityId: record.id, value: member.user.id })).status, 200);
    const filters = encodeURIComponent(JSON.stringify({ 'field:http_reviewer': [member.user.id] }));
    const list = await request(`/api/${resource}?includeFields=true&includeSummary=true&filters=${filters}`);
    assert.equal(list.status, 200);
    assert.equal(list.headers.get('x-total-count'), '1');
    assert.deepEqual((await list.json())[0].fields, { http_reviewer: member.user.id });
    assert.equal(Object.hasOwn((await (await request(`/api/${resource}`)).json())[0], 'fields'), false);
    const facet = await request(`/api/${resource}/facets?facet=field%3Ahttp_reviewer&filters=${filters}&facetLimit=1`);
    assert.equal(facet.status, 200);
    assert.deepEqual((await facet.json()).facetCounts['field:http_reviewer'], [{ value: member.user.id, label: member.user.name, count: 1 }]);
  }
  assert.equal((await request('/api/companies?includeFields=1')).status, 400);
  assert.equal((await request('/api/companies?includeFields=true&includeFields=false')).status, 400);
});
