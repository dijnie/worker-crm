import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createHarness } from './service-harness.mjs';

let h, service, deal;
before(async () => { h = await createHarness(); });
after(async () => { await h?.dispose(); });
beforeEach(async () => {
  await h.reset();
  await h.db.insert(h.schema.companies).values([{ id: 'company', name: 'Company' }, { id: 'employer', name: 'Employer' }]);
  await h.db.insert(h.schema.contacts).values({ id: 'contact', firstName: 'External', companyId: 'employer' });
  await new h.CompanyService(h.db).update('company', { primaryContactId: 'contact' });
  deal = await new h.DealService(h.db).create({ name: 'Deal', companyId: 'company', ownerId: 'legacy' });
  service = new h.DealContactService(h.db);
});

test('attach, role edit/clear and detach preserve independent employer, primary and activity links', async () => {
  const activity = await new h.ActivityService(h.db).create({ type: 'NOTE', companyId: 'employer', contactId: 'contact', dealId: deal.id, createdById: 'historical' });
  assert.deepEqual(await service.attach(deal.id, { contactId: 'contact', role: '  Advisor  ' }), { dealId: deal.id, contactId: 'contact', role: 'Advisor' });
  const detail = await new h.DealService(h.db).getById(deal.id);
  assert.equal(detail.contacts[0].firstName, 'External');
  assert.equal(detail.contacts[0].role, 'Advisor');
  assert.equal(detail.contacts[0].contact, undefined);
  assert.equal((await service.updateRole(deal.id, 'contact', { role: ' ' })).role, null);
  assert.equal((await service.updateRole(deal.id, 'contact', { role: null })).role, null);
  assert.equal((await service.updateRole(deal.id, 'contact', { role: 'x'.repeat(80) })).role.length, 80);
  await new h.ContactService(h.db).update('contact', { companyId: null });
  assert.equal((await new h.DealService(h.db).getById(deal.id)).contacts.length, 1);
  await service.detach(deal.id, 'contact');
  assert.equal((await new h.DealService(h.db).getById(deal.id)).contacts.length, 0);
  assert.equal((await new h.CompanyService(h.db).getById('company')).primaryContactId, 'contact');
  assert.equal((await new h.ActivityService(h.db).getById(activity.id)).companyId, 'employer');
});

test('duplicate concurrent attaches produce exactly one row and conflicts', async () => {
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => service.attach(deal.id, { contactId: 'contact' })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(results.filter(result => result.status === 'rejected').every(result => result.reason.status === 409));
  assert.equal((await h.db.select().from(h.schema.dealContacts)).length, 1);
});

test('strict relation validation, missing records and archived participation', async () => {
  await assert.rejects(service.attach('missing', { contactId: 'contact' }), error => error.status === 404);
  await assert.rejects(service.attach(deal.id, { contactId: 'missing' }), error => error.status === 400);
  for (const body of [{}, { contactId: '' }, { contactId: 'contact', role: 'x'.repeat(81) }, { contactId: 'contact', actorId: 'forged' }]) {
    await assert.rejects(service.attach(deal.id, body));
  }
  for (const id of [deal.id, 'missing']) {
    await assert.rejects(service.updateRole(id, 'contact', { role: 'Role' }), error => error.status === 404);
    await assert.rejects(service.detach(id, 'contact'), error => error.status === 404);
  }
  await new h.ContactService(h.db).archive('contact');
  await new h.DealService(h.db).archive(deal.id);
  assert.equal((await service.attach(deal.id, { contactId: 'contact' })).role, null);
  for (const body of [{}, { role: 'x'.repeat(81) }, { role: 1 }, { role: 'Role', contactId: 'other' }]) await assert.rejects(service.updateRole(deal.id, 'contact', body));
  const results = await Promise.allSettled([service.detach(deal.id, 'contact'), service.detach(deal.id, 'contact')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 404);
});
