import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

let safeReturnUrl, signInUrl;
test('post-auth navigation accepts internal destinations and rejects encoded escape paths', async () => {
  const built = await build({ entryPoints: ['src/lib/auth/safe-return-url.ts'], bundle: true, format: 'esm', platform: 'browser', write: false, logLevel: 'silent' });
  ({ safeReturnUrl, signInUrl } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`));
  for (const value of [null, undefined, '', 'https://evil.test', '//evil.test', '/\\evil.test', '/%5cevil.test', '/%2f%2fevil.test', '/%252f%252fevil.test', '/\nevil.test', '/%0devil.test', '/%ZZ']) {
    assert.equal(safeReturnUrl(value), '/', String(value));
  }
  for (const value of ['/docs', '/settings/members', '/companies?search=example#results', '/companies?q=Example%20Company&pageSize=50&record=company%3Aone&record=contact%3Atwo', '/companies?q=Example+Company', '/?currency=EUR&record=deal%3Aone']) {
    assert.equal(safeReturnUrl(value), value);
    assert.equal(new URL(signInUrl(value), 'https://crm.test').searchParams.get('returnTo'), value);
  }
  for (const value of [null, '/', '//evil.test', '/%252f%252fevil.test']) assert.equal(signInUrl(value), '/sign-in');
});

test('workspace proxy replaces spoofed return destinations with the actual request path and query', async () => {
  const built = await build({ stdin: { contents: `export { proxy } from './src/proxy.ts'; export { NextRequest } from 'next/server';`, loader: 'ts', resolveDir: process.cwd() }, alias: { 'next/server': 'vinext/shims/server' }, bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  const { proxy, NextRequest } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
  const path = '/companies?q=example&pageSize=50&record=company%3Aone&record=contact%3Atwo';
  const response = proxy(new NextRequest(`https://crm.test${path}`, { headers: { 'x-workspace-return-to': '//evil.test', 'x-preserved-header': 'present' } }));
  assert.equal(response.headers.get('x-middleware-request-x-workspace-return-to'), path);
  assert.equal(response.headers.get('x-middleware-request-x-preserved-header'), 'present');
  assert.equal(response.headers.get('x-workspace-return-to'), null, 'Request metadata is not a public response header');
});
