import assert from 'node:assert/strict';
import { createBrowserHarness } from '../tests/browser/browser-harness.mjs';

const knownSuites = ['lists', 'record-sheets', 'activities', 'fields', 'overview', 'integration', 'all'];
const registry = { lists: () => import('../tests/browser/lists.test.mjs') };
let mode = 'dev', suite = 'lists';
for (const argument of process.argv.slice(2)) {
  if (argument.startsWith('--mode=')) mode = argument.slice(7);
  else if (argument.startsWith('--suite=')) suite = argument.slice(8);
  else throw new Error(`Unknown argument: ${argument}`);
}
assert.ok(['dev', 'built', 'both'].includes(mode), 'Expected --mode=dev|built|both');
assert.ok(knownSuites.includes(suite), `Unknown suite: ${suite}`);
assert.ok(suite === 'all' || registry[suite], `Suite ${suite} has not been implemented yet`);
const suites = suite === 'all' ? Object.keys(registry) : [suite];
let harness, cleanup;
const onSignal = signal => { void (async () => { try { await cleanup?.(); } finally { process.exit(signal === 'SIGINT' ? 130 : 143); } })(); };
process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
try {
  harness = await createBrowserHarness({ onCleanup: dispose => { cleanup = dispose; } });
  let identity, probe;
  for (const currentMode of mode === 'both' ? ['dev', 'built'] : [mode]) {
    await harness.start(currentMode);
    if (!identity) {
      identity = await harness.signup('Browser Owner');
      probe = await harness.api(identity.context, '/api/companies', { method: 'POST', body: { name: 'Cross-mode persistence probe' } });
    } else {
      const session = await harness.api(identity.context, '/api/auth/get-session');
      assert.equal(session.user.id, identity.user.id, 'Built mode retains the exact verified dev identity/session');
      const persisted = await harness.api(identity.context, `/api/companies/${probe.id}`);
      assert.equal(persisted.id, probe.id);
      assert.equal(persisted.name, probe.name);
      console.log('[browser] Cross-mode handoff passed: original dev session and probe record survived in built Worker.');
    }
    for (const name of suites) await (await registry[name]()).runSuite(harness, { mode: currentMode, owner: identity });
    await harness.stopServer();
  }
} catch (error) {
  // Never print Playwright call logs: auth navigation URLs may contain live tokens.
  console.error(`[browser] Failed: ${String(error.message).split('\n')[0].replace(/https?:\/\/\S+/g, '[URL redacted]')}`);
  process.exitCode = 1;
} finally {
  try { await cleanup?.(); } catch (error) { console.error(error.message); process.exitCode = 1; }
  process.removeListener('SIGINT', onSignal);
  process.removeListener('SIGTERM', onSignal);
}
