import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createHarness } from './service-harness.mjs';

let harness;
before(async () => { harness = await createHarness(); });
after(async () => { await harness?.dispose(); });
beforeEach(async () => { await harness.reset(); });

test('empty stats preserve default USD and return every ordered stage with honest zeroes', async () => {
  const { db, schema, StatsService } = harness;
  assert.deepEqual(await new StatsService(db).getStats(), {
    totalCompanies: 0, totalContacts: 0, totalDeals: 0, openDeals: 0,
    openDealValue: '0.00', currency: 'USD', activitiesThisWeek: 0,
    pipeline: schema.DEAL_STAGES.map(stage => ({ stage, count: 0, value: '0.00' })),
  });
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
  const usd = await new StatsService(db).getStats();
  assert.equal(usd.openDealValue, '0.30');
  assert.equal(usd.openDeals, 3);
  assert.deepEqual(usd.pipeline, schema.DEAL_STAGES.map(stage => ({
    stage,
    count: stage === 'DEMO_BOOKED' ? 2 : ['CLOSED_WON', 'CLOSED_LOST', 'UNQUALIFIED_TO_BUY'].includes(stage) ? 1 : 0,
    value: stage === 'DEMO_BOOKED' ? '0.30' : ['CLOSED_WON', 'CLOSED_LOST', 'UNQUALIFIED_TO_BUY'].includes(stage) ? '500.00' : '0.00',
  })));
  const eur = await new StatsService(db).getStats({ currency: 'eur' });
  assert.equal(eur.openDealValue, '25.01');
  assert.equal(eur.currency, 'EUR');
  assert.equal(eur.totalCompanies, 1);
  assert.equal(eur.totalContacts, 1);
  assert.equal(eur.totalDeals, 6);
  assert.equal(eur.openDeals, 3);
  assert.deepEqual(eur.pipeline, schema.DEAL_STAGES.map(stage => ({
    stage, count: stage === 'DEMO_BOOKED' ? 1 : 0, value: stage === 'DEMO_BOOKED' ? '25.01' : '0.00',
  })));
  await assert.rejects(new StatsService(db).getStats({ currency: 'invalid' }));
  await db.delete(schema.activities);
});

test('stats sums safe stored amounts beyond the JS safe total as exact decimal strings', async () => {
  const { db, CompanyService, DealService, StatsService } = harness;
  const company = await new CompanyService(db).create({ name: 'Company' });
  const data = { name: 'Large', companyId: company.id, ownerId: 'operator', amount: '90071992547409.91' };
  await new DealService(db).create(data);
  await new DealService(db).create(data);
  const stats = await new StatsService(db).getStats();
  assert.equal(stats.openDealValue, '180143985094819.82');
  assert.deepEqual(stats.pipeline[0], { stage: 'DEMO_BOOKED', count: 2, value: '180143985094819.82' });
});

test('stats scans every selected-currency deal once in one batch including null, zero and closed amounts', async () => {
  const { db, schema, CompanyService, StatsService } = harness;
  const company = await new CompanyService(db).create({ name: 'Pipeline' });
  const archivedContact = await db.insert(schema.contacts).values({ firstName: 'Archived', archivedAt: new Date().toISOString() }).returning();
  assert.equal(archivedContact.length, 1);
  const rows = schema.DEAL_STAGES.flatMap(stage => [
    ...Array.from({ length: 21 }, (_, index) => ({ stage, amount: index === 0 ? null : index === 1 ? 0 : 10, currency: 'USD' })),
    { stage, amount: Number.MAX_SAFE_INTEGER, currency: 'EUR' },
    { stage, amount: Number.MAX_SAFE_INTEGER, currency: 'USD', archivedAt: new Date().toISOString() },
  ]);
  for (let offset = 0; offset < rows.length; offset += 25) {
    await db.batch(rows.slice(offset, offset + 25).map((row, index) => db.insert(schema.deals).values({
      name: `Pipeline ${offset + index}`, companyId: company.id, ownerId: 'operator', ...row,
    })));
  }
  const batches = [];
  const observedDb = new Proxy(db, {
    get(target, property, receiver) {
      if (property === 'batch') return async statements => {
        const result = await target.batch(statements);
        batches.push({ queries: statements.map(statement => statement.toSQL()), result });
        return result;
      };
      return Reflect.get(target, property, receiver);
    },
  });
  const stats = await new StatsService(observedDb).getStats();
  assert.equal(stats.totalDeals, 154);
  assert.equal(stats.totalContacts, 0);
  assert.equal(stats.openDeals, 88);
  assert.equal(stats.openDealValue, '7.60');
  assert.deepEqual(stats.pipeline, schema.DEAL_STAGES.map(stage => ({ stage, count: 21, value: '1.90' })));
  assert.equal(batches.length, 1);
  assert.equal(batches[0].queries.length, 6);
  const projectedRows = batches[0].result[5];
  assert.equal(projectedRows.length, 147);
  assert.deepEqual(Object.keys(projectedRows[0]).sort(), ['amount', 'stage']);
  assert.doesNotMatch(batches[0].queries[5].sql, /\blimit\b|\bsum\s*\(/i);

  const eur = await new StatsService(db).getStats({ currency: 'EUR' });
  assert.equal(eur.openDeals, 88);
  assert.equal(eur.openDealValue, '360287970189639.64');
  assert.deepEqual(eur.pipeline, schema.DEAL_STAGES.map(stage => ({ stage, count: 1, value: '90071992547409.91' })));
  const missingCurrency = await new StatsService(db).getStats({ currency: 'JPY' });
  assert.equal(missingCurrency.totalDeals, 154);
  assert.equal(missingCurrency.openDeals, 88);
  assert.equal(missingCurrency.openDealValue, '0.00');
  assert.deepEqual(missingCurrency.pipeline, schema.DEAL_STAGES.map(stage => ({ stage, count: 0, value: '0.00' })));
});

test('weekly activity count starts Monday UTC and accepts SQL and ISO timestamp formats', async () => {
  const { db, schema, StatsService } = harness;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const times = [start.toISOString(), start.toISOString().replace('T', ' ').slice(0, 19), new Date(start.getTime() - 1).toISOString(), new Date(now.getTime() + 86400000).toISOString()];
  for (const createdAt of times) await db.insert(schema.activities).values({
    type: 'NOTE', createdById: 'operator', createdAt,
    occurredAt: new Date(start.getTime() - 86400000).toISOString(),
  });
  assert.equal((await new StatsService(db).getStats()).activitiesThisWeek, 2);
});
