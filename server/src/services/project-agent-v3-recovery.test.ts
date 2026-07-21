import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRecoveryPatch, classifyAgentFailure, ensureRecoveryState, normalizeRecoveryPatch, recoveryPatchExpandsRisk, resetRecoveryBudget, syncBlockedTasks } from './project-agent-v3-recovery';
import type { AgentPlanRevision, AgentSessionV2, AgentTaskNode } from './project-agent-v2-store';

const task = (id: string, status: AgentTaskNode['status'] = 'pending', dependsOn: string[] = [], access: AgentTaskNode['access'] = 'read'): AgentTaskNode => ({ id, role: 'project', title: id, instruction: id, access, dependsOn, acceptance: [], status, attempt: 0, maxAttempts: 3, evidenceArtifactIds: [], origin: 'planned', generation: 0 });
const plan = (tasks: AgentTaskNode[]): AgentPlanRevision => ({ id: 'p1', revision: 1, request: '修复项目', goal: '修复', successCriteria: [], summary: '', assumptions: [], risks: [], tasks, status: 'confirmed', createdAt: '' });

test('failure classifier separates retry, replanning and hard blockers', () => {
  assert.equal(classifyAgentFailure('PROJECT_REVISION_CONFLICT'), 'revision_conflict');
  assert.equal(classifyAgentFailure('Agent 未授权工具：project.quality.inspect'), 'tool_scope');
  assert.equal(classifyAgentFailure('项目 project-x 不在当前会话限定范围内'), 'tool_scope');
  assert.equal(classifyAgentFailure('连接 timeout'), 'transient');
  assert.equal(classifyAgentFailure('用户拒绝破坏性操作'), 'user_rejected');
  assert.equal(classifyAgentFailure('auto_repair_exhausted：PROJECT_VALIDATION_FAILED：可编辑 Sheet 必须配置主键'), 'validation');
});

test('behavior failures are classified for strategy replacement instead of generic specialist failure', () => {
  assert.equal(classifyAgentFailure('BEHAVIOR_SET_VALUE_EMPTY：禁止用空表达式占位'), 'invalid_arguments');
  assert.equal(classifyAgentFailure('RULE_SYNTAX_INVALID：规则语法或引用校验失败'), 'validation');
  assert.equal(classifyAgentFailure('操作 behavior.delete 与已确认计划中的用户约束冲突'), 'tool_scope');
});

test('dynamic replacement preserves passed evidence and rewires dependents', () => {
  const passed = task('passed', 'passed'); passed.evidenceArtifactIds = ['proof'];
  const failed = task('failed', 'failed', ['passed'], 'write');
  const after = task('after', 'pending', ['failed'], 'write'); const value = plan([passed, failed, after]);
  const result = applyRecoveryPatch(value, 'failed', { action: 'replace_pending', diagnosis: '角色错误', strategy: '交给表单专家', tasks: [{ id: 'fix', role: 'form', title: '修复表单', instruction: '修复', access: 'write', dependsOn: ['failed'], acceptance: ['通过校验'] }] }, 1, 3);
  assert.equal(failed.status, 'superseded'); assert.equal(result.created[0].origin, 'recovery'); assert.deepEqual(passed.evidenceArtifactIds, ['proof']);
  assert.ok(after.dependsOn.includes(result.created[0].id)); assert.ok(!after.dependsOn.includes('failed'));
  assert.deepEqual(result.created[0].dependsOn, ['passed']);
});

test('append patches that cancel the failed node become real replacements', () => {
  const patch = normalizeRecoveryPatch({ action: 'append_tasks', diagnosis: '旧节点不可执行', strategy: '换角色', cancelTaskIds: ['failed'], tasks: [{ role: 'form', title: '修复按钮', instruction: '配置按钮事件', access: 'write' }] }, 'failed');
  assert.equal(patch.action, 'replace_pending');
  const failed = task('failed', 'failed'); const dependent = task('dependent', 'blocked', ['failed']); const value = plan([failed, dependent]);
  const result = applyRecoveryPatch(value, failed.id, patch, 1, 3);
  assert.equal(failed.status, 'superseded'); assert.deepEqual(dependent.dependsOn, [result.created[0].id]);
});

test('blocked tasks automatically unblock after dependency recovery', () => {
  const failed = task('failed', 'failed'); const dependent = task('dependent', 'pending', ['failed']);
  assert.equal(syncBlockedTasks([failed, dependent])[0].to, 'blocked');
  failed.status = 'passed'; assert.equal(syncBlockedTasks([failed, dependent])[0].to, 'pending');
});

test('recovery budgets default compatibly and destructive expansion requires approval', () => {
  const session = { } as AgentSessionV2; assert.equal(ensureRecoveryState(session).maxCycles, 6); assert.equal(ensureRecoveryState(session).maxDynamicTasks, 24);
  session.recovery!.cycles = 6; session.recovery!.dynamicTasks = 21; session.recovery!.strategies = { repeated: 4 };
  assert.deepEqual(resetRecoveryBudget(session), { cycles: 0, maxCycles: 6, dynamicTasks: 0, maxDynamicTasks: 24, strategies: {} });
  assert.equal(recoveryPatchExpandsRisk(plan([task('a')]), { action: 'replace_pending', diagnosis: '', strategy: '', tasks: [{ role: 'project', title: '删除项目', instruction: '删除整个项目', access: 'write' }] }), true);
  assert.equal(recoveryPatchExpandsRisk(plan([task('a')]), { action: 'replace_pending', diagnosis: '', strategy: '', tasks: [{ role: 'form', title: '修复表单', instruction: '修改字段', access: 'write' }] }), true);
});
