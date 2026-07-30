import { randomUUID } from 'node:crypto';
import type { LlmMessage } from '../services/llm-provider-client';
import type { McpRole } from '../services/formflow-tool-registry';
import { listFormFlowTools, getFormFlowTool, executeLlmTool } from '../services/llm-tools';
import { isStructuredPlanningError, PLANNING_MAX_ATTEMPTS, planningRepairInstruction, validatePlannerTaskRoleBoundaries } from '../services/project-agent-v2-planning';
import { compactAgentToolResult } from '../services/project-agent-v2-context';
import { compactProjectStateCheck, createProjectStateCheckSummary, summarizeCheckedProject, type ProjectStateCheckReason, type ProjectStateCheckSummary } from '../services/project-agent-state-check';
import { materializeAnalyzedRequirements, refreshRequirementCoverage } from '../services/project-agent-requirements';
import {
  completeActionStep, completionBlockers, createActionStep, decisionExpandsRisk, ensureActionState, goalContractReady, prepareAssignments,
  reconcileInterruptedActions, observationForTask, recordObservation, resumeActionWithUserInput, PROJECT_AGENT_ROLES,
} from '../services/project-agent-actions';
import { classifyAgentFailure } from '../services/project-agent-v3-recovery';
import { currentExpertRepairDecision } from '../services/project-agent-expert-repair';
import { suggestedExpertRole, enabledExpertKnowledgePrompt, expertTeamKnowledgePrompt } from '../services/project-agent-expert-registry';
import {
  acquireAgentLease, addAgentArtifact, appendAgentEvent, compactConversation, getCapabilityBundle, releaseAgentLease, renewAgentLease,
  saveAgentSessionV2, sessionProjectIds, setAgentPhase, validateTaskGraph, type AgentSessionV2, type AgentPlanRevision, type AgentTaskNode, type AgentOrchestrationStep, type NextActionDecision,
} from '../services/project-agent-v2-store';
import { chat } from './llm-client';
import { requestNextAction } from './decision-engine';
import { runSpecialist, refreshRevision, RevisionRecomputeBlocked, ExpertAssistanceRequired } from './specialist-runner';
import type { RunContext } from './types';
import { verifyTask, QualityGateFailure, roleTitles } from './verifier';
import { recoverFailedTask, pauseRecoveryForUser, requestRecoveryPatch } from './recovery-engine';

// ─── Constants ────────────────────────────────────────────────────────────────

const roleOrder: McpRole[] = ['project', 'data', 'form', 'workflow', 'behavior', 'quality', 'delivery'];
const planningErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const MAX_EXPERT_ASSISTANCE_DEPTH = 3;

// ─── Session helpers ──────────────────────────────────────────────────────────

export function activePlan(session: AgentSessionV2) {
  return session.plans.find((plan) => plan.id === session.activePlanId);
}

export function addMessage(session: AgentSessionV2, role: 'user' | 'assistant', content: string, kind: NonNullable<AgentSessionV2['messages'][number]['kind']> = role === 'user' ? 'user' : 'assistant') {
  session.messages.push({ id: `pam2_${randomUUID()}`, role, content, createdAt: new Date().toISOString(), turnId: session.turnId, kind });
  if (session.messages.length === 1) session.title = content.slice(0, 40);
  saveAgentSessionV2(session);
}

export function questionMetadata(session: AgentSessionV2) {
  return { turnId: session.turnId, createdAt: new Date().toISOString() };
}

// ─── Grounding / project state ────────────────────────────────────────────────

async function ground(session: AgentSessionV2, run: RunContext) {
  setAgentPhase(session, 'grounding');
  const invoke = (role: McpRole, name: string, args: Record<string, unknown>) => executeLlmTool(name, args, { ...run, projectId: session.projectId, mcpRole: role });
  const roleCapabilitiesRaw = Object.fromEntries(await Promise.all(roleOrder.map(async (role) => [role, await invoke(role, 'system.capabilities.get', {})])));
  const roleCapabilities = Object.fromEntries(roleOrder.map((role) => [role, { available: Boolean((roleCapabilitiesRaw as any)[role]?.ok), toolCount: listFormFlowTools(role).filter((tool) => tool.name !== 'release.apply').length }]));
  const toolCatalog = Object.fromEntries(roleOrder.map((role) => [role, { count: listFormFlowTools(role).filter((tool) => tool.name !== 'release.apply').length }]));
  const [componentCatalog, workflowCatalog, eventCatalog] = await Promise.all([invoke('form', 'catalog.components.list', {}), invoke('workflow', 'catalog.workflow_nodes.list', {}), invoke('behavior', 'catalog.events.list', {})]);
  const projects = await Promise.all(sessionProjectIds(session).map(async (projectId) => {
    const previousRevision = session.projectRevisions?.[projectId];
    const [inspect, validation, loaded]: any[] = await Promise.all([invoke('project', 'project.inspect', { projectId }), invoke('quality', 'project.validate', { projectId }), invoke('project', 'project.get', { projectId })]);
    const revision = loaded.ok ? loaded.data.revision : undefined; if (revision) (session.projectRevisions ||= {})[projectId] = revision;
    return summarizeCheckedProject({ projectId, current: projectId === session.projectId, previousRevision, inspect, validation, loaded });
  }));
  session.checkpointRevision = session.projectId ? session.projectRevisions?.[session.projectId] : undefined;
  const projectState = createProjectStateCheckSummary('initial_grounding', projects);
  const artifact = addAgentArtifact(session, { kind: 'grounding', title: '限定项目只读检查', data: { roleCapabilities, toolCatalog, capabilityCatalog: { components: Array.isArray((componentCatalog as any).data) ? (componentCatalog as any).data.length : 0, workflowNodes: Array.isArray((workflowCatalog as any).data) ? (workflowCatalog as any).data.length : 0, events: Array.isArray((eventCatalog as any).data) ? (eventCatalog as any).data.length : 0 }, projectState: compactProjectStateCheck(projectState) } });
  appendAgentEvent(session, 'grounding_completed', { artifactId: artifact.id, projectId: session.projectId, projectIds: sessionProjectIds(session), revision: session.checkpointRevision }); return artifact;
}

export async function checkProjectState(session: AgentSessionV2, run: RunContext, reason: ProjectStateCheckReason): Promise<ProjectStateCheckSummary> {
  appendAgentEvent(session, 'project_state_check_started', { reason, message: '提问前正在核对项目现状' });
  const projects = await Promise.all(sessionProjectIds(session).map(async (projectId) => {
    const previousRevision = session.projectRevisions?.[projectId];
    const invoke = (role: McpRole, name: string) => executeLlmTool(name, { projectId }, { ...run, projectId, mcpRole: role });
    const [inspect, validation, loaded]: any[] = await Promise.all([invoke('project', 'project.inspect'), invoke('quality', 'project.validate'), invoke('project', 'project.get')]);
    const revision = loaded.ok ? loaded.data.revision : undefined; if (revision) (session.projectRevisions ||= {})[projectId] = revision;
    return summarizeCheckedProject({ projectId, current: projectId === session.projectId, previousRevision, inspect, validation, loaded });
  }));
  session.checkpointRevision = session.projectId ? session.projectRevisions?.[session.projectId] : undefined;
  const summary = createProjectStateCheckSummary(reason, projects); const compact = compactProjectStateCheck(summary);
  addAgentArtifact(session, { kind: 'grounding', title: '提问前项目状态检查', data: compact });
  appendAgentEvent(session, 'project_state_check_completed', { reason, summary: summary.summary, fingerprint: summary.fingerprint, changedProjects: projects.filter((item) => item.revisionChanged).length, message: '已核对项目现状，正在判断是否仍需询问' });
  return summary;
}

// ─── Requirement analysis (local helpers) ──────────────────────────────────────

function requirementAnalysisSchema() {
  return { type: 'object', required: ['action'], properties: {
    action: { enum: ['ask', 'contract'] }, summary: { type: 'string' },
    questions: { type: 'array', maxItems: 3, items: { type: 'object', required: ['header', 'question', 'kind'], properties: { header: { type: 'string' }, question: { type: 'string' }, kind: { enum: ['choice', 'text'] }, options: { type: 'array', maxItems: 4, items: { type: 'object', required: ['label'], properties: { label: { type: 'string' }, description: { type: 'string' } } } } } } },
    requirements: { type: 'array', minItems: 1, maxItems: 64, items: { type: 'object', required: ['statement', 'domain', 'acceptanceScenarios', 'risk'], properties: {
      statement: { type: 'string' }, domain: { enum: roleOrder }, acceptanceScenarios: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } }, risk: { enum: ['normal', 'high'] },
    } } },
  } };
}

function requirementAnalysisPrompt(session: AgentSessionV2, prompt: string, grounding: unknown) {
  return `你是 FormFlow 的需求分析师。你的工作是先理解用户的整段自然语言，再输出完整、去重、可验收的需求契约；不得按换行、标点、编号或句子边界机械拆分。应按业务意图聚合相关描述，一项需求必须是可独立验收的业务结果，不能是"业务规则如下"之类标题，也不能是调用 tools/list、使用稳定 ID、最终汇报等智能体执行指令。每项需求要选择主责领域，并给出 1–3 条具体、可观察的验收场景。删除、覆盖、级联或发布标为 high risk。信息不足且会实质改变方案时 action=ask，最多问 3 个问题；其他情况 action=contract。用户在修改需求或回答问题时，requirements 必须返回修订后的完整契约，不是增量补丁。\n本轮用户输入：${prompt}\n现有需求契约：${JSON.stringify(session.requirements || [])}\n项目只读检查：${JSON.stringify(grounding)}\n历史摘要：${session.conversationSummary || '无'}`;
}

async function requestRequirementAnalysis(session: AgentSessionV2, run: RunContext, prompt: string, grounding: unknown) {
  const baseMessages: LlmMessage[] = [{ role: 'system', content: requirementAnalysisPrompt(session, prompt, grounding) }, ...session.messages.slice(-8).map((item) => ({ role: item.role, content: item.content } as LlmMessage))];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    appendAgentEvent(session, 'requirements_analysis_attempt_started', { attempt, maxAttempts: 2 });
    try {
      const messages = attempt === 1 ? baseMessages : [{ role: 'system' as const, content: '上一次需求分析结果不符合 Schema。只输出一个完整 JSON 对象。action=contract 时必须返回修订后的完整 requirements，不要按句子机械拆分。' }, ...baseMessages];
      const response = await chat(session, run, messages, requirementAnalysisSchema());
      const value: any = response.structured || (() => { try { return JSON.parse(response.content || ''); } catch { return undefined; } })();
      if (value?.action === 'ask' && Array.isArray(value.questions) && value.questions.length) return value;
      if (value?.action === 'contract' && Array.isArray(value.requirements) && value.requirements.length) return value;
      throw new Error('需求分析模型未返回有效的 ask 或 contract 结果');
    } catch (error) {
      const structured = isStructuredPlanningError(error) || /需求分析模型未返回/.test(planningErrorMessage(error));
      appendAgentEvent(session, 'requirements_analysis_attempt_failed', { attempt, maxAttempts: 2, retrying: attempt < 2 && structured, error: planningErrorMessage(error) });
      if (attempt >= 2 || !structured) throw error;
    }
  }
  throw new Error('需求分析模型在自动修复后仍未返回合法契约');
}

// ─── Planning (local helpers) ──────────────────────────────────────────────────

function plannerSchema() {
  return { type: 'object', required: ['action'], properties: {
    action: { enum: ['ask', 'plan'] }, questions: { type: 'array', maxItems: 3, items: { type: 'object', required: ['header', 'question', 'kind'], properties: { header: { type: 'string' }, question: { type: 'string' }, kind: { enum: ['choice', 'text'] }, options: { type: 'array', items: { type: 'object', required: ['label'], properties: { label: { type: 'string' }, description: { type: 'string' } } } } } } },
    goal: { type: 'string' }, successCriteria: { type: 'array', minItems: 1, items: { type: 'string' } }, summary: { type: 'string' }, assumptions: { type: 'array', items: { type: 'string' } }, risks: { type: 'array', items: { type: 'string' } },
  } };
}

function plannerPrompt(session: AgentSessionV2, grounding: unknown) {
  const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId); const coordinator = bundle?.agents.find((agent) => agent.role === 'coordinator');
  return `你是 FormFlow 项目智能体的目标规划器。需求契约已由独立分析阶段生成。这里只完善用户要达到的目标边界，不得预先生成专家任务、工具调用或完整执行顺序。信息不足且会改变业务结果时 action=ask，最多三个问题；信息完整时 action=plan，输出清晰的目标、成功标准、范围摘要、假设与风险。summary 只描述允许完成的业务范围。不得新增需求，不得承诺缺少能力支持的结果，不得放宽删除、覆盖或发布风险。\n需求契约：${JSON.stringify((session.requirements || []).map((item) => ({ statement: item.statement, acceptanceScenarios: item.acceptanceScenarios, risk: item.risk, status: item.capabilityStatus })))}\n能力包指令：${coordinator?.instructions || '无'}${enabledExpertKnowledgePrompt(coordinator)}${bundle ? expertTeamKnowledgePrompt(bundle, 'coordinator') : ''}\n当前项目：${session.projectId || '未创建'}\n限定项目：${sessionProjectIds(session).join('、') || '无（允许创建后自动限定）'}\n只读检查：${JSON.stringify(compactAgentToolResult(grounding, 20_000))}\n历史摘要：${session.conversationSummary || '无'}`;
}

function parsePlanningResponse(response: Awaited<ReturnType<typeof chat>>) {
  let value: any = response.structured;
  if (!value && response.content) { try { value = JSON.parse(response.content.replace(/^```json\s*|\s*```$/g, '')); } catch { /* handled below */ } }
  if (value?.action === 'ask' && Array.isArray(value.questions) && value.questions.length) return value;
  if (value?.action === 'plan' && String(value.goal || '').trim() && Array.isArray(value.successCriteria) && value.successCriteria.length) return value;
  throw new Error('规划模型未返回有效的 ask 或 plan 结果');
}

async function requestPlan(session: AgentSessionV2, run: RunContext, grounding: unknown) {
  const baseMessages: LlmMessage[] = [{ role: 'system', content: plannerPrompt(session, grounding) }];
  for (let attempt = 1; attempt <= PLANNING_MAX_ATTEMPTS; attempt += 1) {
    appendAgentEvent(session, 'planning_attempt_started', { attempt, maxAttempts: PLANNING_MAX_ATTEMPTS });
    try {
      const messages = attempt === 1 ? baseMessages : [{
        role: 'system' as const,
        content: planningRepairInstruction(),
      }, ...baseMessages];
      const response = await chat(session, run, messages, plannerSchema());
      const value = parsePlanningResponse(response);
      appendAgentEvent(session, 'planning_attempt_completed', { attempt });
      return value;
    } catch (error) {
      const retrying = attempt < PLANNING_MAX_ATTEMPTS && isStructuredPlanningError(error);
      appendAgentEvent(session, 'planning_attempt_failed', { attempt, maxAttempts: PLANNING_MAX_ATTEMPTS, retrying, error: planningErrorMessage(error) });
      if (!retrying) throw error;
      appendAgentEvent(session, 'planning_retry_scheduled', { failedAttempt: attempt, nextAttempt: attempt + 1, reason: 'structured_output_repair' });
    }
  }
  throw new Error('规划模型在自动修复后仍未返回合法的结构化 JSON');
}

// ─── Plan turn ────────────────────────────────────────────────────────────────

export async function planTurn(session: AgentSessionV2, prompt: string, run: RunContext) {
  const previousQuestionIds = session.questions.map((question) => question.id);
  const grounding = await ground(session, run); setAgentPhase(session, 'analyzing_requirements'); appendAgentEvent(session, 'requirements_analysis_started', { requirementRevision: session.requirementRevision || 0 });
  const analysis: any = await requestRequirementAnalysis(session, run, prompt, grounding.data);
  if (analysis?.action === 'ask' && Array.isArray(analysis.questions) && analysis.questions.length) {
    session.questions = analysis.questions.slice(0, 3).map((item: any) => ({ id: `paq_${randomUUID()}`, ...questionMetadata(session), header: String(item.header || '需要确认'), question: String(item.question), kind: item.kind === 'choice' ? 'choice' : 'text', options: Array.isArray(item.options) ? item.options.slice(0, 4).map((option: any) => ({ label: String(option.label), description: option.description ? String(option.description) : undefined })) : undefined }));
    setAgentPhase(session, 'clarifying'); appendAgentEvent(session, 'requirements_analysis_questions_requested', { questions: session.questions });
    const message = session.questions.map((item, index) => `${index + 1}. ${item.question}`).join('\n'); addMessage(session, 'assistant', message, 'question'); return;
  }
  const requirements = materializeAnalyzedRequirements(analysis.requirements || []);
  if (!requirements.length) throw new Error('需求分析模型未生成可验收的需求契约');
  const previousContract = JSON.stringify((session.requirements || []).map((item) => ({ statement: item.statement, domain: item.domain, acceptanceScenarios: item.acceptanceScenarios, risk: item.risk })));
  const nextContract = JSON.stringify(requirements.map((item) => ({ statement: item.statement, domain: item.domain, acceptanceScenarios: item.acceptanceScenarios, risk: item.risk })));
  if (previousContract !== nextContract) session.requirementRevision = (session.requirementRevision || 0) + 1;
  session.requirements = requirements; session.requirementCoverage = refreshRequirementCoverage(requirements); session.questions = [];
  if (previousQuestionIds.length) appendAgentEvent(session, 'questions_resolved', { questionIds: previousQuestionIds });
  appendAgentEvent(session, 'requirements_analysis_completed', { summary: String(analysis.summary || ''), requirements, coverage: session.requirementCoverage, requirementRevision: session.requirementRevision });
  setAgentPhase(session, 'planning');
  const value: any = await requestPlan(session, run, grounding.data);
  if (value?.action === 'ask' && Array.isArray(value.questions) && value.questions.length) {
    session.questions = value.questions.slice(0, 3).map((item: any) => ({ id: `paq_${randomUUID()}`, ...questionMetadata(session), header: String(item.header || '需要确认'), question: String(item.question), kind: item.kind === 'choice' ? 'choice' : 'text', options: Array.isArray(item.options) ? item.options.slice(0, 4).map((option: any) => ({ label: String(option.label), description: option.description ? String(option.description) : undefined })) : undefined }));
    setAgentPhase(session, 'clarifying'); appendAgentEvent(session, 'question_requested', { questions: session.questions });
    const message = session.questions.map((item, index) => `${index + 1}. ${item.question}`).join('\n'); addMessage(session, 'assistant', message, 'question'); return;
  }
  const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!;
  const tasks: AgentTaskNode[] = [];
  session.requirementCoverage = { ...(session.requirementCoverage || refreshRequirementCoverage(session.requirements || [])), planned: 0, planComplete: true };
  for (const old of session.plans) if (old.status === 'pending' || old.status === 'confirmed') old.status = 'superseded';
  const next: AgentPlanRevision = { id: `pap2_${randomUUID()}`, turnId: session.turnId, revision: (session.plans.at(-1)?.revision || 0) + 1, request: prompt, goal: String(value.goal || prompt), successCriteria: Array.isArray(value.successCriteria) ? value.successCriteria.map(String) : [], summary: String(value.summary || ''), assumptions: Array.isArray(value.assumptions) ? value.assumptions.map(String) : [], risks: Array.isArray(value.risks) ? value.risks.map(String) : [], tasks, status: 'pending', requirementRevision: session.requirementRevision || 0, createdAt: new Date().toISOString() };
  session.plans.push(next); session.activePlanId = next.id; session.questions = []; setAgentPhase(session, 'awaiting_plan_approval'); appendAgentEvent(session, 'plan_proposed', { plan: next, coverage: session.requirementCoverage }); addMessage(session, 'assistant', next.summary || '目标、成功标准和风险边界已整理，等待确认。', 'plan_summary');
  session.recovery = { cycles: 0, maxCycles: bundle.budget.maxRecoveryCycles ?? 6, dynamicTasks: 0, maxDynamicTasks: bundle.budget.maxDynamicTasks ?? 24, strategies: {} };
  const maxDecisionSteps = bundle.budget.maxDecisionSteps ?? bundle.budget.maxLoopRounds ?? 24;
  session.orchestration = { currentRound: 0, maxRounds: maxDecisionSteps, currentStep: 0, maxDecisionSteps, consecutiveNoProgress: 0, maxNoProgressRounds: 2, status: 'idle' }; session.steps = []; session.observations = [];
  compactConversation(session, bundle.context.maxSummaryChars, bundle.context.recentMessages);
}

export function failPlanningTurn(session: AgentSessionV2, error: unknown) {
  const message = planningErrorMessage(error); const retryable = isStructuredPlanningError(error);
  appendAgentEvent(session, 'turn_failed', { turnId: session.turnId, stage: 'planning', error: message, retryable });
  setAgentPhase(session, 'failed', { stage: 'planning', error: message, retryable });
}

// ─── Task execution ───────────────────────────────────────────────────────────

export function blockTaskForRevisionChanges(session: AgentSessionV2, task: AgentTaskNode) {
  task.status = 'blocked'; task.failureClass = 'revision_conflict'; task.error = '项目持续被修改，已安全暂停。请停止其他编辑后再继续。';
  session.questions = [{ id: `paq_${randomUUID()}`, ...questionMetadata(session), header: '项目正在变化', question: '项目在自动重新计算两次后仍被其他操作修改。请停止其他编辑后，再选择继续当前任务。', kind: 'text' }];
  appendAgentEvent(session, 'revision_recompute_blocked', { taskId: task.id, role: task.role, action: task.title, message: task.error });
  appendAgentEvent(session, 'question_requested', { questions: session.questions, reason: 'revision_changes_repeated' });
  if (session.orchestration) session.orchestration.status = 'waiting';
  setAgentPhase(session, 'clarifying', { reason: 'revision_changes_repeated' }); saveAgentSessionV2(session);
}

export function requestTaskAssistance(session: AgentSessionV2, task: AgentTaskNode, error: unknown) {
  const message = error instanceof Error ? error.message : String(error); const previous = task.assistance; const depth = (previous?.depth || 0) + 1;
  const triedRoles = [...new Set([task.role, ...(previous?.triedRoles || []), ...(previous?.helperRole ? [previous.helperRole] : [])])];
  if (depth > MAX_EXPERT_ASSISTANCE_DEPTH || triedRoles.length >= PROJECT_AGENT_ROLES.length) return false;
  const diagnostics = error instanceof QualityGateFailure ? error.diagnostics.slice(0, 8).map((item) => `${item.path || 'project'}：${item.message || item.code || '质量问题'}`).join('；') : '';
  const handoff = task.output ? `专家交接：${task.output.slice(0, 2400)}` : ''; const reason = [message, diagnostics, handoff].filter(Boolean).join('；'); const requestedRole = suggestedExpertRole(reason, task.role);
  task.status = 'blocked'; task.failureClass = classifyAgentFailure(reason); task.error = `当前专家需要其他专家先解决阻断：${reason}`;
  task.assistance = { status: 'needed', reason, depth, triedRoles, requestedRole }; appendAgentEvent(session, 'expert_assistance_requested', { taskId: task.id, role: task.role, action: task.title, reason, requestedRole, depth, triedRoles }); saveAgentSessionV2(session); return true;
}

export async function executeTask(session: AgentSessionV2, task: AgentTaskNode, run: RunContext, continuation?: { repairContext: string; preserveAttempt: boolean }) {
  let continuationPending = Boolean(continuation?.preserveAttempt);
  while (continuationPending || task.attempt < task.maxAttempts) {
    const taskProjectId = task.projectId || session.projectId;
    if (continuationPending) { continuationPending = false; task.status = 'running'; appendAgentEvent(session, 'expert_resumed_after_assistance', { taskId: task.id, role: task.role, action: task.title, helperRole: task.assistance?.helperRole, summary: '协助专家已完成阻断处理，原专家正在从卡点继续' }); }
    else { task.attempt += 1; task.status = 'running'; task.startRevision = taskProjectId ? session.projectRevisions?.[taskProjectId] || session.checkpointRevision : undefined; appendAgentEvent(session, 'task_started', { taskId: task.id, role: task.role, projectId: taskProjectId, attempt: task.attempt, access: task.access }); if (task.assistsTaskId) appendAgentEvent(session, 'expert_assistance_started', { taskId: task.assistsTaskId, helperTaskId: task.id, helperRole: task.role, helperAction: task.title, summary: '协助专家正在处理当前阻断' }); }
    let repairContext: string | undefined = continuation?.repairContext || task.resumeContext; task.resumeContext = undefined; continuation = undefined; let repairCycles = 0;
    while (true) {
      try {
        const result = await runSpecialist(session, task, run, repairContext ? { repairContext } : undefined); if (result.waiting) return false;
        if (result.interrupted) { task.status = 'pending'; task.attempt = Math.max(0, task.attempt - 1); appendAgentEvent(session, 'task_paused', { taskId: task.id, reason: session.controlSignal }); return true; }
        task.output = result.output; await verifyTask(session, task, run); task.status = 'passed'; task.failureClass = undefined; task.error = undefined;
        if (repairCycles) appendAgentEvent(session, 'expert_repair_completed', { taskId: task.id, role: task.role, action: task.title, repairCycles, summary: '专家已找到原因、修正问题并通过验收' });
        const completedProjectId = task.projectId || session.projectId; task.endRevision = completedProjectId ? session.projectRevisions?.[completedProjectId] || session.checkpointRevision : undefined; session.requirementCoverage = refreshRequirementCoverage(session.requirements || [], activePlan(session)?.tasks || [], session.artifacts); appendAgentEvent(session, 'coverage_updated', { coverage: session.requirementCoverage, requirements: session.requirements }); appendAgentEvent(session, 'task_completed', { taskId: task.id, projectId: completedProjectId, evidenceArtifactIds: task.evidenceArtifactIds, revision: task.endRevision }); return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error); if (error instanceof RevisionRecomputeBlocked) return false;
        if (error instanceof ExpertAssistanceRequired && requestTaskAssistance(session, task, error)) return false;
        const repairDecision = currentExpertRepairDecision({ message, repairCycles, qualityGateFailure: error instanceof QualityGateFailure });
        if (repairDecision === 'repair_current') {
          repairCycles += 1; task.expertRepairCount = (task.expertRepairCount || 0) + 1; repairContext = message; task.error = undefined; task.status = 'running';
          if (taskProjectId) await refreshRevision(session, run, task.role, taskProjectId);
          appendAgentEvent(session, 'expert_repair_started', { taskId: task.id, role: task.role, action: task.title, repairCycle: repairCycles, summary: '执行或验收未通过，当前专家正在查找原因并调整方案', diagnosis: message }); saveAgentSessionV2(session); continue;
        }
        if (repairDecision === 'request_assistance' && requestTaskAssistance(session, task, error)) return false;
        task.error = message; appendAgentEvent(session, 'task_failed', { taskId: task.id, attempt: task.attempt, error: message, expertRepairCycles: repairCycles });
        if (error instanceof QualityGateFailure) { task.status = 'failed'; task.failureClass = 'validation'; return false; }
        const retryable = repairDecision === 'retry_infrastructure'; if (!retryable || task.attempt >= task.maxAttempts) { task.status = 'failed'; task.failureClass ||= classifyAgentFailure(message); return false; }
        break;
      }
    }
  }
  task.status = 'failed'; return false;
}

// ─── Step execution ───────────────────────────────────────────────────────────

async function resumeAssistedExperts(session: AgentSessionV2, plan: AgentPlanRevision, step: AgentOrchestrationStep, selected: AgentTaskNode[], run: RunContext) {
  const queue = [...selected].filter((task) => task.assistsTaskId); const processed = new Set<string>();
  while (queue.length) {
    const helper = queue.shift()!; if (processed.has(helper.id)) continue; processed.add(helper.id);
    const blocked = plan.tasks.find((task) => task.id === helper.assistsTaskId); if (!blocked?.assistance) continue;
    if (helper.status !== 'passed') {
      if (helper.status === 'failed') { blocked.assistance = { ...blocked.assistance, status: 'needed', helperTaskId: undefined, helperRole: undefined, triedRoles: [...new Set([...blocked.assistance.triedRoles, helper.role])] }; blocked.error = `协助专家未解决阻断：${helper.error || helper.title}`; appendAgentEvent(session, 'expert_assistance_failed', { taskId: blocked.id, role: blocked.role, action: blocked.title, helperRole: helper.role, helperAction: helper.title, summary: blocked.error }); }
      continue;
    }
    const evidence = helper.evidenceArtifactIds.map((id) => session.artifacts.find((item) => item.id === id)?.title).filter(Boolean); const originalReason = blocked.assistance.reason;
    blocked.assistance = { ...blocked.assistance, status: 'resolved', helperTaskId: helper.id, helperRole: helper.role, triedRoles: [...new Set([...blocked.assistance.triedRoles, helper.role])] }; blocked.status = 'pending'; blocked.error = undefined; blocked.blockedBy = []; blocked.dependsOn = [...new Set([...blocked.dependsOn, helper.id])];
    if (!step.taskIds.includes(blocked.id)) step.taskIds.push(blocked.id); if (!selected.includes(blocked)) selected.push(blocked);
    appendAgentEvent(session, 'expert_assistance_completed', { taskId: blocked.id, role: blocked.role, action: blocked.title, helperRole: helper.role, helperAction: helper.title, evidence, summary: '协助专家已解决阻断，即将交回原专家继续' });
    appendAgentEvent(session, 'task_resumed', { taskId: blocked.id, role: blocked.role, action: blocked.title, helperRole: helper.role, summary: '原专家正在从之前卡住的位置继续' });
    const continuation = `原阻断：${originalReason}\n协助专家：${roleTitles[helper.role]}\n协助结果：${helper.output || helper.title}\n可用证据：${evidence.join('、') || '协助任务已通过验收'}\n请从原卡点继续，先读取协助后的最新项目状态，不要重做已完成的部分。`;
    await executeTask(session, blocked, run, { repairContext: continuation, preserveAttempt: true });
    if (session.pendingApproval || session.controlSignal) return false;
    if ((blocked.status as string) === 'passed') { appendAgentEvent(session, 'expert_resumed_completed', { taskId: blocked.id, role: blocked.role, action: blocked.title, helperRole: helper.role, summary: '原专家已基于协助结果完成后续工作' }); if (blocked.assistsTaskId) queue.push(blocked); }
  }
  return true;
}

export async function executeStepTasks(session: AgentSessionV2, plan: AgentPlanRevision, step: AgentOrchestrationStep, run: RunContext, maxParallelReads: number) {
  const selected = step.taskIds.map((id) => plan.tasks.find((task) => task.id === id)).filter(Boolean) as AgentTaskNode[];
  for (const task of selected.filter((item) => item.status === 'pending')) validatePlannerTaskRoleBoundaries([task]);
  const reads = selected.filter((task) => task.status === 'pending' && task.access === 'read');
  for (let offset = 0; offset < reads.length; offset += Math.max(1, maxParallelReads)) {
    await Promise.all(reads.slice(offset, offset + Math.max(1, maxParallelReads)).map((task) => executeTask(session, task, run)));
    if (session.pendingApproval) { step.status = 'waiting'; const task = selected.find((item) => item.id === session.pendingApproval?.taskId); if (task && !(session.observations || []).some((item) => item.taskId === task.id && item.status === 'waiting_confirmation')) recordObservation(session, step, { ...observationForTask(step, task), status: 'waiting_confirmation', summary: `${task.title}等待操作确认。`, unresolved: ['需要确认后继续'] }); return false; }
    if (session.controlSignal) return false;
  }
  for (const task of selected.filter((item) => item.status === 'pending' && item.access === 'write')) {
    if (!task.dependsOn.every((id) => plan.tasks.find((item) => item.id === id)?.status === 'passed')) { task.status = 'blocked'; task.blockedBy = task.dependsOn.filter((id) => plan.tasks.find((item) => item.id === id)?.status !== 'passed'); continue; }
    await executeTask(session, task, run);
    if (session.pendingApproval) { step.status = 'waiting'; return false; }
    if (session.controlSignal) return false;
  }
  if (!await resumeAssistedExperts(session, plan, step, selected, run)) return false;
  for (const task of selected) if (!(session.observations || []).some((item) => item.taskId === task.id && item.status !== 'waiting_confirmation')) {
    const observation = recordObservation(session, step, observationForTask(step, task)); appendAgentEvent(session, 'observation_recorded', { stepId: step.id, status: observation.status, action: observation.action, summary: observation.summary, role: observation.role });
  }
  return !selected.some((task) => ['pending', 'running'].includes(task.status));
}

// ─── Orchestration budget helpers ─────────────────────────────────────────────

export async function stallOrchestrationForUser(session: AgentSessionV2, run: RunContext) {
  const check = await checkCurrentProjectState(session, run, 'orchestration_stalled');
  const state = ensureActionState(session); session.questions = [
    { id: `paq_${randomUUID()}`, ...questionMetadata(session), header: '执行停滞', question: `${check.summary} 连续两次行动仍未产生新的证据或业务状态推进。请补充需要调整的业务约束，或明确希望优先尝试的方向。`, kind: 'text' },
  ];
  state.status = 'waiting'; appendAgentEvent(session, 'orchestration_stalled', { consecutiveNoProgress: state.consecutiveNoProgress, questions: session.questions });
  appendAgentEvent(session, 'question_requested', { questions: session.questions, reason: 'orchestration_stalled' }); setAgentPhase(session, 'clarifying', { reason: 'orchestration_stalled' });
}

export function failOrchestrationAtBudget(session: AgentSessionV2, plan: AgentPlanRevision) {
  const state = ensureActionState(session); const unresolved = (session.requirements || []).filter((item) => item.capabilityStatus !== 'verified');
  const blocked = plan.tasks.filter((task) => ['failed', 'blocked', 'pending'].includes(task.status)).map((task) => ({ role: task.role, action: task.title, status: task.status, error: task.error }));
  const artifact = addAgentArtifact(session, { kind: 'summary', title: '决策步数预算耗尽', data: { unresolved: unresolved.map((item) => item.statement), blocked } }); state.status = 'failed';
  appendAgentEvent(session, 'orchestration_failed', { reason: 'max_decision_steps_exhausted' }); setAgentPhase(session, 'failed', { reason: 'max_decision_steps_exhausted', artifactId: artifact.id });
}

// ─── Main plan execution loop ─────────────────────────────────────────────────

export async function executePlan(session: AgentSessionV2, run: RunContext) {
  if (!await acquireAgentLease(session.id)) return; setAgentPhase(session, 'executing');
  const heartbeat = setInterval(() => void renewAgentLease(session.id), 15_000);
  try {
    const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!; const maxSteps = bundle.budget.maxDecisionSteps ?? bundle.budget.maxLoopRounds ?? 24; const orchestration = ensureActionState(session, maxSteps);
    orchestration.status = 'running';
    while (true) {
      const plan = activePlan(session); if (!plan) throw new Error('当前没有活动计划'); if (plan.status === 'pending') return; if (plan.status !== 'confirmed') throw new Error('当前没有已确认计划');
      const reconciled = reconcileInterruptedActions(session, plan);
      for (const task of reconciled.superseded) appendAgentEvent(session, 'task_reconciled', { taskId: task.id, action: task.title, status: 'superseded', summary: '未开始的无效行动已撤回，等待重新判断' });
      for (const task of reconciled.corrected) appendAgentEvent(session, 'task_correction_requested', { taskId: task.id, role: task.role, action: task.title, reason: 'legacy_delete_policy_failure', summary: task.error });
      if (reconciled.superseded.length || reconciled.corrected.length) { session.requirementCoverage = refreshRequirementCoverage(session.requirements || [], plan.tasks, session.artifacts); saveAgentSessionV2(session); }
      if (session.pendingApproval) { orchestration.status = 'waiting'; return; }
      if (session.controlSignal === 'pause') { session.controlSignal = undefined; orchestration.status = 'waiting'; setAgentPhase(session, 'paused'); return; }
      if (session.controlSignal === 'stop') { session.controlSignal = undefined; orchestration.status = 'stopped'; setAgentPhase(session, 'stopped'); return; }
      if (session.controlSignal === 'steer') { const prompt = session.pendingSteer || ''; session.controlSignal = undefined; session.pendingSteer = undefined; for (const task of plan.tasks) if (task.status === 'running') task.status = 'pending'; setAgentPhase(session, 'planning', { reason: 'steer' }); await planTurn(session, prompt, run); return; }
      const openStep = session.steps?.at(-1);
      if (openStep && ['running', 'waiting'].includes(openStep.status) && openStep.action === 'assign') {
        openStep.status = 'running'; const finished = await executeStepTasks(session, plan, openStep, run, bundle.budget.maxParallelReads); if (!finished || session.pendingApproval || session.controlSignal) continue;
        if (session.phase === 'clarifying') { openStep.status = 'waiting'; orchestration.status = 'waiting'; return; }
        session.requirementCoverage = refreshRequirementCoverage(session.requirements || [], plan.tasks, session.artifacts);
        const outcome = completeActionStep(session, plan, openStep); appendAgentEvent(session, 'action_completed', { stepId: openStep.id, summary: openStep.summary, progressed: outcome.progressed, coverage: session.requirementCoverage }); saveAgentSessionV2(session);
        if (outcome.stalled) { await stallOrchestrationForUser(session, run); return; }
        continue;
      }
      if ((orchestration.currentStep || 0) >= (orchestration.maxDecisionSteps || maxSteps)) { failOrchestrationAtBudget(session, plan); return; }
      const step = openStep?.status === 'deciding' ? openStep : createActionStep(session, plan); let decision: NextActionDecision;
      try { decision = await requestNextAction(session, plan, step.index, run); }
      catch (error) {
        step.decisionCorrectionCount = (step.decisionCorrectionCount || 0) + 1;
        appendAgentEvent(session, 'decision_correction_requested', { stepId: step.id, attempt: step.decisionCorrectionCount, retrying: step.decisionCorrectionCount < 3, summary: '下一步行动格式或需求映射不完整，正在依据合法需求重新修正', error: planningErrorMessage(error) });
        if (step.decisionCorrectionCount < 3) { step.status = 'deciding'; saveAgentSessionV2(session); continue; }
        throw new Error(`协调器连续无法生成合法下一步行动：${planningErrorMessage(error)}`);
      }
      if (decision.action === 'ask_user') {
        const state = await checkCurrentProjectState(session, run, 'before_question');
        appendAgentEvent(session, 'question_reconsideration_started', { stepId: step.id, candidateQuestions: decision.questions, stateFingerprint: state.fingerprint, message: '已读取最新项目状态，正在重新判断是否需要询问' });
        decision = await requestNextAction(session, plan, step.index, run, { candidateQuestions: decision.questions, state });
        appendAgentEvent(session, 'question_reconsideration_completed', { stepId: step.id, action: decision.action, avoidedQuestion: decision.action !== 'ask_user', message: decision.action === 'ask_user' ? '项目状态无法回答该问题，需要用户决定' : '已从项目状态获得所需信息，继续执行' });
      }
      step.action = decision.action; step.summary = decision.summary;
      if (decision.action === 'ask_user') {
        session.questions = (decision.questions || []).slice(0, 3).map((item) => ({ ...item, id: `paq_${randomUUID()}`, ...questionMetadata(session) })); step.status = 'waiting'; orchestration.status = 'waiting'; appendAgentEvent(session, 'question_requested', { stepId: step.id, questions: session.questions, reason: 'next_action' }); setAgentPhase(session, 'clarifying', { reason: 'next_action' }); return;
      }
      if (decision.action === 'abort') {
        step.status = 'failed'; step.completedAt = new Date().toISOString(); orchestration.status = 'failed'; const artifact = addAgentArtifact(session, { kind: 'summary', title: '智能体阻断报告', data: { reason: decision.reason, summary: decision.summary } }); appendAgentEvent(session, 'orchestration_failed', { reason: decision.reason || decision.summary }); setAgentPhase(session, 'failed', { reason: 'coordinator_abort', artifactId: artifact.id }); return;
      }
      if (decision.action === 'complete') {
        session.requirementCoverage = refreshRequirementCoverage(session.requirements || [], plan.tasks, session.artifacts); const blockers = completionBlockers(session, plan);
        if (blockers.length) { const observation = recordObservation(session, step, { id: `paobs_${step.index}_completion`, stepId: step.id, status: 'blocked', action: '检查完成条件', summary: `暂时不能完成：${blockers.join('；')}`, changes: [], evidence: [], unresolved: blockers, error: { category: 'validation', message: blockers.join('；'), retryable: true, suggestion: '根据缺口选择下一项实施或验证行动' }, createdAt: new Date().toISOString() }); appendAgentEvent(session, 'observation_recorded', { stepId: step.id, status: observation.status, action: observation.action, summary: observation.summary }); const outcome = completeActionStep(session, plan, step); if (outcome.stalled) { await stallOrchestrationForUser(session, run); return; } continue; }
        step.status = 'completed'; step.progressed = true; step.completedAt = new Date().toISOString(); orchestration.status = 'completed'; plan.status = 'executed'; const summary = decision.finalAnswer!; appendAgentEvent(session, 'orchestration_completed', { coverage: session.requirementCoverage }); setAgentPhase(session, 'completed'); addMessage(session, 'assistant', summary, 'completion'); appendAgentEvent(session, 'message_delta', { content: summary }); return;
      }
      const expandsRisk = decisionExpandsRisk(decision, session, plan);
      try {
        const previewPlan = { ...plan, tasks: structuredClone(plan.tasks) }; const previewStep = structuredClone(step);
        prepareAssignments(decision, previewStep, previewPlan, bundle.budget.maxAttempts, (prepared, allTasks) => { validatePlannerTaskRoleBoundaries(prepared); validateTaskGraph(allTasks); });
      } catch (error) {
        step.decisionCorrectionCount = (step.decisionCorrectionCount || 0) + 1; step.status = 'deciding'; step.action = undefined; step.taskIds = [];
        appendAgentEvent(session, 'decision_correction_requested', { stepId: step.id, attempt: step.decisionCorrectionCount, retrying: step.decisionCorrectionCount < 3, summary: '当前行动与未解决工作或写入顺序冲突，正在重新选择修复行动', error: planningErrorMessage(error) });
        if (step.decisionCorrectionCount < 3) { saveAgentSessionV2(session); continue; }
        throw new Error(`协调器连续生成不可执行行动：${planningErrorMessage(error)}`);
      }
      const targetPlan = expandsRisk ? recoveryRevision(session, plan, '下一步行动扩大了已确认风险边界') : plan;
      const selected = prepareAssignments(decision, step, targetPlan, bundle.budget.maxAttempts, (prepared, allTasks) => { validatePlannerTaskRoleBoundaries(prepared); validateTaskGraph(allTasks); }); step.status = expandsRisk ? 'waiting' : 'running'; appendAgentEvent(session, 'action_started', { stepId: step.id, summary: step.summary, assignments: selected.map((task) => ({ role: task.role, title: task.title, access: task.access })) });
      for (const helper of selected.filter((task) => task.assistsTaskId)) { const blocked = targetPlan.tasks.find((task) => task.id === helper.assistsTaskId); if (blocked) appendAgentEvent(session, 'expert_assistance_assigned', { taskId: blocked.id, role: blocked.role, action: blocked.title, helperTaskId: helper.id, helperRole: helper.role, helperAction: helper.title, summary: `已请${roleTitles[helper.role]}先解决当前阻断` }); }
      if (expandsRisk) { targetPlan.status = 'pending'; targetPlan.approvalRequired = true; targetPlan.automaticRevision = false; targetPlan.confirmedAt = undefined; orchestration.status = 'waiting'; appendAgentEvent(session, 'task_graph_revised', { automatic: false, reason: targetPlan.revisionReason }); setAgentPhase(session, 'awaiting_plan_approval', { reason: 'action_risk_expansion', planId: targetPlan.id }); saveAgentSessionV2(session); return; }
      saveAgentSessionV2(session);
    }
  } catch (error) { const step = session.steps?.at(-1); if (step && ['deciding', 'running'].includes(step.status)) { step.status = 'failed'; step.completedAt = new Date().toISOString(); } if (session.orchestration) session.orchestration.status = 'failed'; setAgentPhase(session, 'failed', { error: error instanceof Error ? error.message : String(error) }); }
  finally { clearInterval(heartbeat); await releaseAgentLease(session.id); }
}

// ─── Local helper: recovery revision ──────────────────────────────────────────

function recoveryRevision(session: AgentSessionV2, source: AgentPlanRevision, reason: string) {
  const next = structuredClone(source); source.status = 'superseded';
  next.id = `pap2_${randomUUID()}`; next.turnId = session.turnId || source.turnId; next.revision = Math.max(...session.plans.map((plan) => plan.revision), 0) + 1; next.parentPlanId = source.id; next.revisionReason = reason;
  next.automaticRevision = true; next.approvalRequired = false; next.status = 'confirmed'; next.createdAt = new Date().toISOString(); next.confirmedAt = next.createdAt;
  session.plans.push(next); session.activePlanId = next.id; return next;
}

function checkCurrentProjectState(session: AgentSessionV2, run: RunContext, reason: ProjectStateCheckReason): Promise<ProjectStateCheckSummary> {
  return checkProjectState(session, run, reason);
}
