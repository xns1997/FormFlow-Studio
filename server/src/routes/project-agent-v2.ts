import { createHash, randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { env } from '../config/env';
import { canAccessProject } from '../services/permission';
import { readProjectPackage } from '../services/project-package-store';
import { executeLlmTool, listFormFlowTools } from '../services/llm-tools';
import { getFormFlowTool, isMcpRole, type McpRole } from '../services/formflow-tool-registry';
import { llmManagement } from '../services/llm-management';
import { isRetryableLlmRpcError, llmProviderClient, type LlmMessage } from '../services/llm-provider-client';
import { isStructuredPlanningError, PLANNING_MAX_ATTEMPTS, planningRepairInstruction, validatePlannerTaskRoleBoundaries } from '../services/project-agent-v2-planning';
import { evaluateToolPolicy, shouldAutoApproveOperation } from '../services/project-agent-v2-policy';
import { compactAgentToolResult, compactToolObservation, toolFailureGuidance } from '../services/project-agent-v2-context';
import { applyRuntimeRevision, approvalRevisionChanged, nextRevisionConflictCount, projectChangedToolObservation, requiresProjectStateRead, revisionReadRequiredObservation } from '../services/project-agent-revision';
import { currentExpertRepairDecision } from '../services/project-agent-expert-repair';
import { buildExpertRegistry, buildSpecialistSystemPrompt, enabledExpertKnowledgePrompt, expertTeamKnowledgePrompt, suggestedExpertRole } from '../services/project-agent-expert-registry';
import { compileDataToolArguments, dataFailureFingerprint, hasRepeatedDataFailure } from '../services/data-tool-preflight';
import { compileBehaviorToolArguments } from '../services/behavior-tool-preflight';
import { compileToolArguments, parameterFailureFingerprint, toolContractSummary } from '../services/tool-argument-contract';
import { compactProjectStateCheck, createProjectStateCheckSummary, summarizeCheckedProject, type ProjectStateCheckReason, type ProjectStateCheckSummary } from '../services/project-agent-state-check';
import { insertQualityRemediationTasks, qualityDiagnosticFingerprint, replaceInvalidRemediationTask, shouldRunQualityGate, supersedeInvalidCrossRoleRepairs, type QualityDiagnostic } from '../services/project-agent-v2-remediation';
import { materializeAnalyzedRequirements, refreshRequirementCoverage } from '../services/project-agent-requirements';
import {
  completeActionStep, completionBlockers, createActionStep, decisionExpandsRisk, ensureActionState, goalContractReady, prepareAssignments, reconcileInterruptedActions,
  nextActionSchema, observationForTask, parseNextActionDecision, PROJECT_AGENT_ROLES, recordObservation, resumeActionWithUserInput, validateNextActionDecision,
} from '../services/project-agent-actions';
import {
  applyRecoveryPatch, classifyAgentFailure, ensureRecoveryState, isRecoverableFailure, recoveryPatchExpandsRisk, strategyKey,
  normalizeRecoveryPatch, resetRecoveryBudget, serializeProjectWrites, syncBlockedTasks, type AgentRecoveryPatch, type AgentFailureClass,
} from '../services/project-agent-v3-recovery';
import {
  acquireAgentLease, addAgentArtifact, appendAgentEvent, archiveAgentSessionV2, compactConversation, createAgentSessionV2, deleteAgentSessionV2,
  eventsAfter, findActiveProjectAgentSession, getAgentSessionV2, getCapabilityBundle, hasAgentLease, initializeProjectAgentV2Store, listAgentSessionHistory, listAgentSessionsV2, listCapabilityBundles,
  publishCapabilityBundle, releaseAgentLease, renewAgentLease, saveAgentSessionV2, saveCapabilityBundleDraft, setAgentPhase, subscribeAgentEvents,
  restoreAgentSessionV2, sessionProjectIds, setSessionProjectScope, updateAgentSessionMetadata, validateCapabilityBundle, validateTaskGraph, type AgentOrchestrationStep, type AgentPlanRevision, type AgentSessionV2, type AgentTaskNode, type CapabilityBundleVersion, type NextActionDecision, type ProjectAgentHistoryStatus,
} from '../services/project-agent-v2-store';

const router = Router();
router.use(async (_req, res, next) => { try { await initializeProjectAgentV2Store(); next(); } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : String(error) }); } });
const roleOrder: McpRole[] = ['project', 'data', 'form', 'workflow', 'behavior', 'quality', 'delivery'];
const roleTitles: Record<McpRole, string> = { project: '项目专家', data: '数据专家', form: '表单专家', workflow: '流程专家', behavior: '行为规则专家', quality: '质量专家', delivery: '交付专家' };

type RunContext = { tenantId: string; userId: string; user: AuthRequest['user']; requestId: string };
function requestId(req: AuthRequest) { return (req as AuthRequest & { requestId?: string }).requestId || `req_${randomUUID()}`; }
function scope(req: AuthRequest) { return { tenantId: (req as AuthRequest & { tenantId?: string }).tenantId || 'local', userId: req.user?.id || 'local', projectId: String(req.body?.projectId || req.query.projectId || '') || undefined }; }
function sessionListScope(req: AuthRequest) {
  const current = scope(req); const requested = String(req.query.scope || '');
  if (requested && !['unbound', 'all'].includes(requested)) throw new Error('会话查询 scope 无效');
  return { ...current, sessionScope: current.projectId ? 'project' as const : requested === 'all' ? 'all' as const : 'unbound' as const };
}
function context(req: AuthRequest): RunContext { const value = scope(req); return { tenantId: value.tenantId, userId: value.userId, user: req.user, requestId: requestId(req) }; }
function param(value: string | string[]) { return Array.isArray(value) ? value[0] : value; }
function errorResponse(res: Response, error: unknown, id: string) { const message = error instanceof Error ? error.message : String(error); res.status(/无权/.test(message) ? 403 : /不存在|不能为空|尚未|必须|无效|循环|依赖|发布/.test(message) ? 422 : 500).json({ error: message, requestId: id }); }
function sessionFor(req: AuthRequest) {
  const session = getAgentSessionV2(param(req.params.id)); if (!session) throw new Error('项目智能体 V2 会话不存在'); const current = scope(req);
  if (session.tenantId !== current.tenantId || session.userId !== current.userId) throw new Error('无权访问该项目智能体会话');
  for (const projectId of sessionProjectIds(session)) { const project = readProjectPackage(projectId); if (project && !canAccessProject(req.user, project, 'view')) throw new Error(`无权查看项目 ${projectId}`); }
  return session;
}
function requestedProjectIds(req: AuthRequest) { return Array.isArray(req.body?.projectIds) ? req.body.projectIds.map(String).map((id: string) => id.trim()).filter(Boolean) : []; }
function assertProjectScopeAccess(req: AuthRequest, projectIds: string[]) {
  for (const projectId of projectIds) { const project = readProjectPackage(projectId); if (!project) throw new Error(`项目 ${projectId} 不存在`); if (!canAccessProject(req.user, project, 'view')) throw new Error(`无权查看项目 ${projectId}`); }
}
function activePlan(session: AgentSessionV2) { return session.plans.find((plan) => plan.id === session.activePlanId); }
function addMessage(session: AgentSessionV2, role: 'user' | 'assistant', content: string, kind: NonNullable<AgentSessionV2['messages'][number]['kind']> = role === 'user' ? 'user' : 'assistant') { session.messages.push({ id: `pam2_${randomUUID()}`, role, content, createdAt: new Date().toISOString(), turnId: session.turnId, kind }); if (session.messages.length === 1) session.title = content.slice(0, 40); saveAgentSessionV2(session); }
function questionMetadata(session: AgentSessionV2) { return { turnId: session.turnId, createdAt: new Date().toISOString() }; }

async function chat(session: AgentSessionV2, run: RunContext, messages: LlmMessage[], responseSchema?: Record<string, unknown>, maxTokens = 8192) {
  const profile = llmManagement.resolveProfile(session.profileId, { tenantId: run.tenantId, projectId: session.projectId }); let lastError: unknown;
  for (const [index, route] of profile.routes.entries()) {
    try { return await llmProviderClient.chat({ connection: llmManagement.resolveConnection(route, { tenantId: run.tenantId, projectId: session.projectId }), messages, responseSchema, maxTokens, temperature: profile.defaults.temperature, requestId: run.requestId }); }
    catch (error) { lastError = error; if (!isRetryableLlmRpcError(error) || index === profile.routes.length - 1) throw error; }
  }
  throw lastError || new Error('没有可用模型路由');
}

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

async function checkCurrentProjectState(session: AgentSessionV2, run: RunContext, reason: ProjectStateCheckReason): Promise<ProjectStateCheckSummary> {
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
  return `你是 FormFlow 的需求分析师。你的工作是先理解用户的整段自然语言，再输出完整、去重、可验收的需求契约；不得按换行、标点、编号或句子边界机械拆分。应按业务意图聚合相关描述，一项需求必须是可独立验收的业务结果，不能是“业务规则如下”之类标题，也不能是调用 tools/list、使用稳定 ID、最终汇报等智能体执行指令。每项需求要选择主责领域，并给出 1–3 条具体、可观察的验收场景。删除、覆盖、级联或发布标为 high risk。信息不足且会实质改变方案时 action=ask，最多问 3 个问题；其他情况 action=contract。用户在修改需求或回答问题时，requirements 必须返回修订后的完整契约，不是增量补丁。\n本轮用户输入：${prompt}\n现有需求契约：${JSON.stringify(session.requirements || [])}\n项目只读检查：${JSON.stringify(grounding)}\n历史摘要：${session.conversationSummary || '无'}`;
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

const planningErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

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

function nextActionPrompt(session: AgentSessionV2, plan: AgentPlanRevision, stepIndex: number, questionReview?: { candidateQuestions: unknown; state: ProjectStateCheckSummary }) {
  const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!;
  const coordinator = bundle.agents.find((agent) => agent.role === 'coordinator');
  const toolOwnership = Object.fromEntries(PROJECT_AGENT_ROLES.map((role) => {
    const agent = bundle.agents.find((item) => item.role === role); const configured = agent?.tools || []; const mode = agent?.toolMode || (configured.length ? 'selected' : 'all');
    return [role, listFormFlowTools(role).filter((tool) => tool.name !== 'release.apply' && (mode === 'all' || configured.includes(tool.name))).map((tool) => ({ name: tool.name, risk: tool.risk }))];
  }));
  const requirements = (session.requirements || []).map((item) => ({ statement: item.statement, acceptance: item.acceptanceScenarios, risk: item.risk, status: item.capabilityStatus, evidenceCount: item.evidenceArtifactIds.length }));
  const observations = (session.observations || []).slice(-16).map((item) => ({ status: item.status, action: item.action, summary: item.summary, changes: item.changes, evidence: item.evidence, unresolved: item.unresolved, error: item.error }));
  const recentUserContext = session.messages.filter((item) => item.role === 'user').slice(-4).map((item) => item.content);
  const failures = plan.tasks.filter((task) => ['failed', 'blocked'].includes(task.status)).map((task) => ({ expert: task.role, action: task.title, error: task.error, category: task.failureClass, assistance: task.assistance ? { status: task.assistance.status, reason: task.assistance.reason, triedExperts: task.assistance.triedRoles } : undefined }));
  const assistance = plan.tasks.filter((task) => task.status === 'blocked' && task.assistance?.status === 'needed').map((task) => ({ blockedExpert: task.role, blockedAction: task.title, reason: task.assistance!.reason, preferredHelper: task.assistance!.requestedRole, triedExperts: task.assistance!.triedRoles, requirements: (task.requirementIds || []).map((id) => session.requirements?.find((item) => item.id === id)?.statement).filter(Boolean) }));
  return `你是 FormFlow 项目智能体的下一步行动协调器。根据当前真实状态选择此刻最有价值且可立即执行的行动，不要预先展开完整任务图，也不要为无事可做的专家返回 skip。action=assign 时返回一个有序 assignments 数组：可以同时分配最多 ${bundle.budget.maxParallelReads} 个互不依赖的只读任务；只要包含写任务就必须只有一个 assignment。每个任务映射现有需求并给出可观察验收证据；assignments.requirements 必须复制“需求状态”中的需求 statement，不得返回内部 ID。存在失败或阻断时，必须先调查、修复、协助或替代该项，不能跳去执行无关写入。删除操作可以规划，但运行时一定会展示影响并等待用户审批。如果存在“待专家协助”，必须优先选择一位尚未尝试且能解决根因的其他专家；preferredHelper 可用且尚未尝试时优先选择它。只分配解决阻断所需的最小协助任务，并在 assignment 中用 assistsExpert 和 assistsAction 原样复制 blockedExpert 与 blockedAction；协助完成后运行时会自动让原专家继续。质量检查只交给 quality，交付预检只交给 delivery，领域写入交给对应专家。不得新增需求、扩大项目范围、调用 release.apply 或用静态占位结果冒充证据。ask_user 是最后手段：能从项目状态、工具读取、现有目标契约或确定性校验获得的信息不得询问用户。只有用户必须作出业务取舍、提供外部秘密或扩大已确认边界时才可提问；问题必须说明已检查到的事实和仍需用户决定的内容。不可恢复时 abort。只有全部需求获得有效证据、失败已处理、写入后的质量和交付门禁通过时才 complete，并给出面向用户的 finalAnswer。
确认目标：${plan.goal}
用户原始请求：${plan.request}
成功标准：${JSON.stringify(plan.successCriteria)}
目标范围与风险：${JSON.stringify({ summary: plan.summary, assumptions: plan.assumptions, risks: plan.risks })}
需求状态：${JSON.stringify(requirements)}
需求覆盖：${JSON.stringify(session.requirementCoverage)}
限定项目：${JSON.stringify(sessionProjectIds(session))}
最近行动观察：${JSON.stringify(compactAgentToolResult(observations, 24_000))}
最近用户补充：${JSON.stringify(recentUserContext)}
当前未处理失败：${JSON.stringify(failures)}
待专家协助：${JSON.stringify(assistance)}
工具归属：${JSON.stringify(toolOwnership)}
剩余决策步数：${Math.max(0, (bundle.budget.maxDecisionSteps ?? bundle.budget.maxLoopRounds ?? 24) - stepIndex + 1)}
${questionReview ? `提问复核：你刚才准备向用户提问。运行时已按固定流程重新检查项目，请先用下列轻量摘要回答候选问题。能够自行确定时必须改为 assign 或 complete；只有摘要和可用工具仍无法解决且确需用户业务决定时才再次 ask_user。\n候选问题：${JSON.stringify(questionReview.candidateQuestions)}\n最新项目检查摘要：${JSON.stringify(compactProjectStateCheck(questionReview.state))}\n` : ''}能力包指令：${coordinator?.instructions || '无'}${enabledExpertKnowledgePrompt(coordinator)}${expertTeamKnowledgePrompt(bundle, 'coordinator')}`;
}

async function requestNextAction(session: AgentSessionV2, plan: AgentPlanRevision, stepIndex: number, run: RunContext, questionReview?: { candidateQuestions: unknown; state: ProjectStateCheckSummary }): Promise<NextActionDecision> {
  const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!;
  const base: LlmMessage[] = [{ role: 'system', content: nextActionPrompt(session, plan, stepIndex, questionReview) }]; let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    appendAgentEvent(session, 'decision_started', { step: stepIndex, attempt });
    try {
      const messages = attempt === 1 ? base : [{ role: 'system' as const, content: '修复上一份下一步决策：只输出符合 Schema 的单个 JSON 对象。assign 只能包含当前可执行任务；多个任务必须全部只读，写任务必须独占。' }, ...base];
      const response = await chat(session, run, messages, nextActionSchema(bundle.budget.maxParallelReads, (session.requirements || []).map((item) => item.statement)), 12_000);
      const raw: any = response.structured || (() => { try { return JSON.parse((response.content || '').replace(/^```json\s*|\s*```$/g, '')); } catch { return undefined; } })();
      const result = validateNextActionDecision(parseNextActionDecision(raw, bundle.budget.maxParallelReads), session);
      appendAgentEvent(session, 'action_selected', { step: stepIndex, action: result.action, summary: result.summary, assignments: result.assignments.map((item) => ({ role: item.role, title: item.title, access: item.access })) }); return result;
    } catch (error) { lastError = error; appendAgentEvent(session, 'decision_failed', { step: stepIndex, attempt, retrying: attempt < 2, error: planningErrorMessage(error) }); }
  }
  throw lastError || new Error('下一步协调器未返回合法决策');
}

function recoverySchema() {
  return { type: 'object', required: ['action', 'diagnosis', 'strategy'], properties: {
    action: { enum: ['retry', 'append_tasks', 'replace_pending', 'ask_user', 'abort'] }, diagnosis: { type: 'string' }, strategy: { type: 'string' }, reason: { type: 'string' }, cancelTaskIds: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', maxItems: 3, items: { type: 'object', required: ['header', 'question', 'kind'], properties: { header: { type: 'string' }, question: { type: 'string' }, kind: { enum: ['choice', 'text'] }, options: { type: 'array', items: { type: 'object', required: ['label'], properties: { label: { type: 'string' }, description: { type: 'string' } } } } } } },
    tasks: { type: 'array', maxItems: 24, items: { type: 'object', required: ['role', 'title', 'instruction', 'access', 'acceptance'], properties: { id: { type: 'string' }, role: { enum: roleOrder }, title: { type: 'string' }, instruction: { type: 'string' }, access: { enum: ['read', 'write'] }, dependsOn: { type: 'array', items: { type: 'string' } }, acceptance: { type: 'array', items: { type: 'string' } }, strategyKey: { type: 'string' }, requirementIds: { type: 'array', items: { type: 'string' } }, evidenceKinds: { type: 'array', items: { type: 'string' } }, verificationScenarioIds: { type: 'array', items: { type: 'string' } } } } },
  } };
}

async function requestRecoveryPatch(session: AgentSessionV2, task: AgentTaskNode, failureClass: AgentFailureClass, run: RunContext, questionReview?: { candidateQuestions: unknown; state: ProjectStateCheckSummary }): Promise<AgentRecoveryPatch> {
  const state = ensureRecoveryState(session); const plan = activePlan(session)!;
  const evidence = session.events.filter((event) => event.data?.taskId === task.id).slice(-30).map((event) => ({ seq: event.seq, type: event.type, data: event.data }));
  const requestedTools = [...new Set(evidence.map((event) => event.data?.tool_name || event.data?.toolName || event.data?.name).filter(Boolean).map(String))];
  const toolOwnership = requestedTools.map((name) => { const definition = getFormFlowTool(name); return { name, ownerRole: definition?.ownerRole, risk: definition?.risk, available: Boolean(definition) }; });
  const tried = Object.entries(state.strategies).filter(([, count]) => count > 0).map(([key, count]) => ({ key, count }));
  const prompt = `你是 FormFlow 根智能体的 recovery planner。目标不是解释失败，而是在已确认目标内生成能继续推进的最小任务图补丁。新任务必须继承失败任务的 requirementIds 和场景验收，修复后验证原需求而不是只验证诊断消失。不得修改或取消 passed 任务。retry 仅用于同策略尚未达到 ${task.maxAttempts} 次的情况；达到上限必须 append_tasks 或 replace_pending 并更换角色、工具顺序、前置读取或任务拆分。工具越权必须改由工具所属角色执行。质量诊断必须拆成“领域专家 write 修复 → quality 独立复检”：表单/按钮/控件由 form，数据由 data，流程由 workflow，规则由 behavior，发布预检由 delivery。ask_user 是最后手段，能通过项目读取或其他专家解决时必须继续恢复；只有用户必须作出业务取舍、提供外部秘密或扩大范围时才提问。权限不足或用户拒绝时 abort。不得规划 release.apply。本轮新任务最多 ${state.maxDynamicTasks} 个。\n计划目标：${plan.goal}\n成功标准：${plan.successCriteria.join('；')}\n失败任务：${JSON.stringify({ role: task.role, title: task.title, instruction: task.instruction, access: task.access, acceptance: task.acceptance, attempt: task.attempt, maxAttempts: task.maxAttempts, error: task.error })}\n失败分类：${failureClass}\n相关工具归属：${JSON.stringify(toolOwnership)}\n已尝试策略：${JSON.stringify(tried)}\n相关事件摘要：${JSON.stringify(compactAgentToolResult(evidence, 8_000))}\n当前项目：${session.projectId || '无'}${questionReview ? `\n提问复核：运行时已重新检查项目。先用摘要解决候选问题；仍需用户作出业务决定时才再次 ask_user。\n候选问题：${JSON.stringify(questionReview.candidateQuestions)}\n最新项目检查摘要：${JSON.stringify(compactProjectStateCheck(questionReview.state))}` : ''}`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await chat(session, run, [{ role: 'system', content: prompt }, ...(attempt > 1 ? [{ role: 'user' as const, content: '上一次恢复补丁无效。只输出符合 Schema 的完整 JSON，并确保任务角色边界、依赖和策略均可执行。' }] : [])], recoverySchema(), 8192);
      const value: any = response.structured || (() => { try { return JSON.parse(response.content || ''); } catch { return undefined; } })();
      if (!value || !['retry', 'append_tasks', 'replace_pending', 'ask_user', 'abort'].includes(value.action)) throw new Error('恢复规划模型未返回有效补丁');
      if (['append_tasks', 'replace_pending'].includes(value.action) && !Array.isArray(value.tasks)) throw new Error('恢复补丁缺少动态任务');
      if (Array.isArray(value.tasks)) validatePlannerTaskRoleBoundaries(value.tasks);
      return value as AgentRecoveryPatch;
    } catch (error) { lastError = error; appendAgentEvent(session, 'recovery_planning_attempt_failed', { taskId: task.id, attempt, error: planningErrorMessage(error) }); }
  }
  throw lastError || new Error('恢复规划失败');
}

async function planTurn(session: AgentSessionV2, prompt: string, run: RunContext) {
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

function failPlanningTurn(session: AgentSessionV2, error: unknown) {
  const message = planningErrorMessage(error); const retryable = isStructuredPlanningError(error);
  appendAgentEvent(session, 'turn_failed', { turnId: session.turnId, stage: 'planning', error: message, retryable });
  setAgentPhase(session, 'failed', { stage: 'planning', error: message, retryable });
}

function allowedTools(session: AgentSessionV2, task: AgentTaskNode) {
  const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!; const agent = bundle.agents.find((item) => item.role === task.role); const configured = agent?.tools || []; const toolMode = agent?.toolMode || (configured.length ? 'selected' : 'all');
  return listFormFlowTools(task.role).filter((tool) => tool.name !== 'release.apply' && (task.access === 'write' || tool.risk === 'read') && (toolMode === 'all' || configured.includes(tool.name)));
}

function stableOperationKey(session: AgentSessionV2, task: AgentTaskNode, name: string, args: Record<string, any>) {
  const normalized = Object.fromEntries(Object.entries(args).filter(([key]) => !['baseRevision', 'confirmationToken', 'idempotencyKey'].includes(key)).sort(([a], [b]) => a.localeCompare(b)));
  return `pa2_${createHash('sha256').update(`${session.id}:${task.id}:${name}:${JSON.stringify(normalized)}`).digest('hex').slice(0, 32)}`;
}

function taskProjectRevision(session: AgentSessionV2, projectId?: string) {
  if (!projectId) return undefined;
  return session.projectRevisions?.[projectId] || (projectId === session.projectId ? session.checkpointRevision : undefined);
}

function prepareToolArguments(session: AgentSessionV2, task: AgentTaskNode, name: string, original: Record<string, any>) {
  const definition = getFormFlowTool(name); const schema = (definition?.inputSchema || { type: 'object' }) as Record<string, any>; const properties = schema.properties || {}; const args = { ...original };
  const allowedProjectIds = sessionProjectIds(session); const targetProjectId = String(args.projectId || task.projectId || session.projectId || '');
  if (properties.projectId) {
    if (!targetProjectId && allowedProjectIds.length > 1) throw new Error('任务必须明确指定限定范围内的 projectId');
    if (targetProjectId && allowedProjectIds.length && !allowedProjectIds.includes(targetProjectId)) throw new Error(`项目 ${targetProjectId} 不在当前会话限定范围内`);
    if (targetProjectId) args.projectId = targetProjectId;
  }
  const revision = properties.baseRevision ? applyRuntimeRevision(args, taskProjectRevision(session, targetProjectId)) : { arguments: args, replaced: false, previousRevision: undefined };
  Object.assign(args, revision.arguments);
  if (properties.idempotencyKey) args.idempotencyKey = 'runtime-managed';
  const generic = compileToolArguments(name, args, schema);
  if (!generic.ok) return { args: generic.arguments, preflight: generic, revision: { replaced: revision.replaced, previousRevision: revision.previousRevision, currentRevision: revision.arguments.baseRevision } };
  const dataPreflight = compileDataToolArguments(name, generic.arguments); const domainPreflight = dataPreflight.ok ? compileBehaviorToolArguments(name, dataPreflight.arguments) : dataPreflight;
  if (!domainPreflight.ok) return { args: domainPreflight.arguments, preflight: { ...domainPreflight, normalizations: [...generic.normalizations, ...domainPreflight.normalizations] }, revision: { replaced: revision.replaced, previousRevision: revision.previousRevision, currentRevision: revision.arguments.baseRevision } };
  if (properties.idempotencyKey) domainPreflight.arguments.idempotencyKey = stableOperationKey(session, task, name, domainPreflight.arguments);
  const finalContract = compileToolArguments(name, domainPreflight.arguments, schema);
  const preflight = { ...finalContract, normalizations: [...generic.normalizations, ...domainPreflight.normalizations, ...finalContract.normalizations] };
  return { args: finalContract.arguments, preflight, revision: { replaced: revision.replaced, previousRevision: revision.previousRevision, currentRevision: revision.arguments.baseRevision } };
}

function specialistContext(session: AgentSessionV2, task: AgentTaskNode) {
  const plan = activePlan(session)!; const dependencies = plan.tasks.filter((item) => task.dependsOn.includes(item.id)).map((item) => ({ title: item.title, result: item.output, evidence: item.evidenceArtifactIds.map((id) => session.artifacts.find((artifact) => artifact.id === id)?.title).filter(Boolean) }));
  const projectId = task.projectId || session.projectId;
  return `能力包版本：${session.capabilityBundleVersionId}\n计划目标：${plan.goal}\n成功标准：${plan.successCriteria.join('；')}\n当前任务：${task.instruction}\n验收标准：${task.acceptance.join('；')}\n上次失败：${task.error || '无'}\n任务项目：${projectId || '尚未创建'}\n限定项目：${sessionProjectIds(session).join('、') || '无'}\n当前 revision：${projectId ? session.projectRevisions?.[projectId] || session.checkpointRevision || '无' : '无'}\n依赖产物：${JSON.stringify(dependencies)}\n对话摘要：${session.conversationSummary || '无'}`;
}

async function refreshRevision(session: AgentSessionV2, run: RunContext, role: McpRole, projectId = session.projectId) {
  if (!projectId) return undefined;
  const loaded: any = await executeLlmTool('project.get', { projectId }, { ...run, projectId, mcpRole: role }); if (loaded.ok) { (session.projectRevisions ||= {})[projectId] = loaded.data.revision; if (projectId === session.projectId) session.checkpointRevision = loaded.data.revision; saveAgentSessionV2(session); }
  return loaded;
}

async function verifyTask(session: AgentSessionV2, task: AgentTaskNode, run: RunContext) {
  const projectId = task.projectId || session.projectId;
  if (!projectId) {
    const deleted = [...session.events].reverse().find((event) => event.type === 'tool_completed' && event.data?.taskId === task.id && event.data?.toolName === 'project.delete' && event.data?.result?.ok);
    const successfulTools = session.events.filter((event) => event.type === 'tool_completed' && event.data?.taskId === task.id && event.data?.result?.ok);
    if (!deleted && !successfulTools.length) throw new Error(`${roleTitles[task.role]}没有产生可验证的工具结果或项目 ID`);
    const artifact = addAgentArtifact(session, { taskId: task.id, kind: 'verification', title: deleted ? `${task.title}删除验收` : `${task.title}无项目操作验收`, data: { deleted: Boolean(deleted), acceptance: task.acceptance, toolEvidence: successfulTools.map((event) => ({ seq: event.seq, toolName: event.data?.toolName, result: event.data?.result })) } }); task.evidenceArtifactIds.push(artifact.id); appendAgentEvent(session, 'verification_completed', { taskId: task.id, artifactId: artifact.id, deleted: Boolean(deleted) }); return;
  }
  const dataVerification: Array<{ tableId: string; sheetName: string; keyFields: string[]; valid: boolean }> = [];
  if (task.role === 'data') {
    const writes = session.events.filter((event) => event.type === 'tool_completed' && event.data?.taskId === task.id && ['data_source.create', 'data_source.import'].includes(event.data?.toolName) && event.data?.result?.ok && event.data?.resource?.tableId);
    for (const event of writes) {
      const tableId = String(event.data.resource.tableId); const sheetName = String(event.data.resource.sheetName || 'Sheet1'); const keyFields = Array.isArray(event.data.resource.keyFields) ? event.data.resource.keyFields.map(String) : [];
      const source: any = await executeLlmTool('data_source.get', { projectId, id: tableId }, { ...run, projectId, mcpRole: 'data' });
      if (!source.ok) throw new Error(`数据源创建后读取失败：${source.error?.message || tableId}`);
      const keys: any = await executeLlmTool('data_keys.validate', { projectId, tableId, sheetName, ...(keyFields.length ? { keyFields } : {}) }, { ...run, projectId, mcpRole: 'data' });
      if (!keys.ok || keys.data?.valid === false) throw new Error(`数据源主键验收失败：${keys.error?.message || JSON.stringify(keys.data?.errors || [])}`);
      dataVerification.push({ tableId, sheetName, keyFields: keys.data?.keyFields || keyFields, valid: true }); appendAgentEvent(session, 'data_verification_completed', { taskId: task.id, tableId, sheetName, keyFields: keys.data?.keyFields || keyFields });
    }
  }
  if (task.role === 'behavior') {
    const writes = session.events.filter((event) => event.type === 'tool_completed' && event.data?.taskId === task.id && event.data?.result?.ok && event.data?.resource?.kind && ['rule_code', 'behavior'].includes(event.data.resource.kind));
    if (task.access === 'write' && !writes.length) throw new Error('行为规则写任务没有产生可验证的 rule_code.update 或 behavior.upsert 工具结果');
    for (const event of writes) {
      const resource = event.data.resource;
      if (resource.kind === 'rule_code') {
        const lint: any = await executeLlmTool('rule_syntax.lint', { projectId, formId: resource.formId, code: resource.code }, { ...run, projectId, mcpRole: 'behavior' });
        const errors = lint.data?.diagnostics?.filter((item: any) => item.severity === 'error') || [];
        if (!lint.ok || errors.length) throw new Error(`规则写入后语法复检失败：${lint.error?.message || errors.map((item: any) => item.code).join('、')}`);
        const test: any = await executeLlmTool('rule_test.run', { projectId, formId: resource.formId, code: resource.code }, { ...run, projectId, mcpRole: 'behavior' });
        if (!test.ok || test.data?.passed === false) throw new Error(`规则写入后隔离测试失败：${test.error?.message || resource.formId}`);
        appendAgentEvent(session, 'behavior_verification_completed', { taskId: task.id, kind: 'rule_code', formId: resource.formId, rules: lint.data?.rules?.length || 0, scenarios: test.data?.scenarios || [] });
      } else {
        const listArgs = { projectId, scope: resource.scope, ...(resource.formId ? { formId: resource.formId } : {}), ...(resource.tableId ? { tableId: resource.tableId } : {}), ...(resource.sheetName ? { sheetName: resource.sheetName } : {}) };
        const listed: any = await executeLlmTool('behavior.list', listArgs, { ...run, projectId, mcpRole: 'behavior' });
        if (!listed.ok) throw new Error(`结构化行为写入后读取失败：${listed.error?.message || resource.id}`);
        const exists = (listed.data || []).some((item: any) => item.id === resource.id);
        if (resource.deleted ? exists : !exists) throw new Error(`结构化行为复检失败：${resource.id}${resource.deleted ? '仍然存在' : '不存在'}`);
        appendAgentEvent(session, 'behavior_verification_completed', { taskId: task.id, kind: resource.deleted ? 'behavior_delete' : 'behavior', scope: resource.scope, id: resource.id });
      }
    }
  }
  const finalQualityGate = shouldRunQualityGate(task);
  const validation: any = await executeLlmTool('project.validate', { projectId }, { ...run, projectId, mcpRole: task.role });
  if (!validation.ok || validation.data?.valid === false) {
    const diagnostics: QualityDiagnostic[] = (validation.data?.errors || []).map((item: any) => ({ severity: 'error', code: item.code || 'PROJECT_VALIDATION_FAILED', path: item.path || 'project', message: item.message || '项目结构校验失败' }));
    if (validation.data?.semantic?.valid === false) appendAgentEvent(session, 'semantic_gate_failed', { taskId: task.id, diagnostics: validation.data.semantic.errors, projectId, revision: session.projectRevisions?.[projectId] });
    if (finalQualityGate && diagnostics.length) {
      const artifact = addAgentArtifact(session, { taskId: task.id, kind: 'verification', title: `${task.title}结构诊断`, data: { projectId, validation: validation.data, revision: session.projectRevisions?.[projectId] } });
      appendAgentEvent(session, 'quality_gate_failed', { taskId: task.id, artifactId: artifact.id, stage: 'project.validate', diagnostics });
      throw new QualityGateFailure(`${roleTitles[task.role]}结构门禁未通过`, diagnostics, artifact.id);
    }
    throw new Error(`任务验收失败：${validation.error?.message || `${validation.data?.errors?.length || 0} 个结构错误`}`);
  }
  if (task.remediation) {
    const inspection: any = await executeLlmTool('project.quality.inspect', { projectId }, { ...run, projectId, mcpRole: 'quality' });
    if (!inspection.ok) throw new RemediationVerificationFailure(`修复复检失败：${inspection.error?.message || '质量门禁不可用'}`, task.remediation.diagnostics);
    const expected = new Set(task.remediation.diagnosticFingerprints);
    const remaining = (inspection.data?.diagnostics || []).filter((item: QualityDiagnostic) => item.severity === 'error' && expected.has(qualityDiagnosticFingerprint(item)));
    const artifact = addAgentArtifact(session, { taskId: task.id, kind: 'verification', title: `${task.title}质量复检`, data: { projectId, repairedDiagnostics: task.remediation.diagnostics, remainingDiagnostics: remaining, inspection: inspection.data, revision: session.projectRevisions?.[projectId] } });
    if (remaining.length) {
      appendAgentEvent(session, 'remediation_verification_failed', { taskId: task.id, gateTaskId: task.remediation.gateTaskId, artifactId: artifact.id, remainingDiagnostics: remaining });
      throw new RemediationVerificationFailure(`自动修复未生效，仍有 ${remaining.length} 个原质量诊断，请按规范字段重新修正`, remaining, artifact.id);
    }
    task.evidenceArtifactIds.push(artifact.id);
    appendAgentEvent(session, 'remediation_verification_completed', { taskId: task.id, gateTaskId: task.remediation.gateTaskId, artifactId: artifact.id });
  }
  let gate: any;
  if (finalQualityGate) gate = await executeLlmTool('project.quality.inspect', { projectId }, { ...run, projectId, mcpRole: task.role });
  if (task.role === 'delivery') gate = await executeLlmTool('release.preview', { projectId }, { ...run, projectId, mcpRole: task.role });
  if (gate && (!gate.ok || gate.data?.ready === false)) {
    const artifact = addAgentArtifact(session, { taskId: task.id, kind: 'verification', title: `${task.title}门禁诊断`, data: { projectId, gate: gate.data, revision: session.projectRevisions?.[projectId] } });
    appendAgentEvent(session, 'quality_gate_failed', { taskId: task.id, artifactId: artifact.id, diagnostics: gate.data?.diagnostics || [], blockers: gate.data?.blockers || [] });
    throw new QualityGateFailure(`${roleTitles[task.role]}门禁未通过`, gate.data?.diagnostics || [], artifact.id);
  }
  const latestRun = gate?.data?.latestRun || gate?.data?.quality?.latestRun;
  for (const result of latestRun?.results || []) if (result.category === 'business' && result.passed === true) {
    const scenario = addAgentArtifact(session, { taskId: task.id, kind: 'scenario_result', title: `场景验证：${result.name || result.id}`, data: { projectId, requirementIds: task.requirementIds || [], scenarioId: result.id, assertion: result.assertion, passed: true, revision: session.projectRevisions?.[projectId] } });
    task.evidenceArtifactIds.push(scenario.id); appendAgentEvent(session, 'requirement_verified', { taskId: task.id, artifactId: scenario.id, requirementIds: task.requirementIds || [], scenarioId: result.id });
  }
  if (task.requirementIds?.length) {
    const coverageArtifact = addAgentArtifact(session, { taskId: task.id, kind: 'requirement_coverage', title: `${task.title}需求覆盖证据`, data: { projectId, requirementIds: task.requirementIds, evidenceKinds: task.evidenceKinds || [], verificationScenarioIds: task.verificationScenarioIds || [], validation: { structural: validation.data?.structural, references: validation.data?.references, semantic: validation.data?.semantic }, gate: gate?.data, revision: session.projectRevisions?.[projectId] } });
    task.evidenceArtifactIds.push(coverageArtifact.id);
  }
  const artifact = addAgentArtifact(session, { taskId: task.id, kind: 'verification', title: `${task.title}验收证据`, data: { projectId, acceptance: task.acceptance, dataVerification, validation: validation.data, gate: gate?.data, revision: session.projectRevisions?.[projectId] } }); task.evidenceArtifactIds.push(artifact.id); appendAgentEvent(session, 'verification_completed', { taskId: task.id, projectId, artifactId: artifact.id });
}

class QualityGateFailure extends Error {
  constructor(message: string, readonly diagnostics: QualityDiagnostic[], readonly artifactId: string) { super(message); }
}

class RemediationVerificationFailure extends Error {
  constructor(message: string, readonly diagnostics: QualityDiagnostic[], readonly artifactId?: string) { super(message); }
}

function recoveryRevision(session: AgentSessionV2, source: AgentPlanRevision, reason: string) {
  const next = structuredClone(source); source.status = 'superseded';
  next.id = `pap2_${randomUUID()}`; next.turnId = session.turnId || source.turnId; next.revision = Math.max(...session.plans.map((plan) => plan.revision), 0) + 1; next.parentPlanId = source.id; next.revisionReason = reason;
  next.automaticRevision = true; next.approvalRequired = false; next.status = 'confirmed'; next.createdAt = new Date().toISOString(); next.confirmedAt = next.createdAt;
  session.plans.push(next); session.activePlanId = next.id; return next;
}

function exhaustRecovery(session: AgentSessionV2, task: AgentTaskNode, reason: string) {
  const state = ensureRecoveryState(session); const plan = activePlan(session)!;
  const blocked = plan.tasks.filter((item) => ['failed', 'blocked'].includes(item.status)).map((item) => ({ id: item.id, title: item.title, status: item.status, failureClass: item.failureClass, error: item.error, blockedBy: item.blockedBy }));
  const artifact = addAgentArtifact(session, { taskId: task.id, kind: 'summary', title: '自动恢复阻断报告', data: { reason, recovery: state, blocked, strategies: state.strategies } });
  appendAgentEvent(session, 'recovery_exhausted', { taskId: task.id, reason, artifactId: artifact.id, cycles: state.cycles, maxCycles: state.maxCycles, dynamicTasks: state.dynamicTasks, maxDynamicTasks: state.maxDynamicTasks });
  setAgentPhase(session, 'failed', { reason: 'recovery_exhausted', artifactId: artifact.id });
}

function pauseRecoveryForUser(session: AgentSessionV2, task: AgentTaskNode, reason: string) {
  const artifact = addAgentArtifact(session, { taskId: task.id, kind: 'summary', title: '自动恢复需要用户处理', data: { reason, taskId: task.id, failureClass: task.failureClass, error: task.error } });
  appendAgentEvent(session, 'recovery_blocked', { taskId: task.id, reason, failureClass: task.failureClass, artifactId: artifact.id }); setAgentPhase(session, 'paused', { reason: 'recovery_requires_user', artifactId: artifact.id });
}

async function recoverFailedTask(session: AgentSessionV2, failedTaskId: string, run: RunContext): Promise<'continued' | 'waiting' | 'terminal'> {
  const source = activePlan(session); const failed = source?.tasks.find((task) => task.id === failedTaskId); if (!source || !failed) return 'terminal';
  const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!; const state = ensureRecoveryState(session, bundle.budget.maxRecoveryCycles ?? 6, bundle.budget.maxDynamicTasks ?? 24);
  const failureClass = failed.failureClass || classifyAgentFailure(failed.error || '专家任务失败'); failed.failureClass = failureClass; state.lastFailureTaskId = failed.id; state.lastFailureClass = failureClass;
  appendAgentEvent(session, 'failure_classified', { taskId: failed.id, failureClass, error: failed.error, attempt: failed.attempt });
  if (!isRecoverableFailure(failureClass)) { pauseRecoveryForUser(session, failed, failureClass === 'permission' ? '权限不足，需要用户授权后重试' : '用户拒绝了必要操作，请修改目标或明确新的处理方式'); return 'waiting'; }
  if (state.cycles >= state.maxCycles) { exhaustRecovery(session, failed, '已达到自动恢复周期上限'); return 'terminal'; }
  state.cycles += 1; setAgentPhase(session, 'recovering', { taskId: failed.id, failureClass, cycle: state.cycles }); appendAgentEvent(session, 'recovery_started', { taskId: failed.id, failureClass, cycle: state.cycles, maxCycles: state.maxCycles });

  const qualityFailure = [...session.events].reverse().find((event) => event.type === 'quality_gate_failed' && event.data?.taskId === failed.id && Array.isArray(event.data?.diagnostics) && event.data.diagnostics.length);
  const diagnosticStrategyKey = qualityFailure ? strategyKey(`diagnostic:${qualityFailure.data.diagnostics.map((item: QualityDiagnostic) => qualityDiagnosticFingerprint(item)).sort().join('|')}`) : undefined;
  if (qualityFailure && diagnosticStrategyKey && !state.strategies[diagnosticStrategyKey]) {
    state.strategies[diagnosticStrategyKey] = 1;
    const next = recoveryRevision(session, source, `质量诊断自动修复：${failed.id}`); const gate = next.tasks.find((task) => task.id === failed.id)!;
    appendAgentEvent(session, 'task_graph_patch_proposed', { action: 'append_tasks', taskId: failed.id, diagnosis: '质量门禁诊断', cycle: state.cycles });
    const repairs = insertQualityRemediationTasks(next, gate, qualityFailure.data.diagnostics, bundle.budget.maxAttempts, state.cycles);
    if (!repairs.length || repairs.length > state.maxDynamicTasks) { exhaustRecovery(session, failed, '质量诊断无法映射或本轮动态任务预算不足'); return 'terminal'; }
    for (const repair of repairs) { repair.origin = 'diagnostic'; repair.generation = (failed.generation || 0) + 1; repair.strategyKey ||= strategyKey(repair.instruction); }
    state.dynamicTasks += repairs.length; validateTaskGraph(next.tasks); appendAgentEvent(session, 'quality_remediation_scheduled', { gateTaskId: failed.id, round: state.cycles, artifactId: qualityFailure.data.artifactId, repairTasks: repairs.map((item) => ({ id: item.id, role: item.role, title: item.title })) }); appendAgentEvent(session, 'task_graph_revised', { planId: next.id, parentPlanId: source.id, automatic: true, reason: next.revisionReason, addedTaskIds: repairs.map((task) => task.id) });
    appendAgentEvent(session, 'recovery_budget_updated', { ...state }); saveAgentSessionV2(session); return 'continued';
  }
  if (qualityFailure && diagnosticStrategyKey) appendAgentEvent(session, 'strategy_rejected', { taskId: failed.id, cycle: state.cycles, strategyKey: diagnosticStrategyKey, reason: 'duplicate_quality_diagnostic_strategy', diagnostics: qualityFailure.data.diagnostics });

  if (failureClass === 'tool_scope' && failed.remediation) {
    const next = recoveryRevision(session, source, `纠正诊断修复任务角色边界：${failed.id}`);
    const replacement = replaceInvalidRemediationTask(next, failed.id, bundle.budget.maxAttempts, state.cycles);
    if (!replacement) { exhaustRecovery(session, failed, '无法重建诊断修复任务'); return 'terminal'; }
    const supersededLegacyTaskIds = supersedeInvalidCrossRoleRepairs(next, replacement.id);
    validatePlannerTaskRoleBoundaries([replacement]); validateTaskGraph(next.tasks); state.dynamicTasks += 1;
    appendAgentEvent(session, 'task_superseded', { taskId: failed.id, replacementTaskId: replacement.id, supersededLegacyTaskIds, reason: 'invalid_remediation_role_boundary' });
    appendAgentEvent(session, 'task_graph_revised', { planId: next.id, parentPlanId: source.id, automatic: true, reason: next.revisionReason, addedTaskIds: [replacement.id], supersededTaskId: failed.id });
    appendAgentEvent(session, 'strategy_changed', { taskId: failed.id, strategy: 'rebuild_domain_repair_without_quality_work', strategyKey: replacement.strategyKey, action: 'replace_pending' });
    appendAgentEvent(session, 'recovery_budget_updated', { ...state }); saveAgentSessionV2(session); return 'continued';
  }

  let patch: AgentRecoveryPatch;
  if (['transient', 'revision_conflict'].includes(failureClass) && failed.attempt < failed.maxAttempts) patch = { action: 'retry', diagnosis: failed.error || failureClass, strategy: failureClass === 'revision_conflict' ? 'refresh_revision_and_recompute' : 'retry_after_transient_failure' };
  else {
    try { patch = await requestRecoveryPatch(session, failed, failureClass, run); }
    catch (error) { exhaustRecovery(session, failed, `恢复规划失败：${planningErrorMessage(error)}`); return 'terminal'; }
  }
  if (patch.action === 'ask_user') {
    const projectState = await checkCurrentProjectState(session, run, 'recovery_question');
    appendAgentEvent(session, 'question_reconsideration_started', { candidateQuestions: patch.questions, stateFingerprint: projectState.fingerprint, reason: 'recovery', message: '已读取最新项目状态，正在重新判断是否需要询问' });
    try { patch = await requestRecoveryPatch(session, failed, failureClass, run, { candidateQuestions: patch.questions, state: projectState }); }
    catch (error) { exhaustRecovery(session, failed, `恢复提问复核失败：${planningErrorMessage(error)}`); return 'terminal'; }
    appendAgentEvent(session, 'question_reconsideration_completed', { action: patch.action, avoidedQuestion: patch.action !== 'ask_user', reason: 'recovery', message: patch.action === 'ask_user' ? '项目状态无法回答该问题，需要用户决定' : '已从项目状态获得所需信息，继续恢复' });
  }
  patch = normalizeRecoveryPatch(patch, failed.id); appendAgentEvent(session, 'task_graph_patch_proposed', { taskId: failed.id, cycle: state.cycles, patch });
  if (patch.action === 'ask_user') {
    session.questions = (patch.questions || []).slice(0, 3).map((item) => ({ ...item, id: `paq_${randomUUID()}`, ...questionMetadata(session) })); appendAgentEvent(session, 'question_requested', { questions: session.questions, reason: 'recovery' }); setAgentPhase(session, 'clarifying', { reason: 'recovery' }); return 'waiting';
  }
  if (patch.action === 'abort') { exhaustRecovery(session, failed, patch.reason || patch.diagnosis || '恢复规划判定不可继续'); return 'terminal'; }
  if (patch.action === 'retry' && failed.attempt >= failed.maxAttempts) { exhaustRecovery(session, failed, '同一任务策略已达到尝试上限，恢复规划未提供替代策略'); return 'terminal'; }
  let dynamicCount = patch.tasks?.length || 0; if (dynamicCount > state.maxDynamicTasks) { exhaustRecovery(session, failed, '已达到本轮动态任务上限'); return 'terminal'; }
  let key = strategyKey(patch.strategy || patch.diagnosis); let used = state.strategies[key] || 0;
  if (used >= 1 && patch.action !== 'retry') {
    appendAgentEvent(session, 'strategy_rejected', { taskId: failed.id, cycle: state.cycles, strategy: patch.strategy, strategyKey: key, reason: 'duplicate_failed_strategy' });
    try { patch = await requestRecoveryPatch(session, failed, failureClass, run); }
    catch (error) { exhaustRecovery(session, failed, `更换重复策略失败：${planningErrorMessage(error)}`); return 'terminal'; }
    if (patch.action === 'ask_user') {
      const projectState = await checkCurrentProjectState(session, run, 'recovery_question');
      patch = await requestRecoveryPatch(session, failed, failureClass, run, { candidateQuestions: patch.questions, state: projectState });
      appendAgentEvent(session, 'question_reconsideration_completed', { action: patch.action, avoidedQuestion: patch.action !== 'ask_user', reason: 'recovery' });
    }
    patch = normalizeRecoveryPatch(patch, failed.id); appendAgentEvent(session, 'task_graph_patch_proposed', { taskId: failed.id, cycle: state.cycles, patch, replacesRejectedStrategyKey: key });
    if (patch.action === 'ask_user') {
      session.questions = (patch.questions || []).slice(0, 3).map((item) => ({ ...item, id: `paq_${randomUUID()}`, ...questionMetadata(session) })); appendAgentEvent(session, 'question_requested', { questions: session.questions, reason: 'recovery' }); setAgentPhase(session, 'clarifying', { reason: 'recovery' }); return 'waiting';
    }
    if (patch.action === 'abort') { exhaustRecovery(session, failed, patch.reason || patch.diagnosis || '恢复规划判定不可继续'); return 'terminal'; }
    if (patch.action === 'retry' && failed.attempt >= failed.maxAttempts) { exhaustRecovery(session, failed, '同一任务策略已达到尝试上限，恢复规划未提供替代策略'); return 'terminal'; }
    dynamicCount = patch.tasks?.length || 0; if (dynamicCount > state.maxDynamicTasks) { exhaustRecovery(session, failed, '已达到本轮动态任务上限'); return 'terminal'; }
    key = strategyKey(patch.strategy || patch.diagnosis); used = state.strategies[key] || 0;
    if (used >= 1 && patch.action !== 'retry') { exhaustRecovery(session, failed, '恢复规划在明确要求换策略后仍重复已失败方案'); return 'terminal'; }
  }
  state.strategies[key] = used + 1;
  const next = recoveryRevision(session, source, patch.diagnosis || `恢复任务 ${failed.id}`); const result = applyRecoveryPatch(next, failed.id, patch, state.cycles, bundle.budget.maxAttempts); state.dynamicTasks += result.created.length;
  validateTaskGraph(next.tasks); const expandsRisk = recoveryPatchExpandsRisk(source, patch);
  if (expandsRisk) { next.status = 'pending'; next.approvalRequired = true; next.automaticRevision = false; next.confirmedAt = undefined; setAgentPhase(session, 'awaiting_plan_approval', { reason: 'recovery_risk_expansion', planId: next.id }); }
  else { appendAgentEvent(session, 'task_graph_revised', { planId: next.id, parentPlanId: source.id, automatic: true, reason: next.revisionReason, addedTaskIds: result.created.map((task) => task.id), supersededTaskId: patch.action === 'replace_pending' ? failed.id : undefined }); }
  appendAgentEvent(session, 'strategy_changed', { taskId: failed.id, strategy: patch.strategy, strategyKey: key, action: patch.action }); appendAgentEvent(session, 'recovery_budget_updated', { ...state }); saveAgentSessionV2(session);
  return expandsRisk ? 'waiting' : 'continued';
}

class RevisionRecomputeBlocked extends Error {
  constructor() { super('项目持续被修改，已安全暂停当前操作'); this.name = 'RevisionRecomputeBlocked'; }
}

class ExpertAssistanceRequired extends Error {
  constructor(message: string) { super(message); this.name = 'ExpertAssistanceRequired'; }
}

function blockTaskForRevisionChanges(session: AgentSessionV2, task: AgentTaskNode) {
  task.status = 'blocked'; task.failureClass = 'revision_conflict'; task.error = '项目持续被修改，已安全暂停。请停止其他编辑后再继续。';
  session.questions = [{ id: `paq_${randomUUID()}`, ...questionMetadata(session), header: '项目正在变化', question: '项目在自动重新计算两次后仍被其他操作修改。请停止其他编辑后，再选择继续当前任务。', kind: 'text' }];
  appendAgentEvent(session, 'revision_recompute_blocked', { taskId: task.id, role: task.role, action: task.title, message: task.error });
  appendAgentEvent(session, 'question_requested', { questions: session.questions, reason: 'revision_changes_repeated' });
  if (session.orchestration) session.orchestration.status = 'waiting';
  setAgentPhase(session, 'clarifying', { reason: 'revision_changes_repeated' }); saveAgentSessionV2(session);
}

async function runSpecialist(session: AgentSessionV2, task: AgentTaskNode, run: RunContext, resume?: { runValue?: any; routeIndex?: number; revisionReadRequiredProjectId?: string; repairContext?: string }) {
  const tools = allowedTools(session, task); const modelTools = tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: `${tool.description}\n${toolContractSummary(tool.inputSchema as Record<string, any>)}`, parameters: tool.inputSchema } })); const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!;
  const definition = { entrypoint: task.role, max_steps: bundle.budget.maxToolSteps, max_tool_failures: bundle.budget.maxToolSteps, tools: tools.map((tool) => tool.name), nodes: [{ id: task.role, type: 'model', config: { tool_mode: 'auto', tools: modelTools } }, { id: 'end', type: 'end' }], edges: [{ source: task.role, target: 'end' }] };
  const profile = llmManagement.resolveProfile(bundle.agents.find((agent) => agent.role === task.role)?.profileId || session.profileId, { tenantId: run.tenantId, projectId: session.projectId }); let runValue = resume?.runValue; let routeIndex = resume?.routeIndex ?? 0; let connection: any;
  if (!runValue) {
    let lastError: unknown;
    const systemPrompt = buildSpecialistSystemPrompt({ bundle, role: task.role, runtimeContext: specialistContext(session, task), repairContext: resume?.repairContext });
    for (const [index, route] of profile.routes.entries()) { try { connection = llmManagement.resolveConnection(route, { tenantId: run.tenantId, projectId: session.projectId }); runValue = await llmProviderClient.startAgent(definition, { messages: [{ role: 'system', content: systemPrompt }] }, connection, run.requestId, run.tenantId, session.projectId); routeIndex = index; break; } catch (error) { lastError = error; if (!isRetryableLlmRpcError(error) || index === profile.routes.length - 1) throw error; } }
    if (!runValue) throw lastError || new Error('专家没有可用模型路由');
  } else connection = llmManagement.resolveConnection(profile.routes[routeIndex], { tenantId: run.tenantId, projectId: session.projectId });
  let processed = 0; let steps = 0; let referenceSearches = 0; let revisionReadRequiredProjectId = resume?.revisionReadRequiredProjectId; const parameterFailures = new Map<string, number>(); const parameterCorrectionPending = new Set<string>();
  while (runValue.status === 'waiting_tool' && steps < bundle.budget.maxToolSteps) {
    const fresh = (runValue.events || []).slice(processed); processed = runValue.events?.length || 0; for (const event of fresh) appendAgentEvent(session, event.type, { ...(event.data || {}), taskId: task.id, role: task.role });
    const call = [...(runValue.events || [])].reverse().find((event: any) => event.type === 'tool_call')?.data; if (!call) break;
    if (!tools.some((tool) => tool.name === call.name)) throw new Error(`工具 ${call.name} 不在任务能力范围内`);
    const prepared = prepareToolArguments(session, task, call.name, call.arguments || {}); const args = prepared.args; const definitionForCall = getFormFlowTool(call.name);
    const originalArguments = compactAgentToolResult(call.arguments || {}, 12_000);
    const normalizedArguments = compactAgentToolResult(args, 12_000);
    if (prepared.revision.replaced) appendAgentEvent(session, 'tool_arguments_normalized', { taskId: task.id, role: task.role, toolName: call.name, reason: 'runtime_revision', message: '已使用运行时管理的最新项目状态' });
    if (prepared.preflight.normalizations.length) appendAgentEvent(session, 'tool_arguments_normalized', { taskId: task.id, role: task.role, toolName: call.name, originalArguments, normalizedArguments, normalizations: prepared.preflight.normalizations });
    let result: any; let automaticallyApproved = false; const preflightFailed = !prepared.preflight.ok;
    const referenceBudgetExceeded = task.role === 'behavior' && call.name === 'rule_reference.search' && referenceSearches >= 1;
    const targetProjectId = String(args.projectId || task.projectId || session.projectId || '');
    const revisionReadMissing = requiresProjectStateRead(revisionReadRequiredProjectId, targetProjectId, definitionForCall?.risk);
    if (revisionReadMissing) {
      result = revisionReadRequiredObservation();
      appendAgentEvent(session, 'tool_rejected', { taskId: task.id, role: task.role, toolName: call.name, reason: 'revision_read_required', message: '项目状态变化后需要先重新读取目标资源' });
    } else if (referenceBudgetExceeded) {
      result = { ok: false, error: { code: 'RULE_REFERENCE_BUDGET_EXHAUSTED', message: '本任务已读取过权威规则参考，请使用已有参考和 lint 诊断继续，不要换关键词重复搜索', retryable: false }, meta: { requestId: run.requestId } };
      appendAgentEvent(session, 'tool_rejected', { taskId: task.id, role: task.role, toolName: call.name, error: result.error, reason: 'reference_search_budget' });
    } else if (preflightFailed) {
      const preflightError = prepared.preflight.error || { code: 'TOOL_PREFLIGHT_FAILED', message: '工具参数预检失败', path: undefined, suggestedArguments: undefined };
      result = { ok: false, error: { code: preflightError.code, message: preflightError.message, path: preflightError.path, details: preflightError, retryable: false }, meta: { requestId: run.requestId } };
      appendAgentEvent(session, 'tool_preflight_failed', { taskId: task.id, role: task.role, toolName: call.name, originalArguments, normalizedArguments, error: preflightError, suggestedArguments: preflightError.suggestedArguments, normalizations: prepared.preflight.normalizations });
    }
    else { if (task.role === 'behavior' && call.name === 'rule_reference.search') referenceSearches += 1; appendAgentEvent(session, 'tool_started', { taskId: task.id, role: task.role, toolName: call.name, projectId: args.projectId || task.projectId || session.projectId }); result = await executeLlmTool(call.name, args, { ...run, projectId: args.projectId || task.projectId || session.projectId, mcpRole: task.role }); }
    if (result.status === 'confirmation_required') {
      const policy = evaluateToolPolicy(call.name, activePlan(session)?.request || '', task);
      if (policy.level === 'forbidden' || policy.level === 'correctable') {
        const fingerprint = `${call.name}:${String(args.id || args.formId || args.tableId || args.workflowId || '')}:${policy.reason}`;
        task.policyCorrectionCount = task.policyCorrectionFingerprint === fingerprint ? (task.policyCorrectionCount || 0) + 1 : 1; task.policyCorrectionFingerprint = fingerprint;
        appendAgentEvent(session, 'task_investigating', { taskId: task.id, role: task.role, action: task.title, summary: '当前操作不符合已确认边界，专家正在调整处理方式' });
        appendAgentEvent(session, 'task_correction_requested', { taskId: task.id, role: task.role, action: task.title, toolName: call.name, reason: policy.reason, alternatives: policy.alternatives, repeated: task.policyCorrectionCount >= 2, summary: policy.userMessage });
        if (task.policyCorrectionCount >= 2) throw new ExpertAssistanceRequired(`${policy.userMessage} 当前专家连续两次选择了同一受限操作，需要其他专家协助更换实现方式。`);
        result = { ok: false, error: { code: policy.level === 'forbidden' ? 'TOOL_POLICY_FORBIDDEN' : 'TOOL_POLICY_CORRECTION_REQUIRED', message: policy.userMessage, retryable: true, details: { alternatives: policy.alternatives } }, meta: { requestId: run.requestId } };
      } else if (policy.level === 'allowed' && shouldAutoApproveOperation(env.mode)) {
        automaticallyApproved = true; appendAgentEvent(session, 'approval_decided', { taskId: task.id, toolName: call.name, approved: true, automatic: true, mode: 'local', impact: result.confirmation?.impact });
        result = await executeLlmTool(call.name, { ...args, confirmationToken: result.confirmation.token }, { ...run, projectId: args.projectId || task.projectId || session.projectId, mcpRole: task.role });
      }
    }
    const contextResult = compactAgentToolResult(result);
    const revisionRecoveryError = ['PROJECT_REVISION_CONFLICT', 'PROJECT_STATE_READ_REQUIRED'].includes(String(result.error?.code || ''));
    const parameterFailure = !result.ok && result.status !== 'confirmation_required' && /ARGUMENT|SCHEMA|VALIDATION|REQUIRED|UNKNOWN/.test(String(result.error?.code || '').toUpperCase());
    const parameterFingerprint = parameterFailure ? parameterFailureFingerprint(call.name, result.error, args) : undefined;
    const parameterFailureCount = parameterFingerprint ? (parameterFailures.get(parameterFingerprint) || 0) + 1 : 0;
    if (parameterFingerprint) { parameterFailures.set(parameterFingerprint, parameterFailureCount); parameterCorrectionPending.add(call.name); }
    const repeatedParameterFailure = parameterFailureCount > 1;
    const failureFingerprint = task.role === 'data' && !result.ok && result.status !== 'confirmation_required' && !revisionRecoveryError ? dataFailureFingerprint(call.name, result.error || {}, args) : undefined;
    const repeatedFailure = failureFingerprint ? hasRepeatedDataFailure(session.events, task.id, failureFingerprint.value) : false;
    const resource = task.role === 'data' && ['data_source.create', 'data_source.import'].includes(call.name) ? { tableId: String(args.id || ''), sheetName: String(args.sheetName || 'Sheet1'), keyFields: Array.isArray(args.config?.keyFields) ? args.config.keyFields.map(String) : [] }
      : task.role === 'behavior' && call.name === 'rule_code.update' ? { kind: 'rule_code', formId: String(args.formId || ''), code: String(args.code || '') }
        : task.role === 'behavior' && ['behavior.upsert', 'behavior.delete'].includes(call.name) ? { kind: 'behavior', scope: args.scope, id: String(args.behavior?.id || args.id || ''), formId: args.formId, tableId: args.tableId, sheetName: args.sheetName, deleted: call.name === 'behavior.delete' } : undefined;
    const revisionConflict = !result.ok && result.error?.code === 'PROJECT_REVISION_CONFLICT';
    const expertInvestigating = !result.ok && result.status !== 'confirmation_required' && !revisionRecoveryError;
    appendAgentEvent(session, 'tool_completed', { taskId: task.id, role: task.role, toolName: call.name, toolCallId: call.tool_call_id, result: contextResult, automaticallyApproved, preflightFailed, recoveringRevision: revisionConflict, expertInvestigating, failureFingerprint: failureFingerprint?.value, resource });
    if (result.ok && parameterCorrectionPending.delete(call.name)) appendAgentEvent(session, 'tool_parameter_correction_completed', { taskId: task.id, role: task.role, toolName: call.name, summary: '参数已纠正，工具执行成功' });
    if (parameterFailure) appendAgentEvent(session, 'tool_parameter_correction_requested', { taskId: task.id, role: task.role, toolName: call.name, path: result.error?.path, issues: result.error?.details?.issues, suggestedArguments: result.error?.details?.suggestedArguments, repeated: repeatedParameterFailure, summary: repeatedParameterFailure ? '相同参数结构再次失败，必须重新读取契约并更换参数结构' : '参数未通过校验，已生成精确纠正建议' });
    if (expertInvestigating) appendAgentEvent(session, 'expert_diagnosis_started', { taskId: task.id, role: task.role, action: task.title, toolName: call.name, summary: repeatedFailure || repeatedParameterFailure ? '相同方法再次失败，专家正在更换处理策略' : '当前操作未完成，专家正在分析原因和调整方案' });
    if (repeatedFailure && failureFingerprint) appendAgentEvent(session, 'tool_failure_repeated', { taskId: task.id, role: task.role, toolName: call.name, failureFingerprint, error: result.error, reason: 'same_tool_error_and_argument_shape', handledBy: 'current_expert' });
    const resultProjectId = String(args.projectId || result.meta?.projectId || task.projectId || session.projectId || '');
    if (result.meta?.revision && resultProjectId) { (session.projectRevisions ||= {})[resultProjectId] = result.meta.revision; if (resultProjectId === session.projectId) session.checkpointRevision = result.meta.revision; }
    const projectStateRead = result.ok && definitionForCall?.risk === 'read' && Boolean((definitionForCall.inputSchema as any)?.properties?.projectId) && resultProjectId === revisionReadRequiredProjectId;
    if (projectStateRead) { revisionReadRequiredProjectId = undefined; appendAgentEvent(session, 'revision_recompute_completed', { taskId: task.id, role: task.role, action: task.title, message: '已读取最新状态，继续执行' }); }
    if (result.ok && ['project.create', 'project.initialize', 'project.build_from_data'].includes(call.name)) {
      const createdProjectId = String(args.id || result.data?.project?.config?.id || result.meta?.projectId || '');
      if (createdProjectId) { const previousProjectIds = sessionProjectIds(session); setSessionProjectScope(session, [...previousProjectIds, createdProjectId], createdProjectId); task.projectId = createdProjectId; await refreshRevision(session, run, task.role, createdProjectId); appendAgentEvent(session, 'session_project_scope_changed', { projectIds: sessionProjectIds(session), currentProjectId: createdProjectId, addedProjectId: createdProjectId, reason: 'project_created' }); }
    }
    if (result.ok && call.name === 'project.delete' && resultProjectId) { const remaining = sessionProjectIds(session).filter((id) => id !== resultProjectId); setSessionProjectScope(session, remaining, remaining[0]); appendAgentEvent(session, 'session_project_scope_changed', { projectIds: remaining, currentProjectId: session.projectId, removedProjectId: resultProjectId, reason: 'project_deleted' }); }
    if (result.status === 'confirmation_required') {
      session.pendingApproval = { id: `pao_${randomUUID()}`, runId: runValue.runId, toolCallId: call.tool_call_id, toolName: call.name, taskId: task.id, role: task.role, routeIndex, arguments: args, projectRevision: taskProjectRevision(session, resultProjectId), confirmation: result.confirmation }; session.activeRunId = runValue.runId; setAgentPhase(session, 'awaiting_operation_approval'); appendAgentEvent(session, 'approval_required', { approval: session.pendingApproval }); return { waiting: true, interrupted: false, runValue };
    }
    if (revisionConflict) {
      const recovery = nextRevisionConflictCount(task.revisionConflictCount); task.revisionConflictCount = recovery.count;
      if (recovery.blocked) { blockTaskForRevisionChanges(session, task); throw new RevisionRecomputeBlocked(); }
      appendAgentEvent(session, 'revision_recompute_started', { taskId: task.id, role: task.role, action: task.title, attempt: recovery.count, message: '检测到项目刚刚更新，正在重新核对当前操作' });
      await refreshRevision(session, run, task.role, resultProjectId || session.projectId); revisionReadRequiredProjectId = resultProjectId || session.projectId;
      runValue = await llmProviderClient.resumeAgent(runValue.runId, [{ tool_call_id: call.tool_call_id, result: projectChangedToolObservation() }], run.requestId, connection); steps += 1; saveAgentSessionV2(session); continue;
    }
    const nextObservation: any = compactToolObservation(call.name, result);
    if ((repeatedFailure || repeatedParameterFailure) && nextObservation?.error) nextObservation.error.nextStep = repeatedParameterFailure ? '相同参数结构已经失败。不要重启任务，也不要再次提交同一字段结构；重新读取工具参数契约和目标资源，只重算失败调用的参数。' : toolFailureGuidance(result.error, true);
    if (parameterFailure) nextObservation.parameterCorrection = { required: true, attempt: parameterFailureCount, instruction: result.error?.details?.correctionInstruction || '只修正本次工具参数后重试，不要重启任务。' };
    runValue = await llmProviderClient.resumeAgent(runValue.runId, [{ tool_call_id: call.tool_call_id, result: nextObservation }], run.requestId, connection); steps += 1;
    if (session.controlSignal) break;
  }
  for (const event of (runValue.events || []).slice(processed)) appendAgentEvent(session, event.type, { ...(event.data || {}), taskId: task.id, role: task.role });
  if (session.controlSignal) return { waiting: false, interrupted: true, output: '', runValue };
  if (runValue.status !== 'completed') { const providerError = [...(runValue.events || [])].reverse().find((event: any) => event.type === 'error')?.data; const toolErrorResult = [...(runValue.events || [])].reverse().find((event: any) => event.type === 'tool_result' && event.data?.result?.ok === false)?.data?.result?.error; const detail = toolErrorResult ? `${toolErrorResult.code || 'TOOL_FAILED'}：${toolErrorResult.message || '工具调用失败'}${toolErrorResult.path ? `（${toolErrorResult.path}）` : ''}` : ''; throw new Error([providerError?.code, detail, `专家运行状态：${runValue.status}`].filter(Boolean).join('：')); }
  const output = (runValue.events || []).filter((event: any) => event.type === 'message_delta').map((event: any) => event.data?.content || '').join('').trim(); return { waiting: false, interrupted: false, output, runValue };
}

const MAX_EXPERT_ASSISTANCE_DEPTH = 3;

function requestTaskAssistance(session: AgentSessionV2, task: AgentTaskNode, error: unknown) {
  const message = error instanceof Error ? error.message : String(error); const previous = task.assistance; const depth = (previous?.depth || 0) + 1;
  const triedRoles = [...new Set([task.role, ...(previous?.triedRoles || []), ...(previous?.helperRole ? [previous.helperRole] : [])])];
  if (depth > MAX_EXPERT_ASSISTANCE_DEPTH || triedRoles.length >= PROJECT_AGENT_ROLES.length) return false;
  const diagnostics = error instanceof QualityGateFailure ? error.diagnostics.slice(0, 8).map((item) => `${item.path || 'project'}：${item.message || item.code || '质量问题'}`).join('；') : '';
  const handoff = task.output ? `专家交接：${task.output.slice(0, 2400)}` : ''; const reason = [message, diagnostics, handoff].filter(Boolean).join('；'); const requestedRole = suggestedExpertRole(reason, task.role);
  task.status = 'blocked'; task.failureClass = classifyAgentFailure(reason); task.error = `当前专家需要其他专家先解决阻断：${reason}`;
  task.assistance = { status: 'needed', reason, depth, triedRoles, requestedRole }; appendAgentEvent(session, 'expert_assistance_requested', { taskId: task.id, role: task.role, action: task.title, reason, requestedRole, depth, triedRoles }); saveAgentSessionV2(session); return true;
}

async function executeTask(session: AgentSessionV2, task: AgentTaskNode, run: RunContext, continuation?: { repairContext: string; preserveAttempt: boolean }) {
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

async function executeStepTasks(session: AgentSessionV2, plan: AgentPlanRevision, step: AgentOrchestrationStep, run: RunContext, maxParallelReads: number) {
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

async function stallOrchestrationForUser(session: AgentSessionV2, run: RunContext) {
  const check = await checkCurrentProjectState(session, run, 'orchestration_stalled');
  const state = ensureActionState(session); session.questions = [
    { id: `paq_${randomUUID()}`, ...questionMetadata(session), header: '执行停滞', question: `${check.summary} 连续两次行动仍未产生新的证据或业务状态推进。请补充需要调整的业务约束，或明确希望优先尝试的方向。`, kind: 'text' },
  ];
  state.status = 'waiting'; appendAgentEvent(session, 'orchestration_stalled', { consecutiveNoProgress: state.consecutiveNoProgress, questions: session.questions });
  appendAgentEvent(session, 'question_requested', { questions: session.questions, reason: 'orchestration_stalled' }); setAgentPhase(session, 'clarifying', { reason: 'orchestration_stalled' });
}

function failOrchestrationAtBudget(session: AgentSessionV2, plan: AgentPlanRevision) {
  const state = ensureActionState(session); const unresolved = (session.requirements || []).filter((item) => item.capabilityStatus !== 'verified');
  const blocked = plan.tasks.filter((task) => ['failed', 'blocked', 'pending'].includes(task.status)).map((task) => ({ role: task.role, action: task.title, status: task.status, error: task.error }));
  const artifact = addAgentArtifact(session, { kind: 'summary', title: '决策步数预算耗尽', data: { unresolved: unresolved.map((item) => item.statement), blocked } }); state.status = 'failed';
  appendAgentEvent(session, 'orchestration_failed', { reason: 'max_decision_steps_exhausted' }); setAgentPhase(session, 'failed', { reason: 'max_decision_steps_exhausted', artifactId: artifact.id });
}

async function executePlan(session: AgentSessionV2, run: RunContext) {
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

function writeSse(res: Response, event: { type: string; seq?: number; data: any }) { res.write(`id: ${event.seq || ''}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`); }

router.get('/sessions', (req: AuthRequest, res) => { try { res.json(listAgentSessionsV2(sessionListScope(req))); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.post('/sessions', (req: AuthRequest, res) => { try { const current = scope(req); const projectIds = [...new Set([...requestedProjectIds(req), ...(current.projectId ? [current.projectId] : [])])]; assertProjectScopeAccess(req, projectIds); const profileId = String(req.body.profileId || llmManagement.getProjectAgentProfileId({ tenantId: current.tenantId, projectId: current.projectId })); res.status(201).json(createAgentSessionV2({ ...current, projectIds, title: req.body.title, profileId, capabilityBundleVersionId: req.body.capabilityBundleVersionId })); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.get('/sessions/history', (req: AuthRequest, res) => { try {
  const current = scope(req); const status = String(req.query.status || '') as ProjectAgentHistoryStatus; if (status && !['active', 'attention', 'completed'].includes(status)) throw new Error('历史任务状态筛选无效');
  const result = listAgentSessionHistory({ ...current, q: String(req.query.q || ''), status: status || undefined, projectId: String(req.query.projectId || '') || undefined, archived: String(req.query.archived || '') === 'true', cursor: String(req.query.cursor || '') || undefined, limit: Number(req.query.limit || 30) }, (session) => sessionProjectIds(session).every((projectId) => { const project = readProjectPackage(projectId); return !project || canAccessProject(req.user, project, 'view'); }));
  res.json(result);
} catch (error) { errorResponse(res, error, requestId(req)); } });
router.get('/sessions/:id', (req: AuthRequest, res) => { try { res.json(sessionFor(req)); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.patch('/sessions/:id', (req: AuthRequest, res) => { try { const allowed = new Set(['title', 'pinned']); const unexpected = Object.keys(req.body || {}).filter((key) => !allowed.has(key)); if (unexpected.length) throw new Error(`不支持更新历史任务字段：${unexpected.join('、')}`); res.json(updateAgentSessionMetadata(sessionFor(req), { title: req.body.title === undefined ? undefined : String(req.body.title), pinned: req.body.pinned === undefined ? undefined : req.body.pinned === true })); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.post('/sessions/:id/restore', (req: AuthRequest, res) => { try { res.json(restoreAgentSessionV2(sessionFor(req))); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.put('/sessions/:id/projects', (req: AuthRequest, res) => { try { const session = sessionFor(req); if (['executing', 'recovering', 'awaiting_operation_approval'].includes(session.phase) || hasAgentLease(session.id)) throw new Error('请先暂停当前任务，再调整限定项目'); const projectIds = requestedProjectIds(req); const currentProjectId = String(req.body.currentProjectId || '') || undefined; assertProjectScopeAccess(req, projectIds); const previous = sessionProjectIds(session); const removed = previous.filter((projectId) => !projectIds.includes(projectId)); const referenced = activePlan(session)?.tasks.filter((task) => task.projectId && removed.includes(task.projectId) && !['passed', 'superseded', 'cancelled'].includes(task.status)) || []; if (referenced.length) throw new Error(`以下未完成任务仍使用要移除的项目：${referenced.map((task) => task.title).join('、')}`); setSessionProjectScope(session, projectIds, currentProjectId); appendAgentEvent(session, 'session_project_scope_changed', { previousProjectIds: previous, projectIds: sessionProjectIds(session), currentProjectId: session.projectId, reason: 'user_updated_scope' }); res.json(session); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.delete('/sessions/:id/permanent', async (req: AuthRequest, res) => { try { const session = sessionFor(req); if (req.body?.confirmed !== true) throw new Error('永久删除需要明确确认'); if (['executing', 'recovering', 'awaiting_operation_approval'].includes(session.phase) || hasAgentLease(session.id)) throw new Error('任务仍在执行，请先等待安全暂停'); res.json(await deleteAgentSessionV2(session)); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.delete('/sessions/:id', (req: AuthRequest, res) => { try { res.json(archiveAgentSessionV2(sessionFor(req))); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.get('/sessions/:id/events', (req: AuthRequest, res) => {
  try { const session = sessionFor(req); const after = Number(req.query.afterSeq || req.headers['last-event-id'] || 0); if (!req.headers.accept?.includes('text/event-stream')) return res.json({ events: eventsAfter(session, after), lastSeq: session.events.at(-1)?.seq || 0 });
    res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders(); eventsAfter(session, after).forEach((event) => writeSse(res, event)); const unsubscribe = subscribeAgentEvents(session.id, (event) => writeSse(res, event)); const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000); req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
  } catch (error) { if (!res.headersSent) errorResponse(res, error, requestId(req)); else res.end(); }
});
router.post('/sessions/:id/turns', async (req: AuthRequest, res) => {
    const id = requestId(req); let unsubscribe: (() => void) | undefined; let session: AgentSessionV2 | undefined; try { session = sessionFor(req); const prompt = String(req.body.prompt || '').trim(); if (!prompt) throw new Error('prompt 不能为空'); if (session.pendingApproval) throw new Error('当前有待确认操作'); const run = context(req); session.turnId = `paturn_${randomUUID()}`; addMessage(session, 'user', prompt, 'user'); appendAgentEvent(session, 'turn_started', { turnId: session.turnId });
    if (hasAgentLease(session.id) || session.phase === 'executing') { session.controlSignal = 'steer'; session.pendingSteer = prompt; appendAgentEvent(session, 'steer_requested', { prompt }); return res.status(202).json({ turnId: session.turnId, session }); }
    const wantsStream = req.headers.accept?.includes('text/event-stream'); if (wantsStream) { res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders(); eventsAfter(session, Number(req.body.afterSeq || 0)).forEach((event) => writeSse(res, event)); unsubscribe = subscribeAgentEvents(session.id, (event) => writeSse(res, event)); }
    const resumed = resumeActionWithUserInput(session, prompt);
    if (resumed) { appendAgentEvent(session, 'observation_recorded', { stepId: resumed.stepId, status: resumed.status, action: resumed.action, summary: resumed.summary }); saveAgentSessionV2(session); void executePlan(session, run); }
    else await planTurn(session, prompt, run);
    appendAgentEvent(session, 'turn_completed', { turnId: session.turnId, phase: session.phase }); const payload = { turnId: session.turnId, session }; if (wantsStream) res.end(); else res.status(202).json(payload);
  } catch (error) { if (session && ['grounding', 'analyzing_requirements', 'planning'].includes(session.phase)) failPlanningTurn(session, error); if (res.headersSent) { writeSse(res, { type: 'error', data: { error: error instanceof Error ? error.message : String(error), requestId: id } }); res.end(); } else errorResponse(res, error, id); } finally { unsubscribe?.(); }
});
router.post('/sessions/:id/turns/retry', async (req: AuthRequest, res) => {
  const id = requestId(req); let session: AgentSessionV2 | undefined;
  try {
    session = sessionFor(req); if (session.pendingApproval) throw new Error('当前有待确认操作'); if (hasAgentLease(session.id) || session.phase === 'executing') throw new Error('当前任务仍在执行，不能重试规划');
    const failure = [...session.events].reverse().find((event) => event.type === 'turn_failed' && event.data?.stage === 'planning' && event.data?.retryable !== false);
    const prompt = [...session.messages].reverse().find((message) => message.role === 'user')?.content;
    if (!failure || !prompt) throw new Error('可重试的规划失败记录不存在');
    const previousTurnId = failure.data?.turnId; session.turnId = `paturn_${randomUUID()}`; appendAgentEvent(session, 'turn_retry_requested', { turnId: session.turnId, retryOf: previousTurnId, stage: 'planning' }); appendAgentEvent(session, 'turn_started', { turnId: session.turnId, retryOf: previousTurnId });
    await planTurn(session, prompt, context(req)); appendAgentEvent(session, 'turn_completed', { turnId: session.turnId, phase: session.phase, retryOf: previousTurnId }); res.status(202).json({ turnId: session.turnId, session });
  } catch (error) { if (session && ['grounding', 'analyzing_requirements', 'planning'].includes(session.phase)) failPlanningTurn(session, error); errorResponse(res, error, id); }
});
router.post('/sessions/:id/plans/:planId/confirm', (req: AuthRequest, res) => { const id = requestId(req); try { const session = sessionFor(req); const plan = session.plans.find((item) => item.id === param(req.params.planId)); if (!plan || plan.status !== 'pending') throw new Error('待确认计划不存在');
  if (req.body.requirementsAcknowledged !== true) throw new Error('请先核对并确认目标、成功标准和风险边界');
  if (Number(req.body.requirementRevision) !== Number(plan.requirementRevision || 0) || Number(plan.requirementRevision || 0) !== Number(session.requirementRevision || 0)) throw new Error('需求已发生变化，请重新生成并核对计划');
  if (!goalContractReady(session, plan)) throw new Error('目标契约不完整或仍有需求需要确认，无法开始执行');
  session.requirementCoverage = { ...refreshRequirementCoverage(session.requirements || [], plan.tasks, session.artifacts), planComplete: true };
  for (const projectId of sessionProjectIds(session)) { const conflict = findActiveProjectAgentSession({ ...scope(req), projectId }, session.id); if (conflict) throw new Error(`项目 ${projectId} 的会话“${conflict.title}”仍在执行，必须先暂停或停止该会话`); }
  plan.status = 'confirmed'; plan.confirmedAt = new Date().toISOString(); session.activePlanId = plan.id; appendAgentEvent(session, 'plan_confirmed', { planId: plan.id }); saveAgentSessionV2(session); const run = context(req); void executePlan(session, run); res.status(202).json({ session }); } catch (error) { errorResponse(res, error, id); } });
router.post('/sessions/:id/operations/:operationId/decision', async (req: AuthRequest, res) => {
  const id = requestId(req); try { const session = sessionFor(req); const approval = session.pendingApproval; if (!approval || approval.id !== param(req.params.operationId)) throw new Error('待确认操作不存在'); const plan = activePlan(session)!; const task = plan.tasks.find((item) => item.id === approval.taskId)!;
    if (req.body.approved !== true) { task.status = 'failed'; task.error = '用户拒绝破坏性操作'; task.failureClass = 'user_rejected'; session.pendingApproval = undefined; session.activeRunId = undefined; appendAgentEvent(session, 'approval_decided', { approvalId: approval.id, approved: false }); pauseRecoveryForUser(session, task, '用户拒绝了必要的破坏性操作，请修改目标或明确新的处理方式'); saveAgentSessionV2(session); return res.json({ session }); }
    const run = context(req); const automatic = req.body.automatic === true && shouldAutoApproveOperation(env.mode);
    const approvalPolicy = evaluateToolPolicy(approval.toolName, activePlan(session)?.request || '', task);
    if (approvalPolicy.level === 'forbidden') { task.status = 'blocked'; task.blockedReason = approvalPolicy.userMessage; task.error = approvalPolicy.userMessage; task.failureClass = 'permission'; session.pendingApproval = undefined; session.activeRunId = undefined; appendAgentEvent(session, 'operation_blocked', { approvalId: approval.id, taskId: task.id, toolName: approval.toolName, reason: approvalPolicy.reason, summary: approvalPolicy.userMessage }); pauseRecoveryForUser(session, task, approvalPolicy.userMessage); saveAgentSessionV2(session); return res.status(200).json({ session, blocked: true }); }
    const approvalProjectId = String(approval.arguments.projectId || session.projectId || '') || undefined;
    const continueSpecialist = async (toolResult: any, revisionReadRequiredProjectId?: string) => {
      const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!; const profile = llmManagement.resolveProfile(bundle.agents.find((agent) => agent.role === approval.role)?.profileId || session.profileId, { tenantId: run.tenantId, projectId: session.projectId }); const route = profile.routes[approval.routeIndex]; if (!route) throw new Error('能力包模型路由不可恢复'); const connection = llmManagement.resolveConnection(route, { tenantId: run.tenantId, projectId: session.projectId });
      const resumed = await llmProviderClient.resumeAgent(approval.runId, [{ tool_call_id: approval.toolCallId, result: toolResult }], run.requestId, connection); const continued = await runSpecialist(session, task, run, { runValue: resumed, routeIndex: approval.routeIndex, revisionReadRequiredProjectId });
      if (continued.waiting) return res.status(202).json({ session });
      task.output = continued.output; await verifyTask(session, task, run); task.status = 'passed'; task.failureClass = undefined; task.error = undefined; appendAgentEvent(session, 'task_completed', { taskId: task.id, evidenceArtifactIds: task.evidenceArtifactIds }); void executePlan(session, run); return res.status(202).json({ session });
    };
    if (approvalProjectId) await refreshRevision(session, run, approval.role, approvalProjectId);
    const approvedRevision = approval.projectRevision || approval.arguments.baseRevision;
    const currentRevision = taskProjectRevision(session, approvalProjectId);
    if (approvalRevisionChanged(approvalProjectId, approvedRevision, currentRevision)) {
      const recovery = nextRevisionConflictCount(task.revisionConflictCount); task.revisionConflictCount = recovery.count; session.pendingApproval = undefined; session.activeRunId = undefined;
      appendAgentEvent(session, 'approval_invalidated', { approvalId: approval.id, taskId: task.id, toolName: approval.toolName, reason: 'project_changed' });
      if (recovery.blocked) { blockTaskForRevisionChanges(session, task); return res.status(200).json({ session, blocked: true }); }
      appendAgentEvent(session, 'revision_recompute_started', { taskId: task.id, role: task.role, action: task.title, attempt: recovery.count, message: '确认期间项目已更新，正在重新核对操作影响' }); saveAgentSessionV2(session);
      try { return await continueSpecialist(projectChangedToolObservation(), approvalProjectId); }
      catch (error) { if (error instanceof RevisionRecomputeBlocked) return res.status(200).json({ session, blocked: true }); throw error; }
    }
    let result: any = await executeLlmTool(approval.toolName, { ...approval.arguments, confirmationToken: approval.confirmation.token }, { ...run, projectId: approvalProjectId, mcpRole: approval.role });
    if (result.status === 'confirmation_required') {
      appendAgentEvent(session, 'approval_refreshed', { approvalId: approval.id, toolName: approval.toolName, reason: 'expired_or_stale_token' });
      if (automatic) result = await executeLlmTool(approval.toolName, { ...approval.arguments, confirmationToken: result.confirmation.token }, { ...run, projectId: approvalProjectId, mcpRole: approval.role });
      else { session.pendingApproval = { ...approval, id: `pao_${randomUUID()}`, confirmation: result.confirmation, projectRevision: currentRevision }; appendAgentEvent(session, 'approval_required', { approval: session.pendingApproval, reason: 'confirmation_refreshed' }); saveAgentSessionV2(session); return res.status(202).json({ session }); }
    }
    if (!result.ok && result.error?.code === 'PROJECT_REVISION_CONFLICT') {
      const recovery = nextRevisionConflictCount(task.revisionConflictCount); task.revisionConflictCount = recovery.count; session.pendingApproval = undefined; session.activeRunId = undefined; await refreshRevision(session, run, approval.role, approvalProjectId);
      appendAgentEvent(session, 'approval_invalidated', { approvalId: approval.id, taskId: task.id, toolName: approval.toolName, reason: 'project_changed_during_execution' });
      if (recovery.blocked) { blockTaskForRevisionChanges(session, task); return res.status(200).json({ session, blocked: true }); }
      appendAgentEvent(session, 'revision_recompute_started', { taskId: task.id, role: task.role, action: task.title, attempt: recovery.count, message: '项目在确认操作执行前更新，正在重新核对' }); saveAgentSessionV2(session);
      try { return await continueSpecialist(projectChangedToolObservation(), approvalProjectId); }
      catch (error) { if (error instanceof RevisionRecomputeBlocked) return res.status(200).json({ session, blocked: true }); throw error; }
    }
    if (!result.ok) {
      const message = result.error?.message || '确认操作失败'; task.status = 'failed'; task.error = message; task.failureClass = classifyAgentFailure(message); session.pendingApproval = undefined; session.activeRunId = undefined; appendAgentEvent(session, 'task_failed', { taskId: task.id, attempt: task.attempt, error: message, afterApproval: true }); saveAgentSessionV2(session); void executePlan(session, run); return res.status(202).json({ session });
    }
    if (result.meta?.revision && approvalProjectId) { (session.projectRevisions ||= {})[approvalProjectId] = result.meta.revision; if (approvalProjectId === session.projectId) session.checkpointRevision = result.meta.revision; }
    if (approval.toolName === 'project.delete' && approvalProjectId) { const remaining = sessionProjectIds(session).filter((projectId) => projectId !== approvalProjectId); setSessionProjectScope(session, remaining, remaining[0]); appendAgentEvent(session, 'session_project_scope_changed', { projectIds: remaining, currentProjectId: session.projectId, removedProjectId: approvalProjectId, reason: 'project_deleted' }); }
    session.pendingApproval = undefined; appendAgentEvent(session, 'approval_decided', { approvalId: approval.id, approved: true, automatic, mode: env.mode });
    try {
      return await continueSpecialist(compactToolObservation(approval.toolName, result));
    } catch (error) {
      if (error instanceof RevisionRecomputeBlocked) return res.status(200).json({ session, blocked: true });
      const message = error instanceof Error ? error.message : String(error); task.status = 'failed'; task.error = message; task.failureClass = classifyAgentFailure(message); session.activeRunId = undefined; appendAgentEvent(session, 'task_failed', { taskId: task.id, attempt: task.attempt, error: message, afterApproval: true }); saveAgentSessionV2(session); void executePlan(session, run); return res.status(202).json({ session });
    }
  } catch (error) { errorResponse(res, error, id); }
});
router.post('/sessions/:id/control', (req: AuthRequest, res) => { const id = requestId(req); try { const session = sessionFor(req); const action = String(req.body.action || ''); if (!['pause', 'continue', 'stop', 'retry', 'repair'].includes(action)) throw new Error('控制动作无效');
  if (action === 'pause') { if (hasAgentLease(session.id)) session.controlSignal = 'pause'; else setAgentPhase(session, 'paused'); }
  if (action === 'stop') { session.pendingApproval = undefined; session.activeRunId = undefined; if (hasAgentLease(session.id)) session.controlSignal = 'stop'; else setAgentPhase(session, 'stopped'); }
  if (action === 'retry' || action === 'repair') {
    const plan = activePlan(session); const failed = plan?.tasks.filter((task) => task.status === 'failed') || [];
    if (!failed.length) throw new Error('没有需要恢复的失败任务');
    const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!; const recovery = resetRecoveryBudget(session, bundle.budget.maxRecoveryCycles ?? 6, bundle.budget.maxDynamicTasks ?? 24);
    if (action === 'retry') for (const task of failed) if (task.failureClass === 'permission') { task.status = 'pending'; task.error = undefined; task.failureClass = undefined; }
    appendAgentEvent(session, 'recovery_budget_updated', { ...recovery, reason: 'user_started_new_recovery_cycle' }); session.phase = 'paused';
  }
  appendAgentEvent(session, 'execution_control', { action }); if (action === 'continue' || action === 'retry' || action === 'repair') { if (session.pendingApproval) throw new Error('当前有待确认操作'); session.controlSignal = undefined; void executePlan(session, context(req)); } res.status(202).json({ session }); } catch (error) { errorResponse(res, error, id); } });

router.get('/capability-bundles', (req: AuthRequest, res) => { try { res.json(listCapabilityBundles(scope(req).userId)); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.get('/capability-bundles/:id/experts', (req: AuthRequest, res) => { try { const bundle = getCapabilityBundle(param(req.params.id), scope(req).userId); if (!bundle) throw new Error('能力包不存在'); res.json(buildExpertRegistry(bundle)); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.post('/capability-bundles', (req: AuthRequest, res) => { try { res.status(201).json(saveCapabilityBundleDraft(req.body, scope(req).userId)); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.put('/capability-bundles/:id', (req: AuthRequest, res) => { try { res.json(saveCapabilityBundleDraft({ ...req.body, id: param(req.params.id) }, scope(req).userId)); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.post('/capability-bundles/:id/validate', (req: AuthRequest, res) => { try { const bundle = getCapabilityBundle(param(req.params.id), scope(req).userId); if (!bundle) throw new Error('能力包不存在'); res.json(validateCapabilityBundle(bundle)); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.post('/capability-bundles/:id/publish', (req: AuthRequest, res) => { try { res.json(publishCapabilityBundle(param(req.params.id), scope(req).userId)); } catch (error) { errorResponse(res, error, requestId(req)); } });

export { router as projectAgentV2Router };
