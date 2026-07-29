import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateDocsEvent, readDocsState, saveDocsState } from './docs-store';

test('documentation analytics rejects raw query and project context', () => {
  assert.throws(() => aggregateDocsEvent({ type: 'search', query: '客户姓名' } as any), /不得包含/);
  assert.throws(() => aggregateDocsEvent({ type: 'open', projectId: 'secret-project' } as any), /不得包含/);
});

test('documentation analytics accepts bounded aggregate-only events', () => {
  assert.doesNotThrow(() => aggregateDocsEvent({ type: 'search', resultCount: 4, latencyMs: 12, outcome: 'clicked' }));
  assert.doesNotThrow(() => aggregateDocsEvent({ type: 'feedback', docId: 'task:import-model', category: 'helpful' }));
});

test('documentation state isolates tenant/user scopes and merges stale writes', () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const first = saveDocsState(`tenant-a-${suffix}`, 'user-a', {
    version: 0, favorites: ['doc-a'], recent: ['doc-a'], taskProgress: {}, updatedAt: new Date().toISOString(),
  });
  assert.equal(first.version, 1);
  const stale = saveDocsState(`tenant-a-${suffix}`, 'user-a', {
    version: 0, favorites: ['doc-b'], recent: ['doc-b'], taskProgress: { 'task-a': true }, updatedAt: new Date(0).toISOString(),
  });
  assert.equal(stale.version, 2);
  assert.deepEqual(new Set(stale.favorites), new Set(['doc-a', 'doc-b']));
  assert.equal(readDocsState(`tenant-b-${suffix}`, 'user-a').favorites.length, 0);
  assert.equal(readDocsState(`tenant-a-${suffix}`, 'user-b').favorites.length, 0);
});
