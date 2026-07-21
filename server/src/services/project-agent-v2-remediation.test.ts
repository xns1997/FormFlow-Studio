import assert from 'node:assert/strict';
import test from 'node:test';
import { insertQualityRemediationTasks, qualityDiagnosticFingerprint, replaceInvalidRemediationTask, shouldRunQualityGate, supersedeInvalidCrossRoleRepairs } from './project-agent-v2-remediation';
import { validatePlannerTaskRoleBoundaries } from './project-agent-v2-planning';
import type { AgentPlanRevision, AgentTaskNode } from './project-agent-v2-store';

const task = (id: string, role: AgentTaskNode['role'], title: string, dependsOn: string[] = []): AgentTaskNode => ({ id, role, title, instruction: title, access: 'write', dependsOn, acceptance: [], status: 'pending', attempt: 0, maxAttempts: 3, evidenceArtifactIds: [] });

test('only final quality tasks run the project quality gate', () => {
  assert.equal(shouldRunQualityGate(task('mock', 'quality', '生成Mock数据')), false);
  assert.equal(shouldRunQualityGate(task('suite', 'quality', '创建回归测试套件')), false);
  assert.equal(shouldRunQualityGate(task('gate', 'quality', '执行项目校验和回归测试')), true);
});

test('quality diagnostics insert role-owned repair tasks before the gate', () => {
  const before = task('before', 'quality', '创建回归测试套件'); before.status = 'passed';
  const gate = task('gate', 'quality', '执行项目校验', ['before']); gate.attempt = 2;
  const delivery = task('delivery', 'delivery', '交付预检', ['gate']);
  const plan = { id: 'p', revision: 1, request: '', goal: '', successCriteria: [], summary: '', assumptions: [], risks: [], tasks: [before, gate, delivery], status: 'confirmed', createdAt: '' } as AgentPlanRevision;
  const repairs = insertQualityRemediationTasks(plan, gate, [{ severity: 'error', code: 'BUTTON_WITHOUT_ACTION', path: 'forms.a.submit', message: '按钮没有事件' }], 3, 1);
  assert.equal(repairs.length, 1); assert.equal(repairs[0].role, 'form');
  assert.deepEqual(repairs[0].dependsOn, ['before']); assert.ok(gate.dependsOn.includes(repairs[0].id));
  assert.equal(gate.attempt, 0);
  assert.deepEqual(repairs[0].remediation?.diagnosticFingerprints, ['BUTTON_WITHOUT_ACTION:forms.a.submit']);
  assert.match(repairs[0].instruction, /props\.events/); assert.match(repairs[0].instruction, /不得写入.*props\.onClick/);
  assert.doesNotThrow(() => validatePlannerTaskRoleBoundaries(repairs));
  assert.deepEqual(plan.tasks.map((item) => item.id), ['before', repairs[0].id, 'gate', 'delivery']);
});

test('legacy remediation tasks with mixed quality duties are deterministically replaced', () => {
  const gate = task('gate', 'quality', '执行项目校验');
  const failed = task('legacy-repair', 'form', '自动修正质量问题'); failed.status = 'failed'; failed.error = '质量检查必须由 quality 专家执行';
  failed.remediation = { gateTaskId: gate.id, diagnostics: [{ severity: 'error', code: 'BUTTON_WITHOUT_ACTION', path: 'forms.query.submit', message: '按钮没有事件' }], diagnosticFingerprints: ['BUTTON_WITHOUT_ACTION:forms.query.submit'] };
  gate.dependsOn = [failed.id];
  const plan = { id: 'p', revision: 1, request: '', goal: '', successCriteria: [], summary: '', assumptions: [], risks: [], tasks: [failed, gate], status: 'confirmed', createdAt: '' } as AgentPlanRevision;
  const replacement = replaceInvalidRemediationTask(plan, failed.id, 3, 2)!;
  assert.equal(failed.status, 'superseded'); assert.equal(replacement.role, 'form'); assert.equal(replacement.status, 'pending'); assert.equal(replacement.attempt, 0);
  assert.equal(replacement.supersedesTaskId, failed.id); assert.deepEqual(gate.dependsOn, [replacement.id]);
  assert.doesNotThrow(() => validatePlannerTaskRoleBoundaries([replacement]));
});

test('legacy quality tasks that try to edit form resources are superseded and rewired', () => {
  const replacement = task('correct-form-repair', 'form', '修正诊断项');
  const wrong = task('wrong-quality-repair', 'quality', '修复按钮配置'); wrong.origin = 'recovery';
  const gate = task('gate', 'quality', '执行质量检查', [wrong.id]);
  const plan = { id: 'p', revision: 1, request: '', goal: '', successCriteria: [], summary: '', assumptions: [], risks: [], tasks: [replacement, wrong, gate], status: 'confirmed', createdAt: '' } as AgentPlanRevision;
  assert.deepEqual(supersedeInvalidCrossRoleRepairs(plan, replacement.id), [wrong.id]);
  assert.equal(wrong.status, 'superseded'); assert.deepEqual(gate.dependsOn, [replacement.id]);
});

test('quality diagnostic fingerprints are stable across message changes', () => {
  assert.equal(qualityDiagnosticFingerprint({ code: 'BUTTON_WITHOUT_ACTION', path: 'forms.a.submit', message: 'old' }), qualityDiagnosticFingerprint({ code: 'BUTTON_WITHOUT_ACTION', path: 'forms.a.submit', message: 'new' }));
});
