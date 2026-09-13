import assert from 'node:assert/strict';
import { test as nodeTest } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

async function test(name, run) {
  return nodeTest(name, async () => {
    try { await run(); } catch (error) { process.exitCode = 1; console.error(`[scenario] ${name}: ${error.message}`); throw error; }
  });
}
async function eventually(check, message) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await check()) return; await delay(50); }
  assert.fail(message);
}
const sheet = page => page.getByRole('dialog', { name: /^(Company|Contact|Deal) record$/ });
const composer = page => sheet(page).getByRole('form', { name: 'Log activity', exact: true });
const timeline = page => sheet(page).getByRole('region', { name: 'Activity timeline', exact: true });
const card = (page, id) => timeline(page).locator(`[data-activity-id="${id}"]`);
const isCreate = request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/activities';
async function show(page, kind, id) {
  await page.goto(`/companies?record=${encodeURIComponent(`${kind}:${id}`)}`);
  await sheet(page).getByRole('button', { name: kind === 'contact' ? 'Edit first name' : 'Edit name', exact: true }).waitFor();
  await composer(page).waitFor();
}
async function draft(page, type, subject, body = '') {
  await composer(page).getByLabel('Activity type', { exact: true }).selectOption(type);
  await composer(page).getByLabel('Subject', { exact: true }).fill(subject);
  await composer(page).getByLabel('Body', { exact: true }).fill(body);
}
async function submit(page, keyboard = false) {
  const response = page.waitForResponse(response => isCreate(response.request()));
  if (keyboard) await composer(page).getByLabel('Body', { exact: true }).press('Control+Enter');
  else await composer(page).getByRole('button', { name: 'Add activity', exact: true }).click();
  const saved = await response;
  assert.equal(saved.status(), 201);
  const activity = await saved.json();
  await eventually(async () => await composer(page).getByLabel('Subject', { exact: true }).inputValue() === '', 'Successful save clears submitted draft');
  return { activity, input: saved.request().postDataJSON() };
}
async function countsMatch(page, api, anchor) {
  const counts = await api(`/api/activities/counts?${new URLSearchParams(anchor)}`);
  for (const [view, label] of [['all', 'All'], ['history', 'History'], ['notes', 'Notes'], ['upcoming', 'Upcoming'], ['done', 'Done'], ['email', 'Email'], ['meetings', 'Meetings']]) {
    await timeline(page).getByRole('tab', { name: `${label} ${counts[view]}`, exact: true }).waitFor();
  }
  return counts;
}
async function deleteActivity(page, id) {
  await card(page, id).getByRole('button', { name: 'Delete activity', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete activity', exact: true });
  const response = page.waitForResponse(response => response.request().method() === 'DELETE' && new URL(response.url()).pathname === `/api/activities/${id}`);
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  assert.equal((await response).status(), 204);
  await dialog.waitFor({ state: 'hidden' });
  await card(page, id).waitFor({ state: 'hidden' });
}

export async function runSuite(h, { mode, owner }) {
  const member = await h.signup(`${mode} Activity Member`);
  const api = (path, options) => h.api(member.context, path, options);
  const company = await api('/api/companies', { method: 'POST', body: { name: `${mode} activity company` } });
  const employer = await api('/api/companies', { method: 'POST', body: { name: `${mode} activity employer` } });
  const contact = await api('/api/contacts', { method: 'POST', body: { firstName: `${mode} Activity`, lastName: 'Contact', companyId: employer.id } });
  const deal = await api('/api/deals', { method: 'POST', body: { name: `${mode} activity deal`, companyId: company.id, ownerId: member.user.id, currency: 'USD' } });
  await api(`/api/deals/${deal.id}/contacts`, { method: 'POST', body: { contactId: contact.id } });
  const page = await member.context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await test(`${mode}: all five manual types persist on each anchor with server attribution and exact links`, async () => {
      for (const [kind, record, resolvedCompany] of [['company', company, company], ['contact', contact, employer], ['deal', deal, company]]) {
        await show(page, kind, record.id);
        const types = await composer(page).getByLabel('Activity type', { exact: true }).locator('option').evaluateAll(options => options.map(option => option.value));
        assert.deepEqual(types, ['NOTE', 'CALL', 'EMAIL', 'MEETING', 'TASK']);
        for (const type of types) {
          const subject = `${mode} ${kind} ${type}`;
          await draft(page, type, subject, `${type} recorded through the browser`);
          if (type === 'EMAIL') await composer(page).getByText('Record an email in the CRM. This does not send an email.', { exact: true }).waitFor();
          const { activity, input } = await submit(page);
          assert.equal(input[`${kind}Id`], record.id);
          for (const other of ['company', 'contact', 'deal'].filter(value => value !== kind)) assert.equal(Object.hasOwn(input, `${other}Id`), false, 'Composer sends only its anchor');
          for (const key of ['createdById', 'actorId', 'meta', 'completedAt', 'emailThreadId', 'calendarEventId', 'lastActivityAt', 'createdAt', 'updatedAt']) assert.equal(Object.hasOwn(input, key), false);
          const stored = await api(`/api/activities/${activity.id}`);
          assert.equal(stored.type, type); assert.equal(stored.subject, subject);
          assert.equal(stored.createdById, member.user.id);
          assert.equal(stored.companyId, resolvedCompany.id);
          assert.equal(stored.contactId, kind === 'contact' ? contact.id : null);
          assert.equal(stored.dealId, kind === 'deal' ? deal.id : null);
          await card(page, activity.id).waitFor();
          assert.equal(await card(page, activity.id).count(), 1, 'Pinned tasks are not duplicated in history');
          await card(page, activity.id).getByText(member.user.name, { exact: true }).waitFor();
          assert.equal(await composer(page).getByLabel('Activity type', { exact: true }).inputValue(), type);
          assert.equal(await card(page, activity.id).getByRole('button', { name: 'Complete task', exact: true }).count(), type === 'TASK' ? 1 : 0);
        }
        await countsMatch(page, api, { [`${kind}Id`]: record.id });
      }
      assert.equal((await api(`/api/contacts/${contact.id}`)).companyId, employer.id, 'Logging a deal never changes the participant employer');
    });

    await test(`${mode}: empty drafts and task subjects validate, task dates cannot leak into notes`, async () => {
      await show(page, 'company', company.id);
      let requests = 0;
      const watch = request => { if (isCreate(request)) requests++; };
      page.on('request', watch);
      try {
        await draft(page, 'NOTE', ' ', ' ');
        await composer(page).getByRole('button', { name: 'Add activity', exact: true }).click();
        await composer(page).getByRole('alert').waitFor();
        assert.equal(await composer(page).getByLabel('Body', { exact: true }).getAttribute('aria-invalid'), 'true');
        await draft(page, 'TASK', ' ', 'Task body alone');
        await composer(page).getByRole('button', { name: 'Add activity', exact: true }).click();
        await eventually(async () => await composer(page).getByLabel('Subject', { exact: true }).getAttribute('aria-invalid') === 'true', 'Task requires its subject');
        assert.equal(requests, 0, 'Invalid drafts do not reach the API');
        await composer(page).getByLabel('Due date', { exact: true }).fill('2027-03-04');
        await draft(page, 'NOTE', `${mode} switched task`, 'Date must be absent');
        assert.equal(await composer(page).getByLabel('Due date', { exact: true }).count(), 0);
        const { activity, input } = await submit(page);
        assert.equal(Object.hasOwn(input, 'dueAt'), false);
        assert.equal(activity.dueAt, null);
      } finally { page.off('request', watch); }
    });

    await test(`${mode}: UTC dates and local instants are exact in positive and negative timezones`, async () => {
      for (const timezoneId of ['Asia/Ho_Chi_Minh', 'America/Los_Angeles']) {
        const context = await h.browser.newContext({ baseURL: 'http://localhost:3100', timezoneId, storageState: await member.context.storageState() });
        context.setDefaultTimeout(15000);
        const dated = await context.newPage();
        try {
          await show(dated, 'contact', contact.id);
          await draft(dated, 'TASK', `${mode} dated ${timezoneId}`, 'Calendar and local instant');
          await composer(dated).getByLabel('Occurred at', { exact: true }).fill('2020-02-29T23:45');
          await composer(dated).getByLabel('Due date', { exact: true }).fill('2027-03-04');
          const expected = await dated.evaluate(() => new Date('2020-02-29T23:45').toISOString());
          const { activity, input } = await submit(dated);
          assert.equal(input.occurredAt, expected); assert.equal(activity.occurredAt, expected);
          assert.equal(input.dueAt, '2027-03-04T00:00:00.000Z');
          assert.equal(activity.dueAt, '2027-03-04T00:00:00.000Z');
          assert.equal((await api(`/api/contacts/${contact.id}`)).lastActivityAt, activity.createdAt, 'Historical occurrence never backdates the activity stamp');
          assert.equal((await api(`/api/companies/${employer.id}`)).lastActivityAt, activity.createdAt);
          await draft(dated, 'NOTE', `${mode} date only ${timezoneId}`);
          await composer(dated).getByLabel('Occurred at format', { exact: true }).selectOption('date');
          await composer(dated).getByLabel('Occurred at', { exact: true }).fill('2020-02-29');
          assert.equal((await submit(dated)).activity.occurredAt, '2020-02-29T00:00:00.000Z');
        } finally { await context.close(); }
      }
    });

    await test(`${mode}: keyboard submits once while pending, plain Enter edits and navigation protects the draft`, async () => {
      await show(page, 'company', company.id);
      await draft(page, 'NOTE', `${mode} keyboard`, 'First line');
      await composer(page).getByLabel('Body', { exact: true }).press('End');
      await composer(page).getByLabel('Body', { exact: true }).press('Enter');
      await composer(page).getByLabel('Body', { exact: true }).press('Escape');
      assert.equal(await composer(page).getByLabel('Body', { exact: true }).inputValue(), 'First line\n');
      let release, captured = false, requests = 0;
      const gate = new Promise(resolve => { release = resolve; });
      await page.route('**/api/activities', async route => {
        if (!isCreate(route.request())) return route.continue();
        requests++;
        const response = await route.fetch(); captured = true; await gate;
        await route.fulfill({ response }).catch(() => {});
      });
      try {
        await composer(page).getByLabel('Body', { exact: true }).press('Control+Enter');
        await eventually(() => captured, 'Real create completed behind a held response');
        assert.equal(await composer(page).getByRole('button', { name: 'Add activity', exact: true }).isDisabled(), true);
        await page.keyboard.press('Control+Enter'); await page.keyboard.press('Meta+Enter');
        await sheet(page).getByRole('button', { name: 'Close record sheet', exact: true }).click();
        const guard = page.getByRole('dialog', { name: 'Unsaved changes', exact: true });
        await guard.waitFor();
        assert.equal(await guard.getByRole('button', { name: 'Discard', exact: true }).isDisabled(), true);
        release();
        await eventually(() => guard.getByRole('button', { name: 'Stay', exact: true }).isEnabled(), 'Pending navigation settles after the response');
        await guard.getByRole('button', { name: 'Stay', exact: true }).click();
        await eventually(async () => await composer(page).getByLabel('Subject', { exact: true }).inputValue() === '', 'Completed record draft clears');
        assert.equal(requests, 1, 'Repeated shortcuts issue one create');
        const rows = await api(`/api/activities?companyId=${company.id}&limit=100`);
        assert.equal(rows.filter(item => item.subject === `${mode} keyboard`).length, 1);
      } finally { release(); await page.unroute('**/api/activities'); }
      await draft(page, 'CALL', `${mode} dirty retained`, 'Unsent call outcome');
      await sheet(page).getByRole('button', { name: 'Close record sheet', exact: true }).click();
      const guard = page.getByRole('dialog', { name: 'Unsaved changes', exact: true });
      await guard.getByRole('button', { name: 'Stay', exact: true }).click();
      assert.equal(await composer(page).getByLabel('Subject', { exact: true }).inputValue(), `${mode} dirty retained`);
      await sheet(page).getByRole('button', { name: 'Close record sheet', exact: true }).click();
      await guard.getByRole('button', { name: 'Save changes', exact: true }).click();
      await sheet(page).waitFor({ state: 'hidden' });
      const rows = await api(`/api/activities?companyId=${company.id}&limit=100`);
      assert.equal(rows.filter(item => item.subject === `${mode} dirty retained`).length, 1);
    });

    await test(`${mode}: real validation errors preserve drafts and committed transport loss never auto-replays`, async () => {
      await show(page, 'deal', deal.id);
      await draft(page, 'EMAIL', `${mode} retained email`, 'Keep this body');
      await composer(page).getByLabel('Occurred at', { exact: true }).fill('2024-06-01T12:30');
      let failure = 'validation', requests = 0, committed;
      await page.route('**/api/activities', async route => {
        if (!isCreate(route.request())) return route.continue();
        requests++;
        if (failure === 'transport') {
          const response = await route.fetch(); assert.equal(response.status(), 201); committed = await response.json();
          return route.abort('failed');
        }
        const response = await route.fetch({ postData: { ...route.request().postDataJSON(), subject: 'x'.repeat(100001) } });
        assert.equal(response.status(), 400);
        await route.fulfill({ response });
      });
      try {
        for (const reason of ['validation', 'transport']) {
          failure = reason;
          await composer(page).getByRole('button', { name: 'Add activity', exact: true }).click();
          await composer(page).getByRole('alert').waitFor();
          await eventually(() => composer(page).getByRole('button', { name: 'Add activity', exact: true }).isEnabled(), 'Failed request permits explicit recovery');
          if (reason === 'validation') assert.equal(await composer(page).getByLabel('Subject', { exact: true }).getAttribute('aria-invalid'), 'true', 'Server field issues reach their accessible control');
          assert.equal(await composer(page).getByLabel('Subject', { exact: true }).inputValue(), `${mode} retained email`);
          assert.equal(await composer(page).getByLabel('Body', { exact: true }).inputValue(), 'Keep this body');
          assert.equal(await composer(page).getByLabel('Occurred at', { exact: true }).inputValue(), '2024-06-01T12:30');
          assert.equal(await composer(page).getByLabel('Activity type', { exact: true }).inputValue(), 'EMAIL');
          assert.equal(new URL(page.url()).pathname, '/companies');
        }
        await delay(300);
        assert.equal(requests, 2, 'No failed create is automatically retried');
        assert.ok(committed);
        assert.equal((await api(`/api/activities?dealId=${deal.id}&limit=100`)).filter(item => item.subject === `${mode} retained email`).length, 1);
        await composer(page).getByRole('button', { name: 'Discard draft', exact: true }).click();
        await timeline(page).getByRole('button', { name: 'Refresh timeline', exact: true }).click();
        await card(page, committed.id).waitFor();
      } finally { await page.unroute('**/api/activities'); }
    });

    await test(`${mode}: action-specific 403 rechecks membership without claiming account revocation`, async () => {
      await show(page, 'company', company.id);
      await draft(page, 'NOTE', `${mode} forbidden action`, 'The server rejects this origin');
      await page.route('**/api/activities', async route => {
        if (!isCreate(route.request())) return route.continue();
        const response = await route.fetch({ headers: { ...route.request().headers(), origin: 'http://localhost:3101' } });
        assert.equal(response.status(), 403); await route.fulfill({ response });
      });
      try {
        await composer(page).getByRole('button', { name: 'Add activity', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: /origin|forbidden/i }).first().waitFor();
        assert.equal(new URL(page.url()).pathname, '/companies');
        assert.ok((await api('/api/assignees')).some(row => row.id === member.user.id));
        assert.equal((await api(`/api/activities?companyId=${company.id}&limit=100`)).some(item => item.subject === `${mode} forbidden action`), false);
      } finally { await page.unroute('**/api/activities'); }
    });

    await test(`${mode}: task completion and reopening reconcile counts, filtered cards, focus and stamps`, async () => {
      const task = await api('/api/activities', { method: 'POST', body: { type: 'TASK', subject: `${mode} actionable overdue`, dueAt: '2020-01-01', companyId: company.id, contactId: contact.id, dealId: deal.id } });
      await show(page, 'contact', contact.id);
      const stamps = await Promise.all([`/api/companies/${company.id}`, `/api/contacts/${contact.id}`, `/api/deals/${deal.id}`].map(path => api(path).then(record => record.lastActivityAt)));
      await card(page, task.id).getByText(/^Overdue/).waitFor();
      await timeline(page).getByRole('tab', { name: /^Upcoming / }).click();
      let release, captured = false, requests = 0;
      const gate = new Promise(resolve => { release = resolve; });
      const pattern = `**/api/activities/${task.id}/complete`;
      await page.route(pattern, async route => {
        requests++;
        const response = await route.fetch(); captured = true; await gate;
        await route.fulfill({ response });
      });
      try {
        const complete = card(page, task.id).getByRole('button', { name: 'Complete task', exact: true });
        await complete.click();
        await eventually(() => captured, 'Completed task response is held while the row stays pending');
        assert.equal(await complete.isDisabled(), true);
        assert.equal(await card(page, task.id).getByRole('button', { name: 'Delete activity', exact: true }).isDisabled(), true);
        await complete.evaluate(button => { button.click(); button.click(); });
        release();
        await card(page, task.id).waitFor({ state: 'hidden' });
        assert.equal(requests, 1, 'Pending task controls cannot issue duplicate mutations');
      } finally { release(); await page.unroute(pattern); }
      await countsMatch(page, api, { contactId: contact.id });
      const completed = await api(`/api/activities/${task.id}`);
      assert.ok(completed.completedAt);
      assert.equal(await timeline(page).getByRole('tab', { name: /^Upcoming / }).getAttribute('aria-selected'), 'true');
      assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[data-record-sheet]')), true, 'Removing a focused row leaves focus inside the sheet');
      await timeline(page).getByRole('tab', { name: /^Done / }).click();
      await card(page, task.id).getByText(/^Completed/).waitFor();
      assert.ok((await card(page, task.id).locator('time').evaluateAll(times => times.map(time => time.dateTime))).includes(completed.completedAt));
      await card(page, task.id).getByRole('button', { name: 'Reopen task', exact: true }).click();
      await card(page, task.id).waitFor({ state: 'hidden' });
      await countsMatch(page, api, { contactId: contact.id });
      assert.equal((await api(`/api/activities/${task.id}`)).completedAt, null);
      assert.deepEqual(await Promise.all([`/api/companies/${company.id}`, `/api/contacts/${contact.id}`, `/api/deals/${deal.id}`].map(path => api(path).then(record => record.lastActivityAt))), stamps, 'Task state does not advance linked stamps');
      await draft(page, 'NOTE', `${mode} hidden by done view`);
      const { activity } = await submit(page);
      assert.equal(await timeline(page).getByRole('tab', { name: /^Done / }).getAttribute('aria-selected'), 'true');
      assert.equal(await card(page, activity.id).count(), 0, 'Creation preserves an incompatible filter');
      await timeline(page).getByRole('tab', { name: /^All / }).click();
      await card(page, activity.id).waitFor(); await card(page, task.id).getByText(/^Overdue/).waitFor();
    });

    await test(`${mode}: a task removed concurrently reports the real 404 and refreshes its stale card`, async () => {
      const task = await api('/api/activities', { method: 'POST', body: { type: 'TASK', subject: `${mode} concurrently removed task`, contactId: contact.id } });
      await show(page, 'contact', contact.id);
      await card(page, task.id).waitFor();
      await api(`/api/activities/${task.id}`, { method: 'DELETE', status: 204 });
      const response = page.waitForResponse(response => new URL(response.url()).pathname === `/api/activities/${task.id}/complete`);
      await card(page, task.id).getByRole('button', { name: 'Complete task', exact: true }).click();
      assert.equal((await response).status(), 404);
      await timeline(page).getByRole('alert').filter({ hasText: /404|not found/i }).first().waitFor();
      await card(page, task.id).waitFor({ state: 'hidden' });
      await countsMatch(page, api, { contactId: contact.id });
    });

    await test(`${mode}: linked employer detail and warmed company list refresh after a contact activity`, async () => {
      await page.goto('/companies');
      const companyRow = page.getByRole('row').filter({ has: page.getByRole('link', { name: employer.name, exact: true }) });
      await companyRow.getByRole('link', { name: employer.name, exact: true }).click();
      await sheet(page).getByRole('link', { name: `${contact.firstName} ${contact.lastName}`, exact: true }).click();
      await page.getByRole('dialog', { name: 'Contact record', exact: true }).waitFor();
      await draft(page, 'NOTE', `${mode} linked refresh`);
      const { activity } = await submit(page);
      await sheet(page).getByRole('button', { name: 'Back to previous record', exact: true }).click();
      await page.getByRole('dialog', { name: 'Company record', exact: true }).waitFor();
      await card(page, activity.id).waitFor();
      await sheet(page).getByText('System information', { exact: true }).click();
      const stamp = sheet(page).locator('dl > div').filter({ has: page.getByText('Last Activity At', { exact: true }) });
      await stamp.getByText(activity.createdAt, { exact: true }).waitFor();
      await sheet(page).getByRole('button', { name: 'Close record sheet', exact: true }).click();
      await sheet(page).waitFor({ state: 'hidden' });
      const displayedStamp = await page.evaluate(value => new Date(value).toLocaleString(), activity.createdAt);
      await companyRow.getByRole('cell', { name: displayedStamp, exact: true }).waitFor();
    });

    await test(`${mode}: deletion confirms identity, keeps failed rows and recomputes latest then null stamps`, async () => {
      const isolated = await api('/api/companies', { method: 'POST', body: { name: `${mode} activity deletion company` } });
      const first = await api('/api/activities', { method: 'POST', body: { type: 'NOTE', subject: `${mode} older removable`, companyId: isolated.id } });
      const last = await api('/api/activities', { method: 'POST', body: { type: 'NOTE', subject: `${mode} latest removable`, companyId: isolated.id } });
      await show(page, 'company', isolated.id);
      await card(page, last.id).getByRole('button', { name: 'Delete activity', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Delete activity', exact: true });
      await dialog.getByText(last.subject, { exact: false }).waitFor();
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      assert.equal((await api(`/api/activities/${last.id}`)).id, last.id);
      const pattern = `**/api/activities/${last.id}`;
      await page.route(pattern, async route => {
        if (route.request().method() !== 'DELETE') return route.continue();
        const response = await route.fetch({ url: new URL('/api/activities/nonexistent-browser-activity', route.request().url()).href });
        assert.equal(response.status(), 404); await route.fulfill({ response });
      });
      try {
        await card(page, last.id).getByRole('button', { name: 'Delete activity', exact: true }).click();
        await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
        await dialog.getByRole('alert').waitFor();
        assert.equal(await card(page, last.id).count(), 1);
        assert.equal((await api(`/api/companies/${isolated.id}`)).lastActivityAt, last.createdAt);
        await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      } finally { await page.unroute(pattern); }
      await deleteActivity(page, last.id);
      assert.equal((await api(`/api/companies/${isolated.id}`)).lastActivityAt, first.createdAt);
      await deleteActivity(page, first.id);
      assert.equal((await api(`/api/companies/${isolated.id}`)).lastActivityAt, null);
      assert.equal((await countsMatch(page, api, { companyId: isolated.id })).all, 0);
      assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[data-record-sheet]')), true);
    });

    await test(`${mode}: all stage transitions and same-stage no-op agree with timeline; deleting history retains stage`, async () => {
      await show(page, 'deal', deal.id);
      const stages = ['QUALIFIED_TO_BUY', 'UNQUALIFIED_TO_BUY', 'DEMO_BOOKED', 'DECISION_MAKER_BOUGHT_IN', 'CONTRACT_SENT', 'CLOSED_WON', 'CLOSED_LOST'];
      let previousCount = (await api(`/api/activities?dealId=${deal.id}&type=STAGE_CHANGE`)).length;
      for (const target of [...stages, 'CLOSED_LOST']) {
        const before = await api(`/api/deals/${deal.id}`);
        await sheet(page).getByRole('button', { name: 'Change stage', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Change stage', exact: true });
        await dialog.getByLabel('Stage', { exact: true }).selectOption(target);
        if (['CLOSED_LOST', 'UNQUALIFIED_TO_BUY'].includes(target)) {
          assert.equal(await dialog.getByRole('button', { name: 'Update stage', exact: true }).isDisabled(), true);
          await dialog.getByLabel('Reason', { exact: true }).fill('Recorded browser decision');
        }
        await dialog.getByRole('button', { name: 'Update stage', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        const after = await api(`/api/deals/${deal.id}`);
        assert.equal(after.stage, target);
        const history = await api(`/api/activities?dealId=${deal.id}&type=STAGE_CHANGE&limit=100`);
        assert.equal(history.length, previousCount + (before.stage === target ? 0 : 1));
        if (before.stage === target) assert.equal(after.lastActivityAt, before.lastActivityAt);
        else { await card(page, history[0].id).waitFor(); assert.equal(history[0].createdById, member.user.id); }
        previousCount = history.length;
      }
      const history = await api(`/api/activities?dealId=${deal.id}&type=STAGE_CHANGE&limit=100`);
      await card(page, history[0].id).getByRole('button', { name: 'Delete activity', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Delete activity', exact: true });
      await dialog.getByText('Deleting this history entry does not change the deal’s current stage.', { exact: false }).waitFor();
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' }); await card(page, history[0].id).waitFor({ state: 'hidden' });
      assert.equal((await api(`/api/deals/${deal.id}`)).stage, 'CLOSED_LOST');
      assert.equal((await api(`/api/activities?dealId=${deal.id}&type=STAGE_CHANGE`)).length, previousCount - 1);
    });

    await test(`${mode}: an older timeline response cannot replace post-mutation data`, async () => {
      await show(page, 'contact', contact.id);
      await countsMatch(page, api, { contactId: contact.id });
      let release, captured = false, intercepted = false;
      const gate = new Promise(resolve => { release = resolve; });
      const pattern = '**/api/activities?*';
      await page.route(pattern, async route => {
        const url = new URL(route.request().url());
        if (intercepted || url.searchParams.get('contactId') !== contact.id || url.searchParams.get('view') !== 'all') return route.continue();
        intercepted = true;
        const response = await route.fetch(); captured = true; await gate;
        await route.fulfill({ response }).catch(() => {});
      });
      try {
        await timeline(page).getByRole('button', { name: 'Refresh timeline', exact: true }).click();
        await eventually(() => captured, 'Old timeline response captured before the mutation');
        await draft(page, 'NOTE', `${mode} survives stale read`);
        const { activity } = await submit(page);
        await card(page, activity.id).waitFor();
        release(); await delay(250);
        assert.equal(await card(page, activity.id).count(), 1);
        await countsMatch(page, api, { contactId: contact.id });
      } finally { release(); await page.unroute(pattern); }
    });

    await test(`${mode}: a late create response cannot clear the new record draft after navigation`, async () => {
      await show(page, 'company', company.id);
      await draft(page, 'NOTE', `${mode} late old record`, 'Committed before navigation');
      let release, captured = false;
      const gate = new Promise(resolve => { release = resolve; });
      await page.route('**/api/activities', async route => {
        if (!isCreate(route.request())) return route.continue();
        const response = await route.fetch(); captured = true; await gate;
        await route.fulfill({ response }).catch(() => {});
      });
      try {
        await composer(page).getByRole('button', { name: 'Add activity', exact: true }).click();
        await eventually(() => captured, 'Previous record create is committed but response remains held');
        const beforeUnload = dialog => void dialog.accept();
        page.on('dialog', beforeUnload);
        try { await show(page, 'contact', contact.id); } finally { page.off('dialog', beforeUnload); }
        await draft(page, 'CALL', `${mode} new record retained`, 'A distinct record draft');
        release(); await delay(250);
        assert.equal(await composer(page).getByLabel('Subject', { exact: true }).inputValue(), `${mode} new record retained`);
        assert.equal(await composer(page).getByLabel('Body', { exact: true }).inputValue(), 'A distinct record draft');
        assert.equal(await timeline(page).getByRole('heading', { name: `${mode} late old record`, exact: true }).count(), 0);
        assert.equal((await api(`/api/activities?companyId=${company.id}&limit=100`)).filter(item => item.subject === `${mode} late old record`).length, 1);
        await composer(page).getByRole('button', { name: 'Discard draft', exact: true }).click();
      } finally { release(); await page.unroute('**/api/activities'); }
    });

    await test(`${mode}: mobile composer and record tabs preserve keyboard navigation and focus`, async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      try {
        await page.goto(`/companies?record=${encodeURIComponent(`company:${company.id}`)}`);
        await sheet(page).getByRole('tab', { name: 'Properties & relations', exact: true }).waitFor();
        await sheet(page).getByRole('tab', { name: 'Properties & relations', exact: true }).press('ArrowRight');
        await composer(page).waitFor();
        await draft(page, 'NOTE', `${mode} mobile note`, 'Keyboard on a narrow sheet');
        const { activity } = await submit(page, true);
        await card(page, activity.id).waitFor();
        await eventually(() => composer(page).getByLabel('Body', { exact: true }).evaluate(node => node === document.activeElement), 'Keyboard save returns focus to the composer body').catch(async error => {
          const active = await page.evaluate(() => ({ tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label'), role: document.activeElement?.getAttribute('role'), text: document.activeElement?.textContent?.slice(0, 100), inComposer: !!document.activeElement?.closest('[data-activity-composer]') }));
          throw new Error(`${error.message}; active element: ${JSON.stringify(active)}`);
        });
        assert.equal(await sheet(page).evaluate(node => node.scrollWidth <= node.clientWidth), true, 'Record sheet does not overflow horizontally');
      } finally { await page.setViewportSize({ width: 1280, height: 720 }); }
    });

    await test(`${mode}: real 401 clears the protected composer and prevents queued replay`, async () => {
      const context = await h.newContext(); await h.signIn(context, member.email);
      const signedOut = await context.newPage();
      try {
        await show(signedOut, 'company', company.id);
        await draft(signedOut, 'NOTE', `${mode} private signed-out draft`, 'Must disappear');
        await context.clearCookies();
        await composer(signedOut).getByRole('button', { name: 'Add activity', exact: true }).click();
        await signedOut.waitForURL('**/sign-in?**');
        assert.equal(await signedOut.getByRole('form', { name: 'Log activity', exact: true }).count(), 0);
        assert.equal(await signedOut.getByRole('dialog', { name: 'Unsaved changes', exact: true }).count(), 0);
        assert.equal((await api(`/api/activities?companyId=${company.id}&limit=100`)).some(item => item.subject === `${mode} private signed-out draft`), false);
      } finally { await context.close(); }
    });

    await test(`${mode}: revoked membership clears an unsaved activity and all record overlays`, async () => {
      await show(page, 'company', company.id);
      await draft(page, 'TASK', `${mode} private revoked task`, 'Protected unsaved content');
      const membership = (await h.api(owner.context, '/api/members')).find(row => row.id === member.user.id);
      assert.ok(membership);
      await h.api(owner.context, `/api/members/${member.user.id}`, { method: 'PATCH', body: { action: 'revoke', expectedRevision: membership.revision } });
      await composer(page).getByRole('button', { name: 'Add activity', exact: true }).click();
      await page.waitForURL(url => ['/access-revoked', '/sign-in'].includes(url.pathname));
      assert.equal(await page.getByRole('form', { name: 'Log activity', exact: true }).count(), 0);
      assert.equal(await page.getByRole('dialog').count(), 0);
    });
    assert.deepEqual(errors, [], 'No uncaught browser runtime errors');
  } finally { await page.close(); await member.context.close(); }
}
