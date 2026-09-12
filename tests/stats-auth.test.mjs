import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createHarness } from './service-harness.mjs';

let harness;
before(async () => { harness = await createHarness(); });
after(async () => { await harness?.dispose(); });
beforeEach(async () => { await harness.reset(); });

test('authentication rejects missing or blank configuration and preserves header precedence', () => {
  const { validateApiToken } = harness;
  const token = crypto.randomUUID();
  const request = headers => new Request('http://api.test', { headers });
  for (const authorization of [`Bearer ${token}`, `Token ${token}`, token]) {
    assert.equal(validateApiToken(request({ authorization }), token), true);
  }
  assert.equal(validateApiToken(request({ 'x-api-token': token }), token), true);
  assert.equal(validateApiToken(request({ authorization: 'wrong', 'x-api-token': token }), token), false);
  assert.equal(validateApiToken(request({ authorization: `Bearer ${token}` }), ''), false);
  assert.equal(validateApiToken(request({ authorization: 'Bearer    ' }), '    '), false);
  assert.equal(validateApiToken(request({}), token), false);
  assert.equal(validateApiToken(request({ authorization: `Bearer ${token}` }), ` ${token} `), true);
});

test('stats separates currencies and excludes archived and closed deals without losing cents', async () => {
  const { db, schema, CompanyService, ContactService, DealService, StatsService } = harness;
  const company = await new CompanyService(db).create({ name: 'Company' });
  const archivedCompany = await new CompanyService(db).create({ name: 'Archived' });
  await new CompanyService(db).archive(archivedCompany.id);
  await new ContactService(db).create({ firstName: 'Contact' });
  const service = new DealService(db);
  const makeDeal = (name, amount, currency = 'USD') => service.create({ name, companyId: company.id, ownerId: 'operator', amount, currency });
  await makeDeal('One', '0.10');
  await makeDeal('Two', '0.20');
  await makeDeal('Other currency', '25.01', 'EUR');
  const archived = await makeDeal('Archived', '100.00');
  await service.archive(archived.id);
  for (const stage of ['CLOSED_WON', 'CLOSED_LOST', 'UNQUALIFIED_TO_BUY']) {
    const deal = await makeDeal(stage, '500.00');
    await service.setStage(deal.id, { stage, actorId: 'operator', reason: 'Reason' });
  }
  assert.equal((await new StatsService(db).getStats()).openDealValue, '0.30');
  const eur = await new StatsService(db).getStats({ currency: 'eur' });
  assert.equal(eur.openDealValue, '25.01');
  assert.equal(eur.currency, 'EUR');
  assert.equal(eur.totalCompanies, 1);
  assert.equal(eur.totalContacts, 1);
  assert.equal(eur.totalDeals, 6);
  await assert.rejects(new StatsService(db).getStats({ currency: 'invalid' }));
  await db.delete(schema.activities);
});

test('stats sums safe stored amounts beyond the JS safe total as exact decimal strings', async () => {
  const { db, CompanyService, DealService, StatsService } = harness;
  const company = await new CompanyService(db).create({ name: 'Company' });
  const data = { name: 'Large', companyId: company.id, ownerId: 'operator', amount: '90071992547409.91' };
  await new DealService(db).create(data);
  await new DealService(db).create(data);
  assert.equal((await new StatsService(db).getStats()).openDealValue, '180143985094819.82');
});

test('weekly activity count starts Monday UTC and accepts SQL and ISO timestamp formats', async () => {
  const { db, schema, StatsService } = harness;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const times = [start.toISOString(), start.toISOString().replace('T', ' ').slice(0, 19), new Date(start.getTime() - 1).toISOString(), new Date(now.getTime() + 86400000).toISOString()];
  for (const createdAt of times) await db.insert(schema.activities).values({ type: 'NOTE', createdById: 'operator', createdAt });
  assert.equal((await new StatsService(db).getStats()).activitiesThisWeek, 2);
});
