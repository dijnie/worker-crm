import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createHarness } from './service-harness.mjs';

let h;
before(async () => { h = await createHarness(); });
after(async () => { await h?.dispose(); });
beforeEach(async () => { await h.reset(); });

async function records() {
  await h.db.insert(h.schema.companies).values({ id: 'company', name: 'Company' });
  await h.db.insert(h.schema.contacts).values({ id: 'contact', firstName: 'Contact', companyId: 'company' });
  const deals = new h.DealService(h.db);
  const deal = await deals.create({ name: 'Deal', companyId: 'company', ownerId: 'owner', amount: '90071992547409.91' });
  return { deal, deals, activities: new h.ActivityService(h.db), stamps: new h.ActivityStampService(h.db) };
}

test('deal amounts remain exact across list, detail, edits, archive and restore', async () => {
  const { deal, deals } = await records();
  assert.equal(deal.amount, '90071992547409.91');
  assert.equal((await deals.getById(deal.id)).amount, deal.amount);
  assert.equal((await deals.list()).items[0].amount, deal.amount);
  assert.equal((await deals.update(deal.id, { name: 'Renamed' })).amount, deal.amount);
  assert.equal((await deals.archive(deal.id)).amount, deal.amount);
  assert.equal((await deals.list()).total, 0);
  assert.equal((await deals.list({ archived: true })).total, 1);
  assert.equal((await deals.restore(deal.id)).amount, deal.amount);
  await assert.rejects(() => deals.create({ name: 'Too large', companyId: 'company', ownerId: 'owner', amount: '90071992547409.92' }));
  await assert.rejects(() => deals.update(deal.id, { stage: 'CLOSED_WON' }));
});

test('concurrent identical stage changes insert exactly one history entry and no-op preserves timestamps', async () => {
  const { deal, deals } = await records();
  const results = await Promise.all(Array.from({ length: 5 }, () => deals.setStage(deal.id, { stage: 'QUALIFIED_TO_BUY', actorId: 'actor' })));
  assert.equal(results.filter(result => result.changed).length, 1);
  const entries = await h.db.select().from(h.schema.activities);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].meta, { from: 'DEMO_BOOKED', to: 'QUALIFIED_TO_BUY' });
  assert.equal(entries[0].createdById, 'actor');
  const prior = await deals.getById(deal.id);
  assert.deepEqual(await deals.setStage(deal.id, { stage: 'QUALIFIED_TO_BUY', actorId: 'actor' }), { id: deal.id, stage: 'QUALIFIED_TO_BUY', changed: false });
  const next = await deals.getById(deal.id);
  for (const key of ['stageChangedAt', 'updatedAt', 'lastActivityAt']) assert.equal(next[key], prior[key]);
});

test('concurrent different transitions preserve an unbroken history chain', async () => {
  const { deal, deals } = await records();
  await Promise.all([
    deals.setStage(deal.id, { stage: 'QUALIFIED_TO_BUY', actorId: 'actor' }),
    deals.setStage(deal.id, { stage: 'CONTRACT_SENT', actorId: 'actor' }),
  ]);
  const entries = await h.db.select().from(h.schema.activities);
  assert.equal(entries.length, 2);
  const first = entries.find(entry => entry.meta.from === 'DEMO_BOOKED');
  assert.ok(first);
  const second = entries.find(entry => entry.id !== first.id);
  assert.equal(second.meta.from, first.meta.to);
  assert.equal((await deals.getById(deal.id)).stage, second.meta.to);
});

test('stage history failure rolls back stage and stamps', async () => {
  const { deal, deals } = await records();
  const prior = await deals.getById(deal.id);
  await h.binding.prepare("CREATE TRIGGER reject_stage_history BEFORE INSERT ON activities WHEN NEW.type = 'STAGE_CHANGE' BEGIN SELECT RAISE(ABORT, 'forced history failure'); END").run();
  try {
    await assert.rejects(() => deals.setStage(deal.id, { stage: 'CONTRACT_SENT', actorId: 'actor' }));
    const next = await deals.getById(deal.id);
    for (const key of ['stage', 'stageChangedAt', 'updatedAt', 'lastActivityAt']) assert.equal(next[key], prior[key]);
    assert.equal((await h.db.select().from(h.schema.activities)).length, 0);
    assert.equal((await h.db.query.companies.findFirst()).lastActivityAt, null);
  } finally { await h.binding.prepare('DROP TRIGGER reject_stage_history').run(); }
});

test('final stage update failure rolls back already inserted history and company stamp', async () => {
  const { deal, deals } = await records();
  const prior = await deals.getById(deal.id);
  await h.binding.prepare("CREATE TRIGGER reject_stage_update BEFORE UPDATE OF stage ON deals BEGIN SELECT RAISE(ABORT, 'forced stage update failure'); END").run();
  try {
    await assert.rejects(() => deals.setStage(deal.id, { stage: 'CONTRACT_SENT', actorId: 'actor' }));
    const next = await deals.getById(deal.id);
    for (const key of ['stage', 'stageChangedAt', 'updatedAt', 'lastActivityAt']) assert.equal(next[key], prior[key]);
    assert.equal((await h.db.select().from(h.schema.activities)).length, 0);
    assert.equal((await h.db.query.companies.findFirst()).lastActivityAt, null);
  } finally { await h.binding.prepare('DROP TRIGGER reject_stage_update').run(); }
});

test('losing stages require a reason and reopening clears closed metadata', async () => {
  const { deal, deals } = await records();
  await assert.rejects(() => deals.setStage(deal.id, { stage: 'CLOSED_LOST', actorId: 'actor' }));
  await deals.setStage(deal.id, { stage: 'CLOSED_LOST', actorId: 'actor', reason: 'Budget' });
  const closed = await deals.getById(deal.id);
  assert.equal(closed.closedReason, 'Budget');
  assert.ok(closed.closedAt);
  assert.equal((await deals.setStage(deal.id, { stage: 'CLOSED_LOST', actorId: 'actor' })).changed, false);
  await deals.setStage(deal.id, { stage: 'DEMO_BOOKED', actorId: 'actor' });
  const reopened = await deals.getById(deal.id);
  assert.equal(reopened.closedAt, null);
  assert.equal(reopened.closedReason, null);
});

test('activities derive company, stamp creation time monotonically, and restamp after deletion', async () => {
  const { deal, activities, stamps } = await records();
  const logged = await activities.create({ type: 'NOTE', body: 'Earlier meeting', occurredAt: '2000-01-01', contactId: 'contact', dealId: deal.id, createdById: 'actor' });
  assert.equal(logged.companyId, 'company');
  assert.equal(logged.occurredAt, '2000-01-01T00:00:00.000Z');
  for (const table of [h.schema.companies, h.schema.contacts, h.schema.deals]) {
    assert.equal((await h.db.select().from(table))[0].lastActivityAt, logged.createdAt);
  }
  await stamps.touch({ companyId: 'company', contactId: 'contact', dealId: deal.id }, '1999-01-01T00:00:00.000Z');
  assert.equal((await h.db.query.companies.findFirst()).lastActivityAt, logged.createdAt);
  await activities.delete(logged.id);
  for (const table of [h.schema.companies, h.schema.contacts, h.schema.deals]) {
    assert.equal((await h.db.select().from(table))[0].lastActivityAt, null);
  }
});

test('activity creation and deletion roll back when stamping fails', async () => {
  const { activities } = await records();
  await h.binding.prepare("CREATE TRIGGER reject_stamp BEFORE UPDATE OF last_activity_at ON companies BEGIN SELECT RAISE(ABORT, 'forced stamp failure'); END").run();
  try {
    await assert.rejects(() => activities.create({ type: 'NOTE', companyId: 'company', createdById: 'actor' }));
    assert.equal((await h.db.select().from(h.schema.activities)).length, 0);
  } finally { await h.binding.prepare('DROP TRIGGER reject_stamp').run(); }
  const note = await activities.create({ type: 'NOTE', companyId: 'company', createdById: 'actor' });
  await h.binding.prepare("CREATE TRIGGER reject_stamp BEFORE UPDATE OF last_activity_at ON companies BEGIN SELECT RAISE(ABORT, 'forced stamp failure'); END").run();
  try {
    await assert.rejects(() => activities.delete(note.id));
    assert.equal((await activities.getById(note.id)).id, note.id);
  } finally { await h.binding.prepare('DROP TRIGGER reject_stamp').run(); }
});

test('activity validation requires attribution and rejects protected fields, invalid links, dates and non-task completion', async () => {
  const { activities } = await records();
  for (const input of [
    { type: 'NOTE', companyId: 'company' },
    { type: 'NOTE', createdById: 'actor' },
    { type: 'STAGE_CHANGE', companyId: 'company', createdById: 'actor' },
    { type: 'NOTE', companyId: 'missing', createdById: 'actor' },
    { type: 'NOTE', companyId: 'company', createdById: 'actor', occurredAt: '2026-02-30' },
    { type: 'TASK', companyId: 'company', createdById: 'actor' },
    { type: 'NOTE', companyId: 'company', createdById: 'actor', meta: {} },
  ]) await assert.rejects(() => activities.create(input));
  const note = await activities.create({ type: 'NOTE', companyId: 'company', createdById: 'actor' });
  await assert.rejects(() => activities.completeTask(note.id, { completed: true }));
  const task = await activities.create({ type: 'TASK', subject: 'Follow up', contactId: 'contact', createdById: 'actor', dueAt: '2026-10-01' });
  assert.ok((await activities.completeTask(task.id, { completed: true })).completedAt);
  assert.equal((await activities.completeTask(task.id, { completed: false })).completedAt, null);
});

test('activity links remain independent and company attribution uses explicit company then deal then contact', async () => {
  const { deal, activities } = await records();
  await h.db.insert(h.schema.companies).values({ id: 'advisor-employer', name: 'Advisor employer' });
  await h.db.insert(h.schema.companies).values({ id: 'explicit-company', name: 'Explicit company' });
  await h.db.insert(h.schema.contacts).values({ id: 'advisor', firstName: 'Advisor', companyId: 'advisor-employer' });
  const linked = await activities.create({ type: 'NOTE', contactId: 'advisor', dealId: deal.id, createdById: 'actor' });
  assert.equal(linked.companyId, 'company');
  assert.equal(linked.contactId, 'advisor');
  assert.equal(linked.dealId, deal.id);
  assert.equal((await activities.list({ contactId: 'advisor' })).total, 1);
  assert.equal((await activities.list({ dealId: deal.id })).total, 1);
  assert.equal((await new h.CompanyService(h.db).getById('advisor-employer')).lastActivityAt, null);
  const explicit = await activities.create({ type: 'NOTE', companyId: 'explicit-company', contactId: 'advisor', dealId: deal.id, createdById: 'actor' });
  assert.equal(explicit.companyId, 'explicit-company');
  const contactOnly = await activities.create({ type: 'NOTE', contactId: 'advisor', createdById: 'actor' });
  assert.equal(contactOnly.companyId, 'advisor-employer');
});

test('optional activity links preserve page order, all types, stored IDs and unprojected shape', async () => {
  const { deal, activities } = await records();
  const archivedAt = '2026-09-12T00:00:00.000Z';
  await h.db.update(h.schema.companies).set({ archivedAt });
  await h.db.update(h.schema.contacts).set({ lastName: 'Person', archivedAt });
  await h.db.update(h.schema.deals).set({ archivedAt });
  await h.db.batch(Array.from({ length: 14 }, (_, index) => h.db.insert(h.schema.activities).values({
    id: `activity-${String(index).padStart(2, '0')}`, type: h.schema.ACTIVITY_TYPES[index % 7],
    createdById: 'historical-actor', companyId: index % 3 === 0 ? 'company' : null,
    contactId: index % 3 !== 2 ? 'contact' : null, dealId: index % 3 === 0 ? deal.id : null,
    createdAt: index % 2 ? '2026-09-13 12:00:00' : '2026-09-13T12:00:00.000Z',
    occurredAt: `2000-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    dueAt: index % 7 === 4 ? '2026-09-20T00:00:00.000Z' : null,
    completedAt: index === 11 ? '2026-09-13T12:00:00.000Z' : null,
  })));
  const plain = await activities.list({ limit: 10 });
  assert.deepEqual(await activities.list({ limit: 10, includeLinks: false }), plain);
  assert.ok(plain.items.every(row => !Object.hasOwn(row, 'links')));
  const projected = await activities.list({ limit: 10, includeLinks: true });
  assert.deepEqual({ ...projected, items: projected.items.map(({ links, ...row }) => row) }, plain);
  assert.deepEqual(projected.items.map(row => row.id), Array.from({ length: 10 }, (_, index) => `activity-${String(13 - index).padStart(2, '0')}`));
  assert.deepEqual(new Set(projected.items.map(row => row.type)), new Set(h.schema.ACTIVITY_TYPES));
  assert.equal(projected.total, 14);
  for (const row of projected.items) {
    const expected = [];
    if (row.companyId !== null) expected.push({ kind: 'company', id: 'company', name: 'Company', archivedAt });
    if (row.contactId !== null) expected.push({ kind: 'contact', id: 'contact', name: 'Contact Person', archivedAt });
    if (row.dealId !== null) expected.push({ kind: 'deal', id: deal.id, name: 'Deal', archivedAt });
    assert.deepEqual(row.links, expected);
  }
  assert.deepEqual(projected.items.find(row => row.id === 'activity-11').links, []);
  assert.deepEqual(projected.items.find(row => row.id === 'activity-13').links.map(link => link.kind), ['contact']);
  assert.deepEqual((await activities.list({ limit: 10, page: 2, includeLinks: true })).items.map(row => row.id), ['activity-03', 'activity-02', 'activity-01', 'activity-00']);
  assert.deepEqual((await activities.list({ limit: 10, page: 3, includeLinks: true })).items, []);
  for (const view of h.ACTIVITY_VIEWS) {
    for (const anchor of [{}, { companyId: 'company' }, { contactId: 'contact' }, { dealId: deal.id }, { type: 'TASK' }]) {
      const input = { ...anchor, view, limit: 10 };
      const withLinks = await activities.list({ ...input, includeLinks: true });
      assert.deepEqual({ ...withLinks, items: withLinks.items.map(({ links, ...row }) => row) }, await activities.list(input));
    }
  }
  for (const includeLinks of ['true', 'false', 0, 1, null, {}, []]) {
    await assert.rejects(() => activities.list({ includeLinks }));
  }
  await assert.rejects(() => activities.list({ includeLinks: true, sort: 'desc' }));
});

test('activity projection batches only returned IDs and supports 100 distinct links of each kind', async () => {
  const size = 105;
  await h.db.batch(Array.from({ length: size }, (_, index) => h.db.insert(h.schema.companies).values({ id: `company-${index}`, name: `Company ${index}` })));
  await h.db.batch(Array.from({ length: size }, (_, index) => h.db.insert(h.schema.contacts).values({ id: `contact-${index}`, firstName: `Contact ${index}` })));
  await h.db.batch(Array.from({ length: size }, (_, index) => h.db.insert(h.schema.deals).values({ id: `deal-${index}`, name: `Deal ${index}`, companyId: `company-${index}`, ownerId: 'owner' })));
  await h.db.batch(Array.from({ length: size }, (_, index) => h.db.insert(h.schema.activities).values({
    id: `activity-${String(index).padStart(3, '0')}`, type: 'NOTE', createdById: 'actor',
    companyId: `company-${index}`, contactId: `contact-${index}`, dealId: `deal-${index}`,
  })));
  const queries = [];
  const db = new Proxy(h.db, { get(target, property) {
    if (property !== 'batch') return Reflect.get(target, property);
    return statements => {
      queries.push(...statements.map(statement => statement.toSQL()));
      return target.batch(statements);
    };
  } });
  const service = new h.ActivityService(db);
  const result = await service.list({ limit: 100, includeLinks: true });
  assert.equal(result.total, size);
  assert.equal(result.items.length, 100);
  assert.ok(result.items.every(row => row.links.length === 3));
  assert.equal(queries.length, 5);
  for (const [index, kind] of ['company', 'contact', 'deal'].entries()) {
    const query = queries[index + 2];
    assert.match(query.sql, /json_each/);
    assert.equal(query.params.length, 1);
    assert.deepEqual(new Set(JSON.parse(query.params[0])), new Set(result.items.map(row => row[`${kind}Id`])));
    assert.equal(JSON.parse(query.params[0]).length, 100);
  }
  for (const input of [{ limit: 100 }, { limit: 100, includeLinks: false }, { page: 3, limit: 100, includeLinks: true }]) {
    queries.length = 0;
    await service.list(input);
    assert.equal(queries.length, 2);
  }
});

test('records disappearing after the activity page read retain unavailable links and stored IDs', async () => {
  const { deal, activities } = await records();
  const activity = await activities.create({ type: 'NOTE', contactId: 'contact', dealId: deal.id, createdById: 'actor' });
  let batches = 0;
  const db = new Proxy(h.db, { get(target, property) {
    if (property !== 'batch') return Reflect.get(target, property);
    return async queries => {
      const result = await target.batch(queries);
      if (++batches === 1) {
        // Real deletion between page and projection reads exercises the fallback without invalid foreign keys.
        await h.db.batch([h.db.delete(h.schema.companies), h.db.delete(h.schema.contacts)]);
      }
      return result;
    };
  } });
  const result = await new h.ActivityService(db).list({ includeLinks: true });
  assert.equal(result.total, 1);
  const { links, ...row } = result.items[0];
  assert.deepEqual(row, activity);
  assert.deepEqual(links, ['company', 'contact', 'deal'].map(kind => ({
    kind, id: activity[`${kind}Id`], name: `Unavailable / historical (${activity[`${kind}Id`]})`, archivedAt: null,
  })));
});
