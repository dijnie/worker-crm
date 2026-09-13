import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== '--dry-run')) {
  console.error('Usage: npm run deploy [-- --dry-run]. Deployment uses the production target in wrangler.jsonc.');
  process.exit(1);
}

const dryRun = args[0] === '--dry-run';
const commands = dryRun
  ? [['exec', '--no', '--', 'vinext-cloudflare', 'deploy', '--config', 'wrangler.jsonc', '--dry-run']]
  : [
      ['run', 'build'],
      ['run', 'db:migrate:remote'],
      ['exec', '--no', '--', 'vinext-cloudflare', 'deploy', '--config', 'dist/server/wrangler.json', '--skip-build'],
    ];

for (const command of commands) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', command, {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Unable to start deployment step: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
