import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { createHarness } from './service-harness.mjs';
let h, fields, company;
before(async () => { h = await createHarness(); fields = new h.FieldService(h.db); });
after(async () => { await h?.dispose(); });
beforeEach(async () => { await h.reset(); [company] = await h.db.insert(h.schema.companies).values({ name: 'Field target' }).returning(); });
const definition = (type, extra = {}) => fields.createDefinition({ entity: 'COMPANY', label: type, type, ...extra });
const rejected = (promise, status) => assert.rejects(promise, error => error.status === status);

test('definitions derive stable keys, append positions, reject invalid input and preserve archive uniqueness', async () => {
  const first = await definition('TEXT', { label: "Owner's rank" });
  assert.equal(first.key, 'owners_rank'); assert.equal(first.position, 0);
  assert.equal((await definition('TEXT', { label: '2nd field' })).key, 'f_2nd_field');
  assert.equal((await definition('TEXT', { label: 'Owner' })).key, 'owner_field');
  const updated = await fields.updateDefinition(first.id, { label: 'Renamed' });
  assert.equal(updated.key, 'owners_rank');
  await fields.archiveDefinition(first.id);
  assert.equal((await fields.listDefinitions('COMPANY')).length, 2);
  assert.equal((await fields.listDefinitions('COMPANY', true)).length, 3);
  await rejected(definition('TEXT', { label: "Owner's rank" }), 409);
  assert.equal((await fields.restoreDefinition(first.id)).archivedAt, null);
  await rejected(definition('TEXT', { createdAt: 'fake' }), 400);
  await rejected(fields.updateDefinition(first.id, { key: 'changed' }), 400);
  await rejected(definition('INVALID'), 400);
  await rejected(fields.listDefinitions('INVALID'), 400);
  await rejected(fields.getDefinition('missing'), 404);
});

test('select creation is atomic and options cannot cross field boundaries', async () => {
  await rejected(definition('SELECT'), 400);
  await rejected(definition('TEXT', { options: [{ label: 'Unexpected' }] }), 400);
  await h.binding.prepare("CREATE TRIGGER reject_option BEFORE INSERT ON field_options WHEN NEW.label = 'Reject' BEGIN SELECT RAISE(ABORT, 'option rejected'); END").run();
  try { await assert.rejects(definition('SELECT', { options: [{ label: 'Accept' }, { label: 'Reject' }] })); }
  finally { await h.binding.prepare('DROP TRIGGER reject_option').run(); }
  assert.deepEqual(await fields.listDefinitions('COMPANY'), []);
  const first = await definition('SELECT', { options: [{ label: 'One' }] });
  const second = await definition('SELECT', { label: 'Other', options: [{ label: 'Other option' }] });
  const added = await fields.createOption(first.id, { label: 'Two' }); assert.equal(added.position, 1);
  await rejected(fields.updateOption(first.id, second.options[0].id, { label: 'Hijacked' }), 404);
  await rejected(fields.updateDefinition(first.id, { options: [{ id: second.options[0].id, label: 'Hijacked' }] }), 400);
  await rejected(fields.updateOption(first.id, added.id, { fieldId: second.id }), 400);
});

test('archived selections stay readable while new writes require an active same-field option', async () => {
  const field = await definition('SELECT', { options: [{ label: 'Old' }, { label: 'Current' }] });
  const old = field.options[0];
  await fields.upsertValue(field.id, 'COMPANY', company.id, old.id);
  await fields.updateOption(field.id, old.id, { archived: true });
  assert.equal((await fields.listOptions(field.id)).length, 1);
  assert.equal((await fields.listOptions(field.id, true)).length, 2);
  const [loaded] = await fields.getValues('COMPANY', company.id);
  assert.equal(loaded.value, old.id); assert.equal(loaded.options.find(option => option.id === old.id).label, 'Old');
  await rejected(fields.upsertValue(field.id, 'COMPANY', company.id, old.id), 400);
  await fields.updateOption(field.id, old.id, { archived: false, label: 'Restored' });
  assert.equal((await fields.listOptions(field.id)).length, 2);
  await fields.upsertValue(field.id, 'COMPANY', company.id, old.id);
  await fields.updateDefinition(field.id, { options: [{ id: old.id, label: 'Kept' }, { label: 'Added' }] });
  assert.deepEqual((await fields.listOptions(field.id)).map(option => option.label), ['Kept', 'Added']);
  assert.equal((await fields.listOptions(field.id, true)).length, 3);
  await fields.archiveDefinition(field.id);
  await rejected(fields.upsertValue(field.id, 'COMPANY', company.id, old.id), 400);
  assert.deepEqual(await fields.getValues('COMPANY', company.id), []);
});

test('option replacement rolls back metadata and options when a later write fails', async () => {
  const field = await definition('SELECT', { options: [{ label: 'Original' }] });
  await h.binding.prepare("CREATE TRIGGER reject_option BEFORE INSERT ON field_options WHEN NEW.label = 'Reject' BEGIN SELECT RAISE(ABORT, 'option rejected'); END").run();
  try { await assert.rejects(fields.updateDefinition(field.id, { label: 'Changed', options: [{ label: 'Reject' }] })); }
  finally { await h.binding.prepare('DROP TRIGGER reject_option').run(); }
  const loaded = await fields.getDefinition(field.id);
  assert.equal(loaded.label, field.label); assert.equal(loaded.options[0].id, field.options[0].id);
});

test('non-select definitions hide retained options and require explicit choices when switching back', async () => {
  const field = await definition('SELECT', { options: [{ label: 'First' }, { label: 'Retired' }] });
  await fields.updateOption(field.id, field.options[1].id, { archived: true });
  const storedBefore = await fields.listOptions(field.id, true);
  const converted = await fields.updateDefinition(field.id, { type: 'TEXT' });
  assert.deepEqual(converted.options, []);
  assert.deepEqual((await fields.getDefinition(field.id)).options, []);
  assert.deepEqual((await fields.listDefinitions('COMPANY'))[0].options, []);
  assert.deepEqual((await fields.listDefinitions('COMPANY', true))[0].options, []);
  assert.deepEqual(await fields.listOptions(field.id), []);
  assert.deepEqual(await fields.listOptions(field.id, true), []);
  const retained = await h.db.select().from(h.schema.fieldOptions).where(h.eq(h.schema.fieldOptions.fieldId, field.id)).orderBy(h.asc(h.schema.fieldOptions.position));
  assert.deepEqual(retained, storedBefore);
  await rejected(fields.updateDefinition(field.id, { type: 'SELECT' }), 400);
  await rejected(fields.updateDefinition(field.id, { type: 'SELECT', options: [] }), 400);
  assert.equal((await fields.getDefinition(field.id)).type, 'TEXT');
  const restored = await fields.updateDefinition(field.id, {
    type: 'SELECT', options: storedBefore.map(option => ({ id: option.id, label: option.label })),
  });
  assert.deepEqual(restored.options.map(option => option.id), storedBefore.map(option => option.id));
  assert.ok(restored.options.every(option => option.archivedAt === null));
  assert.deepEqual(await fields.listOptions(field.id), restored.options);
  assert.deepEqual((await fields.listDefinitions('COMPANY'))[0].options, restored.options);
});

test('typed values preserve exact decimals, false, dates and external user IDs without coercion', async () => {
  const cases = [
    ['TEXT', 'text'], ['LONG_TEXT', 'long text'], ['NUMBER', '-99999999999999999999.1234567890'],
    ['CHECKBOX', false], ['DATE', '2026-02-28'], ['URL', 'https://example.test'], ['EMAIL', 'field@example.test'],
    ['PHONE', '+84 123'], ['USER', 'external-user'],
  ];
  for (const [type, value] of cases) {
    const field = await definition(type);
    assert.equal((await fields.getValues('COMPANY', company.id)).find(row => row.id === field.id).value, null);
    const result = await fields.upsertValue(field.id, 'COMPANY', company.id, value);
    assert.equal(result.value, type === 'DATE' ? '2026-02-28T00:00:00.000Z' : value);
    await rejected(fields.upsertValue(field.id, 'COMPANY', company.id, {}), 400);
  }
  const all = await fields.getValues('COMPANY', company.id);
  assert.equal(all.find(row => row.type === 'NUMBER').value, cases[2][1]);
  assert.equal(all.find(row => row.type === 'CHECKBOX').value, false);
  await rejected(fields.upsertValue(all.find(row => row.type === 'NUMBER').id, 'COMPANY', company.id, 12.3), 400);
  await rejected(fields.upsertValue(all.find(row => row.type === 'CHECKBOX').id, 'COMPANY', company.id, 'false'), 400);
  await rejected(fields.upsertValue(all.find(row => row.type === 'DATE').id, 'COMPANY', company.id, '2026-02-30'), 400);
  await rejected(fields.upsertValue(all.find(row => row.type === 'EMAIL').id, 'COMPANY', company.id, 'invalid'), 400);
});

test('values target exactly one existing matching entity, clearing required fields is rejected', async () => {
  const field = await definition('TEXT', { required: true });
  await rejected(fields.upsertValue(field.id, 'CONTACT', company.id, 'value'), 404);
  await rejected(fields.upsertValue(field.id, 'COMPANY', 'missing', 'value'), 404);
  await rejected(fields.upsertValue(field.id, 'INVALID', company.id, 'value'), 400);
  const [person] = await h.db.insert(h.schema.contacts).values({ firstName: 'Target' }).returning();
  await rejected(fields.upsertValue(field.id, 'CONTACT', person.id, 'value'), 400);
  await fields.upsertValue(field.id, 'COMPANY', company.id, 'saved');
  await rejected(fields.upsertValue(field.id, 'COMPANY', company.id, null), 400);
  await rejected(fields.updateDefinition(field.id, { type: 'NUMBER' }), 409);
  await fields.updateDefinition(field.id, { required: false });
  await fields.upsertValue(field.id, 'COMPANY', company.id, null);
  assert.deepEqual(await h.db.select().from(h.schema.fieldValues), []);
  await fields.updateDefinition(field.id, { type: 'NUMBER' });
  const contactField = await fields.createDefinition({ entity: 'CONTACT', type: 'TEXT', label: 'Contact field' });
  await fields.upsertValue(contactField.id, 'CONTACT', person.id, 'contact value');
  const [row] = await h.db.select().from(h.schema.fieldValues);
  assert.equal(row.contactId, person.id); assert.equal(row.companyId, null); assert.equal(row.dealId, null);
});

test('simultaneous type and value writes never store a value of a stale type', async () => {
  for (let index = 0; index < 12; index++) {
    const field = await definition('TEXT', { label: `Concurrent ${index}` });
    const outcomes = await Promise.allSettled([
      fields.updateDefinition(field.id, { type: 'NUMBER' }),
      fields.upsertValue(field.id, 'COMPANY', company.id, 'text value'),
    ]);
    assert.ok(outcomes.some(result => result.status === 'fulfilled'));
    for (const result of outcomes) if (result.status === 'rejected') assert.ok([400, 409].includes(result.reason.status));
    const updated = await fields.getDefinition(field.id);
    const [value] = await h.db.select().from(h.schema.fieldValues).where(h.eq(h.schema.fieldValues.fieldId, field.id));
    if (updated.type === 'NUMBER') assert.equal(value, undefined);
    else assert.equal(value?.text, 'text value');
  }
});


test('select creation supports many options without exceeding statement parameter limits', async () => {
  const field = await definition('SELECT', { options: Array.from({ length: 100 }, (_, index) => ({ label: `Option ${index}` })) });
  assert.equal(field.options.length, 100);
  const replaced = await fields.updateDefinition(field.id, { options: field.options.map(option => ({ id: option.id, label: option.label })) });
  assert.equal(replaced.options.length, 100);
  assert.deepEqual(field.options.map(option => option.position), Array.from({ length: 100 }, (_, index) => index));
});


test('concurrent select conversion leaves no option side effects when a stored value wins', async () => {
  for (let index = 0; index < 8; index++) {
    const field = await definition('TEXT', { label: `Select conversion ${index}` });
    const outcomes = await Promise.allSettled([
      fields.updateDefinition(field.id, { type: 'SELECT', options: [{ label: 'Choice' }] }),
      fields.upsertValue(field.id, 'COMPANY', company.id, 'text value'),
    ]);
    assert.ok(outcomes.some(result => result.status === 'fulfilled'));
    for (const result of outcomes) if (result.status === 'rejected') assert.ok([400, 409].includes(result.reason.status));
    const updated = await fields.getDefinition(field.id);
    const [value] = await h.db.select().from(h.schema.fieldValues).where(h.eq(h.schema.fieldValues.fieldId, field.id));
    if (updated.type === 'SELECT') { assert.equal(value, undefined); assert.equal(updated.options.length, 1); }
    else { assert.equal(value.text, 'text value'); assert.deepEqual(updated.options, []); }
  }
});

test('editor type precondition rejects old drafts before parsing or clearing and preserves legacy writes', async () => {
  const field = await definition('TEXT');
  await fields.updateDefinition(field.id, { type: 'NUMBER' });
  await rejected(fields.upsertValue(field.id, 'COMPANY', company.id, 'old text draft', 'TEXT'), 409);
  await rejected(fields.upsertValue(field.id, 'COMPANY', company.id, '12.34', 'TEXT'), 409);
  await rejected(fields.upsertValue(field.id, 'COMPANY', company.id, null, 'TEXT'), 409);
  assert.deepEqual(await h.db.select().from(h.schema.fieldValues), []);
  await rejected(fields.upsertValue(field.id, 'COMPANY', company.id, 'old text draft'), 400);
  await rejected(fields.upsertValue(field.id, 'COMPANY', company.id, '12.34', 'INVALID'), 400);
  await fields.upsertValue(field.id, 'COMPANY', company.id, '12.34');
  await rejected(fields.upsertValue(field.id, 'COMPANY', company.id, null, 'TEXT'), 409);
  assert.equal((await fields.getValues('COMPANY', company.id))[0].value, '12.34');
  await fields.upsertValue(field.id, 'COMPANY', company.id, null, 'NUMBER');
  assert.deepEqual(await h.db.select().from(h.schema.fieldValues), []);
});

test('all ten editor types round-trip on each entity using the opening type', async () => {
  const [contact] = await h.db.insert(h.schema.contacts).values({ firstName: 'Field target' }).returning();
  const [deal] = await h.db.insert(h.schema.deals).values({ name: 'Field target', companyId: company.id, ownerId: 'external-owner' }).returning();
  for (const [entity, target] of [['COMPANY', company], ['CONTACT', contact], ['DEAL', deal]]) {
    for (const [type, input, expected] of [
      ['TEXT', '  văn bản  ', 'văn bản'], ['LONG_TEXT', 'First\nTiếng Việt', 'First\nTiếng Việt'],
      ['NUMBER', '-99999999999999999999.0000000001', '-99999999999999999999.0000000001'],
      ['DATE', '2026-02-28', '2026-02-28T00:00:00.000Z'], ['CHECKBOX', false, false],
      ['URL', 'https://example.test/path', 'https://example.test/path'], ['EMAIL', 'field@example.test', 'field@example.test'],
      ['PHONE', '  +0012345  ', '+0012345'], ['USER', 'former-external-user', 'former-external-user'], ['SELECT', null, null],
    ]) {
      const field = await fields.createDefinition({ entity, type, label: type, required: true,
        ...(type === 'SELECT' ? { options: [{ label: 'Choice' }] } : {}) });
      const value = type === 'SELECT' ? field.options[0].id : input;
      await fields.upsertValue(field.id, entity, target.id, value, type);
      assert.equal((await fields.getValues(entity, target.id)).find(row => row.id === field.id).value, type === 'SELECT' ? value : expected);
      await rejected(fields.upsertValue(field.id, entity, target.id, null, type), 400);
      await fields.updateDefinition(field.id, { required: false });
      await fields.upsertValue(field.id, entity, target.id, null, type);
    }
  }
});

test('concurrent editor saves and conversions reject stale types with conflict only', async () => {
  for (let index = 0; index < 12; index++) {
    const field = await definition('TEXT', { label: `Editor conversion ${index}` });
    const outcomes = await Promise.allSettled([
      fields.updateDefinition(field.id, { type: 'NUMBER' }),
      fields.upsertValue(field.id, 'COMPANY', company.id, 'old text draft', 'TEXT'),
    ]);
    assert.ok(outcomes.some(result => result.status === 'fulfilled'));
    for (const result of outcomes) if (result.status === 'rejected') assert.equal(result.reason.status, 409);
    const updated = await fields.getDefinition(field.id);
    const rows = await h.db.select().from(h.schema.fieldValues).where(h.eq(h.schema.fieldValues.fieldId, field.id));
    if (updated.type === 'NUMBER') assert.deepEqual(rows, []);
    else assert.equal(rows[0].text, 'old text draft');
  }
});

test('the guarded write rejects type conversion after the definition read for both save and clear', async () => {
  for (const input of ['old draft', null]) {
    const field = await definition('TEXT', { label: input === null ? 'Clear race' : 'Save race' });
    const read = Promise.withResolvers();
    const resume = Promise.withResolvers();
    // Pause after a real D1 definition read to force the stale-write window.
    class PausedFieldService extends h.FieldService {
      async getDefinition(id) {
        const result = await super.getDefinition(id);
        read.resolve();
        await resume.promise;
        return result;
      }
    }
    const pending = new PausedFieldService(h.db).upsertValue(field.id, 'COMPANY', company.id, input, 'TEXT');
    await read.promise;
    try {
      await fields.updateDefinition(field.id, { type: 'NUMBER' });
      await fields.upsertValue(field.id, 'COMPANY', company.id, '42.00', 'NUMBER');
    } finally { resume.resolve(); }
    await rejected(pending, 409);
    assert.equal((await fields.getValues('COMPANY', company.id)).find(row => row.id === field.id).value, '42.00');
  }
});
