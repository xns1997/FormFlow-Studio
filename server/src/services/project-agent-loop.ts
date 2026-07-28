import { createHash } from 'node:crypto';
import type { McpRole } from './formflow-tool-registry';
import type {
  AgentEvidenceKind, AgentOrchestrationRound, AgentPlanRevision, AgentQuestion, AgentRoundExpertDecision,
  AgentSessionV2, AgentTaskNode,
} from './project-agent-v2-store';

export const PROJECT_AGENT_ROLES: McpRole[] = ['project', 'data', 'form', 'workflow', 'behavior', 'quality', 'delivery'];
export const DEFAULT_MAX_LOOP_ROUNDS = 24;
export const MAX_NO_PROGRESS_ROUNDS = 2;

export interface RoundPlannerResult {
  action: 'continue' | 'complete' | 'ask_user' | 'abort';
  summary: string;
  decisions: AgentRoundExpertDecision[];
  cancelTaskIds?: string[];
  questions?: Array<Omit<AgentQuestion, 'id'>>;
  reason?: string;
}

export function roundPlannerSchema() {
  const task = {
    type: 'object', required: ['title', 'instruction', 'access', 'dependsOn', 'acceptance', 'requirementIds', 'evidenceKinds', 'verificationScenarioIds'], properties: {
      title: { type: 'string' }, instruction: { type: 'string' }, access: { enum: ['read', 'write'] }, projectId: { type: 'string' },
      dependsOn: { type: 'array', items: { type: 'string' } }, acceptance: { type: 'array', items: { type: 'string' } },
      requirementIds: { type: 'array', items: { type: 'string' } },
      evidenceKinds: { type: 'array', items: { enum: ['tool_result', 'structural_validation', 'semantic_validation', 'scenario_result', 'requirement_coverage', 'delivery_preview'] } },
      verificationScenarioIds: { type: 'array', items: { type: 'string' } }, supersedesTaskId: { type: 'string' },
    },
  };
  return { type: 'object', required: ['action', 'summary', 'decisions'], properties: {
    action: { enum: ['continue', 'complete', 'ask_user', 'abort'] }, summary: { type: 'string' }, reason: { type: 'string' }, cancelTaskIds: { type: 'array', items: { type: 'string' } },
    decisions: { type: 'array', minItems: 7, maxItems: 7, items: { type: 'object', required: ['role', 'decision', 'reason'], properties: {
      role: { enum: PROJECT_AGENT_ROLES }, decision: { enum: ['run', 'skip'] }, reason: { type: 'string' }, taskId: { type: 'string' }, task,
    } } },
    questions: { type: 'array', maxItems: 3, items: { type: 'object', required: ['header', 'question', 'kind'], properties: {
      header: { type: 'string' }, question: { type: 'string' }, kind: { enum: ['choice', 'text'] }, options: { type: 'array', maxItems: 4, items: { type: 'object', required: ['label'], properties: { label: { type: 'string' }, description: { type: 'string' } } } },
    } } },
  } };
}

function stringArray(value: unknown) { return Array.isArray(value) ? value.map(String).filter(Boolean) : []; }

export function parseRoundPlannerResult(value: any): RoundPlannerResult {
  if (!value || !['continue', 'complete', 'ask_user', 'abort'].includes(value.action)) throw new Error('轮次协调器未返回合法 action');
  if (!Array.isArray(value.decisions) || value.decisions.length !== PROJECT_AGENT_ROLES.length) throw new Error('轮次协调器必须为七位专家分别给出决策');
  const roles = value.decisions.map((item: any) => item?.role);
  if (new Set(roles).size !== PROJECT_AGENT_ROLES.length || PROJECT_AGENT_ROLES.some((role) => !roles.includes(role))) throw new Error('轮次协调器专家决策必须完整且角色唯一');
  const decisions: AgentRoundExpertDecision[] = value.decisions.map((item: any) => {
    if (!['run', 'skip'].includes(item.decision)) throw new Error(`专家 ${item.role} 的轮次决策无效`);
    const reason = String(item.reason || '').trim(); if (!reason) throw new Error(`专家 ${item.role} 的轮次决策缺少原因`);
    if (item.decision === 'skip') return { role: item.role, decision: 'skip', reason };
    if (Boolean(item.taskId) === Boolean(item.task)) throw new Error(`专家 ${item.role} 的 run 决策必须且只能指定 taskId 或新任务`);
    if (item.taskId) return { role: item.role, decision: 'run', reason, taskId: String(item.taskId) };
    const input = item.task;
    if (!input?.title || !input?.instruction || !['read', 'write'].includes(input.access)) throw new Error(`专家 ${item.role} 的新任务不完整`);
    return { role: item.role, decision: 'run', reason, task: {
      title: String(input.title), instruction: String(input.instruction), access: input.access, projectId: input.projectId ? String(input.projectId) : undefined,
      dependsOn: stringArray(input.dependsOn), acceptance: stringArray(input.acceptance), requirementIds: stringArray(input.requirementIds),
      evidenceKinds: stringArray(input.evidenceKinds) as AgentEvidenceKind[], verificationScenarioIds: stringArray(input.verificationScenarioIds),
      supersedesTaskId: input.supersedesTaskId ? String(input.supersedesTaskId) : undefined,
    } };
  });
  if (value.action !== 'continue' && decisions.some((item) => item.decision === 'run')) throw new Error(`${value.action} 轮次不得同时调度专家任务`);
  if (value.action === 'continue' && !decisions.some((item) => item.decision === 'run')) throw new Error('continue 轮次至少需要调度一位专家');
  if (value.action === 'ask_user' && (!Array.isArray(value.questions) || !value.questions.length)) throw new Error('ask_user 轮次必须提供问题');
  return { action: value.action, summary: String(value.summary || ''), reason: value.reason ? String(value.reason) : undefined, decisions, questions: value.questions, cancelTaskIds: stringArray(value.cancelTaskIds) };
}

export function ensureOrchestrationState(session: AgentSessionV2, maxRounds = DEFAULT_MAX_LOOP_ROUNDS) {
  session.rounds ||= [];
  session.orchestration ||= { currentRound: 0, maxRounds, consecutiveNoProgress: 0, maxNoProgressRounds: MAX_NO_PROGRESS_ROUNDS, status: 'idle' };
  session.orchestration.maxRounds ||= maxRounds;
  session.orchestration.maxNoProgressRounds = MAX_NO_PROGRESS_ROUNDS;
  return session.orchestration;
}

export function orchestrationProgressFingerprint(session: AgentSessionV2, plan: AgentPlanRevision) {
  const value = {
    revisions: Object.entries(session.projectRevisions || {}).sort(([left], [right]) => left.localeCompare(right)),
    coverage: session.requirementCoverage,
    requirements: (session.requirements || []).map((item) => [item.id, item.capabilityStatus, item.evidenceArtifactIds.length]),
    tasks: plan.tasks.map((task) => [task.id, task.status, task.attempt, task.endRevision, task.evidenceArtifactIds.length]),
    artifacts: session.artifacts.length,
  };
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20);
}

export function createOrchestrationRound(session: AgentSessionV2, plan: AgentPlanRevision): AgentOrchestrationRound {
  const state = ensureOrchestrationState(session); const index = state.currentRound + 1;
  if (index > state.maxRounds) throw new Error(`Loop 已达到最大轮数 ${state.maxRounds}`);
  const round: AgentOrchestrationRound = { id: `paround_${index}_${Date.now().toString(36)}`, turnId: session.turnId, index, status: 'planning', inputFingerprint: orchestrationProgressFingerprint(session, plan), decisions: [], taskIds: [], startedAt: new Date().toISOString() };
  state.currentRound = index; state.status = 'running'; session.rounds!.push(round); return round;
}

function isProjectCreation(decision: AgentRoundExpertDecision) {
  return decision.role === 'project' && /创建|初始化|导入|create|initialize|import/i.test(`${decision.task?.title || ''}\n${decision.task?.instruction || ''}`);
}

export function validateRoundDecision(result: RoundPlannerResult, session: AgentSessionV2, plan: AgentPlanRevision) {
  const requirementIds = new Set((session.requirements || []).map((item) => item.id)); const projectIds = new Set([...(session.projectIds || []), ...(session.projectId ? [session.projectId] : [])]);
  const selectedIds = new Set(result.decisions.map((item) => item.taskId).filter(Boolean));
  for (const id of result.cancelTaskIds || []) { const task = plan.tasks.find((item) => item.id === id); if (!task) throw new Error(`待取消任务 ${id} 不存在`); if (task.status === 'passed') throw new Error('已通过任务不可取消'); if (selectedIds.has(id)) throw new Error(`任务 ${id} 不能在同一轮同时执行和取消`); }
  for (const decision of result.decisions) {
    if (decision.decision === 'skip') continue;
    if (decision.taskId) {
      const task = plan.tasks.find((item) => item.id === decision.taskId); if (!task) throw new Error(`轮次选择了不存在的任务 ${decision.taskId}`);
      if (task.role !== decision.role) throw new Error(`任务 ${task.id} 不属于 ${decision.role} 专家`);
      if (task.status !== 'pending') throw new Error(`任务 ${task.id} 当前不可调度`);
      if (!task.dependsOn.every((id) => plan.tasks.find((item) => item.id === id)?.status === 'passed')) throw new Error(`任务 ${task.id} 的依赖尚未通过`);
      continue;
    }
    const task = decision.task!;
    if (!task.requirementIds.length || task.requirementIds.some((id) => !requirementIds.has(id))) throw new Error(`专家 ${decision.role} 的新任务必须映射现有需求`);
    if (!task.acceptance.length || !task.evidenceKinds.length) throw new Error(`专家 ${decision.role} 的新任务缺少验收或证据要求`);
    if (task.projectId && !projectIds.has(task.projectId) && !isProjectCreation(decision)) throw new Error(`专家 ${decision.role} 的新任务使用了未限定项目 ${task.projectId}`);
    if (!task.projectId && projectIds.size > 1 && !isProjectCreation(decision)) throw new Error(`专家 ${decision.role} 的新任务必须明确 projectId`);
    for (const dependency of task.dependsOn) if (plan.tasks.find((item) => item.id === dependency)?.status !== 'passed') throw new Error(`专家 ${decision.role} 的新任务依赖 ${dependency} 尚未通过`);
    if (task.supersedesTaskId) { const replaced = plan.tasks.find((item) => item.id === task.supersedesTaskId); if (!replaced) throw new Error(`待替代任务 ${task.supersedesTaskId} 不存在`); if (replaced.status === 'passed') throw new Error('已通过任务不可被替代'); }
  }
  return result;
}

export function roundDecisionExpandsRisk(result: RoundPlannerResult, session: AgentSessionV2, plan: AgentPlanRevision) {
  const request = plan.request.toLowerCase(); const scoped = new Set([...(session.projectIds || []), ...(session.projectId ? [session.projectId] : [])]);
  return result.decisions.some((decision) => {
    if (decision.decision !== 'run' || !decision.task) return false;
    const text = `${decision.task.title}\n${decision.task.instruction}`.toLowerCase();
    if (decision.task.projectId && !scoped.has(decision.task.projectId) && !isProjectCreation(decision)) return true;
    if (decision.task.access === 'write' && !plan.tasks.some((task) => task.access === 'write')) return true;
    return /delete|remove|cascade|overwrite|删除|移除|级联|覆盖/.test(text) && !/delete|remove|cascade|overwrite|删除|移除|级联|覆盖/.test(request);
  });
}

export function materializeRoundTasks(result: RoundPlannerResult, round: AgentOrchestrationRound, plan: AgentPlanRevision, maxAttempts: number) {
  const selected: AgentTaskNode[] = [];
  for (const id of result.cancelTaskIds || []) { const task = plan.tasks.find((item) => item.id === id); if (task && !['passed', 'running'].includes(task.status)) task.status = 'superseded'; }
  for (const decision of result.decisions) {
    if (decision.decision === 'skip') continue;
    if (decision.taskId) {
      const task = plan.tasks.find((item) => item.id === decision.taskId)!; task.roundId = round.id; task.decisionReason = decision.reason; selected.push(task); continue;
    }
    const input = decision.task!; const replaced = input.supersedesTaskId ? plan.tasks.find((item) => item.id === input.supersedesTaskId) : undefined;
    if (replaced) replaced.status = 'superseded';
    let id = `loop_${round.index}_${decision.role}`; let suffix = 1; while (plan.tasks.some((item) => item.id === id)) id = `loop_${round.index}_${decision.role}_${suffix++}`;
    const task: AgentTaskNode = { id, role: decision.role, title: input.title, instruction: input.instruction, access: input.access, projectId: input.projectId,
      dependsOn: [...input.dependsOn], acceptance: [...input.acceptance], requirementIds: [...input.requirementIds], evidenceKinds: [...input.evidenceKinds], verificationScenarioIds: [...input.verificationScenarioIds],
      status: 'pending', attempt: 0, maxAttempts, evidenceArtifactIds: [], origin: 'loop', generation: (replaced?.generation || 0) + 1, supersedesTaskId: replaced?.id,
      roundId: round.id, decisionReason: decision.reason,
    };
    plan.tasks.push(task); selected.push(task);
  }
  round.decisions = result.decisions; round.taskIds = selected.map((task) => task.id); round.cancelledTaskIds = [...(result.cancelTaskIds || [])]; round.action = result.action; round.summary = result.summary; return selected;
}

export function completeOrchestrationRound(session: AgentSessionV2, plan: AgentPlanRevision, round: AgentOrchestrationRound) {
  const state = ensureOrchestrationState(session); const output = orchestrationProgressFingerprint(session, plan); const progressed = output !== round.inputFingerprint;
  round.outputFingerprint = output; round.progressed = progressed; round.status = 'completed'; round.completedAt = new Date().toISOString();
  state.consecutiveNoProgress = progressed ? 0 : state.consecutiveNoProgress + 1; state.lastProgressFingerprint = output;
  return { progressed, stalled: state.consecutiveNoProgress >= state.maxNoProgressRounds };
}
