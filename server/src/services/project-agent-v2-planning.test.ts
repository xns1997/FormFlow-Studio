import assert from 'node:assert/strict';
import test from 'node:test';
import { isStructuredPlanningError, PLANNING_MAX_ATTEMPTS, planningRepairInstruction, validatePlannerTaskRoleBoundaries } from './project-agent-v2-planning';

test('planning retries only malformed or schema-invalid structured responses', () => {
  assert.equal(PLANNING_MAX_ATTEMPTS, 2);
  assert.equal(isStructuredPlanningError(new Error('模型未返回合法的结构化 JSON')), true);
  assert.equal(isStructuredPlanningError(new Error('结构化输出不符合 Schema：action is required')), true);
  assert.equal(isStructuredPlanningError(new Error('规划模型未返回有效的 ask 或 plan 结果')), true);
  assert.equal(isStructuredPlanningError(new Error('规划任务角色边界无效：质量检查必须拆分')), true);
  assert.equal(isStructuredPlanningError(new Error('规划任务 t1 使用了未限定项目 project-x')), true);
  assert.equal(isStructuredPlanningError(new Error('模型服务认证失败')), false);
});

test('planning repair instruction requires a single plain JSON object', () => {
  const instruction = planningRepairInstruction();
  assert.match(instruction, /只输出一个 JSON 对象/);
  assert.match(instruction, /不要输出 Markdown/);
  assert.match(instruction, /尾随逗号/);
  assert.match(instruction, /不得把质量检查与发布预检合并/);
});

test('planning role boundary rejects combined quality and delivery work', () => {
  assert.throws(() => validatePlannerTaskRoleBoundaries([{ id: 'delivery', role: 'delivery', title: '质量检查和发布预检', instruction: '调用 project.quality.inspect 和 release.preview', acceptance: [] }]), /质量检查必须由 quality/);
  assert.deepEqual(validatePlannerTaskRoleBoundaries([
    { id: 'form', role: 'form', title: '创建请假表单', instruction: '实现字段和按钮', acceptance: ['通过质量验收'] },
    { id: 'quality', role: 'quality', title: '质量门禁', instruction: '执行质量检查', acceptance: [] },
    { id: 'delivery', role: 'delivery', title: '发布预检', instruction: '调用 release.preview', acceptance: [] },
  ]), { valid: true });
  assert.throws(() => validatePlannerTaskRoleBoundaries([{ id: 'wrong-quality-fix', role: 'quality', access: 'write', title: '修复按钮配置', instruction: '修改 forms.query.submit 的 props.events', acceptance: [] }]), /表单资源修复必须由 form/);
});
