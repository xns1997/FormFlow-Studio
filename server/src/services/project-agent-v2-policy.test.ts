import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateToolPolicy, operationAllowedByPlan, shouldAutoApproveOperation } from './project-agent-v2-policy';

test('operation approvals are automatic only in local mode', () => {
  assert.equal(shouldAutoApproveOperation('local'), true);
  assert.equal(shouldAutoApproveOperation('cloud'), false);
});

test('all deletions require approval and explicit deletion constraints stay forbidden', () => {
  const task = { title: '初始化项目', instruction: '创建请假项目', acceptance: ['项目存在'] };
  assert.equal(operationAllowedByPlan('project.delete', '不删除或覆盖任何现有项目', task), false);
  assert.equal(operationAllowedByPlan('form.delete', '创建项目', task), false);
  assert.equal(operationAllowedByPlan('form.delete', '清理旧表单', { ...task, title: '删除旧表单' }), false);
  assert.equal(evaluateToolPolicy('form.delete', '创建项目', task).level, 'confirmation_required');
  assert.equal(evaluateToolPolicy('form.delete', '不删除任何表单', task).level, 'forbidden');
  assert.equal(operationAllowedByPlan('form.update', '不删除项目', task), true);
});
