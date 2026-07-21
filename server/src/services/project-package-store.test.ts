import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeProjectPackageCandidates } from './project-package-store';

function candidate(storageId: string, projectId: string, updatedAt: string) {
  return {
    storageId,
    project: {
      config: { id: projectId, name: `项目 ${projectId}`, updatedAt },
      srcTable: [{ id: 'table' }],
    },
  };
}

test('project scan deduplicates historical package directories by internal project id', () => {
  const result = dedupeProjectPackageCandidates([
    candidate('proj_demo_reworked_v2', 'proj_demo', '2026-07-16T12:00:00.000Z'),
    candidate('proj_demo', 'proj_demo', '2026-07-16T10:00:00.000Z'),
    candidate('proj_demo_reworked_v3', 'proj_demo', '2026-07-16T13:00:00.000Z'),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, 'proj_demo');
});

test('project scan keeps a non-canonical package addressable when no canonical directory exists', () => {
  const result = dedupeProjectPackageCandidates([
    candidate('imported_copy_v1', 'external_project', '2026-07-16T10:00:00.000Z'),
    candidate('imported_copy_v2', 'external_project', '2026-07-16T11:00:00.000Z'),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, 'imported_copy_v2');
});
