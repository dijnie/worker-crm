import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { createHarness } from './service-harness.mjs';

let h, fields;
before(async () => { h = await createHarness(); fields = new h.FieldService(h.db); });
after(async () => { await h?.dispose(); });
beforeEach(async () => { await h.reset(); });
const create = (label, extra = {}) => fields.createDefinition({ entity: 'COMPANY', type: 'TEXT', label, ...extra });
const rejected = (promise, status) => assert.rejects(promise, error => error.status === status);
const positions = async () => (await fields.listDefinitions('COMPANY', true)).map(({ id, position }) => ({ id, position })).sort((a, b) => a.id.localeCompare(b.id));

test('reorder requires the exact active entity set and preserves archived positions', async () => {
  const first = await create('First', { position: 8 });
  const second = await create('Second', { position: 9 });
  const archived = await create('Archived', { position: 10 });
  const foreign = await create('Foreign', { entity: 'CONTACT' });
  await fields.archiveDefinition(archived.id);
  const before = await positions();
  for (const [ids, status] of [
    [[first.id, first.id], 400], [[first.id, foreign.id], 400],
    [[first.id], 409], [[first.id, second.id, archived.id], 409],
    [[first.id, 'missing'], 409], [[], 409],
  ]) {
    await rejected(fields.reorder({ entity: 'COMPANY', ids }), status);
    assert.deepEqual(await positions(), before);
  }
  await rejected(fields.reorder({ entity: 'COMPANY', ids: [first.id, second.id], unknown: true }), 400);
  const result = await fields.reorder({ entity: 'COMPANY', ids: [second.id, first.id] });
  assert.deepEqual(result.map(field => [field.id, field.position]), [[second.id, 0], [first.id, 1]]);
  assert.equal((await fields.getDefinition(archived.id)).position, 10);
  assert.equal((await fields.getDefinition(foreign.id)).position, 0);
  await fields.restoreDefinition(archived.id);
  assert.deepEqual((await fields.listDefinitions('COMPANY')).map(field => field.id), [second.id, first.id, archived.id]);
});

test('an empty permutation succeeds only for an empty active set', async () => {
  assert.deepEqual(await fields.reorder({ entity: 'COMPANY', ids: [] }), []);
  const field = await create('Archived', { position: 18 });
  await rejected(fields.reorder({ entity: 'COMPANY', ids: [] }), 409);
  await fields.archiveDefinition(field.id);
  assert.deepEqual(await fields.reorder({ entity: 'COMPANY', ids: [] }), []);
  assert.equal((await fields.getDefinition(field.id)).position, 18);
});

test('reorder rolls back every position when an update fails', async () => {
  const first = await create('First', { position: 8 });
  const second = await create('Second', { position: 9 });
  const before = await fields.listDefinitions('COMPANY');
  await h.binding.prepare("CREATE TRIGGER reject_reorder BEFORE UPDATE OF position ON field_definitions WHEN NEW.position = 1 BEGIN SELECT RAISE(ABORT, 'position rejected'); END").run();
  try { await assert.rejects(fields.reorder({ entity: 'COMPANY', ids: [second.id, first.id] })); }
  finally { await h.binding.prepare('DROP TRIGGER reject_reorder').run(); }
  assert.deepEqual(await fields.listDefinitions('COMPANY'), before);
});

test('large complete permutations stay below D1 parameter limits', async () => {
  const ids = Array.from({ length: 120 }, (_, index) => `field-${String(index).padStart(3, '0')}`);
  await h.db.batch(ids.map((id, position) => h.db.insert(h.schema.fieldDefinitions).values({ id, entity: 'COMPANY', key: `key_${position}`, label: id, type: 'TEXT', position })));
  const result = await fields.reorder({ entity: 'COMPANY', ids: [...ids].reverse() });
  assert.deepEqual(result.map(field => field.id), [...ids].reverse());
  assert.deepEqual(result.map(field => field.position), ids.map((_, index) => index));
});

test('create and archive racing reorder never partially change positions', async () => {
  for (const mutation of ['create', 'archive']) {
    for (let index = 0; index < 12; index++) {
      await h.reset();
      const first = await create('First', { position: 8 });
      const second = await create('Second', { position: 9 });
      const [reorder, changed] = await Promise.allSettled([
        fields.reorder({ entity: 'COMPANY', ids: [second.id, first.id] }),
        mutation === 'create' ? create('New') : fields.archiveDefinition(first.id),
      ]);
      assert.equal(changed.status, 'fulfilled');
      const loaded = await Promise.all([fields.getDefinition(first.id), fields.getDefinition(second.id)]);
      if (reorder.status === 'rejected') {
        assert.equal(reorder.reason.status, 409);
        assert.deepEqual(loaded.map(field => field.position), [8, 9]);
      } else assert.deepEqual(loaded.map(field => field.position), [1, 0]);
      if (mutation === 'archive') assert.ok(loaded[0].archivedAt);
      else assert.equal((await fields.listDefinitions('COMPANY')).length, 3);
    }
  }
});
