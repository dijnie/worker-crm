import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createHarness } from './service-harness.mjs';

let h, service;
before(async () => { h = await createHarness(); });
after(async () => { await h?.dispose(); });
beforeEach(async () => {
  await h.reset();
  service = new h.ActivityService(h.db);
  await h.db.insert(h.schema.companies).values([{ id: 'company', name: 'Company' }, { id: 'employer', name: 'Employer' }]);
  await h.db.insert(h.schema.contacts).values({ id: 'contact', firstName: 'Contact', companyId: 'employer' });
});
async function insert(rows) {
  for (const row of rows) await h.db.insert(h.schema.activities).values({ type: 'NOTE', companyId: 'company', createdById: 'historical', createdAt: '2026-09-12T12:00:00.000Z', occurredAt: '2000-01-01', ...row });
}

test('all seven views and counts share full-dataset predicates beyond the preview limit', async () => {
  await insert([
    ...Array.from({ length: 35 }, (_, index) => ({ id: `note-${String(index).padStart(2, '0')}` })),
    ...['CALL', 'EMAIL', 'MEETING', 'STAGE_CHANGE', 'ENRICHMENT'].map(type => ({ id: type, type })),
    { id: 'old-task', type: 'TASK', dueAt: '2001-01-01', createdAt: '1999-01-01' },
    { id: 'undated-task', type: 'TASK' },
    { id: 'done-task', type: 'TASK', completedAt: '2026-09-13T12:00:00Z' },
    { id: 'external', companyId: 'employer', contactId: 'contact' },
  ]);
  const counts = await service.counts({ companyId: 'company' });
  assert.deepEqual(counts, { all: 43, history: 41, notes: 35, upcoming: 2, done: 1, email: 1, meetings: 1 });
  for (const view of h.ACTIVITY_VIEWS) {
    const pages = [];
    for (let page = 1; page <= Math.ceil(counts[view] / 7); page++) {
      const result = await service.list({ companyId: 'company', view, page, limit: 7 });
      assert.equal(result.total, counts[view]);
      pages.push(...result.items);
    }
    assert.equal(new Set(pages.map(row => row.id)).size, counts[view]);
  }
  assert.deepEqual((await service.list({ companyId: 'company', view: 'upcoming' })).items.map(row => row.id), ['old-task', 'undated-task']);
  assert.equal((await service.list({ companyId: 'company', view: 'notes', type: 'TASK' })).total, 0);
  assert.deepEqual(await service.counts({ companyId: 'company', type: 'TASK' }), { all: 3, history: 1, notes: 0, upcoming: 2, done: 1, email: 0, meetings: 0 });
  assert.equal((await service.counts({ contactId: 'contact' })).all, 1);
  assert.equal((await service.counts({ contactId: 'contact', companyId: 'company' })).all, 0);
});

test('mixed timestamp notation uses instant ordering with stable ID ties and null due dates last', async () => {
  await insert([
    { id: 'sql', createdAt: '2026-09-12 13:00:00', type: 'TASK', dueAt: '2026-09-12 13:00:00', completedAt: '2026-09-12 13:00:00' },
    { id: 'iso-a', createdAt: '2026-09-12T12:00:00.000Z', type: 'TASK', dueAt: '2026-09-12T14:00:00+02:00', completedAt: '2026-09-12T12:00:00Z' },
    { id: 'iso-b', createdAt: '2026-09-12T14:00:00+02:00', type: 'TASK', dueAt: '2026-09-12T12:00:00Z', completedAt: '2026-09-12T14:00:00+02:00' },
  ]);
  for (const view of [undefined, 'all', 'history', 'done']) assert.deepEqual((await service.list({ view })).items.map(row => row.id), ['sql', 'iso-b', 'iso-a']);
  await h.db.update(h.schema.activities).set({ completedAt: null });
  await insert([{ id: 'null', type: 'TASK' }]);
  assert.deepEqual((await service.list({ view: 'upcoming' })).items.map(row => row.id), ['iso-b', 'iso-a', 'sql', 'null']);
  assert.equal((await service.counts()).done, 0);
  assert.equal((await service.counts()).upcoming, 4);
});

test('counts are zero on empty data and strict query contracts reject irrelevant inputs', async () => {
  assert.deepEqual(await service.counts(), Object.fromEntries(h.ACTIVITY_VIEWS.map(view => [view, 0])));
  for (const body of [{ view: 'all' }, { page: 1 }, { limit: 10 }, { type: 'UNKNOWN' }, { companyId: '' }]) await assert.rejects(service.counts(body));
  for (const body of [{ view: 'unknown' }, { sort: 'createdAt' }, { record: 'company:id' }]) await assert.rejects(service.list(body));
});
