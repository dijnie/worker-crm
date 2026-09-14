import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthHarness, password } from './auth-harness.mjs';

const post = (h, path, body, options = {}) => h.request(`/api/auth/${path}`, { method: 'POST', body, ...options });

test('real workerd signup, verification, session mapping, renewal, expiry and signout', async t => {
  const h = await createAuthHarness(t);
  const signup = await post(h, 'sign-up/email', { email: '  ALICE@Example.test ', name: 'Alice', password, callbackURL: '/sign-in', accessVersion: 888 });
  assert.equal(signup.status, 200, await signup.clone().text());
  assert.equal(signup.headers.get('set-cookie'), null);
  const user = await h.binding.prepare('SELECT * FROM user').first();
  assert.equal(user.email, 'alice@example.test');
  assert.equal(user.email_verified, 0);
  assert.equal((await post(h, 'sign-in/email', { email: user.email, password })).status, 403);
  assert.equal((await h.request('/api/companies')).status, 401);
  const [message] = await h.outbox();
  assert.equal(new URL(message.url).origin, h.baseUrl);
  const claims = JSON.parse(Buffer.from(new URL(message.url).searchParams.get('token').split('.')[1], 'base64url'));
  assert.equal(claims.exp - claims.iat, 3600);
  const verified = await h.request(message.url);
  assert.equal(verified.status, 302);
  assert.equal(verified.headers.get('set-cookie'), null);
  assert.equal((await h.binding.prepare('SELECT * FROM singleton_membership').first()).role_id, null);
  const login = await h.signIn(' ALICE@example.test ', { body: { accessVersion: 888 } });
  const cookie = login.response.headers.get('set-cookie');
  assert.match(cookie, /__Secure-better-auth\.session_token=/);
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i); assert.match(cookie, /Secure/);
  const stored = await h.binding.prepare('SELECT * FROM session').first();
  assert.equal(stored.access_version, 0);
  assert.ok(Math.abs(stored.expires_at - stored.created_at - 3600000) < 2000);
  const current = await h.request('/api/auth/get-session', { cookie: login.cookie });
  const session = await current.json();
  assert.equal(session.user.id, user.id);
  assert.equal('accessVersion' in session.session, false);
  assert.equal((await h.request('/api/companies', { cookie: login.cookie })).status, 403);
  assert.equal((await h.request('/api/account', { cookie: login.cookie })).status, 200);
  await h.binding.prepare('UPDATE session SET updated_at = ?, expires_at = ? WHERE id = ?').bind(Date.now() - 360000, Date.now() + 300000, stored.id).run();
  const expiryBeforePrivateRead = (await h.binding.prepare('SELECT expires_at FROM session WHERE id=?').bind(stored.id).first()).expires_at;
  const privateRead = await h.request('/api/account', { cookie: login.cookie });
  assert.equal(privateRead.status, 200);
  assert.equal(privateRead.headers.get('set-cookie'), null);
  assert.equal((await h.binding.prepare('SELECT expires_at FROM session WHERE id=?').bind(stored.id).first()).expires_at, expiryBeforePrivateRead);
  const renewed = await h.request('/api/auth/get-session', { cookie: login.cookie });
  assert.equal(renewed.status, 200);
  assert.match(renewed.headers.get('set-cookie'), /session_token=/);
  assert.ok((await h.binding.prepare('SELECT expires_at FROM session WHERE id=?').bind(stored.id).first()).expires_at > Date.now() + 3500000);
  assert.equal((await post(h, 'sign-out', {}, { cookie: login.cookie })).status, 200);
  assert.equal(await (await h.request('/api/auth/get-session', { cookie: login.cookie })).json(), null);
  const expired = await h.signIn(user.email);
  await h.binding.prepare('UPDATE session SET expires_at = ?').bind(Date.now() - 1000).run();
  assert.equal((await h.request('/api/companies', { cookie: expired.cookie })).status, 401);
  assert.equal((await h.request('/api/auth/not-a-route')).status, 404);
});

test('awaited signup delivery failure keeps unverified user recoverable by normalized resend', async t => {
  const h = await createAuthHarness(t);
  await h.request('/__test/email-failure', { method: 'POST', body: { enabled: true } });
  const failed = await post(h, 'sign-up/email', { email: 'recover@example.test', name: 'Recover', password });
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { code: 'EMAIL_DELIVERY_UNAVAILABLE', message: 'Email delivery is unavailable. Please retry or resend verification.' });
  assert.equal(failed.headers.get('cache-control'), 'no-store');
  const requestId = failed.headers.get('x-request-id');
  assert.match(requestId ?? '', /^[0-9a-f-]{36}$/);
  assert.deepEqual(await h.errorEvents(), [[JSON.stringify({
    event: 'request_failure', requestId, route: '/api/auth/sign-up/email', method: 'POST', status: 503, category: 'email_delivery_failed',
  })]]);
  assert.equal((await h.binding.prepare('SELECT email_verified FROM user').first()).email_verified, 0);
  assert.equal((await h.outbox()).length, 0);
  await h.request('/__test/email-failure', { method: 'POST', body: { enabled: false } });
  const resend = await post(h, 'send-verification-email', { email: ' RECOVER@EXAMPLE.TEST ', callbackURL: '/sign-in' });
  assert.equal(resend.status, 200, await resend.clone().text());
  await h.request((await h.outbox())[0].url);
  const login = await h.signIn('recover@example.test');
  assert.equal((await h.request('/api/companies', { cookie: login.cookie })).status, 403);
  assert.equal((await h.request('/api/account', { cookie: login.cookie })).status, 200);
});

test('real reset is generic, canonical, one-use, expires in fifteen minutes and invalidates sessions', async t => {
  const h = await createAuthHarness(t);
  const account = await h.signupVerified('reset@example.test');
  const valid = await post(h, 'request-password-reset', { email: ' RESET@example.test ', redirectTo: '/reset-password' });
  const unknown = await post(h, 'request-password-reset', { email: 'unknown@example.test', redirectTo: '/reset-password' });
  assert.equal(valid.status, 200); assert.equal(unknown.status, 200);
  assert.deepEqual(await valid.json(), await unknown.json());
  const message = (await h.outbox()).findLast(message => message.kind === 'reset');
  const link = new URL(message.url); assert.equal(link.origin, h.baseUrl);
  const token = link.pathname.split('/').at(-1);
  const verification = await h.binding.prepare("SELECT * FROM verification WHERE identifier LIKE 'reset-password:%'").first();
  assert.ok(verification.expires_at - Date.now() <= 900000 && verification.expires_at - Date.now() > 890000);
  const landing = await h.request(message.url);
  assert.equal(landing.status, 302);
  assert.equal(new URL(landing.headers.get('location'), h.baseUrl).searchParams.get('token'), token);
  const newPassword = password + '-changed';
  assert.equal((await post(h, 'reset-password', { token, newPassword })).status, 200);
  assert.equal((await h.request('/api/companies', { cookie: account.cookie })).status, 401);
  assert.equal((await post(h, 'reset-password', { token, newPassword })).status, 400);
  assert.equal((await post(h, 'sign-in/email', { email: account.email, password })).status, 401);
  assert.equal((await h.signIn(account.email, { body: { password: newPassword } })).response.status, 200);
  await post(h, 'request-password-reset', { email: account.email, redirectTo: '/reset-password' });
  const expiredLink = (await h.outbox()).findLast(message => message.kind === 'reset');
  await h.binding.prepare("UPDATE verification SET expires_at = ? WHERE identifier LIKE 'reset-password:%'").bind(Date.now() - 1000).run();
  assert.equal((await post(h, 'reset-password', { token: new URL(expiredLink.url).pathname.split('/').at(-1), newPassword })).status, 400);
});

test('canonical host and callbacks reject poisoning while local cookies allow loopback', async t => {
  const h = await createAuthHarness(t, { baseUrl: 'http://localhost:3000' });
  for (const callbackURL of ['https://evil.test/steal', '//evil.test/steal']) {
    assert.equal((await post(h, 'sign-up/email', { email: 'host@example.test', password, name: 'Host', callbackURL })).status, 403);
  }
  assert.equal((await post(h, 'sign-up/email', { email: 'host@example.test', password, name: 'Host' }, { origin: 'https://evil.test' })).status, 403);
  const account = await h.signupVerified('local@example.test');
  const cookie = account.response.headers.get('set-cookie');
  assert.match(cookie, /^better-auth\.session_token=/); assert.doesNotMatch(cookie, /; Secure/i);
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i);
  const response = await h.runtime.dispatchFetch('http://attacker.test/api/auth/send-verification-email', { method: 'POST', headers: { origin: h.baseUrl, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.5' }, body: JSON.stringify({ email: 'local@example.test', callbackURL: '/sign-in' }) });
  assert.equal(response.status, 200);
  for (const message of await h.outbox()) assert.equal(new URL(message.url).origin, h.baseUrl);
});

test('persistent endpoint rate limits and controlled bad credentials', async t => {
  const h = await createAuthHarness(t);
  for (let attempt = 0; attempt < 11; attempt++) {
    const response = await post(h, 'sign-in/email', { email: 'unknown@example.test', password }, { ip: '192.0.2.10' });
    assert.equal(response.status, attempt < 10 ? 401 : 429);
  }
  for (const [path, limit, body] of [
    ['request-password-reset', 5, { email: 'unknown@example.test', redirectTo: '/reset-password' }],
    ['send-verification-email', 5, { email: 'unknown@example.test', callbackURL: '/sign-in' }],
    ['reset-password', 5, { token: 'invalid', newPassword: password }],
  ]) {
    for (let attempt = 0; attempt <= limit; attempt++) {
      const response = await post(h, path, body, { ip: '192.0.2.20' });
      assert.equal(response.status === 429, attempt === limit, `${path} attempt ${attempt}: ${response.status}`);
    }
  }
  for (let attempt = 0; attempt < 11; attempt++) {
    const response = await h.request('/api/auth/verify-email?token=invalid', { ip: '192.0.2.30' });
    assert.equal(response.status === 429, attempt === 10);
  }
  assert.ok((await h.binding.prepare('SELECT count(*) AS count FROM rate_limit').first()).count >= 5);
});

test('concurrent email failures stay request-local and reset delivery failure is awaited', async t => {
  const h = await createAuthHarness(t, { sharedAuth: true });
  await h.request('/__test/email-failure', { method: 'POST', body: { enabled: true, email: 'failure@example.test' } });
  const [failed, successful] = await Promise.all([
    post(h, 'sign-up/email', { email: 'failure@example.test', name: 'Failure', password }, { ip: '192.0.2.101' }),
    post(h, 'sign-up/email', { email: 'success@example.test', name: 'Success', password }, { ip: '192.0.2.102' }),
  ]);
  assert.equal(failed.status, 503); assert.equal(successful.status, 200);
  assert.equal((await h.outbox()).length, 1);
  assert.equal(successful.headers.get('x-request-id'), null);
  assert.deepEqual((await h.errorEvents()).map(([entry]) => JSON.parse(entry)), [{
    event: 'request_failure', requestId: failed.headers.get('x-request-id'), route: '/api/auth/sign-up/email', method: 'POST', status: 503, category: 'email_delivery_failed',
  }]);
  await h.request('/__test/email-failure', { method: 'POST', body: { enabled: false } });
  const account = await h.signupVerified('reset-failure@example.test');
  await h.request('/__test/email-failure', { method: 'POST', body: { enabled: true } });
  const reset = await post(h, 'request-password-reset', { email: account.email, redirectTo: '/reset-password' });
  assert.equal(reset.status, 503);
  const events = (await h.errorEvents()).map(([entry]) => JSON.parse(entry));
  assert.equal(events.length, 2);
  assert.equal(events[1].requestId, reset.headers.get('x-request-id'));
  assert.notEqual(events[1].requestId, events[0].requestId);
  assert.equal(events[1].route, '/api/auth/request-password-reset');
  assert.equal(events[1].category, 'email_delivery_failed');
  assert.equal((await h.outbox()).filter(message => message.kind === 'reset').length, 0);
});

test('real delayed signin cannot issue sessions after revoke or revoke followed by restore', async t => {
  const h = await createAuthHarness(t);
  const owner = await h.signupSystem('race-owner@example.test');
  const member = await h.signupVerified('race-member@example.test');
  let revision = 0;
  for (const restore of [false, true]) {
    if (revision) {
      const response = await h.request(`/api/members/${member.user.id}`, { method: 'PATCH', cookie: owner.cookie, body: { action: 'restore', expectedRevision: revision } });
      assert.equal(response.status, 200, await response.clone().text()); revision++;
    }
    await h.request('/__test/session-pause', { method: 'POST', body: { userId: member.user.id } });
    const pending = post(h, 'sign-in/email', { email: member.email, password }, { ip: restore ? '192.0.2.152' : '192.0.2.151' });
    let paused = false;
    for (let attempt = 0; attempt < 100 && !paused; attempt++) {
      paused = (await (await h.request('/__test/session-pause')).json()).paused;
      if (!paused) await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(paused, true, 'signin must pause after capturing membership version');
    try {
      const revoked = await h.request(`/api/members/${member.user.id}`, { method: 'PATCH', cookie: owner.cookie, body: { action: 'revoke', expectedRevision: revision } });
      assert.equal(revoked.status, 200, await revoked.clone().text()); revision++;
      if (restore) {
        const restored = await h.request(`/api/members/${member.user.id}`, { method: 'PATCH', cookie: owner.cookie, body: { action: 'restore', expectedRevision: revision } });
        assert.equal(restored.status, 200, await restored.clone().text()); revision++;
      }
    } finally {
      await h.request('/__test/session-pause', { method: 'POST', body: { release: true } });
    }
    const delayed = await pending;
    assert.ok(delayed.status >= 400, `delayed signin returned ${delayed.status}`);
    assert.equal(delayed.headers.get('set-cookie'), null);
    assert.equal((await h.binding.prepare('SELECT count(*) AS count FROM session WHERE user_id=?').bind(member.user.id).first()).count, 0);
    assert.equal((await h.request('/api/companies', { cookie: member.cookie })).status, 401);
  }
  const fresh = await h.signIn(member.email);
  assert.equal((await h.request('/api/companies', { cookie: fresh.cookie })).status, 403);
  assert.equal((await h.request('/api/account', { cookie: fresh.cookie })).status, 200);
  const stored = await h.binding.prepare('SELECT access_version FROM session WHERE user_id=?').bind(member.user.id).first();
  assert.equal(stored.access_version, 4);
});

test('expired and absent verification links fail; replay is idempotent and interrupted admission repairs on signin', async t => {
  const h = await createAuthHarness(t);
  await post(h, 'sign-up/email', { email: 'verify@example.test', name: 'Verify', password, callbackURL: '/sign-in?verified=true' });
  const message = (await h.outbox())[0];
  const expired = await h.request(h.expireVerificationLink(message.url));
  assert.equal(expired.status, 302);
  assert.equal(new URL(expired.headers.get('location'), h.baseUrl).searchParams.get('error'), 'TOKEN_EXPIRED');
  assert.equal((await h.binding.prepare('SELECT email_verified FROM user').first()).email_verified, 0);
  assert.equal((await h.request('/api/auth/verify-email')).status, 400);
  await h.binding.prepare("CREATE TRIGGER fail_admission BEFORE INSERT ON singleton_membership BEGIN SELECT RAISE(ABORT, 'injected_admission_failure'); END").run();
  const interrupted = await h.request(message.url);
  assert.equal(interrupted.status, 500);
  assert.deepEqual(await interrupted.json(), { message: 'Authentication is temporarily unavailable. Please retry.' });
  assert.equal(interrupted.headers.get('cache-control'), 'no-store');
  const requestId = interrupted.headers.get('x-request-id');
  assert.match(requestId ?? '', /^[0-9a-f-]{36}$/);
  assert.deepEqual(await h.errorEvents(), [[JSON.stringify({
    event: 'request_failure', requestId, route: '/api/auth/verify-email', method: 'GET', status: 500, category: 'auth_unexpected',
  })]]);
  assert.equal((await h.binding.prepare('SELECT email_verified FROM user').first()).email_verified, 1);
  assert.equal((await h.binding.prepare('SELECT count(*) AS count FROM singleton_membership').first()).count, 0);
  await h.binding.prepare('DROP TRIGGER fail_admission').run();
  await h.signIn('verify@example.test');
  const membership = await h.binding.prepare('SELECT * FROM singleton_membership').first();
  assert.equal(membership.role_id, null);
  const replay = await h.request(message.url);
  assert.equal(replay.status, 302);
  assert.equal(replay.headers.get('set-cookie'), null);
  assert.deepEqual(await h.binding.prepare('SELECT * FROM singleton_membership').first(), membership);
});

test('signup and general limits persist while loopback without edge IP stays controlled', async t => {
  const h = await createAuthHarness(t);
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await post(h, 'sign-up/email', { email: `limit-${attempt}@example.test`, name: 'Limit', password }, { ip: '192.0.2.180' });
    assert.equal(response.status, attempt < 5 ? 200 : 429);
  }
  for (let attempt = 0; attempt < 101; attempt++) {
    const response = await h.request('/api/auth/get-session', { ip: '192.0.2.181' });
    assert.equal(response.status, attempt < 100 ? 200 : 429);
  }
  const local = await post(h, 'sign-in/email', { email: 'unknown@example.test', password }, { ip: null });
  assert.equal(local.status, 401);
  assert.equal(local.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await h.errorEvents(), []);
});

test('invalid cookies, mismatched access versions and revoked credentials fail without revealing access anonymously', async t => {
  const h = await createAuthHarness(t);
  assert.equal((await h.request('/api/companies', { cookie: '__Secure-better-auth.session_token=fabricated.invalid' })).status, 401);
  const owner = await h.signupSystem();
  const member = await h.signupVerified();
  await h.binding.prepare('UPDATE singleton_membership SET access_version = access_version + 1 WHERE user_id = ?').bind(member.user.id).run();
  assert.equal((await h.request('/api/companies', { cookie: member.cookie })).status, 403);
  assert.equal((await h.request(`/api/members/${member.user.id}`, { method: 'PATCH', cookie: owner.cookie, body: { action: 'revoke', expectedRevision: 0 } })).status, 200);
  const wrong = await post(h, 'sign-in/email', { email: member.email, password: password + '-wrong' });
  assert.equal(wrong.status, 401);
  assert.doesNotMatch(await wrong.text(), /ACCESS_REVOKED|revoked/i);
  const valid = await post(h, 'sign-in/email', { email: member.email, password });
  assert.equal(valid.status, 403);
  assert.equal((await valid.json()).code, 'ACCESS_REVOKED');
});
