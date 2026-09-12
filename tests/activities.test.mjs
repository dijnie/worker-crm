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
