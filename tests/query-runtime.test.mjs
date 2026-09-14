import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness } from './service-harness.mjs';
import { createAuthHarness } from './auth-harness.mjs';

const longAscii = 'a'.repeat(999) + 'Z';
const longUnicode = 'ế'.repeat(999) + 'Z';
const longLiteral = '%_\\'.repeat(333) + 'X';
const samples = [longAscii, longUnicode, 'Prefix MiXeD %_\\ suffix', 'École', longLiteral];
const searches = [
  ['a'.repeat(48), 0], ['a'.repeat(49), 0], [longAscii.toLowerCase(), 0],
  ['ế'.repeat(17), 1], [longUnicode, 1], ['ế'.repeat(1000), -1],
  ['mixed', 2], ['%_\\', 2], ['%', 2], ['_', 2], ['\\', 2],
  ['suffix', 2], ['missing', -1], ['école', -1], ['ÉCOLE', 3],
];

test('D1 literal substring searches retain the full contract across records and facets', async t => {
  const h = await createHarness(t);
  const fields = new h.FieldService(h.db);
  const company = new h.CompanyService(h.db);
  const contact = new h.ContactService(h.db);
  const deal = new h.DealService(h.db);
  const reviewer = await fields.createDefinition({ entity: 'COMPANY', key: 'search_user', label: 'Search user', type: 'USER', showOnFilter: true });
  const definition = await fields.createDefinition({ entity: 'COMPANY', key: 'search_option', label: 'Search option', type: 'SELECT', showOnFilter: true,
    options: samples.slice(0, 4).map(label => ({ label })) });
  for (const [index, name] of samples.slice(0, 4).entries()) {
    const id = `search-${index}`;
    await h.db.insert(h.schema.companies).values({ id, name, industry: name });
    await h.db.insert(h.schema.contacts).values({ id, firstName: name, title: name });
    await h.db.insert(h.schema.deals).values({ id, name, companyId: id, ownerId: 'historical' });
    await h.db.insert(h.schema.user).values({ id, name, email: `${id}@example.test`, emailVerified: true });
    await h.db.insert(h.schema.singletonMembership).values({ userId: id, roleId: null, status: 'active', createdAt: new Date(), updatedAt: new Date() });
    await fields.upsertValue(reviewer.id, 'COMPANY', id, id);
    await fields.upsertValue(definition.id, 'COMPANY', id, definition.options[index].id);
  }
  // Nullable secondary columns and unrelated values must not produce false matches.
  await h.db.insert(h.schema.companies).values({ id: 'nulls', name: 'unrelated' });
  for (const [search, index] of searches) {
    const expected = index < 0 ? [] : [`search-${index}`];
    for (const service of [company, contact, deal]) {
      const result = await service.list({ search });
      assert.deepEqual(result.items.map(row => row.id), expected, `${service.constructor.name}: ${search.slice(0, 30)}`);
      assert.equal(result.total, expected.length);
    }
    for (const [service, facet] of [[company, 'industry'], [contact, 'title'], [company, 'field:search_option'], [company, 'field:search_user']]) {
      const result = await service.facets({ facet, facetSearch: search });
      assert.equal(result.facetPages[facet].total, expected.length, `${facet}: ${search.slice(0, 30)}`);
      assert.deepEqual(result.facetCounts[facet].map(option => option.label), index < 0 ? [] : [samples[index]]);
    }
    const constrained = await company.facets({ facet: 'industry', search });
    assert.equal(constrained.facetPages.industry.total, expected.length);
  }
  await h.db.insert(h.schema.companies).values({ id: 'literal', name: longLiteral });
  assert.equal((await company.list({ search: longLiteral })).items[0].id, 'literal');
  await h.db.insert(h.schema.companies).values({ id: 'domain', name: 'domain record', domain: 'prefix Domain_%\\ suffix' });
  await h.db.insert(h.schema.contacts).values({ id: 'full-name', firstName: 'Ada', lastName: 'Lovelace', email: 'Email_%\\@example.test' });
  await h.db.insert(h.schema.deals).values({ id: 'related-company', name: 'related deal', ownerId: 'historical', companyId: 'search-1' });
  assert.equal((await company.list({ search: 'domain_%\\' })).items[0].id, 'domain');
  assert.equal((await contact.list({ search: 'a love' })).items[0].id, 'full-name');
  assert.equal((await contact.list({ search: 'email_%\\' })).items[0].id, 'full-name');
  assert.deepEqual((await deal.list({ search: longUnicode })).items.map(row => row.id).sort(), ['related-company', 'search-1']);
  await assert.rejects(company.list({ search: 'a'.repeat(1001) }));
  await assert.rejects(company.facets({ facetSearch: 'a'.repeat(1001) }));
});

test('D1 company summaries support 97, 98 and 100 row pages with accurate counts', async t => {
  const h = await createHarness(t);
  const company = new h.CompanyService(h.db);
  for (let index = 0; index < 100; index++) await h.db.insert(h.schema.companies).values({ id: `company-${String(index).padStart(3, '0')}`, name: `Company ${String(index).padStart(3, '0')}` });
  await h.db.insert(h.schema.contacts).values([
    { id: 'active', firstName: 'Active', companyId: 'company-000' },
    { id: 'archived', firstName: 'Archived', companyId: 'company-000', archivedAt: new Date().toISOString() },
  ]);
  for (const stage of ['DEMO_BOOKED', 'CLOSED_WON', 'CLOSED_LOST', 'UNQUALIFIED_TO_BUY']) {
    await h.db.insert(h.schema.deals).values({ id: stage, name: stage, stage, ownerId: 'historical', companyId: 'company-000' });
  }
  await h.db.insert(h.schema.deals).values({ id: 'archived', name: 'Archived', ownerId: 'historical', companyId: 'company-000', archivedAt: new Date().toISOString() });
  for (const limit of [97, 98, 100]) {
    for (const includeSummary of [false, true]) {
      const result = await company.list({ limit, includeSummary, sort: 'name', dir: 'asc' });
      assert.equal(result.total, 100);
      assert.equal(result.items.length, limit);
      assert.equal(result.page, 1);
      assert.equal(result.limit, limit);
      if (includeSummary) {
        assert.equal(result.items[0].contactCount, 1);
        assert.equal(result.items[0].openDealCount, 1);
        assert.equal(result.items[0].owner, null);
        assert.equal(result.items.at(-1).contactCount, 0);
        assert.equal(result.items.at(-1).openDealCount, 0);
      } else assert.equal(Object.hasOwn(result.items[0], 'contactCount'), false);
    }
  }
});

test('authenticated search, directory and saved-view HTTP contracts accept long literal queries', async t => {
  const h = await createAuthHarness(t);
  const owner = await h.signupSystem();
  const request = (path, options = {}) => h.request(path, { ...options, cookie: owner.cookie });
  const created = await request('/api/companies', { method: 'POST', body: { name: longUnicode, industry: longUnicode } });
  assert.equal(created.status, 201);
  const company = await created.json();
  for (const search of ['a'.repeat(48), 'a'.repeat(49), 'ế'.repeat(17), longUnicode]) {
    const response = await request('/api/companies?' + new URLSearchParams({ search }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-total-count'), search.startsWith('ế') ? '1' : '0');
    assert.ok(Array.isArray(await response.json()));
    const facet = await request('/api/companies/facets?' + new URLSearchParams({ facet: 'industry', facetSearch: search }));
    assert.equal(facet.status, 200);
  }
  for (const name of samples) {
    await h.binding.prepare('UPDATE user SET name = ? WHERE id = ?').bind(name, owner.user.id).run();
    const response = await request('/api/assignees?' + new URLSearchParams({ search: name }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-total-count'), '1');
    assert.deepEqual(await response.json(), [{ id: owner.user.id, name, image: null }]);
  }
  const saved = await request('/api/saved-views', { method: 'POST', body: { entity: 'COMPANY', name: 'Long search', filters: { q: longUnicode } } });
  assert.equal(saved.status, 201);
  const view = await saved.json();
  assert.equal(view.filters.q, longUnicode);
  const applied = await request('/api/companies?' + new URLSearchParams({ search: view.filters.q }));
  assert.equal(applied.status, 200);
  assert.equal((await applied.json())[0].id, company.id);
  assert.equal((await request('/api/companies?' + new URLSearchParams({ search: 'a'.repeat(1001) }))).status, 400);
  assert.equal((await request('/api/companies/facets?' + new URLSearchParams({ facetSearch: 'a'.repeat(1001) }))).status, 400);
  assert.equal((await request('/api/assignees?' + new URLSearchParams({ search: 'a'.repeat(1001) }))).status, 400);
  assert.equal((await request('/api/members?search=unsupported')).status, 400);
});
