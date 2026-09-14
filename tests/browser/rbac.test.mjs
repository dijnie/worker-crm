import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

async function eventually(check, message) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await check()) return; await delay(75); }
  assert.fail(message);
}

export async function runSuite(h, { mode, owner }) {
  await test(`${mode}: roleless account, permission matrix, assignment and live access removal`, { timeout: 150000 }, async () => {
    const actor = await h.signup(`${mode} Waiting account`);
    const page = await actor.context.newPage(), admin = await owner.context.newPage();
    const roleName = `${mode} Company operator`;
    try {
      const businessRequests = [];
      page.on('request', request => {
        const path = new URL(request.url()).pathname;
        if (/^\/api\/(companies|contacts|deals|activities|stats|fields|assignees|saved-views)(\/|$)/.test(path)) businessRequests.push(path);
      });
      await page.goto('/companies');
      await page.getByRole('heading', { name: 'Waiting for access', exact: true }).waitFor();
      await page.waitForLoadState('networkidle');
      assert.deepEqual(businessRequests, [], 'Roleless shell never requests business data');
      assert.equal(await page.getByRole('table').count(), 0);
      assert.equal((await actor.context.request.get('/api/companies')).status(), 403);

      await admin.goto('/settings/roles');
      await admin.waitForLoadState('networkidle');
      await admin.getByRole('button', { name: 'Create role', exact: true }).click();
      let editor = admin.getByRole('dialog', { name: 'Create role', exact: true });
      await editor.getByLabel('Role name', { exact: true }).fill(roleName);
      await editor.getByRole('checkbox', { name: 'company update', exact: true }).check();
      assert.equal(await editor.getByRole('checkbox', { name: 'company read', exact: true }).isChecked(), true);
      await editor.getByRole('checkbox', { name: 'company create', exact: true }).check();
      assert.equal(await editor.getByRole('checkbox', { name: 'company archive', exact: true }).isChecked(), false);
      await editor.getByRole('button', { name: 'Save role', exact: true }).click();
      await editor.waitFor({ state: 'hidden' });
      const role = (await h.api(owner.context, '/api/roles')).find(row => row.name === roleName);
      assert.ok(role);
      await admin.goto('/settings/members');
      await admin.waitForLoadState('networkidle');
      const selector = admin.getByRole('combobox', { name: `Role for ${actor.user.name}`, exact: true });
      await selector.selectOption(role.id);
      await eventually(async () => (await h.api(actor.context, '/api/account')).role?.id === role.id, 'Role assignment reaches current session');
      await page.getByRole('button', { name: 'Check access', exact: true }).click();
      await page.getByRole('button', { name: 'New company', exact: true }).first().waitFor();
      const navigation = page.getByRole('navigation', { name: 'Primary', exact: true });
      assert.equal(await navigation.getByRole('link', { name: 'Contacts', exact: true }).count(), 0);
      assert.equal(await navigation.getByRole('link', { name: 'Deals', exact: true }).count(), 0);
      await page.getByRole('button', { name: 'New company', exact: true }).first().click();
      const create = page.getByRole('dialog', { name: 'New company', exact: true });
      const companyName = `${mode} Limited permissions company`;
      await create.getByLabel('Name', { exact: false }).fill(companyName);
      await create.getByRole('button', { name: 'Add company', exact: true }).click();
      await create.waitFor({ state: 'hidden' });
      await page.getByRole('link', { name: companyName, exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Company record', exact: true });
      await sheet.getByRole('button', { name: 'Edit name', exact: true }).waitFor();
      assert.equal(await sheet.getByRole('button', { name: 'Archive record', exact: true }).count(), 0);
      assert.equal(await sheet.getByRole('link', { name: 'Manage fields', exact: true }).count(), 0);
      await sheet.getByRole('button', { name: 'Edit name', exact: true }).click();
      await sheet.getByLabel('Name', { exact: true }).fill('Unsaved permission draft');

      await admin.goto('/settings/roles');
      await admin.waitForLoadState('networkidle');
      const roleRow = admin.getByRole('listitem').filter({ has: admin.getByRole('heading', { name: roleName, exact: true }) });
      assert.equal(await roleRow.getByRole('button', { name: 'Delete role', exact: true }).isDisabled(), true);
      await roleRow.getByRole('button', { name: 'Edit role', exact: true }).click();
      editor = admin.getByRole('dialog', { name: 'Edit role', exact: true });
      await editor.getByRole('checkbox', { name: 'company read', exact: true }).uncheck();
      assert.equal(await editor.getByRole('checkbox', { name: 'company update', exact: true }).isChecked(), false);
      assert.equal(await editor.getByRole('checkbox', { name: 'company create', exact: true }).isChecked(), false);
      await editor.getByRole('button', { name: 'Save role', exact: true }).click();
      await editor.waitFor({ state: 'hidden' });
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.getByRole('heading', { name: 'Waiting for access', exact: true }).waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await page.getByText(companyName, { exact: true }).count(), 0);
      assert.equal(await page.getByText('Unsaved permission draft', { exact: true }).count(), 0);
      assert.equal((await actor.context.request.get('/api/companies')).status(), 403);
      assert.ok((await h.api(actor.context, '/api/account')).role, 'Empty grants retain the explicit custom role');

      await admin.goto('/settings/members');
      await admin.waitForLoadState('networkidle');
      await admin.getByRole('combobox', { name: `Role for ${actor.user.name}`, exact: true }).selectOption('');
      await eventually(async () => (await h.api(actor.context, '/api/account')).role === null, 'Role assignment clears');
      await admin.goto('/settings/roles');
      await admin.waitForLoadState('networkidle');
      await admin.setViewportSize({ width: 390, height: 844 });
      const unused = admin.getByRole('listitem').filter({ has: admin.getByRole('heading', { name: roleName, exact: true }) });
      await unused.getByRole('button', { name: 'Edit role', exact: true }).click();
      editor = admin.getByRole('dialog', { name: 'Edit role', exact: true });
      assert.equal(await editor.getByRole('checkbox').count(), 19);
      assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
      await unused.getByRole('button', { name: 'Delete role', exact: true }).click();
      await admin.getByRole('dialog', { name: 'Delete role?', exact: true }).getByRole('button', { name: 'Delete role', exact: true }).click();
      await eventually(async () => !(await h.api(owner.context, '/api/roles')).some(row => row.id === role.id), 'Unused role is deleted');
    } finally { await page.close(); await admin.close(); await actor.context.close(); }
  });
}
