import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePlanTasks } from './planner';

test('planner validation accepts a valid ordered write task list', () => {
  assert.deepEqual(validatePlanTasks([
    { id: 'p1', title: '创建项目', instruction: '创建项目', scope: 'project', access: 'write', acceptance: ['项目存在'] },
    { id: 'd1', title: '导入数据', instruction: '导入数据', scope: 'data', access: 'write', acceptance: ['数据存在'] },
  ]), { valid: true });
});

test('planner validation rejects duplicate ids and invalid scopes', () => {
  assert.throws(() => validatePlanTasks([
    { id: 'same', title: 'a', instruction: 'a', scope: 'project', access: 'write', acceptance: ['x'] },
    { id: 'same', title: 'b', instruction: 'b', scope: 'data', access: 'read', acceptance: ['x'] },
  ]), /任务 ID 必须唯一/);
  assert.throws(() => validatePlanTasks([
    { id: 'x', title: 'x', instruction: 'x', scope: 'coordinator', access: 'read', acceptance: ['x'] },
  ]), /作用域无效/);
});

test('planner validation requires acceptance and limits instruction length', () => {
  assert.throws(() => validatePlanTasks([
    { id: 'x', title: 'x', instruction: 'x', scope: 'project', access: 'read', acceptance: [] },
  ]), /必须包含验收标准/);
  assert.throws(() => validatePlanTasks([
    { id: 'x', title: 'x', instruction: 'x'.repeat(801), scope: 'project', access: 'read', acceptance: ['ok'] },
  ]), /超过 800 字符/);
});
