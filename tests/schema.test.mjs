import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const migrationFolder = join(projectRoot, 'migrations');
const tableNames = [
  'activities', 'companies', 'contacts', 'deal_contacts', 'deals',
  'field_definitions', 'field_options', 'field_values', 'saved_views',
];
let temporaryDirectory;
let miniflare;
let binding;
let db;
let schema;
let eq;
let migrate;

before(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'worker-schema-'));
  const modulePath = join(temporaryDirectory, 'schema.mjs');
  await build({
    stdin: {
      contents: `
        import * as schema from './src/lib/db/schema/index.ts';
        export { schema };
        export { drizzle } from 'drizzle-orm/d1';
        export { migrate } from 'drizzle-orm/d1/migrator';
        export { eq } from 'drizzle-orm';
      `,
      resolveDir: projectRoot,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: modulePath,
    logLevel: 'silent',
  });
  const bundled = await import(pathToFileURL(modulePath).href);
  ({ schema, eq, migrate } = bundled);
  miniflare = new Miniflare({
    resourcePersistencePath: join(temporaryDirectory, 'storage'),
    telemetry: { enabled: false },
    workers: [{
      config: {
        type: 'worker',
        name: 'schema-tests',
        compatibilityDate: '2026-09-11',
        manifest: {
          mainModule: 'worker.mjs',
          modules: {
            'worker.mjs': {
              type: 'esm',
              contents: 'export default { fetch() { return new Response("schema tests"); } };',
            },
          },
        },
        env: { DB: { type: 'd1', id: 'schema-tests' } },
      },
    }],
  });
  binding = await miniflare.getD1Database('DB');
  db = bundled.drizzle(binding, { schema });
  await migrate(db, { migrationsFolder: migrationFolder });
});

after(async () => {
  try {
    await miniflare?.dispose();
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

beforeEach(async () => {
  // Delete dependants first, leaving the migration history intact between tests.
  for (const name of [
    'activities', 'field_values', 'field_options', 'field_definitions',
    'deal_contacts', 'deals', 'companies', 'contacts', 'saved_views',
  ]) {
    await binding.prepare(`DELETE FROM ${name}`).run();
  }
});

async function insert(table, values) {
  const [row] = await db.insert(table).values(values).returning();
  return row;
}

async function constraint(query, expected) {
  await assert.rejects(async () => { await query; }, (error) => {
    assert.match(String(error.cause?.message ?? error.message), expected);
    return true;
  });
}

const company = (values = {}) => insert(schema.companies, { name: 'Example', ...values });
const contact = (values = {}) => insert(schema.contacts, { firstName: 'Ada', ...values });
const deal = (companyId, values = {}) => insert(schema.deals, {
  name: 'Annual contract', companyId, ownerId: 'external-user', ...values,
});
const field = (entity, values = {}) => insert(schema.fieldDefinitions, {
  entity, key: 'priority', label: 'Priority', type: 'SELECT', position: 0, ...values,
});

test('migrations create exactly the business tables and can be applied again', async () => {
  await migrate(db, { migrationsFolder: migrationFolder });
  const result = await binding.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != '__drizzle_migrations' ORDER BY name",
  ).all();
  assert.deepEqual(result.results.map(({ name }) => name), tableNames);
  assert.equal((await binding.prepare('PRAGMA foreign_keys').first()).foreign_keys, 1);
});

test('the schema barrel and constants bundle for browsers without Worker runtime imports', async () => {
  const result = await build({
    entryPoints: [
      join(projectRoot, 'src/lib/db/schema/index.ts'),
      join(projectRoot, 'src/lib/db/schema/constants.ts'),
    ],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    outdir: join(temporaryDirectory, 'browser'),
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  assert.equal(result.outputFiles.length, 2);
  for (const input of Object.keys(result.metafile.inputs)) {
    assert.doesNotMatch(input, /cloudflare:workers|src\/lib\/db\/index\.ts$/);
  }
});

test('ORM inserts generate UUIDs and timestamps, and updates advance updatedAt', async () => {
  const oldTimestamp = '2000-01-01 00:00:00';
  const record = await company({ updatedAt: oldTimestamp });
  assert.match(record.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.ok(Number.isFinite(Date.parse(record.createdAt)));
  assert.equal(record.enrichmentStatus, 'PENDING');
  assert.equal(record.source, 'MANUAL');
  const [updated] = await db.update(schema.companies).set({ name: 'Updated' })
    .where(eq(schema.companies.id, record.id)).returning();
  assert.ok(Date.parse(updated.updatedAt) > Date.parse(oldTimestamp));
  assert.equal(updated.createdAt, record.createdAt);
  const defaultContact = await contact();
  assert.equal(defaultContact.companyId, null);
  assert.equal(defaultContact.enrichmentStatus, 'PENDING');
  assert.equal(defaultContact.source, 'MANUAL');
  const defaultDeal = await deal(record.id);
  assert.equal(defaultDeal.stage, 'DEMO_BOOKED');
  assert.equal(defaultDeal.currency, 'USD');
  assert.ok(Number.isFinite(Date.parse(defaultDeal.stageChangedAt)));
});

test('company domain and contact email are unique only among active records', async () => {
  for (const [table, create, property] of [
    [schema.companies, company, 'domain'],
    [schema.contacts, contact, 'email'],
  ]) {
    const identifier = property === 'domain' ? 'example.test' : 'ada@example.test';
    const first = await create({ [property]: identifier });
    await constraint(create({ [property]: identifier }), /UNIQUE constraint failed/);
    await db.update(table).set({ archivedAt: '2026-01-01 00:00:00' }).where(eq(table.id, first.id));
    const replacement = await create({ [property]: identifier });
    await create({ [property]: identifier, archivedAt: '2026-02-01 00:00:00' });
    await constraint(db.update(table).set({ archivedAt: null }).where(eq(table.id, first.id)), /UNIQUE constraint failed/);
    await db.delete(table).where(eq(table.id, replacement.id));
    await db.update(table).set({ archivedAt: null }).where(eq(table.id, first.id));
    await create();
    await create();
    const [restored] = await db.select().from(table).where(eq(table.id, first.id));
    assert.equal(restored.archivedAt, null);
  }
});

test('company membership and primary contact are distinct nullable relationships', async () => {
  const employer = await company();
  const primaryCompany = await company({ name: 'Primary relationship' });
  const person = await contact({ companyId: employer.id });
  const unassigned = await db.query.contacts.findFirst({
    where: eq(schema.contacts.id, person.id), with: { primaryOf: true },
  });
  assert.equal(unassigned.primaryOf, null);
  await db.update(schema.companies).set({ primaryContactId: person.id })
    .where(eq(schema.companies.id, primaryCompany.id));
  const loaded = await db.query.contacts.findFirst({
    where: eq(schema.contacts.id, person.id), with: { company: true, primaryOf: true },
  });
  assert.equal(loaded.company.id, employer.id);
  assert.equal(loaded.primaryOf.id, primaryCompany.id);
  await constraint(company({ primaryContactId: person.id }), /UNIQUE constraint failed/);
  await constraint(contact({ companyId: 'missing' }), /FOREIGN KEY constraint failed/);
  await constraint(company({ primaryContactId: 'missing' }), /FOREIGN KEY constraint failed/);
  await db.delete(schema.companies).where(eq(schema.companies.id, employer.id));
  assert.equal((await db.query.contacts.findFirst({ where: eq(schema.contacts.id, person.id) })).companyId, null);
  await db.delete(schema.contacts).where(eq(schema.contacts.id, person.id));
  assert.equal((await db.query.companies.findFirst({ where: eq(schema.companies.id, primaryCompany.id) })).primaryContactId, null);
});

test('all forward and reverse relations resolve through Drizzle relational queries', async () => {
  const organization = await company();
  const person = await contact({ companyId: organization.id });
  await db.update(schema.companies).set({ primaryContactId: person.id })
    .where(eq(schema.companies.id, organization.id));
  const opportunity = await deal(organization.id);
  await insert(schema.dealContacts, { dealId: opportunity.id, contactId: person.id, role: 'Buyer' });
  const event = await insert(schema.activities, {
    type: 'ENRICHMENT', createdById: 'external-user', companyId: organization.id,
    contactId: person.id, dealId: opportunity.id, meta: { provider: 'test', found: true },
  });
  const definition = await field('COMPANY');
  const option = await insert(schema.fieldOptions, { fieldId: definition.id, label: 'High', position: 0 });
  const value = await insert(schema.fieldValues, {
    fieldId: definition.id, optionId: option.id, companyId: organization.id,
    contactId: person.id, dealId: opportunity.id,
  });
  const loadedCompany = await db.query.companies.findFirst({
    where: eq(schema.companies.id, organization.id),
    with: { contacts: true, deals: true, activities: true, fieldValues: true, primaryContact: true },
  });
  assert.deepEqual(loadedCompany.contacts.map(({ id }) => id), [person.id]);
  assert.deepEqual(loadedCompany.deals.map(({ id }) => id), [opportunity.id]);
  assert.deepEqual(loadedCompany.activities.map(({ id }) => id), [event.id]);
  assert.deepEqual(loadedCompany.fieldValues.map(({ id }) => id), [value.id]);
  assert.equal(loadedCompany.primaryContact.id, person.id);
  const loadedContact = await db.query.contacts.findFirst({
    where: eq(schema.contacts.id, person.id),
    with: { company: true, primaryOf: true, deals: { with: { deal: true } }, activities: true, fieldValues: true },
  });
  assert.equal(loadedContact.company.id, organization.id);
  assert.equal(loadedContact.primaryOf.id, organization.id);
  assert.equal(loadedContact.deals[0].deal.id, opportunity.id);
  assert.equal(loadedContact.activities[0].id, event.id);
  assert.equal(loadedContact.fieldValues[0].id, value.id);
  const loadedDeal = await db.query.deals.findFirst({
    where: eq(schema.deals.id, opportunity.id),
    with: { company: true, contacts: { with: { contact: true } }, activities: true, fieldValues: true },
  });
  assert.equal(loadedDeal.company.id, organization.id);
  assert.equal(loadedDeal.contacts[0].contact.id, person.id);
  assert.equal(loadedDeal.contacts[0].role, 'Buyer');
  assert.equal(loadedDeal.activities[0].id, event.id);
  assert.equal(loadedDeal.fieldValues[0].id, value.id);
  const loadedActivity = await db.query.activities.findFirst({ with: { company: true, contact: true, deal: true } });
  assert.equal(loadedActivity.company.id, organization.id);
  assert.equal(loadedActivity.contact.id, person.id);
  assert.equal(loadedActivity.deal.id, opportunity.id);
  assert.deepEqual(loadedActivity.meta, { provider: 'test', found: true });
  const loadedDefinition = await db.query.fieldDefinitions.findFirst({ with: { options: true, values: true } });
  assert.equal(loadedDefinition.options[0].id, option.id);
  assert.equal(loadedDefinition.values[0].id, value.id);
  const loadedOption = await db.query.fieldOptions.findFirst({ with: { field: true, values: true } });
  assert.equal(loadedOption.field.id, definition.id);
  assert.equal(loadedOption.values[0].id, value.id);
  const loadedValue = await db.query.fieldValues.findFirst({
    with: { field: true, option: true, company: true, contact: true, deal: true },
  });
  assert.equal(loadedValue.field.id, definition.id);
  assert.equal(loadedValue.option.id, option.id);
  assert.equal(loadedValue.company.id, organization.id);
  assert.equal(loadedValue.contact.id, person.id);
  assert.equal(loadedValue.deal.id, opportunity.id);
});

test('deals require a company and owner, and join rows enforce composite uniqueness', async () => {
  const organization = await company();
  const first = await contact();
  const second = await contact();
  await constraint(deal(null), /NOT NULL constraint failed/);
  await constraint(deal('missing'), /FOREIGN KEY constraint failed/);
  await constraint(deal(organization.id, { ownerId: null }), /NOT NULL constraint failed/);
  const opportunity = await deal(organization.id);
  const other = await deal(organization.id);
  await insert(schema.dealContacts, { dealId: opportunity.id, contactId: first.id });
  await insert(schema.dealContacts, { dealId: opportunity.id, contactId: second.id });
  await insert(schema.dealContacts, { dealId: other.id, contactId: first.id });
  await constraint(insert(schema.dealContacts, { dealId: opportunity.id, contactId: first.id }), /UNIQUE constraint failed/);
  await constraint(insert(schema.dealContacts, { dealId: opportunity.id, contactId: 'missing' }), /FOREIGN KEY constraint failed/);
  await db.delete(schema.contacts).where(eq(schema.contacts.id, first.id));
  assert.equal((await db.select().from(schema.dealContacts)).length, 1);
  await db.delete(schema.deals).where(eq(schema.deals.id, opportunity.id));
  assert.deepEqual(await db.select().from(schema.dealContacts), []);
  assert.equal((await db.select().from(schema.contacts)).length, 1);
});

test('deleting a company cascades deals and their dependants while preserving contacts', async () => {
  const organization = await company();
  const person = await contact({ companyId: organization.id });
  const opportunity = await deal(organization.id);
  const definition = await field('DEAL');
  await insert(schema.dealContacts, { dealId: opportunity.id, contactId: person.id });
  await insert(schema.activities, { type: 'NOTE', createdById: 'external-user', companyId: organization.id });
  await insert(schema.activities, { type: 'NOTE', createdById: 'external-user', dealId: opportunity.id });
  await insert(schema.fieldValues, { fieldId: definition.id, companyId: organization.id });
  await insert(schema.fieldValues, { fieldId: definition.id, dealId: opportunity.id });
  await db.delete(schema.companies).where(eq(schema.companies.id, organization.id));
  for (const table of [schema.deals, schema.dealContacts, schema.activities, schema.fieldValues]) {
    assert.deepEqual(await db.select().from(table), []);
  }
  assert.equal((await db.query.contacts.findFirst()).companyId, null);
  assert.equal((await db.select().from(schema.fieldDefinitions)).length, 1);
});

test('custom fields enforce per-record uniqueness and option/definition deletion semantics', async () => {
  const organization = await company();
  const person = await contact();
  const opportunity = await deal(organization.id);
  const definition = await field('COMPANY');
  assert.equal(definition.agentFilled, true);
  assert.equal(definition.required, false);
  assert.equal(definition.showOnSheet, true);
  assert.equal(definition.showOnTable, false);
  assert.equal(definition.showOnFilter, false);
  await constraint(field('COMPANY'), /UNIQUE constraint failed/);
  await field('CONTACT');
  const option = await insert(schema.fieldOptions, { fieldId: definition.id, label: 'High', position: 0 });
  for (const [property, id] of [['companyId', organization.id], ['contactId', person.id], ['dealId', opportunity.id]]) {
    await insert(schema.fieldValues, { fieldId: definition.id, [property]: id, optionId: option.id });
    await constraint(insert(schema.fieldValues, { fieldId: definition.id, [property]: id }), /UNIQUE constraint failed/);
  }
  await db.delete(schema.fieldOptions).where(eq(schema.fieldOptions.id, option.id));
  const values = await db.select().from(schema.fieldValues);
  assert.equal(values.length, 3);
  assert.ok(values.every((value) => value.optionId === null));
  await insert(schema.fieldOptions, { fieldId: definition.id, label: 'Replacement', position: 1 });
  await db.delete(schema.fieldDefinitions).where(eq(schema.fieldDefinitions.id, definition.id));
  assert.deepEqual(await db.select().from(schema.fieldValues), []);
  assert.deepEqual(await db.select().from(schema.fieldOptions), []);
  assert.equal((await db.select().from(schema.companies)).length, 1);
  assert.equal((await db.select().from(schema.contacts)).length, 1);
  assert.equal((await db.select().from(schema.deals)).length, 1);
});

test('deleting a contact cascades its activities and custom field values', async () => {
  const person = await contact();
  const definition = await field('CONTACT');
  await insert(schema.activities, { type: 'NOTE', createdById: 'external-user', contactId: person.id });
  await insert(schema.fieldValues, { fieldId: definition.id, contactId: person.id, text: 'A value' });
  await db.delete(schema.contacts).where(eq(schema.contacts.id, person.id));
  assert.deepEqual(await db.select().from(schema.activities), []);
  assert.deepEqual(await db.select().from(schema.fieldValues), []);
});

test('saved views round-trip JSON and booleans and enforce owner-scoped names', async () => {
  const filters = { all: [{ field: 'amount', operator: 'gte', value: 2500 }], archived: false, search: 'Việt Nam' };
  const view = await insert(schema.savedViews, { entity: 'DEAL', name: 'Pipeline', ownerId: 'external-user', filters });
  assert.deepEqual(view.filters, filters);
  assert.equal(view.shared, false);
  await db.update(schema.savedViews).set({ shared: true }).where(eq(schema.savedViews.id, view.id));
  const loaded = await db.query.savedViews.findFirst();
  assert.equal(loaded.shared, true);
  assert.deepEqual(loaded.filters, filters);
  assert.equal((await binding.prepare('SELECT shared FROM saved_views WHERE id = ?').bind(view.id).first()).shared, 1);
  await constraint(insert(schema.savedViews, { entity: 'DEAL', name: 'Pipeline', ownerId: 'external-user', filters }), /UNIQUE constraint failed/);
  await insert(schema.savedViews, { entity: 'DEAL', name: 'Pipeline', ownerId: 'another-user', filters });
  await constraint(insert(schema.savedViews, { entity: 'DEAL', name: 'No owner', filters }), /NOT NULL constraint failed/);
  await constraint(insert(schema.activities, { type: 'NOTE' }), /NOT NULL constraint failed/);
});

test('money remains integer cents and high precision decimal fields remain exact strings', async () => {
  const organization = await company();
  const opportunity = await deal(organization.id, {
    amount: 99999999999999, baseAmount: '99999999999999999999.9999', fxRate: '1234567890.1234567890',
  });
  const definition = await field('DEAL', { type: 'NUMBER' });
  const value = await insert(schema.fieldValues, {
    fieldId: definition.id, dealId: opportunity.id, number: '-99999999999999999999.9999', bool: false,
  });
  assert.equal(opportunity.amount, 99999999999999);
  assert.equal(opportunity.baseAmount, '99999999999999999999.9999');
  assert.equal(opportunity.fxRate, '1234567890.1234567890');
  assert.equal(value.number, '-99999999999999999999.9999');
  assert.equal(value.bool, false);
  const storage = await binding.prepare('SELECT typeof(amount) AS amount_type, typeof(base_amount) AS base_type, typeof(fx_rate) AS rate_type FROM deals WHERE id = ?').bind(opportunity.id).first();
  assert.deepEqual(storage, { amount_type: 'integer', base_type: 'text', rate_type: 'text' });
});

test('USER custom fields preserve external user IDs without an authentication table', async () => {
  const person = await contact({ source: 'TRACKING', enrichmentStatus: 'COMPLETE' });
  const definition = await field('CONTACT', { type: 'USER' });
  const value = await insert(schema.fieldValues, {
    fieldId: definition.id, contactId: person.id, userId: 'external-user',
    updatedAt: '2000-01-01 00:00:00',
  });
  assert.equal(value.userId, 'external-user');
  const [updated] = await db.update(schema.fieldValues).set({ userId: 'another-user' })
    .where(eq(schema.fieldValues.id, value.id)).returning();
  assert.equal(updated.userId, 'another-user');
  assert.ok(Date.parse(updated.updatedAt) > Date.parse(value.updatedAt));
  const loaded = await db.query.contacts.findFirst({ with: { fieldValues: { with: { field: true } } } });
  assert.equal(loaded.source, 'TRACKING');
  assert.equal(loaded.enrichmentStatus, 'COMPLETE');
  assert.equal(loaded.fieldValues[0].field.type, 'USER');
});
