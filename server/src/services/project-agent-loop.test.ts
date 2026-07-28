import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeOrchestrationRound, createOrchestrationRound, ensureOrchestrationState, materializeRoundTasks, orchestrationProgressFingerprint,
  parseRoundPlannerResult, PROJECT_AGENT_ROLES, roundDecisionExpandsRisk, validateRoundDecision,
} from './project-agent-loop';
import type { AgentPlanRevision, AgentSessionV2, AgentTaskNode } from './project-agent-v2-store';

const task = (id = 'seed'): AgentTaskNode => ({ id, role: 'form', title: '创建表单', instruction: '创建表单', access: 'write', dependsOn: [], acceptance: ['表单存在'], status: 'pending', attempt: 0, maxAttempts: 3, evidenceArtifactIds: [], requirementIds: ['req-1'], evidenceKinds: ['structural_validation'], verificationScenarioIds: ['表单存在'] });
const plan = (): AgentPlanRevision => ({ id: 'plan-1', revision: 1, request: '创建表单', goal: '创建表单', successCriteria: ['表单存在'], summary: '', assumptions: [], risks: [], tasks: [task()], status: 'confirmed', createdAt: '' });
const session = (): AgentSessionV2 => ({ schemaVersion: 2, id: 'session-1', tenantId: 't', userId: 'u', projectId: 'project-1', projectIds: ['project-1'], projectRevisions: { 'project-1': 'r1' }, title: '', profileId: 'p', capabilityBundleVersionId: 'b', phase: 'executing', plans: [], questions: [], requirements: [{ id: 'req-1', statement: '创建表单', domain: 'form', acceptanceScenarios: ['表单存在'], risk: 'normal', capabilityStatus: 'supported', taskIds: [], evidenceArtifactIds: [] }], requirementCoverage: { total: 1, planned: 1, supported: 1, verified: 0, failed: 0, capabilityGaps: 0, needsUserInput: 0, planComplete: true, complete: false }, messages: [], conversationSummary: '', artifacts: [], events: [], rounds: [], archived: false, createdAt: '', updatedAt: '' });

function decisions(runRole?: string) {
  return PROJECT_AGENT_ROLES.map((role) => role === runRole
    ? { role, decision: 'run', reason: '本轮需要实施', taskId: 'seed' }
    : { role, decision: 'skip', reason: '本轮没有该领域工作' });
}

test('round planner requires seven unique expert decisions', () => {
  assert.throws(() => parseRoundPlannerResult({ action: 'continue', summary: '', decisions: decisions('form').slice(0, 6) }), /七位专家/);
  assert.throws(() => parseRoundPlannerResult({ action: 'continue', summary: '', decisions: decisions() }), /至少需要调度/);
  const parsed = parseRoundPlannerResult({ action: 'continue', summary: '执行表单任务', decisions: decisions('form') });
  assert.equal(parsed.decisions.length, 7); assert.equal(parsed.decisions.find((item) => item.role === 'form')?.decision, 'run');
});

test('round tasks are validated, materialized and linked to their round', () => {
  const value = session(); const active = plan(); value.plans = [active]; value.activePlanId = active.id; value.turnId = 'turn-1';
  const result = validateRoundDecision(parseRoundPlannerResult({ action: 'continue', summary: '', decisions: decisions('form') }), value, active);
  const round = createOrchestrationRound(value, active); const selected = materializeRoundTasks(result, round, active, 3);
  assert.equal(round.turnId, 'turn-1'); assert.equal(selected[0].id, 'seed'); assert.equal(selected[0].roundId, round.id); assert.equal(round.taskIds[0], 'seed');
});

test('target-bound rounds may cancel unexecuted work but never passed work', () => {
  const value = session(); const active = plan(); const obsolete = task('obsolete'); active.tasks.push(obsolete); value.plans = [active];
  const raw = { action: 'continue', summary: '调整未执行任务', cancelTaskIds: ['obsolete'], decisions: decisions('form') };
  const result = validateRoundDecision(parseRoundPlannerResult(raw), value, active); const round = createOrchestrationRound(value, active); materializeRoundTasks(result, round, active, 3);
  assert.equal(obsolete.status, 'superseded'); assert.deepEqual(round.cancelledTaskIds, ['obsolete']);
  obsolete.status = 'passed'; assert.throws(() => validateRoundDecision(parseRoundPlannerResult(raw), value, active), /已通过任务不可取消/);
});

test('new destructive work outside the confirmed request expands risk', () => {
  const value = session(); const active = plan(); const raw = { action: 'continue', summary: '', decisions: PROJECT_AGENT_ROLES.map((role) => role === 'project' ? { role, decision: 'run', reason: '清理', task: { title: '删除项目', instruction: '删除整个项目', access: 'write', projectId: 'project-1', dependsOn: [], acceptance: ['项目不存在'], requirementIds: ['req-1'], evidenceKinds: ['tool_result'], verificationScenarioIds: ['项目不存在'] } } : { role, decision: 'skip', reason: '无任务' }) };
  const result = validateRoundDecision(parseRoundPlannerResult(raw), value, active); assert.equal(roundDecisionExpandsRisk(result, value, active), true);
});

test('two unchanged rounds trigger the no-progress threshold', () => {
  const value = session(); const active = plan(); value.plans = [active]; ensureOrchestrationState(value, 24);
  const first = createOrchestrationRound(value, active); const fingerprint = orchestrationProgressFingerprint(value, active); assert.equal(first.inputFingerprint, fingerprint);
  assert.equal(completeOrchestrationRound(value, active, first).stalled, false);
  const second = createOrchestrationRound(value, active); assert.equal(completeOrchestrationRound(value, active, second).stalled, true);
  assert.equal(value.orchestration?.consecutiveNoProgress, 2);
});
