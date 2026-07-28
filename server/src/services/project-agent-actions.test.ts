import assert from 'node:assert/strict';
import test from 'node:test';
import { completionBlockers, createActionStep, decisionExpandsRisk, goalContractReady, materializeAssignments, nextActionSchema, parseNextActionDecision, prepareAssignments, reconcileInterruptedActions, resumeActionWithUserInput, validateNextActionDecision } from './project-agent-actions';
import type { AgentPlanRevision, AgentSessionV2 } from './project-agent-v2-store';

const plan = (): AgentPlanRevision => ({ id: 'plan', revision: 1, request: '创建员工表单', goal: '创建员工表单', successCriteria: ['可以录入'], summary: '只创建表单', assumptions: [], risks: [], tasks: [], status: 'confirmed', createdAt: '' });
const session = (): AgentSessionV2 => ({ schemaVersion: 2, id: 'session', tenantId: 't', userId: 'u', projectId: 'project', projectIds: ['project'], title: '', profileId: 'p', capabilityBundleVersionId: 'b', phase: 'executing', plans: [], questions: [], requirements: [{ id: 'req', statement: '创建表单', domain: 'form', acceptanceScenarios: ['可录入'], risk: 'normal', capabilityStatus: 'supported', taskIds: [], evidenceArtifactIds: [] }], requirementCoverage: { total: 1, planned: 0, supported: 1, verified: 0, failed: 0, capabilityGaps: 0, needsUserInput: 0, planComplete: true, complete: false }, messages: [], conversationSummary: '', artifacts: [], events: [], steps: [], observations: [], archived: false, createdAt: '', updatedAt: '' });
const assignment = (access: 'read' | 'write' = 'read') => ({ role: 'form', title: '检查表单', instruction: '读取现有表单', access, projectId: 'project', acceptance: ['返回表单现状'], requirements: ['创建表单'], evidenceKinds: ['structural_validation'], verificationScenarioIds: [] });

test('next action accepts safe read concurrency without seven expert skip decisions', () => {
  const parsed = parseNextActionDecision({ action: 'assign', summary: '并行检查', assignments: [assignment(), { ...assignment(), role: 'quality', title: '检查质量' }] }, 4);
  assert.equal(parsed.assignments.length, 2); assert.equal(parsed.assignments.some((item) => (item as any).decision === 'skip'), false);
  assert.equal(validateNextActionDecision(parsed, session()), parsed);
});

test('a write action must be the only assignment', () => {
  assert.throws(() => parseNextActionDecision({ action: 'assign', summary: '混合执行', assignments: [assignment('write'), assignment()] }, 4), /写任务必须独占/);
});

test('assignments are materialized only after goal confirmation', () => {
  const value = session(); const active = plan(); value.plans = [active]; value.activePlanId = active.id;
  const step = createActionStep(value, active); const decision = validateNextActionDecision(parseNextActionDecision({ action: 'assign', summary: '检查现状', assignments: [assignment()] }), value);
  const tasks = materializeAssignments(decision, step, active, 3);
  assert.equal(tasks.length, 1); assert.equal(tasks[0].origin, 'action'); assert.deepEqual(tasks[0].requirementIds, ['req']); assert.equal(active.tasks.length, 1); assert.equal(step.taskIds.length, 1);
});

test('goal confirmation validates the target contract instead of a task graph', () => {
  const value = session(); const active = plan();
  assert.equal(active.tasks.length, 0); assert.equal(goalContractReady(value, active), true);
  value.requirements![0].capabilityStatus = 'needs_user_input'; assert.equal(goalContractReady(value, active), false);
});

test('next action schema asks for requirement statements and hides internal references', () => {
  const schema = JSON.stringify(nextActionSchema(4, ['创建表单']));
  assert.match(schema, /requirements/); assert.doesNotMatch(schema, /requirementIds|taskId|roundId/);
  assert.match(schema, /"enum":\["创建表单"\]/);
});

test('requirement mapping tolerates punctuation differences but reports canonical candidates', () => {
  const value = session();
  const normalized = parseNextActionDecision({ action: 'assign', summary: '检查', assignments: [{ ...assignment(), requirements: ['创建表单。'] }] });
  assert.deepEqual(validateNextActionDecision(normalized, value).assignments[0].requirementIds, ['req']);
  const invalid = parseNextActionDecision({ action: 'assign', summary: '检查', assignments: [{ ...assignment(), requirements: ['创建报表'] }] });
  assert.throws(() => validateNextActionDecision(invalid, value), /可选需求为/);
});

test('creating a project within the confirmed request does not expand scope', () => {
  const value = session(); value.projectId = undefined; value.projectIds = [];
  const decision = validateNextActionDecision(parseNextActionDecision({ action: 'assign', summary: '创建项目', assignments: [{ ...assignment('write'), role: 'project', title: '创建员工项目', instruction: '初始化项目', projectId: 'new-project' }] }), value);
  assert.equal(decisionExpandsRisk(decision, value, plan()), false);
});

test('deletion uses operation approval instead of reopening the whole goal contract', () => {
  const value = session();
  const decision = validateNextActionDecision(parseNextActionDecision({ action: 'assign', summary: '修复表单', assignments: [{ ...assignment('write'), title: '删除重复控件', instruction: '删除重复控件后重新验证' }] }), value);
  assert.equal(decisionExpandsRisk(decision, value, plan()), false);
});

test('an answer requested during execution returns to the same decision loop', () => {
  const value = session(); const active = plan(); value.plans = [active]; value.activePlanId = active.id; value.phase = 'clarifying'; value.questions = [{ id: 'q', header: '字段', question: '请选择字段', kind: 'text' }];
  const step = createActionStep(value, active); step.status = 'waiting'; value.orchestration!.consecutiveNoProgress = 2;
  const observation = resumeActionWithUserInput(value, '优先使用员工编号');
  assert.equal(observation?.summary, '优先使用员工编号'); assert.equal(step.status, 'completed'); assert.equal(value.questions.length, 0); assert.equal(value.orchestration!.consecutiveNoProgress, 0);
});

test('completion requires evidence and post-write quality plus delivery gates', () => {
  const value = session(); const active = plan(); value.requirementCoverage!.complete = true;
  active.tasks.push({ id: 'write', role: 'form', title: '写表单', instruction: '', access: 'write', dependsOn: [], acceptance: [], status: 'passed', attempt: 1, maxAttempts: 3, evidenceArtifactIds: [], requirementIds: ['req'] });
  assert.deepEqual(completionBlockers(value, active), ['尚未通过质量检查', '尚未通过交付预检']);
});

test('a blocked expert requires a different helper and links the assistance task', () => {
  const value = session(); const active = plan(); value.plans = [active]; value.activePlanId = active.id;
  active.tasks.push({ id: 'blocked-form', role: 'form', title: '创建员工表单', instruction: '', access: 'write', dependsOn: [], acceptance: [], status: 'blocked', attempt: 1, maxAttempts: 3, evidenceArtifactIds: [], requirementIds: ['req'], assistance: { status: 'needed', reason: '缺少字段', depth: 1, triedRoles: ['form'] } });
  const helper = { ...assignment('write'), role: 'data', title: '补齐员工数据字段', instruction: '创建表单所需字段', assistsExpert: 'form', assistsAction: '创建员工表单' };
  const decision = validateNextActionDecision(parseNextActionDecision({ action: 'assign', summary: '请数据专家解决阻断', assignments: [helper] }), value);
  const step = createActionStep(value, active); const tasks = materializeAssignments(decision, step, active, 3);
  assert.equal(tasks[0].assistsTaskId, 'blocked-form'); assert.equal(active.tasks[0].assistance?.status, 'assigned'); assert.equal(active.tasks[0].assistance?.helperRole, 'data');
});

test('the coordinator cannot ignore a pending assistance request or assign the same expert', () => {
  const value = session(); const active = plan(); value.plans = [active]; value.activePlanId = active.id;
  active.tasks.push({ id: 'blocked-form', role: 'form', title: '创建员工表单', instruction: '', access: 'write', dependsOn: [], acceptance: [], status: 'blocked', attempt: 1, maxAttempts: 3, evidenceArtifactIds: [], requirementIds: ['req'], assistance: { status: 'needed', reason: '缺少字段', depth: 1, triedRoles: ['form'] } });
  assert.throws(() => validateNextActionDecision(parseNextActionDecision({ action: 'assign', summary: '做其他事', assignments: [assignment()] }), value), /应先/);
  const same = { ...assignment('write'), assistsExpert: 'form', assistsAction: '创建员工表单' };
  assert.throws(() => validateNextActionDecision(parseNextActionDecision({ action: 'assign', summary: '原专家继续', assignments: [same] }), value), /其他专家/);
});

test('unresolved writes block unrelated actions but allow targeted diagnosis', () => {
  const value = session(); const active = plan(); value.plans = [active]; value.activePlanId = active.id;
  active.tasks.push({ id: 'failed-form', role: 'form', title: '创建员工表单', instruction: '', access: 'write', dependsOn: [], acceptance: [], status: 'failed', attempt: 1, maxAttempts: 3, evidenceArtifactIds: [], requirementIds: ['req'] });
  const unrelatedSession = { ...value, requirements: [...value.requirements!, { ...value.requirements![0], id: 'other', statement: '创建报表' }] };
  const unrelated = parseNextActionDecision({ action: 'assign', summary: '做其他事', assignments: [{ ...assignment('write'), requirements: ['创建报表'] }] });
  assert.throws(() => validateNextActionDecision(unrelated, unrelatedSession), /必须先调查/);
  const diagnosis = parseNextActionDecision({ action: 'assign', summary: '调查失败', assignments: [assignment('read')] });
  assert.equal(validateNextActionDecision(diagnosis, value), diagnosis);
});

test('assignment preparation is atomic when validation fails', () => {
  const value = session(); const active = plan(); value.plans = [active]; value.activePlanId = active.id; const step = createActionStep(value, active);
  const decision = validateNextActionDecision(parseNextActionDecision({ action: 'assign', summary: '检查', assignments: [assignment()] }), value);
  assert.throws(() => prepareAssignments(decision, step, active, 3, () => { throw new Error('invalid'); }), /invalid/);
  assert.equal(active.tasks.length, 0); assert.equal(step.taskIds.length, 0);
});

test('retry reconciliation supersedes orphan actions and converts legacy delete failures to correction', () => {
  const value = session(); const active = plan(); value.plans = [active]; value.activePlanId = active.id;
  value.steps = [{ id: 'failed-step', index: 1, status: 'failed', inputFingerprint: 'x', taskIds: ['orphan'], observationIds: [], startedAt: '' }];
  active.tasks.push(
    { id: 'legacy', role: 'form', title: '修复表单', instruction: '', access: 'write', dependsOn: [], acceptance: [], status: 'failed', attempt: 1, maxAttempts: 3, evidenceArtifactIds: [], requirementIds: ['req'], error: '操作 form_component.delete 与已确认计划中的用户约束冲突' },
    { id: 'orphan', role: 'form', title: '趋势分析', instruction: '', access: 'write', dependsOn: [], acceptance: [], status: 'pending', attempt: 0, maxAttempts: 3, evidenceArtifactIds: [], requirementIds: ['req'], stepId: 'failed-step' },
  );
  const result = reconcileInterruptedActions(value, active);
  assert.equal(result.corrected[0].status, 'blocked'); assert.match(result.corrected[0].resumeContext || '', /删除操作必须/);
  assert.equal(result.superseded[0].status, 'superseded');
});
