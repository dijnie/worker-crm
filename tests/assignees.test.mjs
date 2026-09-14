import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createAuthHarness } from './auth-harness.mjs';
let h, owner, member;
before(async () => { h = await createAuthHarness(); owner = await h.signupSystem(); member = await h.signupAuthorized(); });
after(async () => h?.dispose());
const call = (account,path,method='GET',body) => h.request(path,{cookie:account.cookie,method,body});
test('ordinary member receives only safe active verified directory data with bounded pagination', async () => {
  assert.equal((await call(member,'/api/members')).status,403);
  const response=await call(member,'/api/assignees?limit=1'); assert.equal(response.status,200); assert.equal(response.headers.get('x-total-count'),'2');
  const [row]=await response.json(); assert.deepEqual(Object.keys(row).sort(),['id','image','name']);
  const second=await (await call(member,'/api/assignees?page=2&limit=1')).json(); assert.notEqual(row.id,second[0].id);
  assert.equal((await call(member,'/api/assignees?limit=101')).status,400);
  assert.equal((await call(member,'/api/assignees?page=1&page=2')).status,400);
  assert.deepEqual(await (await call(member,'/api/assignees?search=%25')).json(),[]);
});
test('revocation and restoration refresh assignees without changing historical record owner IDs', async () => {
  const record=await (await call(member,'/api/companies','POST',{name:'Historical assignment',ownerId:member.user.id})).json();
  const revoked=await call(owner,`/api/members/${member.user.id}`,'PATCH',{action:'revoke',expectedRevision:0}); assert.equal(revoked.status,200);
  let list=await (await call(owner,'/api/assignees')).json(); assert.equal(list.some(row=>row.id===member.user.id),false);
  assert.equal((await (await call(owner,`/api/companies/${record.id}`)).json()).ownerId,member.user.id);
  assert.equal((await call(owner,`/api/members/${member.user.id}`,'PATCH',{action:'restore',expectedRevision:1})).status,200);
  list=await (await call(owner,'/api/assignees')).json(); assert.equal(list.some(row=>row.id===member.user.id),true);
});

test('directory searches display names case-insensitively and excludes unverified or membershipless users', async () => {
  await h.binding.prepare('UPDATE user SET name = ? WHERE id = ?').bind('Alpha Owner', owner.user.id).run();
  await h.binding.prepare('UPDATE user SET name = ? WHERE id = ?').bind('beta Member', member.user.id).run();
  const created = await h.request('/api/auth/sign-up/email', { method: 'POST', body: { email: 'directory-unverified@example.test', password: 'A-real-local-test-password-42!', name: 'Hidden Unverified' } });
  assert.equal(created.status, 200);
  const pending = await h.binding.prepare('SELECT id FROM user WHERE email = ?').bind('directory-unverified@example.test').first();
  // Unverified accounts cannot gain membership even through a direct admission attempt.
  await assert.rejects(h.binding.prepare("INSERT INTO singleton_membership (user_id, role_id, status, created_at, updated_at) VALUES (?, NULL, 'active', ?, ?)").bind(pending.id, Date.now(), Date.now()).run(), /membership_admission_denied/);
  await h.binding.prepare("INSERT INTO user (id, name, email, email_verified) VALUES ('directory-orphan', 'Hidden Orphan', 'directory-orphan@example.test', 1)").run();
  const response = await call(owner, '/api/assignees?search=ALPHA');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-total-count'), '1');
  assert.equal((await response.json())[0].id, owner.user.id);
  const rows = await (await call(owner, '/api/assignees')).json();
  assert.deepEqual(rows.map(row => row.id), [owner.user.id, member.user.id]);
  assert.deepEqual(await (await call(owner, '/api/assignees?search=Hidden')).json(), []);
});

test('directory query rejects unsupported fields and malformed pagination', async () => {
  for (const query of ['archived=false', 'role=owner', 'status=active', 'includeSummary=true', 'filters={}', 'page=0', 'page=1.1', 'page=-1', 'limit=0', 'search=a&search=b']) {
    assert.equal((await call(owner, `/api/assignees?${query}`)).status, 400, query);
  }
});
