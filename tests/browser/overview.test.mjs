import assert from 'node:assert/strict';
import { test as nodeTest } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';
import { chmod, realpath, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOverviewMutations } from './overview-mutations.test.mjs';

export async function scenario(name, run) {
  return nodeTest(name, async () => {
    try { await run(); } catch (error) { process.exitCode = 1; console.error(`[scenario] ${name}: ${error.message}`); throw error; }
  });
}
export async function eventually(check, message) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await check()) return; await delay(50); }
  assert.fail(message);
}
export const statsRegion = page => page.getByRole('region', { name: 'Workspace statistics', exact: true });
export const feed = page => page.locator('div[aria-label="Recent activity"]');
export const card = (page, id) => feed(page).locator(`[data-activity-id="${id}"]`);
export const sheet = page => page.getByRole('dialog', { name: /^(Company|Contact|Deal) record$/ });
export const stages = ['DEMO_BOOKED', 'QUALIFIED_TO_BUY', 'UNQUALIFIED_TO_BUY', 'DECISION_MAKER_BOUGHT_IN', 'CONTRACT_SENT', 'CLOSED_WON', 'CLOSED_LOST'];
export async function statsMatch(page, api, currency = 'USD') {
  const stats = await api(`/api/stats?currency=${currency}`);
  for (const key of ['totalCompanies', 'totalContacts', 'openDeals', 'openDealValue']) {
    const expected = key === 'openDealValue' ? `${currency} ${stats[key]}` : String(stats[key]);
    await eventually(async () => await statsRegion(page).locator(`[data-stat="${key}"] dd`).first().innerText() === expected, `${key} reflects authoritative ${currency} statistics`);
  }
  for (const bucket of stats.pipeline) {
    const cells = page.getByRole('table', { name: 'Deal pipeline', exact: true }).locator(`[data-stage="${bucket.stage}"] td`);
    await eventually(async () => (await cells.allTextContents()).join('|') === `${bucket.count}|${bucket.value}`, `${bucket.stage} count and exact value match`);
  }
  return stats;
}
export async function changeCurrency(page, currency) {
  await page.getByLabel('Currency', { exact: true }).fill(currency);
  await page.getByRole('button', { name: 'Apply currency', exact: true }).click();
  await eventually(() => new URL(page.url()).searchParams.get('currency') === currency.toUpperCase(), 'Currency URL updates');
}

export async function runSuite(h, { mode, owner }) {
  const member = await h.signupAuthorized(`${mode} Overview Member`);
  const api = (path, options) => h.api(member.context, path, options);
  let page = await member.context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const baseline = await api('/api/stats');
  const baselineGbp = await api('/api/stats?currency=GBP');
  try {
    await scenario(`${mode}: overview renders honest baseline values and owner/member business access`, async () => {
      await page.goto('/');
      await statsMatch(page, api);
      assert.equal(await statsRegion(page).locator('[data-stat]').count(), 4);
      assert.equal(await page.getByRole('table', { name: 'Deal pipeline', exact: true }).locator('[data-stage]').count(), 7);
      if (baseline.totalCompanies === 0 && baseline.totalContacts === 0 && baseline.totalDeals === 0) {
        assert.equal(baseline.openDeals, 0); assert.equal(baseline.openDealValue, '0.00');
        await page.getByText('No activity yet. Activities logged on a company, contact, or deal will appear here.', { exact: true }).waitFor();
        assert.equal(await feed(page).getByRole('article').count(), 0);
      }
      const ownerPage = await owner.context.newPage();
      try { await ownerPage.goto('/'); await statsMatch(ownerPage, path => h.api(owner.context, path)); }
      finally { await ownerPage.close(); }
    });

    const company = await api('/api/companies', { method: 'POST', body: { name: `${mode} Overview company with a long descriptive name ${'広'.repeat(35)}` } });
    const contact = await api('/api/contacts', { method: 'POST', body: { firstName: `${mode} Overview contact`, companyId: company.id } });
    const orphan = await api('/api/contacts', { method: 'POST', body: { firstName: `${mode} Contact without employer` } });
    const archived = await api('/api/companies', { method: 'POST', body: { name: `${mode} Archived overview company` } });
    await api(`/api/companies/${archived.id}`, { method: 'DELETE', status: 200 });
    const deals = [];
    for (const [index, stage] of stages.entries()) {
      const deal = await api('/api/deals', { method: 'POST', body: { name: `${mode} Overview ${stage}`, companyId: company.id, ownerId: member.user.id, amount: `${index + 1}.00`, currency: 'USD' } });
      if (stage !== 'DEMO_BOOKED') await api(`/api/deals/${deal.id}/stage`, { method: 'POST', status: 200, body: { stage, ...(['CLOSED_LOST', 'UNQUALIFIED_TO_BUY'].includes(stage) ? { reason: 'Browser fixture decision' } : {}) } });
      deals.push({ ...deal, stage });
    }
    for (const [index, amount, currency] of [[0, '90071992547409.91', 'USD'], [1, '90071992547409.91', 'USD'], [2, null, 'USD'], [3, '9.99', 'EUR'], [4, '0.10', 'GBP'], [5, '0.20', 'GBP']]) {
      deals.push(await api('/api/deals', { method: 'POST', body: { name: `${mode} Overview extra ${index}`, companyId: company.id, ownerId: member.user.id, amount, currency } }));
    }
    await scenario(`${mode}: aggregate cards preserve exact large money, null values, closed stages and currency scopes`, async () => {
      await page.goto('/?q=preserved&currency=USD');
      const usd = await statsMatch(page, api);
      assert.equal(usd.totalCompanies, baseline.totalCompanies + 1);
      assert.equal(usd.totalContacts, baseline.totalContacts + 2);
      assert.equal(usd.openDeals, baseline.openDeals + 10);
      const toCents = value => BigInt(value.replace('.', ''));
      assert.equal(toCents(usd.openDealValue) - toCents(baseline.openDealValue), 18014398509483182n);
      await changeCurrency(page, 'gbp');
      const gbp = await statsMatch(page, api, 'GBP');
      assert.equal(gbp.openDeals, usd.openDeals);
      assert.equal(new URL(page.url()).searchParams.get('q'), 'preserved');
      assert.equal(toCents(gbp.openDealValue) - toCents(baselineGbp.openDealValue), 30n);
      await page.getByLabel('Currency', { exact: true }).fill('US');
      await page.getByRole('button', { name: 'Apply currency', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Enter a three-letter currency code' }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('currency'), 'GBP');
      await page.goto('/?currency=invalid');
      await page.getByRole('alert').filter({ hasText: 'This link has an invalid currency' }).waitFor();
      await statsMatch(page, api);
    });

    await scenario(`${mode}: each pipeline link opens exactly its selected-currency stage bucket`, async () => {
      await page.goto('/?currency=USD');
      const stats = await statsMatch(page, api);
      for (const bucket of stats.pipeline) {
        const link = page.getByRole('table', { name: 'Deal pipeline', exact: true }).locator(`[data-stage="${bucket.stage}"]`).getByRole('link');
        const href = await link.getAttribute('href');
        const url = new URL(href, 'http://localhost:3100');
        assert.equal(url.pathname, '/deals'); assert.equal(url.searchParams.get('stage'), bucket.stage); assert.equal(url.searchParams.get('currency'), 'USD');
        const destination = await member.context.newPage();
        try {
          await destination.goto(href);
          await destination.getByRole('status').filter({ hasText: new RegExp(`^${bucket.count} records?$`) }).waitFor();
          const rows = await api(`/api/deals?stage=${bucket.stage}&currency=USD&limit=100`);
          assert.equal(rows.length, bucket.count);
          for (const deal of rows) assert.equal(deal.currency, 'USD');
        } finally { await destination.close(); }
      }
    });

    const createActivity = body => api('/api/activities', { method: 'POST', body });
    for (let index = 0; index < 4; index++) await createActivity({ type: 'NOTE', companyId: company.id, subject: `${mode} older activity ${index}` });
    const emptyNote = await createActivity({ type: 'NOTE', companyId: company.id });
    const call = await createActivity({ type: 'CALL', companyId: company.id, contactId: contact.id, dealId: deals[0].id, subject: `${mode} multi-record call` });
    const email = await createActivity({ type: 'EMAIL', contactId: orphan.id, subject: `${mode} contact-only email` });
    const meeting = await createActivity({ type: 'MEETING', companyId: archived.id, subject: `${mode} archived meeting` });
    const task = await createActivity({ type: 'TASK', dealId: deals[0].id, subject: `${mode} overdue task`, dueAt: '2020-01-01T00:00:00.000Z' });
    await api(`/api/deals/${deals[0].id}/stage`, { method: 'POST', status: 200, body: { stage: 'QUALIFIED_TO_BUY' } });
    await api(`/api/deals/${deals[0].id}/stage`, { method: 'POST', status: 200, body: { stage: 'DEMO_BOOKED' } });
    const historicalCompany = await api('/api/companies', { method: 'POST', body: { name: `${mode} imported name to clear` } });
    const legacy = await createActivity({ type: 'NOTE', companyId: historicalCompany.id, subject: `${mode} historical enrichment` });
    const unlinked = await createActivity({ type: 'NOTE', companyId: company.id, subject: `${mode} historical unlinked note` });
    const long = await createActivity({ type: 'NOTE', companyId: company.id, subject: `${mode} ${'Long unbroken history '.repeat(20)}`, body: 'Stored multiline body\n<script>plain text only</script>' });
    // Close the previous page before direct historical-fixture maintenance so
    // its pending navigation cannot overlap the next scenario's document.
    await page.close();
    await seedLegacy(h, mode, legacy.id, unlinked.id, historicalCompany.id);
    const runtimeChanges = h.safeLogs().split('\n').filter(line => /(?:hmr|reload|restart|optimized dependencies)/i.test(line));
    if (runtimeChanges.length) console.log(`[browser] Historical fixture runtime events: ${runtimeChanges.join(' | ')}`);
    page = await member.context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const expectedFeed = await api('/api/activities?limit=10&includeLinks=true');

    await scenario(`${mode}: latest ten of many activities include every type, historical fallbacks and typed record links`, async () => {
      const navigations = [];
      const observe = frame => { if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname + new URL(frame.url()).search); };
      page.on('framenavigated', observe);
      await page.goto('/?currency=USD&q=retained');
      // Settle navigation before evaluating the browser's activity order.
      await page.waitForLoadState('networkidle');
      page.off('framenavigated', observe);
      assert.ok(navigations.length > 0 && navigations.every(path => path === '/?currency=USD&q=retained'), 'Fixture navigation must remain on the requested overview URL');
      console.log(`[browser] Historical fixture transition settled after ${navigations.length} main-frame navigation event(s), all on the requested overview URL.`);
      await eventually(async () => (await feed(page).locator('[data-activity-id]').evaluateAll(rows => rows.map(row => row.dataset.activityId))).join() === expectedFeed.map(row => row.id).join(), 'Recent ten preserve server ordering');
      assert.equal(expectedFeed.length, 10);
      assert.deepEqual([...new Set(expectedFeed.map(row => row.type))].sort(), ['CALL', 'EMAIL', 'ENRICHMENT', 'MEETING', 'NOTE', 'STAGE_CHANGE', 'TASK']);
      await card(page, emptyNote.id).getByRole('heading', { name: 'Note', exact: true }).waitFor();
      await card(page, legacy.id).getByText('Unavailable / historical actor (historical-browser-actor)', { exact: true }).waitFor();
      await card(page, legacy.id).getByRole('button', { name: `Unavailable company (${historicalCompany.id})`, exact: true }).waitFor();
      assert.equal(await card(page, legacy.id).locator('time').getAttribute('datetime'), new Date(expectedFeed.find(row => row.id === legacy.id).createdAt).toISOString(), 'Missing occurrence time falls back to creation');
      assert.equal(await card(page, unlinked.id).getByRole('navigation', { name: 'Activity related records' }).count(), 0);
      assert.equal(await card(page, call.id).getByRole('navigation', { name: 'Activity related records' }).getByRole('button').count(), 3);
      const contactLink = card(page, email.id).getByRole('navigation', { name: 'Activity related records' }).getByRole('button');
      assert.equal(await contactLink.count(), 1); assert.equal(await contactLink.innerText(), orphan.firstName);
      await card(page, meeting.id).getByRole('button', { name: `${archived.name} (archived)`, exact: true }).waitFor();
      await card(page, task.id).getByText(/Overdue/).waitFor();
      await card(page, long.id).getByText('<script>plain text only</script>', { exact: false }).waitFor();
      await contactLink.focus(); await contactLink.press('Enter');
      await sheet(page).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('record'), `contact:${orphan.id}`);
      assert.equal(new URL(page.url()).searchParams.get('currency'), 'USD');
      assert.equal(new URL(page.url()).searchParams.get('q'), 'retained');
      await page.goBack(); await sheet(page).waitFor({ state: 'hidden' });
      await page.goForward(); await sheet(page).waitFor();
      await page.reload(); await sheet(page).getByRole('button', { name: 'Edit first name', exact: true }).waitFor();
      await sheet(page).getByRole('button', { name: 'Close record sheet', exact: true }).click();
      await sheet(page).waitFor({ state: 'hidden' });
      assert.equal(new URL(page.url()).searchParams.get('currency'), 'USD');
    });

    await scenario(`${mode}: slow previous currency responses cannot replace current statistics`, async () => {
      await page.goto('/?currency=USD'); await statsMatch(page, api);
      let release, received; const held = new Promise(resolve => { release = resolve; }); const fetched = new Promise(resolve => { received = resolve; });
      await page.route('**/api/stats?currency=EUR', async route => { const response = await route.fetch(); received(); await held; await route.fulfill({ response }).catch(() => {}); });
      try {
        await changeCurrency(page, 'EUR'); await fetched;
        await changeCurrency(page, 'GBP'); await statsMatch(page, api, 'GBP');
        release(); await delay(200); await statsMatch(page, api, 'GBP');
        assert.equal(new URL(page.url()).searchParams.get('currency'), 'GBP');
      } finally { release(); await page.unroute('**/api/stats?currency=EUR'); }
    });

    await scenario(`${mode}: statistics and activity transport failures stay independent and retry genuine requests`, async () => {
      await page.route('**/api/stats?*', route => route.abort('failed'));
      try {
        await page.goto('/');
        await page.getByText('Workspace statistics could not load.', { exact: false }).waitFor();
        await eventually(async () => await feed(page).getByRole('article').count() === 10, 'Feed remains available after statistics failure');
        assert.equal(await statsRegion(page).locator('dd').filter({ hasText: /^0$/ }).count(), 0);
      } finally { await page.unroute('**/api/stats?*'); }
      await page.getByRole('button', { name: 'Retry statistics', exact: true }).click(); await statsMatch(page, api);
      await page.route('**/api/activities?*', route => route.abort('failed'));
      try {
        await page.getByRole('button', { name: 'Refresh activity', exact: true }).click();
        await page.getByText('Recent activity could not load.', { exact: false }).waitFor();
        await statsMatch(page, api);
        assert.equal(await page.getByText('No activity yet. Activities logged on a company, contact, or deal will appear here.', { exact: true }).count(), 0);
      } finally { await page.unroute('**/api/activities?*'); }
      await page.getByRole('button', { name: 'Retry activity', exact: true }).click();
      await eventually(async () => await feed(page).getByRole('article').count() === 10, 'Feed retry restores rows');
    });

    await scenario(`${mode}: narrow light and dark overview retains keyboard currency and readable links`, async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      try {
        for (const theme of ['light', 'dark']) {
          await page.emulateMedia({ colorScheme: theme });
          await page.goto('/?currency=USD'); await statsMatch(page, api);
          await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), theme === 'dark');
          await eventually(async () => await feed(page).getByRole('article').count() === 10, 'Mobile feed ready');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No page-level horizontal overflow');
          for (const link of await feed(page).getByRole('navigation', { name: 'Activity related records' }).getByRole('button').all()) assert.ok((await link.boundingBox()).height >= 44);
          await page.getByLabel('Currency', { exact: true }).fill('gbp'); await page.getByLabel('Currency', { exact: true }).press('Enter');
          await statsMatch(page, api, 'GBP');
        }
      } finally { await page.evaluate(() => document.documentElement.classList.remove('dark')); await page.setViewportSize({ width: 1280, height: 720 }); await page.emulateMedia({ colorScheme: 'light' }); }
    });
    await scenario(`${mode}: actor directory transport errors preserve historical attribution and retry names`, async () => {
      await page.route('**/api/assignees?*', route => route.abort('failed'));
      try {
        await page.goto('/');
        await page.getByText('Actor names could not load. Historical actor IDs remain visible.', { exact: true }).waitFor();
        await card(page, call.id).getByText(`Unavailable / historical actor (${member.user.id})`, { exact: true }).waitFor();
        await statsMatch(page, api);
      } finally { await page.unroute('**/api/assignees?*'); }
      await page.getByRole('button', { name: 'Retry actor names', exact: true }).click();
      await card(page, call.id).getByText(member.user.name, { exact: true }).waitFor();
      await card(page, legacy.id).getByText('Unavailable / historical actor (historical-browser-actor)', { exact: true }).waitFor();
    });

    await scenario(`${mode}: list navigation returns to current overview aggregates and recent activity`, async () => {
      await page.getByRole('link', { name: 'Companies', exact: true }).click();
      await page.waitForURL('**/companies');
      await page.getByRole('status').filter({ hasText: /records?$/ }).first().waitFor();
      await page.getByRole('link', { name: 'Overview', exact: true }).click();
      await page.waitForURL(url => url.pathname === '/');
      await statsMatch(page, api);
      await eventually(async () => (await feed(page).locator('[data-activity-id]').evaluateAll(rows => rows.map(row => row.dataset.activityId))).join() === expectedFeed.map(row => row.id).join(), 'Overview navigation fetches current projected activity');
    });

    await runOverviewMutations(h, { mode, actor: member });
    await scenario(`${mode}: genuine action-specific activity denial stays bounded and explicit retry recovers`, async () => {
      let attempts = 0;
      await page.route('**/api/activities?*', async route => {
        attempts++;
        const response = await route.fetch({ method: 'POST', headers: { ...route.request().headers(), origin: 'http://localhost:3101' } });
        assert.equal(response.status(), 403);
        assert.equal((await response.json()).code, 'FORBIDDEN_ACTION');
        await route.fulfill({ response });
      });
      try {
        await page.goto('/?currency=USD');
        await page.getByText('Recent activity could not load.', { exact: false }).waitFor();
        await statsMatch(page, api);
        assert.equal(await feed(page).getByRole('article').count(), 0);
        const settled = attempts; await delay(750);
        assert.equal(attempts, settled, 'Action denial cannot cause an access recheck request loop');
        assert.ok(attempts <= 2, 'Forbidden resource settles after bounded recheck');
        assert.equal(new URL(page.url()).pathname, '/');
      } finally { await page.unroute('**/api/activities?*'); }
      await page.getByRole('button', { name: 'Retry activity', exact: true }).click();
      await eventually(async () => await feed(page).getByRole('article').count() === 10, 'Explicit retry recovers permitted feed');
    });

    await scenario(`${mode}: expired session clears protected overview and ignores a late activity response`, async () => {
      const context = await h.newContext(); await h.signIn(context, member.email);
      const expired = await context.newPage();
      let release, received; const held = new Promise(resolve => { release = resolve; }); const fetched = new Promise(resolve => { received = resolve; });
      try {
        await expired.goto('/'); await statsMatch(expired, api);
        await eventually(async () => await feed(expired).getByRole('article').count() === 10, 'Authenticated feed ready');
        await expired.route('**/api/activities?*', async route => { const response = await route.fetch(); received(); await held; await route.fulfill({ response }).catch(() => {}); });
        await expired.getByRole('button', { name: 'Refresh activity', exact: true }).click(); await fetched;
        await context.clearCookies();
        await changeCurrency(expired, 'EUR');
        await expired.waitForURL('**/sign-in?**');
        release(); await delay(200);
        assert.equal(await statsRegion(expired).count(), 0);
        assert.equal(await feed(expired).count(), 0);
        assert.equal(await expired.locator('[data-activity-id]').count(), 0);
      } finally { release(); await context.close(); }
    });

    await scenario(`${mode}: confirmed membership revocation clears overview cards links and open record`, async () => {
      await page.goto(`/?currency=USD&record=company:${company.id}`);
      await sheet(page).getByRole('button', { name: 'Edit name', exact: true }).waitFor();
      const composer = sheet(page).getByRole('form', { name: 'Log activity', exact: true });
      await composer.getByLabel('Subject', { exact: true }).fill(`${mode} rejected after revocation`);
      const membership = (await h.api(owner.context, '/api/members')).find(row => row.id === member.user.id);
      await h.api(owner.context, `/api/members/${member.user.id}`, { method: 'PATCH', body: { action: 'revoke', expectedRevision: membership.revision } });
      await composer.getByRole('button', { name: 'Add activity', exact: true }).click();
      await page.waitForURL(url => ['/access-revoked', '/sign-in'].includes(url.pathname));
      assert.equal(await statsRegion(page).count(), 0); assert.equal(await feed(page).count(), 0); assert.equal(await sheet(page).count(), 0);
    });
    assert.deepEqual(errors, [], 'No uncaught browser exceptions');
  } finally { await page.close(); await member.context.close(); }
}

async function seedLegacy(h, mode, legacyId, unlinkedId, companyId) {
  const directory = await realpath(h.directory), app = await realpath(h.app), state = await realpath(h.state);
  assert.ok(basename(directory).startsWith('worker-browser-'));
  assert.equal(app, join(directory, 'app')); assert.equal(state, join(app, '.wrangler/state'));
  const cli = fileURLToPath(new URL('../../node_modules/wrangler/bin/wrangler.js', import.meta.url));
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SYSTEMROOT'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { CI: '1', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' });
  const backup = join(directory, `${mode}-before-historical-activities.sql`);
  execFileSync(process.execPath, [cli, 'd1', 'export', 'DB', '--local', '--config', join(app, 'wrangler.jsonc'), '--output', backup], { cwd: app, env, stdio: 'pipe', timeout: 30000 });
  await chmod(backup, 0o600);
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  const path = join(directory, `${mode}-historical-activities.sql`);
  await writeFile(path, `UPDATE activities SET type='ENRICHMENT', created_by_id='historical-browser-actor', occurred_at=NULL WHERE id=${quote(legacyId)};\nUPDATE activities SET company_id=NULL, contact_id=NULL, deal_id=NULL WHERE id=${quote(unlinkedId)};\nUPDATE companies SET name='' WHERE id=${quote(companyId)};\n`, { mode: 0o600 });
  execFileSync(process.execPath, [cli, 'd1', 'execute', 'DB', '--local', '--persist-to', state, '--config', join(app, 'wrangler.jsonc'), '--file', path, '--yes'], { cwd: app, env, stdio: 'pipe', timeout: 30000 });
  console.log(`[browser] Historical activity rows seeded through local D1 after private export backup: ${backup}`);
}
