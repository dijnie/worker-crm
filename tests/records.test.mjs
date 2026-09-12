import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createHarness } from './service-harness.mjs';

let harness;
let companies;
let contacts;

before(async () => {
  harness = await createHarness();
  companies = new harness.CompanyService(harness.db);
  contacts = new harness.ContactService(harness.db);
});
beforeEach(async () => { await harness.reset(); });
after(async () => { await harness?.dispose(); });

const status = expected => error => error.status === expected;
const invalid = error => error.name === 'ZodError' || error.status === 400;

test('strict record inputs reject invalid, protected, and custom-field writes without creating records', async () => {
  for (const input of [null, [], {}, { name: ' ' }, { name: null }, { name: 'Test', id: 'chosen' },
    { name: 'Test', createdAt: '2026-01-01' }, { name: 'Test', enrichmentStatus: 'COMPLETE' },
    { name: 'Test', source: 'IMPORT' }, { name: 'Test', fields: {} }, { name: 'Test', domain: 'not a domain' }]) {
    await assert.rejects(companies.create(input), invalid);
  }
  for (const input of [null, {}, { firstName: ' ' }, { firstName: 'Test', archivedAt: null },
    { firstName: 'Test', email: 'not-email' }, { firstName: 'Test', fields: {} },
    { firstName: 'Test', socialsCheckedAt: '2026-01-01' }]) {
    await assert.rejects(contacts.create(input), invalid);
  }
  assert.equal((await companies.list()).total, 0);
  assert.equal((await contacts.list()).total, 0);
  for (const service of [companies, contacts]) {
    for (const method of ['getById', 'archive', 'restore']) {
      await assert.rejects(service[method](' '), invalid);
      await assert.rejects(service[method]('missing'), status(404));
    }
    for (const input of [{ page: 0 }, { page: 1.5 }, { limit: 101 }, { archived: 'false' }, { unexpected: true }]) {
      await assert.rejects(service.list(input), invalid);
    }
  }
});

test('company domains normalize before uniqueness checks and archived domains can be reused', async () => {
  const company = await companies.create({ name: ' Example ', domain: ' HTTPS://WWW.Example.COM/path ', ownerId: null });
  assert.equal(company.name, 'Example');
  assert.equal(company.domain, 'example.com');
  assert.equal(company.website, 'https://example.com');
  assert.equal(company.source, 'MANUAL');
  await assert.rejects(companies.create({ name: 'Duplicate', domain: 'example.com' }), status(409));
  await companies.archive(company.id);
  const replacement = await companies.create({ name: 'Replacement', domain: 'www.EXAMPLE.com' });
  await assert.rejects(companies.restore(company.id), status(409));
  assert.notEqual((await companies.getById(company.id)).archivedAt, null);
  await companies.archive(replacement.id);
  assert.equal((await companies.restore(company.id)).archivedAt, null);
  assert.equal((await companies.list()).total, 1);
  assert.equal((await companies.list({ archived: true })).items[0].id, replacement.id);
  await companies.create({ name: 'Blank', domain: ' ' });
  await companies.create({ name: 'Null', domain: null });
});

test('partial company updates preserve omitted values, clear nullable fields, and invalidate changed-domain icons', async () => {
  const company = await companies.create({ name: 'Original', domain: 'example.com', description: ' Description ', phone: '123' });
  await harness.db.update(harness.schema.companies).set({ enrichmentStatus: 'COMPLETE', enrichmentError: 'old', iconUrl: 'old-icon', updatedAt: '2000-01-01 00:00:00' })
    .where(harness.eq(harness.schema.companies.id, company.id));
  const noChange = await companies.update(company.id, {});
  assert.equal(noChange.updatedAt, '2000-01-01 00:00:00');
  const updated = await companies.update(company.id, { description: ' ', phone: null, domain: 'new.example', name: ' Renamed ' });
  assert.equal(updated.description, null);
  assert.equal(updated.phone, null);
  assert.equal(updated.website, 'https://example.com');
  assert.equal(updated.name, 'Renamed');
  assert.equal(updated.iconUrl, null);
  assert.equal(updated.enrichmentStatus, 'PENDING');
  assert.equal(updated.enrichmentError, null);
  await assert.rejects(companies.update(company.id, { name: null }), invalid);
  await assert.rejects(companies.update(company.id, { updatedAt: '2026-01-01' }), invalid);
  await assert.rejects(companies.update('missing', { name: 'New' }), status(404));
});

test('contact emails normalize before uniqueness checks, support null, and preserve restore conflicts', async () => {
  const contact = await contacts.create({ firstName: ' Ada ', lastName: ' Lovelace ', email: ' ADA@EXAMPLE.COM ', phone: '123' });
  assert.equal(contact.firstName, 'Ada');
  assert.equal(contact.lastName, 'Lovelace');
  assert.equal(contact.email, 'ada@example.com');
  assert.equal(contact.companyId, null);
  await assert.rejects(contacts.create({ firstName: 'Duplicate', email: 'ada@example.com' }), status(409));
  await contacts.archive(contact.id);
  const replacement = await contacts.create({ firstName: 'Replacement', email: 'ADA@example.com' });
  await assert.rejects(contacts.restore(contact.id), status(409));
  await contacts.update(replacement.id, { email: null });
  const restored = await contacts.restore(contact.id);
  assert.equal(restored.archivedAt, null);
  const updated = await contacts.update(contact.id, { lastName: ' ', phone: null });
  assert.equal(updated.lastName, null);
  assert.equal(updated.phone, null);
  assert.equal(updated.email, 'ada@example.com');
  await contacts.create({ firstName: 'Blank', email: ' ' });
  await assert.rejects(contacts.update(contact.id, { firstName: null }), invalid);
  await assert.rejects(contacts.update(contact.id, { email: 'invalid' }), invalid);
  await assert.rejects(contacts.update('missing', { firstName: 'New' }), status(404));
});

test('reference validation preserves independent employer and primary-contact relationships', async () => {
  await assert.rejects(companies.create({ name: 'Missing primary', primaryContactId: 'missing' }), status(400));
  await assert.rejects(contacts.create({ firstName: 'Missing employer', companyId: 'missing' }), status(400));
  const employer = await companies.create({ name: 'Employer' });
  const contact = await contacts.create({ firstName: 'Employee', companyId: employer.id, ownerId: 'external-user' });
  const primaryCompany = await companies.create({ name: 'Another account', primaryContactId: contact.id });
  const detail = await contacts.getById(contact.id);
  assert.equal(detail.company.id, employer.id);
  assert.equal(detail.primaryOf.id, primaryCompany.id);
  await assert.rejects(companies.create({ name: 'Duplicate primary', primaryContactId: contact.id }), status(409));
  await assert.rejects(contacts.update(contact.id, { companyId: 'missing' }), status(400));
  await assert.rejects(companies.update(employer.id, { primaryContactId: 'missing' }), status(400));
  assert.equal((await contacts.update(contact.id, { companyId: null })).companyId, null);
  assert.equal((await companies.update(primaryCompany.id, { primaryContactId: null })).primaryContactId, null);
  assert.equal((await contacts.getById(contact.id)).primaryOf, null);
});

test('record lists paginate deterministically, escape search wildcards, and separate archived records', async () => {
  await harness.db.insert(harness.schema.companies).values([
    { id: 'a', name: '100% company', createdAt: '2026-01-01 00:00:00' },
    { id: 'b', name: 'under_score', createdAt: '2026-01-01 00:00:00' },
    { id: 'c', name: 'Newest', createdAt: '2026-01-02 00:00:00' },
    { id: 'd', name: 'Archived', archivedAt: '2026-01-03 00:00:00' },
  ]);
  const first = await companies.list({ limit: 2 });
  assert.deepEqual(first.items.map(record => record.id), ['c', 'b']);
  assert.deepEqual({ total: first.total, page: first.page, limit: first.limit }, { total: 3, page: 1, limit: 2 });
  assert.deepEqual((await companies.list({ page: 2, limit: 2 })).items.map(record => record.id), ['a']);
  assert.deepEqual((await companies.list({ search: '%' })).items.map(record => record.id), ['a']);
  assert.deepEqual((await companies.list({ search: '_' })).items.map(record => record.id), ['b']);
  assert.equal((await companies.list({ archived: true })).items[0].id, 'd');
  await harness.db.insert(harness.schema.contacts).values([
    { id: 'a', firstName: 'Ada', lastName: 'Percent%', companyId: 'a', createdAt: '2026-01-01 00:00:00' },
    { id: 'b', firstName: 'Grace', email: 'grace@example.com', companyId: 'b', createdAt: '2026-01-01 00:00:00' },
    { id: 'c', firstName: 'Archived', companyId: 'a', archivedAt: '2026-01-03 00:00:00' },
  ]);
  assert.deepEqual((await contacts.list()).items.map(record => record.id), ['b', 'a']);
  assert.equal((await contacts.list({ companyId: 'a' })).total, 1);
  assert.equal((await contacts.list({ search: '%' })).items[0].id, 'a');
  assert.equal((await contacts.list({ search: 'GRACE@' })).items[0].id, 'b');
  assert.equal((await contacts.list({ companyId: 'a', archived: true })).items[0].id, 'c');
});

test('record details serialize related deal amounts and bound recent activities without losing exact decimal text', async () => {
  const company = await companies.create({ name: 'Account' });
  const contact = await contacts.create({ firstName: 'Buyer', companyId: company.id });
  const [deal] = await harness.db.insert(harness.schema.deals).values({
    name: 'Contract', companyId: company.id, ownerId: 'external-user', amount: 29,
    baseAmount: '99999999999999999999.9999', fxRate: '1234567890.1234567890',
  }).returning();
  await harness.db.insert(harness.schema.dealContacts).values({ dealId: deal.id, contactId: contact.id, role: 'Buyer' });
  await harness.db.batch(Array.from({ length: 22 }, (_, index) => harness.db.insert(harness.schema.activities).values({
    id: `activity-${String(index).padStart(2, '0')}`, type: 'NOTE', createdById: 'external-user',
    companyId: company.id, contactId: contact.id, createdAt: '2026-01-01 00:00:00',
  })));
  const companyDetail = await companies.getById(company.id);
  assert.equal(companyDetail.contacts[0].id, contact.id);
  assert.equal(companyDetail.deals[0].amount, '0.29');
  assert.equal(companyDetail.deals[0].baseAmount, '99999999999999999999.9999');
  assert.equal(companyDetail.activities.length, 20);
  assert.equal(companyDetail.activities[0].id, 'activity-21');
  const contactDetail = await contacts.getById(contact.id);
  assert.equal(contactDetail.company.id, company.id);
  assert.equal(contactDetail.deals[0].amount, '0.29');
  assert.equal(contactDetail.deals[0].role, 'Buyer');
  assert.equal(contactDetail.deals[0].fxRate, '1234567890.1234567890');
  assert.equal(contactDetail.activities.length, 20);
});
