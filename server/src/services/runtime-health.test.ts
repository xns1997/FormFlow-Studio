import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAiHealth, recordDatabaseHealth, recordVectorHealth, runtimeHealth, startRuntimeHealthMonitor, stopRuntimeHealthMonitor } from './runtime-health';

test('runtime health exposes AI as a recoverable capability flag', async () => {
  recordDatabaseHealth(true, { latencyMs: 2 });
  await checkAiHealth(async () => { throw new Error('provider offline'); });
  assert.equal(runtimeHealth().status, 'degraded');
  assert.equal(runtimeHealth().capabilities.ai, false);

  await checkAiHealth(async () => ({ status: 'ok', version: 'test' }));
  assert.equal(runtimeHealth().status, 'ok');
  assert.equal(runtimeHealth().capabilities.ai, true);
});

test('runtime health exposes pgvector as an independent capability', () => {
  recordVectorHealth(true, { details: { extensionVersion: '0.8.1' } });
  assert.equal(runtimeHealth().capabilities.vectorSearch, true);
  recordVectorHealth(false, { error: 'extension unavailable' });
  assert.equal(runtimeHealth().capabilities.vectorSearch, false);
  assert.equal(runtimeHealth().ready, true);
});

test('runtime monitor checks database and AI immediately', async () => {
  await startRuntimeHealthMonitor({
    database: async () => ({ latencyMs: 1 }),
    ai: async () => ({ status: 'ok' }),
    intervalMs: 60_000,
  });
  try {
    const health = runtimeHealth();
    assert.equal(health.ready, true);
    assert.equal(health.capabilities.ai, true);
  } finally { stopRuntimeHealthMonitor(); }
});
