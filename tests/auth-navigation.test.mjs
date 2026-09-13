import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

let safeReturnUrl;
test('post-auth navigation accepts internal destinations and rejects encoded escape paths', async () => {
  const built = await build({ entryPoints: ['src/lib/auth/safe-return-url.ts'], bundle: true, format: 'esm', platform: 'browser', write: false, logLevel: 'silent' });
  ({ safeReturnUrl } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`));
  for (const value of [null, undefined, '', 'https://evil.test', '//evil.test', '/\\evil.test', '/%5cevil.test', '/%2f%2fevil.test', '/%252f%252fevil.test', '/\nevil.test', '/%0devil.test', '/%ZZ']) {
    assert.equal(safeReturnUrl(value), '/', String(value));
  }
  for (const value of ['/docs', '/settings/members', '/companies?search=example#results']) assert.equal(safeReturnUrl(value), value);
});
