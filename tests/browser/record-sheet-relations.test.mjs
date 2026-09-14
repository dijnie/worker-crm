import assert from 'node:assert/strict';
import { test as nodeTest } from 'node:test';
async function test(name, run) { return nodeTest(name, async () => { try { await run(); } catch (error) { console.error(`[scenario] ${name}: ${error.message}`); throw error; } }); }
import { setTimeout as delay } from 'node:timers/promises';

async function eventually(check, message) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await check()) return; await delay(50); }
  assert.fail(message);
}
const sheet = page => page.getByRole('dialog', { name: /^(Company|Contact|Deal) record$/ });
async function show(page, kind, id) {
  await page.goto(`/companies?record=${encodeURIComponent(`${kind}:${id}`)}`);
  await sheet(page).waitFor();
  await sheet(page).getByRole('button', { name: kind === 'contact' ? 'Edit first name' : 'Edit name', exact: true }).waitFor();
}

export async function runSuite(h, { mode }) {
  const member = await h.signupAuthorized(`${mode} Relation Member`);
  const api = (path, options) => h.api(member.context, path, options);
  const company = await api('/api/companies', { method: 'POST', body: { name: `${mode} relation company`, ownerId: member.user.id } });
  const employer = await api('/api/companies', { method: 'POST', body: { name: `${mode} separate employer` } });
  const contact = await api('/api/contacts', { method: 'POST', body: { firstName: `${mode} External`, lastName: 'Participant', companyId: employer.id } });
  const contactName = `${contact.firstName} ${contact.lastName}`;
  const deal = await api('/api/deals', { method: 'POST', body: { name: `${mode} relation deal`, companyId: company.id, ownerId: member.user.id, currency: 'USD' } });
  await api(`/api/companies/${company.id}`, { method: 'PATCH', body: { primaryContactId: contact.id } });
  const page = await member.context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await test(`${mode}: attach searches all companies, protects inner drafts and excludes existing participants`, async () => {
      await show(page, 'deal', deal.id);
      await sheet(page).getByRole('button', { name: 'Attach existing contact', exact: true }).click();
      const attach = page.getByRole('dialog', { name: 'Attach contact', exact: true });
      await attach.waitFor();
      await page.keyboard.press('Escape');
      await attach.waitFor({ state: 'hidden' });
      await sheet(page).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('record'), `deal:${deal.id}`);
      await sheet(page).getByRole('button', { name: 'Attach existing contact', exact: true }).click();
      await attach.getByLabel('Search participant', { exact: true }).fill(contact.firstName);
      const picker = attach.getByRole('combobox', { name: 'Participant', exact: true });
      await eventually(async () => (await picker.locator('option').allTextContents()).includes(contactName), 'External employee is available for participation');
      await picker.selectOption(contact.id);
      await attach.getByLabel('Participant role', { exact: true }).fill('Advisor');
      await page.keyboard.press('Escape');
      await attach.getByText('Save your changes before closing?', { exact: true }).waitFor();
      assert.equal(await attach.getByLabel('Participant role', { exact: true }).inputValue(), 'Advisor');
      await attach.getByRole('button', { name: 'Stay', exact: true }).click();
      await attach.getByRole('button', { name: 'Attach contact', exact: true }).click();
      await attach.waitFor({ state: 'hidden' });
      const participants = sheet(page).getByRole('region', { name: 'Deal contacts', exact: true });
      await participants.getByRole('button', { name: `Edit role for ${contactName.toLowerCase()}`, exact: true }).waitFor();
      const stored = await api(`/api/deals/${deal.id}`);
      assert.equal(stored.contacts.find(item => item.id === contact.id)?.role, 'Advisor');
      assert.equal((await api(`/api/contacts/${contact.id}`)).companyId, employer.id);
      assert.equal((await api(`/api/companies/${company.id}`)).primaryContactId, contact.id);
      await participants.getByRole('button', { name: 'Attach existing contact', exact: true }).click();
      await attach.getByRole('combobox', { name: 'Participant', exact: true }).waitFor();
      await eventually(async () => !(await attach.getByRole('combobox', { name: 'Participant', exact: true }).isDisabled()), 'Participant options finish loading');
      assert.equal(await attach.locator(`option[value="${contact.id}"]`).count(), 0);
      await page.keyboard.press('Escape');
      await attach.waitFor({ state: 'hidden' });
    });

    await test(`${mode}: role edit and clear, detach cancellation and confirmation preserve independent links`, async () => {
      await show(page, 'deal', deal.id);
      const participants = sheet(page).getByRole('region', { name: 'Deal contacts', exact: true });
      const editRole = participants.getByRole('button', { name: `Edit role for ${contactName.toLowerCase()}`, exact: true });
      for (const role of ['Decision maker', '']) {
        await editRole.click();
        const input = participants.getByLabel(`Role for ${contactName}`, { exact: true });
        await input.fill(role); await input.press('Enter'); await editRole.waitFor();
        assert.equal((await api(`/api/deals/${deal.id}`)).contacts.find(item => item.id === contact.id)?.role, role || null);
      }
      await participants.getByRole('button', { name: `Detach ${contactName}`, exact: true }).click();
      const confirm = page.getByRole('dialog', { name: 'Detach contact?', exact: true });
      await confirm.waitFor(); await page.keyboard.press('Escape'); await confirm.waitFor({ state: 'hidden' });
      assert.equal((await api(`/api/deals/${deal.id}`)).contacts.some(item => item.id === contact.id), true);
      await participants.getByRole('button', { name: `Detach ${contactName}`, exact: true }).click();
      await confirm.getByRole('button', { name: 'Detach contact', exact: true }).click();
      await confirm.waitFor({ state: 'hidden' });
      await participants.getByText('No contacts attached.', { exact: true }).waitFor();
      assert.equal((await api(`/api/deals/${deal.id}`)).contacts.length, 0);
      assert.equal((await api(`/api/contacts/${contact.id}`)).companyId, employer.id);
      assert.equal((await api(`/api/companies/${company.id}`)).primaryContactId, contact.id);
    });

    await test(`${mode}: contextual contact and deal creation retain company and owner defaults`, async () => {
      await show(page, 'company', company.id);
      for (const entity of ['contact', 'deal']) {
        await sheet(page).getByRole('button', { name: `Add ${entity}`, exact: true }).click();
        const form = page.getByRole('dialog', { name: `New ${entity}`, exact: true });
        await form.waitFor();
        assert.equal(await form.getByRole('combobox', { name: 'Company', exact: true }).inputValue(), company.id);
        assert.equal(await form.getByRole('combobox', { name: 'Owner', exact: true }).inputValue(), member.user.id);
        const name = `${mode} Contextual ${entity}`;
        await form.getByLabel(entity === 'contact' ? /^First name/ : /^Name/).fill(name);
        if (entity === 'contact') {
          await page.keyboard.press('Escape');
          await form.getByText('Save your changes before closing?', { exact: true }).waitFor();
          await form.getByRole('button', { name: 'Stay', exact: true }).click();
        }
        const created = page.waitForResponse(response => new URL(response.url()).pathname === `/api/${entity === 'contact' ? 'contacts' : 'deals'}` && response.request().method() === 'POST');
        await form.getByRole('button', { name: `Add ${entity}`, exact: true }).click();
        const response = await created;
        assert.equal(response.status(), 201);
        const record = await response.json();
        await form.waitFor({ state: 'hidden' });
        assert.equal(record.companyId, company.id); assert.equal(record.ownerId, member.user.id);
        const related = sheet(page).getByRole('region', { name: entity === 'contact' ? 'Employed contacts' : 'Deals', exact: true });
        await related.getByText(name, { exact: true }).waitFor();
      }
    });

    await test(`${mode}: employer and primary-contact editors set and clear independently of participation`, async () => {
      await api(`/api/deals/${deal.id}/contacts`, { method: 'POST', body: { contactId: contact.id, role: 'Independent participant' } });
      await show(page, 'contact', contact.id);
      for (const companyId of ['', company.id, employer.id]) {
        await sheet(page).getByRole('button', { name: 'Edit company', exact: true }).click();
        await sheet(page).getByRole('combobox', { name: 'Company', exact: true }).selectOption(companyId);
        await sheet(page).getByRole('button', { name: 'Save company', exact: true }).click();
        await sheet(page).getByRole('button', { name: 'Edit company', exact: true }).waitFor();
        assert.equal((await api(`/api/contacts/${contact.id}`)).companyId, companyId || null);
        assert.equal((await api(`/api/companies/${company.id}`)).primaryContactId, contact.id);
        assert.equal((await api(`/api/deals/${deal.id}`)).contacts.find(item => item.id === contact.id)?.role, 'Independent participant');
      }
      await show(page, 'company', company.id);
      for (const primaryId of ['', contact.id]) {
        await sheet(page).getByRole('button', { name: 'Edit primary contact', exact: true }).click();
        const picker = sheet(page).getByRole('combobox', { name: 'Primary contact', exact: true });
        await picker.selectOption(primaryId);
        await sheet(page).getByRole('button', { name: 'Save primary contact', exact: true }).click();
        await sheet(page).getByRole('button', { name: 'Edit primary contact', exact: true }).waitFor();
        assert.equal((await api(`/api/companies/${company.id}`)).primaryContactId, primaryId || null);
        assert.equal((await api(`/api/contacts/${contact.id}`)).companyId, employer.id);
      }
    });

    await test(`${mode}: stage dialog Escape protects its draft and leaves the record sheet open`, async () => {
      await show(page, 'deal', deal.id);
      const openStage = sheet(page).getByRole('button', { name: 'Change stage', exact: true });
      await openStage.click();
      const stage = page.getByRole('dialog', { name: 'Change stage', exact: true });
      await stage.waitFor(); await page.keyboard.press('Escape'); await stage.waitFor({ state: 'hidden' });
      await openStage.click();
      await stage.getByRole('combobox', { name: 'Stage', exact: true }).selectOption('CLOSED_LOST');
      await stage.getByLabel('Reason', { exact: true }).fill('Preserve this pending reason');
      await page.keyboard.press('Escape');
      await stage.getByText('Save the stage change before closing?', { exact: true }).waitFor();
      assert.equal(await stage.getByLabel('Reason', { exact: true }).inputValue(), 'Preserve this pending reason');
      await stage.getByRole('button', { name: 'Discard', exact: true }).click();
      await stage.waitFor({ state: 'hidden' }); await sheet(page).waitFor();
      assert.equal((await api(`/api/deals/${deal.id}`)).stage, 'DEMO_BOOKED');
    });

    await test(`${mode}: a late company response cannot replace a newly opened contact`, async () => {
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      let captured = false;
      const routePattern = `**/api/companies/${company.id}`;
      await page.route(routePattern, async route => {
        const response = await route.fetch();
        captured = true;
        await gate;
        await route.fulfill({ response }).catch(() => {}); // Navigation may cancel the original request.
      });
      try {
        await page.goto(`/companies?record=${encodeURIComponent(`company:${company.id}`)}`);
        await eventually(() => captured, 'The delayed company response was captured');
        await page.evaluate(id => {
          const url = new URL(location.href); url.searchParams.set('record', `contact:${id}`);
          history.replaceState({}, '', url); dispatchEvent(new PopStateEvent('popstate'));
        }, contact.id);
        await page.getByRole('dialog', { name: 'Contact record', exact: true }).waitFor();
        await sheet(page).getByRole('heading', { name: contactName, exact: true }).waitFor();
        release();
        await delay(250);
        assert.equal(await sheet(page).getByRole('heading', { name: company.name, exact: true }).count(), 0);
        assert.equal(await sheet(page).getByRole('heading', { name: contactName, exact: true }).count(), 1);
        assert.equal(new URL(page.url()).searchParams.get('record'), `contact:${contact.id}`);
      } finally { release(); await page.unroute(routePattern); }
    });
    assert.deepEqual(errors, [], 'No browser runtime errors');
  } finally { await page.close(); }
}
