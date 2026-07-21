import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

if (process.env.TEST_POSTGRES_URL) process.env.FORMFLOW_DATABASE_URL = process.env.TEST_POSTGRES_URL;
const { enqueueTask, getTask, initTaskQueue, shutdownTaskQueue } = await import('./task-queue');

test('PostgreSQL queue claims and persists a DAG task', { skip: !process.env.TEST_POSTGRES_URL }, async () => {
  await initTaskQueue();
  try {
    const task = await enqueueTask('postgres test', {
      steps: [{ id: 'value', action: { type: 'value', value: 42 } }],
    });
    let stored = await getTask(task.id);
    for (let attempt = 0; attempt < 40 && stored?.state !== 'completed'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      stored = await getTask(task.id);
    }
    assert.equal(stored?.state, 'completed');
    assert.deepEqual(stored?.result, { value: 42 });

    const database = new Pool({ connectionString: process.env.TEST_POSTGRES_URL });
    const expiredId = `task_expired_${randomUUID()}`;
    try {
      await database.query(
        `INSERT INTO formflow_tasks
          (id, name, state, progress, payload, logs, created_at, started_at, locked_by, lease_expires_at)
         VALUES ($1, 'expired lease', 'running', 0, $2::jsonb, '[]'::jsonb, NOW(), NOW(), 'dead-worker', NOW() - INTERVAL '1 minute')`,
        [expiredId, JSON.stringify({ steps: [{ id: 'recovered', action: { type: 'value', value: 7 } }] })],
      );
      let recovered = await getTask(expiredId);
      for (let attempt = 0; attempt < 40 && recovered?.state !== 'completed'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        recovered = await getTask(expiredId);
      }
      assert.equal(recovered?.state, 'completed');
      assert.deepEqual(recovered?.result, { recovered: 7 });
    } finally {
      await database.end();
    }
  } finally {
    await shutdownTaskQueue();
  }
});
