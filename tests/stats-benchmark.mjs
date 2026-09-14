// Explicit benchmark: node --expose-gc --test tests/stats-benchmark.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness } from './service-harness.mjs';

test('measure exact stats on disposable D1 acceptance datasets', async t => {
  const harness = await createHarness(t);
  const { db, schema, StatsService, centsToDecimal } = harness;
  const closedStages = new Set(['CLOSED_WON', 'CLOSED_LOST', 'UNQUALIFIED_TO_BUY']);
  for (const size of [147, 10000]) {
    await harness.reset();
    await db.insert(schema.companies).values({ id: 'benchmark-company', name: 'Benchmark' });
    const expected = schema.DEAL_STAGES.map(stage => ({ stage, count: 0, cents: 0n }));
    let totalDeals = 0;
    let openDeals = 0;
    // Each seven-row cycle covers all real stages; both currencies, archives,
    // null/zero amounts and individually safe amounts beyond a safe total occur.
    const rows = Array.from({ length: size }, (_, index) => {
      const stageIndex = index % schema.DEAL_STAGES.length;
      const row = {
        id: `benchmark-${index}`, name: `Deal ${index}`, companyId: 'benchmark-company', ownerId: 'operator',
        stage: schema.DEAL_STAGES[stageIndex], currency: index % 11 === 0 ? 'EUR' : 'USD',
        archivedAt: index % 13 === 0 ? '2026-01-01T00:00:00.000Z' : null,
        amount: index % 17 === 0 ? Number.MAX_SAFE_INTEGER : index % 5 === 0 ? null : index % 7 === 0 ? 0 : index % 2 === 0 ? 10 : 20,
      };
      if (row.archivedAt === null) {
        totalDeals++;
        if (!closedStages.has(row.stage)) openDeals++;
        if (row.currency === 'USD') {
          expected[stageIndex].count++;
          expected[stageIndex].cents += BigInt(row.amount ?? 0);
        }
      }
      return row;
    });
    for (let offset = 0; offset < rows.length; offset += 100) {
      await db.batch(rows.slice(offset, offset + 100).map(row => db.insert(schema.deals).values(row)));
    }
    let observation;
    const observedDb = new Proxy(db, {
      get(target, property, receiver) {
        if (property === 'batch') return async statements => {
          const result = await target.batch(statements);
          observation.batchCalls++;
          observation.statements += statements.length;
          observation.projectionRows = result[5].length;
          observation.heapAfterBatch = process.memoryUsage().heapUsed;
          observation.projectionJsonBytes = Buffer.byteLength(JSON.stringify(result[5]));
          return result;
        };
        return Reflect.get(target, property, receiver);
      },
    });
    const service = new StatsService(observedDb);
    const samples = [];
    for (let sample = 0; sample < 8; sample++) {
      global.gc?.();
      observation = { batchCalls: 0, statements: 0 };
      const heapBefore = process.memoryUsage().heapUsed;
      const started = performance.now();
      const result = await service.getStats();
      const elapsedMs = performance.now() - started;
      assert.equal(result.totalDeals, totalDeals);
      assert.equal(result.openDeals, openDeals);
      assert.equal(result.openDealValue, centsToDecimal(expected.reduce((sum, row) => sum + (closedStages.has(row.stage) ? 0n : row.cents), 0n)));
      assert.deepEqual(result.pipeline, expected.map(({ stage, count, cents }) => ({ stage, count, value: centsToDecimal(cents) })));
      assert.equal(observation.batchCalls, 1);
      assert.equal(observation.statements, 6);
      if (sample > 0) samples.push({ elapsedMs, heapGrowthBytes: observation.heapAfterBatch - heapBefore, ...observation });
    }
    const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
    t.diagnostic(JSON.stringify({
      totalSeededDeals: size, selectedCurrencyRows: samples[0].projectionRows,
      measuredRuns: samples.length, warmups: 1, batchCallsPerRun: 1, statementsPerRun: 6,
      latencyMs: {
        minimum: Math.min(...samples.map(sample => sample.elapsedMs)),
        median: median(samples.map(sample => sample.elapsedMs)),
        maximum: Math.max(...samples.map(sample => sample.elapsedMs)),
      },
      projectionJsonBytes: samples[0].projectionJsonBytes,
      medianNodeHeapGrowthThroughBatchBytes: median(samples.map(sample => sample.heapGrowthBytes)),
      explicitGc: typeof global.gc === 'function',
    }));
  }
});
