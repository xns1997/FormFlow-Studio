import { createHash } from 'node:crypto';
import type { McpRole } from './formflow-tool-registry';
import type { AgentAssignment, AgentObservation, AgentOrchestrationStep, AgentPlanRevision, AgentSessionV2, AgentTaskNode, NextActionDecision } from './project-agent-v2-store';

export const PROJECT_AGENT_ROLES: McpRole[] = ['project', 'data', 'form', 'workflow', 'behavior', 'quality', 'delivery'];
export const DEFAULT_MAX_DECISION_STEPS = 24;
export const MAX_NO_PROGRESS_STEPS = 2;

export function nextActionSchema(maxParallelReads = 4, requirementStatements: string[] = []) {
  const assignment = { type: 'object', required: ['role', 'title', 'instruction', 'access', 'acceptance', 'requirements', 'evidenceKinds', 'verificationScenarioIds'], properties: {
    role: { enum: PROJECT_AGENT_ROLES }, title: { type: 'string' }, instruction: { type: 'string' }, access: { enum: ['read', 'write'] }, projectId: { type: 'string' },
    acceptance: { type: 'array', minItems: 1, items: { type: 'string' } }, requirements: { type: 'array', minItems: 1, items: requirementStatements.length ? { type: 'string', enum: requirementStatements } : { type: 'string' } },
    assistsExpert: { enum: PROJECT_AGENT_ROLES }, assistsAction: { type: 'string' },
    evidenceKinds: { type: 'array', minItems: 1, items: { enum: ['tool_result', 'structural_validation', 'semantic_validation', 'scenario_result', 'requirement_coverage', 'delivery_preview'] } },
    verificationScenarioIds: { type: 'array', items: { type: 'string' } },
  } };
  return { type: 'object', required: ['action', 'summary', 'assignments'], properties: {
    action: { enum: ['assign', 'complete', 'ask_user', 'abort'] }, summary: { type: 'string' }, reason: { type: 'string' }, finalAnswer: { type: 'string' },
    assignments: { type: 'array', maxItems: maxParallelReads, items: assignment },
    questions: { type: 'array', maxItems: 3, items: { type: 'object', required: ['header', 'question', 'kind'], properties: { header: { type: 'string' }, question: { type: 'string' }, kind: { enum: ['choice', 'text'] }, options: { type: 'array', maxItems: 4, items: { type: 'object', required: ['label'], properties: { label: { type: 'string' }, description: { type: 'string' } } } } } } },
  } };
}

const strings = (value: unknown) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];

export function parseNextActionDecision(value: any, maxParallelReads = 4): NextActionDecision {
  if (!value || !['assign', 'complete', 'ask_user', 'abort'].includes(value.action)) throw new Error('下一步决策未返回合法 action');
  const rawAssignments = Array.isArray(value.assignments) ? value.assignments : [];
  if (value.action === 'assign' && !rawAssignments.length) throw new Error('assign 必须包含当前可执行任务');
  if (value.action !== 'assign' && rawAssignments.length) throw new Error(`${value.action} 不得同时分配任务`);
  if (rawAssignments.length > maxParallelReads) throw new Error(`只读并发任务不能超过 ${maxParallelReads} 个`);
  const assignments: AgentAssignment[] = rawAssignments.map((item: any) => {
    if (!PROJECT_AGENT_ROLES.includes(item?.role) || !item.title || !item.instruction || !['read', 'write'].includes(item.access)) throw new Error('下一步任务字段不完整');
    const assignment = { role: item.role, title: String(item.title), instruction: String(item.instruction), access: item.access, projectId: item.projectId ? String(item.projectId) : undefined,
      acceptance: strings(item.acceptance), requirementIds: strings(item.requirements || item.requirementIds), evidenceKinds: strings(item.evidenceKinds) as AgentAssignment['evidenceKinds'], verificationScenarioIds: strings(item.verificationScenarioIds),
      assistsRole: item.assistsExpert && PROJECT_AGENT_ROLES.includes(item.assistsExpert) ? item.assistsExpert : undefined, assistsAction: item.assistsAction ? String(item.assistsAction) : undefined };
    if (Boolean(assignment.assistsRole) !== Boolean(assignment.assistsAction)) throw new Error(`协助任务“${assignment.title}”必须同时声明 assistsExpert 和 assistsAction`);
    if (!assignment.acceptance.length || !assignment.requirementIds.length || !assignment.evidenceKinds.length) throw new Error(`任务“${assignment.title}”缺少需求映射或验收证据`);
    return assignment;
  });
  const writes = assignments.filter((item) => item.access === 'write');
  if (writes.length && assignments.length !== 1) throw new Error('写任务必须独占当前决策步');
  if (value.action === 'ask_user' && (!Array.isArray(value.questions) || !value.questions.length)) throw new Error('ask_user 必须提供问题');
  if (value.action === 'complete' && !String(value.finalAnswer || '').trim()) throw new Error('complete 必须提供最终答复');
  return { action: value.action, summary: String(value.summary || ''), assignments, questions: value.questions, finalAnswer: value.finalAnswer ? String(value.finalAnswer) : undefined, reason: value.reason ? String(value.reason) : undefined };
}

export function validateNextActionDecision(decision: NextActionDecision, session: AgentSessionV2) {
  const normalizeReference = (value: string) => value.normalize('NFKC').replace(/[\s，。；：、,.!！?？;:"“”'‘’（）()【】\[\]]+/g, '').toLowerCase();
  const requirements = session.requirements || [];
  const requirementByReference = new Map(requirements.flatMap((item) => [[item.id, item], [item.statement, item], [normalizeReference(item.statement), item]] as const));
  const projects = new Set([...(session.projectIds || []), ...(session.projectId ? [session.projectId] : [])]);
  for (const assignment of decision.assignments) {
    const mapped = assignment.requirementIds.map((reference) => requirementByReference.get(reference) || requirementByReference.get(normalizeReference(reference))); if (mapped.some((item) => !item)) throw new Error(`任务“${assignment.title}”必须映射现有需求；可选需求为：${requirements.map((item) => `“${item.statement}”`).join('、')}`); assignment.requirementIds = mapped.map((item) => item!.id);
    const createsProject = assignment.role === 'project' && /创建|初始化|导入|create|initialize|import/i.test(`${assignment.title}\n${assignment.instruction}`);
    if (assignment.projectId && !projects.has(assignment.projectId) && !createsProject) throw new Error(`任务“${assignment.title}”使用了未限定项目`);
    if (!assignment.projectId && projects.size > 1 && !createsProject) throw new Error(`任务“${assignment.title}”必须明确项目范围`);
  }
  const plan = session.plans.find((item) => item.id === session.activePlanId) || session.plans.at(-1);
  const waiting = plan?.tasks.filter((task) => task.status === 'blocked' && task.assistance?.status === 'needed') || [];
  for (const assignment of decision.assignments.filter((item) => item.assistsRole)) {
    const target = waiting.find((task) => task.role === assignment.assistsRole && task.title === assignment.assistsAction && task.requirementIds?.some((id) => assignment.requirementIds.includes(id)));
    if (!target) throw new Error(`协助任务“${assignment.title}”没有匹配待解决的专家阻断`);
    if (assignment.role === target.role || target.assistance?.triedRoles.includes(assignment.role)) throw new Error(`协助任务“${assignment.title}”必须由尚未尝试的其他专家执行`);
  }
  if (decision.action === 'assign' && waiting.length) {
    const target = waiting[0]; const covers = decision.assignments.some((assignment) => assignment.assistsRole === target.role && assignment.assistsAction === target.title && assignment.requirementIds.some((id) => target.requirementIds?.includes(id)));
    if (!covers) throw new Error(`当前应先为“${target.title}”分配其他专家解决阻断`);
  }
  const unresolved = plan?.tasks.find((task) => ['failed', 'blocked'].includes(task.status) && task.assistance?.status !== 'resolved');
  if (decision.action === 'assign' && unresolved && !waiting.length) {
    const targetsFailure = decision.assignments.every((assignment) => assignment.requirementIds.some((id) => unresolved.requirementIds?.includes(id))
      && (assignment.access === 'read' || assignment.role === unresolved.role || assignment.assistsRole === unresolved.role));
    if (!targetsFailure) throw new Error(`必须先调查、修复或替代未解决的工作“${unresolved.title}”，不能开始无关写入`);
  }
  return decision;
}

export function decisionExpandsRisk(decision: NextActionDecision, session: AgentSessionV2, plan: AgentPlanRevision) {
  const request = plan.request.toLowerCase(); const scoped = new Set([...(session.projectIds || []), ...(session.projectId ? [session.projectId] : [])]);
  return decision.assignments.some((assignment) => {
    const text = `${assignment.title}\n${assignment.instruction}`.toLowerCase();
    const createsProject = assignment.role === 'project' && /创建|初始化|导入|create|initialize|import/i.test(text);
    if (assignment.projectId && !scoped.has(assignment.projectId) && !createsProject) return true;
    // 删除由具体工具调用的影响审批兜底，不重复升级成整份目标契约修订。
    return /cascade|overwrite|级联|覆盖/.test(text) && !/cascade|overwrite|级联|覆盖/.test(request);
  });
}

export function goalContractReady(session: AgentSessionV2, plan: AgentPlanRevision) {
  return Boolean(plan.goal.trim() && plan.successCriteria.length && plan.summary.trim() && (session.requirements || []).length
    && !(session.requirements || []).some((item) => item.capabilityStatus === 'needs_user_input'));
}

export function actionProgressFingerprint(session: AgentSessionV2, plan: AgentPlanRevision) {
  return createHash('sha256').update(JSON.stringify({ revisions: session.projectRevisions, coverage: session.requirementCoverage,
    requirements: (session.requirements || []).map((item) => [item.capabilityStatus, item.evidenceArtifactIds.length]),
    tasks: plan.tasks.map((task) => [task.status, task.endRevision, task.evidenceArtifactIds.length]) })).digest('hex').slice(0, 20);
}

export function ensureActionState(session: AgentSessionV2, maxSteps = DEFAULT_MAX_DECISION_STEPS) {
  session.steps ||= []; session.observations ||= [];
  session.orchestration ||= { currentRound: 0, maxRounds: maxSteps, consecutiveNoProgress: 0, maxNoProgressRounds: MAX_NO_PROGRESS_STEPS, status: 'idle' };
  session.orchestration.currentStep ??= session.steps.length; session.orchestration.maxDecisionSteps ??= maxSteps;
  return session.orchestration;
}

export function createActionStep(session: AgentSessionV2, plan: AgentPlanRevision): AgentOrchestrationStep {
  const state = ensureActionState(session); const index = (state.currentStep || 0) + 1; const max = state.maxDecisionSteps || DEFAULT_MAX_DECISION_STEPS;
  if (index > max) throw new Error(`已达到最大决策步数 ${max}`);
  const step: AgentOrchestrationStep = { id: `pastep_${index}_${Date.now().toString(36)}`, turnId: session.turnId, index, status: 'deciding', inputFingerprint: actionProgressFingerprint(session, plan), taskIds: [], observationIds: [], startedAt: new Date().toISOString() };
  state.currentStep = index; state.currentRound = index; state.status = 'running'; session.steps!.push(step); return step;
}

export function materializeAssignments(decision: NextActionDecision, step: AgentOrchestrationStep, plan: AgentPlanRevision, maxAttempts: number) {
  const tasks: AgentTaskNode[] = decision.assignments.map((assignment, index) => {
    const replaced = [...plan.tasks].reverse().find((task) => ['failed', 'blocked'].includes(task.status) && task.assistance?.status !== 'assigned' && task.role === assignment.role && task.requirementIds?.some((id) => assignment.requirementIds.includes(id)));
    if (replaced) replaced.status = 'superseded';
    const assisted = assignment.assistsRole ? plan.tasks.find((task) => task.status === 'blocked' && task.assistance?.status === 'needed' && task.role === assignment.assistsRole && task.title === assignment.assistsAction && task.requirementIds?.some((id) => assignment.requirementIds.includes(id))) : undefined;
    const task: AgentTaskNode = { id: `action_${step.index}_${index + 1}`, role: assignment.role, title: assignment.title, instruction: assignment.instruction, access: assignment.access, projectId: assignment.projectId,
      dependsOn: [], acceptance: assignment.acceptance, requirementIds: assignment.requirementIds, evidenceKinds: assignment.evidenceKinds, verificationScenarioIds: assignment.verificationScenarioIds,
      status: 'pending', attempt: 0, maxAttempts, evidenceArtifactIds: [], origin: 'action', generation: (replaced?.generation || 0) + 1, supersedesTaskId: replaced?.id, assistsTaskId: assisted?.id, stepId: step.id, decisionReason: decision.summary };
    if (assisted?.assistance) assisted.assistance = { ...assisted.assistance, status: 'assigned', helperTaskId: task.id, helperRole: task.role };
    plan.tasks.push(task); return task;
  });
  step.action = decision.action; step.summary = decision.summary; step.taskIds = tasks.map((task) => task.id); return tasks;
}

export function prepareAssignments(decision: NextActionDecision, step: AgentOrchestrationStep, plan: AgentPlanRevision, maxAttempts: number, validate: (prepared: AgentTaskNode[], allTasks: AgentTaskNode[]) => void) {
  const shadowPlan = { ...plan, tasks: structuredClone(plan.tasks) };
  const shadowStep = structuredClone(step);
  const prepared = materializeAssignments(decision, shadowStep, shadowPlan, maxAttempts);
  validate(prepared, shadowPlan.tasks);
  plan.tasks = shadowPlan.tasks;
  step.action = shadowStep.action; step.summary = shadowStep.summary; step.taskIds = shadowStep.taskIds;
  return step.taskIds.map((id) => plan.tasks.find((task) => task.id === id)!).filter(Boolean);
}

export function reconcileInterruptedActions(session: AgentSessionV2, plan: AgentPlanRevision) {
  const superseded: AgentTaskNode[] = []; const corrected: AgentTaskNode[] = [];
  const stepById = new Map((session.steps || []).map((step) => [step.id, step]));
  for (const task of plan.tasks) {
    const neverStarted = task.status === 'pending' && task.stepId && stepById.get(task.stepId)?.status === 'failed'
      && !session.events.some((event) => event.type === 'task_started' && event.data?.taskId === task.id);
    if (neverStarted) { task.status = 'superseded'; task.blockedReason = '生成任务的决策未能通过校验，已等待重新判断'; superseded.push(task); continue; }
    if (task.status === 'failed' && /操作\s+\S+\.delete\s+与已确认计划中的用户约束冲突/.test(task.error || '')) {
      task.status = 'blocked'; task.failureClass = 'tool_scope'; task.policyCorrectionCount = Math.max(1, task.policyCorrectionCount || 0);
      task.blockedReason = '删除操作需要审批，原任务应从当前项目状态继续修复';
      task.resumeContext = ['已检查到现有配置存在重复或错误内容。', '删除操作必须先展示影响并等待用户审批。', '审批前可以继续读取状态、评估替代方案，不要重做已通过的工作。'].join('\n');
      task.error = '当前修复需要重新选择安全修改方式；如仍需删除，将先请求你的确认。'; corrected.push(task);
    }
  }
  return { superseded, corrected };
}

export function observationForTask(step: AgentOrchestrationStep, task: AgentTaskNode): AgentObservation {
  const succeeded = task.status === 'passed'; const blocked = task.status === 'blocked';
  return { id: `paobs_${step.index}_${step.observationIds.length + 1}`, stepId: step.id, taskId: task.id, role: task.role,
    status: succeeded ? 'succeeded' : blocked ? 'blocked' : 'failed', action: task.title,
    summary: succeeded ? `${task.title}已完成并通过验收。` : `${task.title}未完成：${task.error || (blocked ? '前置条件尚未满足' : '执行失败')}`,
    changes: succeeded && task.access === 'write' ? [task.output || '项目内容已更新'] : [], evidence: succeeded ? task.acceptance : [],
    unresolved: succeeded ? [] : [task.error || '需要调整执行方式'], error: succeeded ? undefined : { category: task.failureClass || 'specialist_failure', message: task.error || '执行失败', retryable: !['permission', 'user_rejected'].includes(task.failureClass || '') }, createdAt: new Date().toISOString() };
}

export function recordObservation(session: AgentSessionV2, step: AgentOrchestrationStep, observation: AgentObservation) {
  session.observations ||= []; session.observations.push(observation); step.observationIds.push(observation.id); return observation;
}

export function resumeActionWithUserInput(session: AgentSessionV2, input: string) {
  const plan = session.plans.find((item) => item.id === session.activePlanId) || session.plans.at(-1); const step = session.steps?.at(-1);
  if (session.phase !== 'clarifying' || plan?.status !== 'confirmed' || !step || step.status !== 'waiting') return undefined;
  const observation = recordObservation(session, step, { id: `paobs_${step.index}_user`, stepId: step.id, status: 'succeeded', action: '补充执行信息',
    summary: input.trim(), changes: [], evidence: ['用户已补充下一步判断所需信息'], unresolved: [], createdAt: new Date().toISOString() });
  step.status = 'completed'; step.progressed = true; step.completedAt = observation.createdAt; session.questions = [];
  const state = ensureActionState(session); state.consecutiveNoProgress = 0; state.status = 'running'; return observation;
}

export function completeActionStep(session: AgentSessionV2, plan: AgentPlanRevision, step: AgentOrchestrationStep) {
  const state = ensureActionState(session); const output = actionProgressFingerprint(session, plan); const progressed = output !== step.inputFingerprint;
  step.outputFingerprint = output; step.progressed = progressed; step.status = 'completed'; step.completedAt = new Date().toISOString();
  state.consecutiveNoProgress = progressed ? 0 : state.consecutiveNoProgress + 1; state.lastProgressFingerprint = output;
  return { progressed, stalled: state.consecutiveNoProgress >= MAX_NO_PROGRESS_STEPS };
}

export function completionBlockers(session: AgentSessionV2, plan: AgentPlanRevision) {
  const blockers: string[] = [];
  if (!session.requirementCoverage?.complete) blockers.push('仍有需求缺少有效验收证据');
  if (plan.tasks.some((task) => ['failed', 'blocked', 'pending', 'running'].includes(task.status))) blockers.push('仍有未处理的任务或失败');
  const wrote = plan.tasks.some((task) => task.access === 'write' && task.status === 'passed');
  if (wrote && !plan.tasks.some((task) => task.role === 'quality' && task.status === 'passed')) blockers.push('尚未通过质量检查');
  if (wrote && !plan.tasks.some((task) => task.role === 'delivery' && task.status === 'passed')) blockers.push('尚未通过交付预检');
  return blockers;
}
