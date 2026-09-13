import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export async function createHarness(context) {
  const directory = await mkdtemp(join(tmpdir(), 'worker-services-'));
  let runtime;
  const dispose = async () => {
    try { await runtime?.dispose(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  };
  try {
    const modulePath = join(directory, 'services.mjs');
    await build({
      stdin: {
        contents: `
          import * as schema from './src/lib/db/schema/index.ts';
          export { schema };
          export { drizzle } from 'drizzle-orm/d1';
          export { migrate } from 'drizzle-orm/d1/migrator';
          export * from 'drizzle-orm';
          export * from './services/company.service.ts';
          export * from './services/contact.service.ts';
          export * from './services/deal.service.ts';
          export * from './services/deal-contact.service.ts';
          export * from './services/activity.service.ts';
          export * from './services/activity-stamp.service.ts';
          export * from './services/field.service.ts';
          export * from './services/stats.service.ts';
          export * from './src/lib/utils/money.ts';
          export * from './src/lib/utils/service-error.ts';
          export * from './services/member.service.ts';
        `,
        resolveDir: projectRoot,
        loader: 'ts',
      },
      bundle: true, platform: 'node', format: 'esm', outfile: modulePath, logLevel: 'silent',
    });
    const exported = await import(pathToFileURL(modulePath).href);
    runtime = new Miniflare({
      resourcePersistencePath: join(directory, 'storage'),
      telemetry: { enabled: false },
      workers: [{ config: {
        type: 'worker', name: 'service-tests', compatibilityDate: '2026-09-11',
        manifest: { mainModule: 'worker.mjs', modules: {
          'worker.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("service tests"); } };' },
        } },
        env: { DB: { type: 'd1', id: 'service-tests' } },
      } }],
    });
    const binding = await runtime.getD1Database('DB');
    const db = exported.drizzle(binding, { schema: exported.schema });
    await exported.migrate(db, { migrationsFolder: join(projectRoot, 'migrations') });
    const reset = async () => {
      for (const name of ['activities', 'field_values', 'field_options', 'field_definitions', 'deal_contacts', 'deals', 'companies', 'contacts', 'saved_views']) {
        await binding.prepare(`DELETE FROM ${name}`).run();
      }
    };
    context?.after(dispose);
    return { ...exported, db, binding, reset, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
