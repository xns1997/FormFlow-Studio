import assert from 'node:assert/strict';
import test from 'node:test';
import { clearOfflineQueue, enqueueOffline, listOfflineQueue, replayOfflineQueue, updateOfflineQueue } from './offlineQueue';

test('offline queue persists a non-destructive request and can update its state', async () => {
  await clearOfflineQueue();
  const item = await enqueueOffline({
    id: 'offline-1',
    projectId: 'project-1',
    path: '/projects/project-1',
    method: 'PUT',
    headers: { 'x-idempotency-key': 'offline-1' },
    body: JSON.stringify({ name: 'draft' }),
  });
  assert.equal(item.state, 'pending');
  await updateOfflineQueue(item.id, { state: 'conflict', error: '项目已变化' });
  const [stored] = await listOfflineQueue('project-1');
  assert.equal(stored?.state, 'conflict');
  assert.equal(stored?.error, '项目已变化');
  await clearOfflineQueue();
});

test('offline queue pauses conflicts and removes successfully replayed requests', async () => {
  await clearOfflineQueue();
  await enqueueOffline({ id: 'offline-conflict', projectId: 'project-2', path: '/projects/project-2', method: 'PUT', headers: {}, body: '{}' });
  await enqueueOffline({ id: 'offline-success', projectId: 'project-2', path: '/projects/project-2', method: 'PUT', headers: {}, body: '{}' });
  await replayOfflineQueue(async (item) => item.id === 'offline-conflict' ? 'conflict' : 'completed');
  const remaining = await listOfflineQueue('project-2');
  assert.deepEqual(remaining.map((item) => [item.id, item.state]), [['offline-conflict', 'conflict']]);
  await clearOfflineQueue();
});
