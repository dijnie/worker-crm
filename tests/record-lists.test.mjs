import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness } from './service-harness.mjs';

test('record list query matrix uses real D1 filtering, sorting, facets and page summaries', async t => {
  const h = await createHarness(t);
  const company = new h.CompanyService(h.db);
  const contact = new h.ContactService(h.db);
  const deal = new h.DealService(h.db);
  const now = new Date();
  const recent = new Date(now.getTime() - 2 * 86400000).toISOString();
  await h.db.insert(h.schema.user).values({ id: 'active-owner', name: 'Zoe Owner', email: 'list-owner@example.test', emailVerified: true });
  await h.db.insert(h.schema.companies).values([
    { id: 'a', name: 'alpha', domain: 'literal_%.example', industry: 'Tech', ownerId: 'active-owner', lastActivityAt: recent, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'b', name: 'Beta', industry: 'Finance', ownerId: 'legacy-owner', createdAt: '2026-01-01 12:00:00', source: 'IMPORT', enrichmentStatus: 'COMPLETE' },
    { id: 'c', name: 'charlie', industry: 'Tech', createdAt: '2026-01-01T01:00:00.000Z' },
    { id: 'archived', name: 'Archived', industry: 'Tech', archivedAt: '2026-02-01T00:00:00Z' },
  ]);
  await h.db.insert(h.schema.contacts).values([
    { id: 'ca', firstName: 'Ada', lastName: 'Lovelace', companyId: 'a', title: 'Engineer', seniority: 'Senior', function: 'Engineering', ownerId: 'active-owner', lastActivityAt: recent },
    { id: 'cb', firstName: 'ben', companyId: 'b', title: 'Founder', seniority: 'Executive', function: 'Leadership', source: 'IMPORT' },
    { id: 'cc', firstName: 'Claire', companyId: null, title: 'Engineer' },
    { id: 'cx', firstName: 'Former', companyId: 'a', archivedAt: recent },
  ]);
  const date = (offset, day) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, day)).toISOString();
  await h.db.insert(h.schema.deals).values([
    { id: 'd1', name: 'USD expensive', companyId: 'a', ownerId: 'active-owner', amount: 10000, currency: 'USD', expectedCloseDate: date(0, 1) },
    { id: 'd2', name: 'USD cheap', companyId: 'a', ownerId: 'legacy-owner', amount: 999, currency: 'USD', expectedCloseDate: date(1, 1) },
    { id: 'd3', name: 'EUR expensive', companyId: 'b', ownerId: 'active-owner', amount: 999999999999, currency: 'EUR', stage: 'CLOSED_WON', expectedCloseDate: date(2, 1) },
    { id: 'd4', name: 'USD unknown', companyId: 'a', ownerId: 'active-owner', amount: null, currency: 'USD', stage: 'UNQUALIFIED_TO_BUY' },
    { id: 'd5', name: 'EUR cheap', companyId: 'a', ownerId: 'legacy-owner', amount: 1, currency: 'EUR', stage: 'CLOSED_LOST' },
    { id: 'dx', name: 'Archived deal', companyId: 'a', ownerId: 'active-owner', amount: 9999, archivedAt: recent },
  ]);

  await t.test('sort before pagination, case insensitive names, timestamps chronological and nulls last', async () => {
    assert.deepEqual((await company.list({ sort: 'name', dir: 'asc', limit: 2 })).items.map(r => r.id), ['a', 'b']);
    assert.deepEqual((await company.list({ sort: 'createdAt', dir: 'asc' })).items.map(r => r.id), ['a', 'c', 'b']);
    assert.deepEqual((await company.list({ sort: 'createdAt', dir: 'desc' })).items.map(r => r.id), ['b', 'c', 'a']);
    for (const dir of ['asc', 'desc']) assert.equal((await company.list({ sort: 'domain', dir })).items[0].id, 'a');
    assert.equal((await company.list({ page: 2, limit: 2 })).total, 3);
    assert.equal((await company.list({ search: '_%' })).total, 1);
    assert.equal((await contact.list({ search: 'Ada Lovelace' })).total, 1);
    assert.equal((await company.list({ archived: true })).items[0].id, 'archived');
  });
  await t.test('exact cents sort grouped by currency in both directions with nulls last', async () => {
    assert.deepEqual((await deal.list({ sort: 'amount', dir: 'asc' })).items.map(r => r.id), ['d5', 'd3', 'd2', 'd1', 'd4']);
    assert.deepEqual((await deal.list({ sort: 'amount', dir: 'desc' })).items.map(r => r.id), ['d1', 'd2', 'd3', 'd5', 'd4']);
    assert.equal((await deal.list({ currency: 'eur', sort: 'amount', dir: 'desc' })).items[0].amount, '9999999999.99');
    assert.equal((await deal.list({ currency: 'USD', filters: { currency: ['EUR'] } })).total, 0);
  });
  await t.test('all built-in facet selections and legacy constraints intersect', async () => {
    const companyCases = [[{ owner: ['unassigned'] }, 1], [{ industry: ['Tech', 'Finance'] }, 3], [{ source: ['IMPORT'] }, 1], [{ enrichment: ['COMPLETE'] }, 1], [{ activity: ['7'] }, 1]];
    for (const [filters, total] of companyCases) assert.equal((await company.list({ filters })).total, total);
    const contactCases = [[{ owner: ['unassigned'] }, 2], [{ company: ['none'] }, 1], [{ title: ['Engineer'] }, 2], [{ seniority: ['Senior'] }, 1], [{ persona: ['Engineering'] }, 1], [{ source: ['IMPORT'] }, 1], [{ activity: ['30'] }, 1]];
    for (const [filters, total] of contactCases) assert.equal((await contact.list({ filters })).total, total);
    const dealCases = [[{ owner: ['legacy-owner'] }, 2], [{ stage: ['CLOSED_WON', 'CLOSED_LOST'] }, 2], [{ status: ['open'] }, 2], [{ status: ['closed'] }, 3], [{ status: ['all'] }, 5], [{ currency: ['EUR'] }, 2], [{ closing: ['none'] }, 2], [{ closing: ['overdue'] }, 1], [{ closing: ['this-month'] }, 1], [{ closing: ['next-month'] }, 1], [{ closing: ['later'] }, 1]];
    for (const [filters, total] of dealCases) assert.equal((await deal.list({ filters })).total, total, JSON.stringify(filters));
    assert.equal((await contact.list({ companyId: 'a', filters: { company: ['b'] } })).total, 0);
    assert.equal((await deal.list({ stage: 'CLOSED_WON', filters: { stage: ['CLOSED_LOST'] } })).total, 0);
    assert.equal((await company.list({ filters: { industry: ['Tech'], owner: ['active-owner'] } })).total, 1);
  });
  await t.test('facets exclude own selection, retain other selections and selected zero counts', async () => {
    const facets = await company.facets({ filters: { industry: ['Finance'], owner: ['active-owner'] }, limit: 1, page: 999 });
    assert.deepEqual(facets.facetCounts.industry.map(o => [o.value, o.count]), [['Tech', 1], ['Finance', 0]]);
    assert.deepEqual(facets.facetCounts.owner.map(o => [o.value, o.count]), [['legacy-owner', 1], ['active-owner', 0]]);
    const statuses = await deal.facets({ facet: 'status', filters: { status: ['open'], currency: ['USD'] } });
    assert.deepEqual(statuses.facetCounts.status.map(o => [o.value, o.count]), [['all', 3], ['open', 2], ['closed', 1]]);
    const legacy = await deal.facets({ facet: 'stage', stage: 'CLOSED_WON', filters: { stage: ['CLOSED_LOST'] } });
    assert.deepEqual(legacy.facetCounts.stage.map(o => [o.value, o.count]), [['CLOSED_WON', 1], ['CLOSED_LOST', 0]]);
    const titles = await contact.facets({ facet: 'title', facetLimit: 1, facetPage: 2 });
    assert.deepEqual(titles.facetCounts.title, [{ value: 'Founder', label: 'Founder', count: 1 }]);
    assert.deepEqual(titles.facetPages.title, { total: 2, page: 2, limit: 1 });
    const searched = await contact.facets({ facet: 'company', facetSearch: 'ALPHA' });
    assert.equal(searched.facetCounts.company[0].value, 'a');
    assert.equal(searched.facetCounts.company[0].count, 1);
    const absent = await contact.facets({ facet: 'title', facetSearch: 'missing', filters: { title: ['Engineer'] } });
    assert.deepEqual(absent.facetCounts.title, [{ value: 'Engineer', label: 'Engineer', count: 2 }]);
  });
  await t.test('summary opt-in preserves raw default shape and safe historical ownership', async () => {
    assert.equal(Object.hasOwn((await company.list()).items[0], 'owner'), false);
    const projected = await company.list({ includeSummary: true, sort: 'name', dir: 'asc' });
    assert.deepEqual(projected.items[0].owner, { id: 'active-owner', name: 'Zoe Owner', image: null });
    assert.equal(projected.items[0].contactCount, 1);
    assert.equal(projected.items[0].openDealCount, 2);
    assert.deepEqual(projected.items[1].owner, { id: 'legacy-owner', name: 'Historical / unknown owner', image: null });
    assert.equal(projected.items[2].owner, null);
    assert.equal((await contact.list({ includeSummary: true, search: 'Ada' })).items[0].company.name, 'alpha');
    assert.equal((await deal.list({ includeSummary: true, search: 'USD cheap' })).items[0].company.id, 'a');
    assert.equal((await company.list({ sort: 'contacts', dir: 'desc' })).items[0].id, 'b');
    assert.equal((await company.list({ sort: 'deals', dir: 'desc' })).items[0].id, 'a');
  });
  await t.test('strict query bounds and unsupported extensions reject', async () => {
    for (const query of [{ sort: 'name; DROP TABLE companies' }, { filters: JSON.parse('{"__proto__":["x"]}') }, { filters: { madeUp: ['x'] } }, { filters: { 'field:x': ['y'] } }, { includeFields: true }, { filters: 'bad' }, { filters: { industry: Array(51).fill('x') } }, { filters: { industry: [''] } }, { stage: 'CLOSED_WON' }, { currency: 'USD' }, { includeSummary: 'true' }, { limit: 101 }, { unexpected: true }]) await assert.rejects(company.list(query));
    for (const query of [{ filters: { stage: ['unknown'] } }, { filters: { currency: ['usd'] } }, { filters: { status: ['lost'] } }, { currency: 'US' }]) await assert.rejects(deal.list(query));
    await assert.rejects(company.facets({ facetLimit: 101 }));
    await assert.rejects(company.facets({ facet: 'title' }));
    assert.equal((await company.list({ includeFields: false })).total, 3);
  });
  await t.test('all allowlisted sorts execute without leaking unsupported identifiers', async () => {
    for (const sort of ['name', 'domain', 'industry', 'owner', 'contacts', 'deals', 'createdAt', 'lastActivity', 'archivedAt']) assert.equal((await company.list({ sort })).total, 3);
    for (const sort of ['name', 'title', 'email', 'company', 'owner', 'createdAt', 'lastActivity', 'archivedAt']) assert.equal((await contact.list({ sort })).total, 3);
    for (const sort of ['name', 'company', 'stage', 'amount', 'owner', 'expectedCloseDate', 'createdAt', 'lastActivity', 'archivedAt']) assert.equal((await deal.list({ sort })).total, 5);
  });
  await t.test('dynamic option enumeration is bounded and many selections stay within D1 bindings', async () => {
    for (let i = 0; i < 60; i++) await h.db.insert(h.schema.companies).values({ id: `option-${i}`, name: `Option ${i}`, industry: `Industry ${String(i).padStart(2, '0')}` });
    const facets = await company.facets({ facet: 'industry' });
    assert.equal(facets.facetCounts.industry.length, 50);
    assert.equal(facets.facetPages.industry.total, 62);
    const searched = await company.facets({ facet: 'industry', facetSearch: 'Industry', facetPage: 2, facetLimit: 50, filters: { industry: ['missing'] } });
    assert.equal(searched.facetCounts.industry.length, 11);
    assert.equal(searched.facetCounts.industry.at(-1).value, 'missing');
    const many = Array.from({ length: 50 }, (_, i) => `value-${i}`);
    assert.equal((await contact.list({ filters: { title: many, seniority: many, persona: many, company: many, owner: many } })).total, 0);
    assert.equal((await contact.facets({ facet: 'title', filters: { title: many, seniority: many, persona: many, company: many, owner: many } })).facetCounts.title.length, 50);
  });

});

test('HTTP list/facet contracts work for ordinary members and reject malformed query encodings', async t => {
  const { createAuthHarness } = await import('./auth-harness.mjs');
  const h = await createAuthHarness(t);
  await h.signupVerified();
  const member = await h.signupVerified();
  const request = (path, options = {}) => h.request(path, { ...options, cookie: member.cookie });
  const created = await request('/api/companies', { method: 'POST', body: { name: 'HTTP company', industry: 'Research', ownerId: member.user.id } });
  assert.equal(created.status, 201);
  const company = await created.json();
  const filters = encodeURIComponent(JSON.stringify({ industry: ['Research'] }));
  const list = await request(`/api/companies?filters=${filters}&includeSummary=true&sort=name&dir=asc&limit=1`);
  assert.equal(list.status, 200);
  assert.equal(list.headers.get('x-total-count'), '1');
  assert.equal(list.headers.get('x-limit'), '1');
  const rows = await list.json();
  assert.equal(rows[0].id, company.id);
  assert.deepEqual(Object.keys(rows[0].owner).sort(), ['id', 'image', 'name']);
  const facets = await request(`/api/companies/facets?filters=${filters}&facet=industry&facetPage=1&facetLimit=1`);
  assert.equal(facets.status, 200);
  assert.deepEqual((await facets.json()).facetCounts.industry, [{ value: 'Research', label: 'Research', count: 1 }]);
  for (const resource of ['companies', 'contacts', 'deals']) {
    assert.equal((await request(`/api/${resource}/facets`)).status, 200);
    assert.equal((await h.request(`/api/${resource}/facets`)).status, 401);
  }
  for (const query of ['filters={', 'filters=[]', 'filters=null', 'filters=%22text%22', 'filters={}&filters={}', 'includeSummary=1', 'includeFields=true', 'sort=unsupported', 'filters=%7B%22unknown%22%3A%5B%22x%22%5D%7D', 'filters=%7B%22field%3Ax%22%3A%5B%22x%22%5D%7D']) {
    assert.equal((await request(`/api/companies?${query}`)).status, 400, query);
  }
  assert.equal((await request('/api/companies/facets?facetPage=1&facetPage=2')).status, 400);
  assert.equal((await request('/api/companies/facets?facetLimit=101')).status, 400);
  assert.equal((await request('/api/companies?includeFields=false')).status, 200);
});
