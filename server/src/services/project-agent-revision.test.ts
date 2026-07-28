import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRuntimeRevision, approvalRevisionChanged, MAX_REVISION_RECOMPUTES, nextRevisionConflictCount, projectChangedToolObservation, requiresProjectStateRead, revisionReadRequiredObservation } from './project-agent-revision';

test('runtime revision replaces stale model arguments and preserves business arguments', () => {
  const result = applyRuntimeRevision({ projectId: 'demo', id: 'form-a', baseRevision: 'stale', patch: { name: '新名称' } }, 'current');
  assert.equal(result.replaced, true);
  assert.equal(result.previousRevision, 'stale');
  assert.deepEqual(result.arguments, { projectId: 'demo', id: 'form-a', baseRevision: 'current', patch: { name: '新名称' } });
});

test('runtime revision also fills a missing model revision', () => {
  const result = applyRuntimeRevision({ projectId: 'demo' }, 'current');
  assert.equal(result.replaced, true);
  assert.equal(result.arguments.baseRevision, 'current');
});

test('revision recovery allows two recomputes and blocks the third conflict', () => {
  let count = 0;
  for (let index = 0; index < MAX_REVISION_RECOMPUTES; index += 1) {
    const result = nextRevisionConflictCount(count); count = result.count; assert.equal(result.blocked, false);
  }
  assert.deepEqual(nextRevisionConflictCount(count), { count: 3, blocked: true });
});

test('specialist recovery observations omit revisions and internal identifiers', () => {
  const copy = JSON.stringify([projectChangedToolObservation(), revisionReadRequiredObservation()]);
  assert.doesNotMatch(copy, /baseRevision|currentRevision|requestId|toolCallId/);
  assert.match(copy, /先重新读取目标资源/);
});

test('project changes invalidate approvals, including approvals restored from old sessions', () => {
  assert.equal(approvalRevisionChanged('demo', 'old', 'current'), true);
  assert.equal(approvalRevisionChanged('demo', undefined, 'current'), true);
  assert.equal(approvalRevisionChanged('demo', 'current', 'current'), false);
  assert.equal(approvalRevisionChanged(undefined, undefined, undefined), false);
});

test('a write is gated until the changed project has been read', () => {
  assert.equal(requiresProjectStateRead('demo', 'demo', 'write'), true);
  assert.equal(requiresProjectStateRead('demo', 'demo', 'destructive'), true);
  assert.equal(requiresProjectStateRead('demo', 'demo', 'read'), false);
  assert.equal(requiresProjectStateRead('demo', 'other', 'write'), false);
});
