import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateToolPolicy, isReleaseApply, isWriteTool, stableIdempotencyKey, toolRisk } from './policy';

test('policy treats reads as allowed and deletions as confirmation required', () => {
  assert.equal(evaluateToolPolicy('project.get', '请修改项目').level, 'allowed');
  assert.equal(evaluateToolPolicy('form.create', '请创建表单').level, 'allowed');
  const destructive = evaluateToolPolicy('project.delete', '请删除旧项目', { id: 't', title: '清理旧数据', instruction: '删除', acceptance: [], scope: 'project', access: 'write', status: 'pending', attempt: 0, maxAttempts: 3, toolSteps: 0, evidence: [], createdAt: '', updatedAt: '' });
  assert.equal(destructive.level, 'confirmation_required');
  const forbidden = evaluateToolPolicy('project.delete', '不要删除任何内容，只能更新');
  assert.equal(forbidden.level, 'forbidden');
});

test('idempotency keys are stable across retries and change with args', () => {
  const first = stableIdempotencyKey('thread1', 'task1', 1, 'form.create', { projectId: 'p', id: 'f', name: 'x' });
  const retry = stableIdempotencyKey('thread1', 'task1', 1, 'form.create', { projectId: 'p', id: 'f', name: 'x' });
  const different = stableIdempotencyKey('thread1', 'task1', 1, 'form.create', { projectId: 'p', id: 'f', name: 'y' });
  assert.equal(first, retry);
  assert.notEqual(first, different);
});

test('release.apply is never callable and risk is classified from the registry', () => {
  assert.equal(isReleaseApply('release.apply'), true);
  assert.equal(isReleaseApply('release.preview'), false);
  assert.equal(isWriteTool('project.update'), true);
  assert.equal(isWriteTool('project.get'), false);
  assert.equal(toolRisk('project.delete'), 'destructive');
});
