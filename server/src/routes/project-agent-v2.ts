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
import { operationAllowedByPlan, shouldAutoApproveOperation } from '../services/project-agent-v2-policy';
import { compactAgentToolResult } from '../services/project-agent-v2-context';
import { compileDataToolArguments, dataFailureFingerprint, hasRepeatedDataFailure } from '../services/data-tool-preflight';
import { compileBehaviorToolArguments } from '../services/behavior-tool-preflight';
import { insertQualityRemediationTasks, qualityDiagnosticFingerprint, replaceInvalidRemediationTask, shouldRunQualityGate, supersedeInvalidCrossRoleRepairs, type QualityDiagnostic } from '../services/project-agent-v2-remediation';
import { compileAgentRequirements, mergeAgentRequirements, refreshRequirementCoverage, validateRequirementTaskCoverage } from '../services/project-agent-requirements';
import {
  applyRecoveryPatch, classifyAgentFailure, ensureRecoveryState, isRecoverableFailure, recoveryPatchExpandsRisk, strategyKey,
  normalizeRecoveryPatch, resetRecoveryBudget, syncBlockedTasks, type AgentRecoveryPatch, type AgentFailureClass,
} from '../services/project-agent-v3-recovery';
import {
  acquireAgentLease, addAgentArtifact, appendAgentEvent, archiveAgentSessionV2, compactConversation, createAgentSessionV2,
  eventsAfter, findActiveProjectAgentSession, getAgentSessionV2, getCapabilityBundle, hasAgentLease, initializeProjectAgentV2Store, listAgentSessionsV2, listCapabilityBundles,
  publishCapabilityBundle, releaseAgentLease, renewAgentLease, saveAgentSessionV2, saveCapabilityBundleDraft, selectRunnableTaskBatch, setAgentPhase, subscribeAgentEvents,
  sessionProjectIds, setSessionProjectScope, validateCapabilityBundle, validateTaskGraph, type AgentPlanRevision, type AgentSessionV2, type AgentTaskNode, type CapabilityBundleVersion,
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
function addMessage(session: AgentSessionV2, role: 'user' | 'assistant', content: string) { session.messages.push({ id: `pam2_${randomUUID()}`, role, content, createdAt: new Date().toISOString() }); if (session.messages.length === 1) session.title = content.slice(0, 40); saveAgentSessionV2(session); }

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
  const roleCapabilities = Object.fromEntries(await Promise.all(roleOrder.map(async (role) => [role, await invoke(role, 'system.capabilities.get', {})])));
  const toolCatalog = Object.fromEntries(roleOrder.map((role) => [role, listFormFlowTools(role).filter((tool) => tool.name !== 'release.apply').map((tool) => ({ name: tool.name, risk: tool.risk, requiredAccess: tool.requiredAccess }))]));
  const [componentCatalog, workflowCatalog, eventCatalog] = await Promise.all([invoke('form', 'catalog.components.list', {}), invoke('workflow', 'catalog.workflow_nodes.list', {}), invoke('behavior', 'catalog.events.list', {})]);
  const projects = await Promise.all(sessionProjectIds(session).map(async (projectId) => {
    const [inspect, validation, loaded]: any[] = await Promise.all([invoke('project', 'project.inspect', { projectId }), invoke('quality', 'project.validate', { projectId }), invoke('project', 'project.get', { projectId })]);
    const revision = loaded.ok ? loaded.data.revision : undefined; if (revision) (session.projectRevisions ||= {})[projectId] = revision;
    return { projectId, current: projectId === session.projectId, inspect, validation, revision };
  }));
  session.checkpointRevision = session.projectId ? session.projectRevisions?.[session.projectId] : undefined;
  const artifact = addAgentArtifact(session, { kind: 'grounding', title: '限定项目只读检查', data: { roleCapabilities, toolCatalog, capabilityCatalog: { components: componentCatalog, workflowNodes: workflowCatalog, events: eventCatalog }, projects } });
  appendAgentEvent(session, 'grounding_completed', { artifactId: artifact.id, projectId: session.projectId, projectIds: sessionProjectIds(session), revision: session.checkpointRevision }); return artifact;
}

function plannerSchema() {
  return { type: 'object', required: ['action'], properties: {
    action: { enum: ['ask', 'plan'] }, questions: { type: 'array', maxItems: 3, items: { type: 'object', required: ['header', 'question', 'kind'], properties: { header: { type: 'string' }, question: { type: 'string' }, kind: { enum: ['choice', 'text'] }, options: { type: 'array', items: { type: 'object', required: ['label'], properties: { label: { type: 'string' }, description: { type: 'string' } } } } } } },
    goal: { type: 'string' }, successCriteria: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' }, assumptions: { type: 'array', items: { type: 'string' } }, risks: { type: 'array', items: { type: 'string' } },
    tasks: { type: 'array', items: { type: 'object', required: ['id', 'role', 'title', 'instruction', 'access', 'dependsOn', 'acceptance', 'requirementIds', 'evidenceKinds', 'verificationScenarioIds'], properties: { id: { type: 'string' }, role: { enum: roleOrder }, title: { type: 'string' }, instruction: { type: 'string' }, access: { enum: ['read', 'write'] }, projectId: { type: 'string' }, dependsOn: { type: 'array', items: { type: 'string' } }, acceptance: { type: 'array', items: { type: 'string' } }, requirementIds: { type: 'array', items: { type: 'string' } }, evidenceKinds: { type: 'array', items: { enum: ['tool_result', 'structural_validation', 'semantic_validation', 'scenario_result', 'requirement_coverage', 'delivery_preview'] } }, verificationScenarioIds: { type: 'array', items: { type: 'string' } } } } },
  } };
}

function plannerPrompt(session: AgentSessionV2, grounding: unknown) {
  const coordinator = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)?.agents.find((agent) => agent.role === 'coordinator');
  return `你是 FormFlow 根智能体的 planner。你只能基于只读检查和对话进行澄清或生成计划，不得调用写工具。信息不足时 action=ask，一次最多提出 3 个会实质改变方案的问题；不得询问可从项目查到的事实。信息完整时 action=plan，生成最小且完整的有向无环任务图，只包含需求涉及的角色。每个任务必须引用一个或多个已编译 requirementIds，声明 evidenceKinds 和 verificationScenarioIds；所有 supported 需求必须被任务覆盖。不得用提示脚本、日志、静态占位值或 Mock 副作用冒充需求证据。无法由实时能力目录支持的需求必须澄清，不能假装完成。若用户要求创建新项目，必须规划 project.create/project.initialize 类创建任务；创建成功后运行时会把新项目自动加入限定范围并设为当前项目。已有项目任务必须填写 projectId，且只能使用限定项目。read 表示纯只读，write 表示修改；同一项目写任务通过 dependsOn 串行。一个写任务只处理一个可独立验收的资源。质量检查、回归测试和 project.quality.inspect 只能放在独立 quality 任务；项目包校验、输出和 release.preview 只能放在 delivery 任务，delivery 必须依赖 quality。计划必须覆盖目标、成功标准、验收项、假设和风险，永不规划 release.apply。\n需求契约：${JSON.stringify(session.requirements || [])}\n能力包指令：${coordinator?.instructions || '无'}\n当前项目：${session.projectId || '未创建'}\n限定项目：${sessionProjectIds(session).join('、') || '无（允许创建后自动限定）'}\n只读检查：${JSON.stringify(grounding)}\n历史摘要：${session.conversationSummary || '无'}`;
}

const planningErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

function parsePlanningResponse(response: Awaited<ReturnType<typeof chat>>) {
  let value: any = response.structured;
  if (!value && response.content) { try { value = JSON.parse(response.content.replace(/^```json\s*|\s*```$/g, '')); } catch { /* handled below */ } }
  if (value?.action === 'ask' && Array.isArray(value.questions) && value.questions.length) return value;
  if (value?.action === 'plan' && Array.isArray(value.tasks)) return value;
  throw new Error('规划模型未返回有效的 ask 或 plan 结果');
}

async function requestPlan(session: AgentSessionV2, run: RunContext, grounding: unknown) {
  const baseMessages: LlmMessage[] = [{ role: 'system', content: plannerPrompt(session, grounding) }, ...session.messages.slice(-8).map((item) => ({ role: item.role, content: item.content } as LlmMessage))];
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

function recoverySchema() {
  return { type: 'object', required: ['action', 'diagnosis', 'strategy'], properties: {
    action: { enum: ['retry', 'append_tasks', 'replace_pending', 'ask_user', 'abort'] }, diagnosis: { type: 'string' }, strategy: { type: 'string' }, reason: { type: 'string' }, cancelTaskIds: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', maxItems: 3, items: { type: 'object', required: ['header', 'question', 'kind'], properties: { header: { type: 'string' }, question: { type: 'string' }, kind: { enum: ['choice', 'text'] }, options: { type: 'array', items: { type: 'object', required: ['label'], properties: { label: { type: 'string' }, description: { type: 'string' } } } } } } },
    tasks: { type: 'array', maxItems: 24, items: { type: 'object', required: ['role', 'title', 'instruction', 'access', 'acceptance'], properties: { id: { type: 'string' }, role: { enum: roleOrder }, title: { type: 'string' }, instruction: { type: 'string' }, access: { enum: ['read', 'write'] }, dependsOn: { type: 'array', items: { type: 'string' } }, acceptance: { type: 'array', items: { type: 'string' } }, strategyKey: { type: 'string' }, requirementIds: { type: 'array', items: { type: 'string' } }, evidenceKinds: { type: 'array', items: { type: 'string' } }, verificationScenarioIds: { type: 'array', items: { type: 'string' } } } } },
  } };
}

async function requestRecoveryPatch(session: AgentSessionV2, task: AgentTaskNode, failureClass: AgentFailureClass, run: RunContext): Promise<AgentRecoveryPatch> {
  const state = ensureRecoveryState(session); const plan = activePlan(session)!;
  const evidence = session.events.filter((event) => event.data?.taskId === task.id).slice(-30).map((event) => ({ seq: event.seq, type: event.type, data: event.data }));
  const requestedTools = [...new Set(evidence.map((event) => event.data?.tool_name || event.data?.toolName || event.data?.name).filter(Boolean).map(String))];
  const toolOwnership = requestedTools.map((name) => { const definition = getFormFlowTool(name); return { name, ownerRole: definition?.ownerRole, risk: definition?.risk, available: Boolean(definition) }; });
  const tried = Object.entries(state.strategies).filter(([, count]) => count > 0).map(([key, count]) => ({ key, count }));
  const prompt = `你是 FormFlow 根智能体的 recovery planner。目标不是解释失败，而是在已确认目标内生成能继续推进的最小任务图补丁。新任务必须继承失败任务的 requirementIds 和场景验收，修复后验证原需求而不是只验证诊断消失。不得修改或取消 passed 任务。retry 仅用于同策略尚未达到 ${task.maxAttempts} 次的情况；达到上限必须 append_tasks 或 replace_pending 并更换角色、工具顺序、前置读取或任务拆分。工具越权必须改由工具所属角色执行。质量诊断必须拆成“领域专家 write 修复 → quality 独立复检”：表单/按钮/控件由 form，数据由 data，流程由 workflow，规则由 behavior，发布预检由 delivery。缺少真实业务决定时 ask_user；权限不足或用户拒绝时 abort。不得规划 release.apply。本轮新任务最多 ${state.maxDynamicTasks} 个。\n计划目标：${plan.goal}\n成功标准：${plan.successCriteria.join('；')}\n失败任务：${JSON.stringify({ id: task.id, role: task.role, title: task.title, instruction: task.instruction, access: task.access, dependsOn: task.dependsOn, acceptance: task.acceptance, requirementIds: task.requirementIds, evidenceKinds: task.evidenceKinds, verificationScenarioIds: task.verificationScenarioIds, attempt: task.attempt, maxAttempts: task.maxAttempts, error: task.error })}\n失败分类：${failureClass}\n相关工具归属：${JSON.stringify(toolOwnership)}\n已尝试策略：${JSON.stringify(tried)}\n相关事件：${JSON.stringify(evidence)}\n当前项目：${session.projectId || '无'}`;
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
  const compiled = compileAgentRequirements(prompt); if (compiled.length) { session.requirements = mergeAgentRequirements(session.requirements, compiled); session.requirementCoverage = refreshRequirementCoverage(session.requirements); appendAgentEvent(session, 'requirements_compiled', { requirements: session.requirements, coverage: session.requirementCoverage }); }
  if (session.questions.length) { const questionIds = session.questions.map((question) => question.id); session.questions = []; appendAgentEvent(session, 'questions_resolved', { questionIds }); }
  const grounding = await ground(session, run); setAgentPhase(session, 'planning');
  const value: any = await requestPlan(session, run, grounding.data);
  if (value?.action === 'ask' && Array.isArray(value.questions) && value.questions.length) {
    session.questions = value.questions.slice(0, 3).map((item: any) => ({ id: `paq_${randomUUID()}`, header: String(item.header || '需要确认'), question: String(item.question), kind: item.kind === 'choice' ? 'choice' : 'text', options: Array.isArray(item.options) ? item.options.slice(0, 4).map((option: any) => ({ label: String(option.label), description: option.description ? String(option.description) : undefined })) : undefined }));
    setAgentPhase(session, 'clarifying'); appendAgentEvent(session, 'question_requested', { questions: session.questions });
    const message = session.questions.map((item, index) => `${index + 1}. ${item.question}`).join('\n'); addMessage(session, 'assistant', message); return;
  }
  const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!;
  validatePlannerTaskRoleBoundaries(value.tasks);
  const allowedProjectIds = sessionProjectIds(session);
  const rawTasks = value.tasks as any[];
  const creationTaskIds = new Set(rawTasks.filter((item) => item.role === 'project' && /创建|初始化|导入|create|initialize|import/i.test(`${item.title || ''}\n${item.instruction || ''}`)).map((item) => String(item.id)));
  const dependsOnCreation = (item: any, seen = new Set<string>()): boolean => (Array.isArray(item.dependsOn) ? item.dependsOn : []).some((id: unknown) => { const value = String(id); if (creationTaskIds.has(value)) return true; if (seen.has(value)) return false; seen.add(value); const dependency = rawTasks.find((candidate) => String(candidate.id) === value); return dependency ? dependsOnCreation(dependency, seen) : false; });
  const tasks: AgentTaskNode[] = value.tasks.map((item: any, index: number) => {
    const creatingProject = item.role === 'project' && /创建|初始化|导入|create|initialize|import/i.test(`${item.title || ''}\n${item.instruction || ''}`);
    const waitsForCreatedProject = !creatingProject && dependsOnCreation(item);
    const taskProjectId = String(item.projectId || (!creatingProject && !waitsForCreatedProject ? session.projectId || '' : '')).trim() || undefined;
    if (taskProjectId && !allowedProjectIds.includes(taskProjectId) && !waitsForCreatedProject) throw new Error(`规划任务 ${item.id || index + 1} 使用了未限定项目 ${taskProjectId}`);
    if (!taskProjectId && allowedProjectIds.length > 1 && !creatingProject && !waitsForCreatedProject) throw new Error(`规划任务 ${item.id || index + 1} 必须明确指定限定范围内的 projectId`);
    return { id: String(item.id || `task_${index + 1}`), role: item.role, title: String(item.title || roleTitles[item.role as McpRole]), instruction: String(item.instruction), access: item.access === 'read' ? 'read' : 'write', projectId: taskProjectId, dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn.map(String) : [], acceptance: Array.isArray(item.acceptance) ? item.acceptance.map(String) : [], requirementIds: Array.isArray(item.requirementIds) ? item.requirementIds.map(String) : [], evidenceKinds: Array.isArray(item.evidenceKinds) ? item.evidenceKinds.map(String) : [], verificationScenarioIds: Array.isArray(item.verificationScenarioIds) ? item.verificationScenarioIds.map(String) : [], status: 'pending', attempt: 0, maxAttempts: bundle.budget.maxAttempts, evidenceArtifactIds: [], origin: 'planned', generation: 0, strategyKey: strategyKey(`${item.role}:${item.title}:${item.instruction}`) };
  });
  let previousWrite: AgentTaskNode | undefined; for (const task of tasks) if (task.access === 'write') { if (previousWrite && !task.dependsOn.includes(previousWrite.id)) task.dependsOn.push(previousWrite.id); previousWrite = task; }
  validateTaskGraph(tasks);
  validateRequirementTaskCoverage(session.requirements || [], tasks);
  for (const old of session.plans) if (old.status === 'pending' || old.status === 'confirmed') old.status = 'superseded';
  const next: AgentPlanRevision = { id: `pap2_${randomUUID()}`, revision: (session.plans.at(-1)?.revision || 0) + 1, request: prompt, goal: String(value.goal || prompt), successCriteria: Array.isArray(value.successCriteria) ? value.successCriteria.map(String) : [], summary: String(value.summary || ''), assumptions: Array.isArray(value.assumptions) ? value.assumptions.map(String) : [], risks: Array.isArray(value.risks) ? value.risks.map(String) : [], tasks, status: 'pending', createdAt: new Date().toISOString() };
  session.plans.push(next); session.activePlanId = next.id; session.questions = []; setAgentPhase(session, 'awaiting_plan_approval'); appendAgentEvent(session, 'plan_proposed', { plan: next }); addMessage(session, 'assistant', next.summary || `已生成包含 ${tasks.length} 个任务的实施计划，等待确认。`);
  session.recovery = { cycles: 0, maxCycles: bundle.budget.maxRecoveryCycles ?? 6, dynamicTasks: 0, maxDynamicTasks: bundle.budget.maxDynamicTasks ?? 24, strategies: {} };
  compactConversation(session, bundle.context.maxSummaryChars, bundle.context.recentMessages);
}

function failPlanningTurn(session: AgentSessionV2, error: unknown) {
  const message = planningErrorMessage(error); const retryable = isStructuredPlanningError(error);
  appendAgentEvent(session, 'turn_failed', { turnId: session.turnId, stage: 'planning', error: message, retryable });
  setAgentPhase(session, 'failed', { stage: 'planning', error: message, retryable });
}

function allowedTools(session: AgentSessionV2, task: AgentTaskNode) {
  const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!; const configured = bundle.agents.find((item) => item.role === task.role)?.tools || [];
  return listFormFlowTools(task.role).filter((tool) => tool.name !== 'release.apply' && (task.access === 'write' || tool.risk === 'read') && (!configured.length || configured.includes(tool.name)));
}

function stableOperationKey(session: AgentSessionV2, task: AgentTaskNode, name: string, args: Record<string, any>) {
  const normalized = Object.fromEntries(Object.entries(args).filter(([key]) => !['baseRevision', 'confirmationToken', 'idempotencyKey'].includes(key)).sort(([a], [b]) => a.localeCompare(b)));
  return `pa2_${createHash('sha256').update(`${session.id}:${task.id}:${name}:${JSON.stringify(normalized)}`).digest('hex').slice(0, 32)}`;
}

function prepareToolArguments(session: AgentSessionV2, task: AgentTaskNode, name: string, original: Record<string, any>) {
  const definition = getFormFlowTool(name); const properties = (definition?.inputSchema as any)?.properties || {}; const args = { ...original };
  const allowedProjectIds = sessionProjectIds(session); const targetProjectId = String(args.projectId || task.projectId || session.projectId || '');
  if (properties.projectId) {
    if (!targetProjectId && allowedProjectIds.length > 1) throw new Error('任务必须明确指定限定范围内的 projectId');
    if (targetProjectId && allowedProjectIds.length && !allowedProjectIds.includes(targetProjectId)) throw new Error(`项目 ${targetProjectId} 不在当前会话限定范围内`);
    if (targetProjectId) args.projectId = targetProjectId;
  }
  if (properties.baseRevision && !args.baseRevision && targetProjectId) args.baseRevision = session.projectRevisions?.[targetProjectId] || (targetProjectId === session.projectId ? session.checkpointRevision : undefined);
  const dataPreflight = compileDataToolArguments(name, args); const preflight = dataPreflight.ok ? compileBehaviorToolArguments(name, dataPreflight.arguments) : dataPreflight; const normalized = preflight.arguments;
  if (properties.idempotencyKey) normalized.idempotencyKey = stableOperationKey(session, task, name, normalized);
  return { args: normalized, preflight };
}

function specialistContext(session: AgentSessionV2, task: AgentTaskNode) {
  const plan = activePlan(session)!; const dependencies = plan.tasks.filter((item) => task.dependsOn.includes(item.id)).map((item) => ({ id: item.id, title: item.title, output: item.output, evidence: item.evidenceArtifactIds.map((id) => session.artifacts.find((artifact) => artifact.id === id)?.data) }));
  const projectId = task.projectId || session.projectId;
  return `能力包版本：${session.capabilityBundleVersionId}\n计划目标：${plan.goal}\n成功标准：${plan.successCriteria.join('；')}\n当前任务：${task.instruction}\n验收标准：${task.acceptance.join('；')}\n上次失败：${task.error || '无'}\n任务项目：${projectId || '尚未创建'}\n限定项目：${sessionProjectIds(session).join('、') || '无'}\n当前 revision：${projectId ? session.projectRevisions?.[projectId] || session.checkpointRevision || '无' : '无'}\n依赖产物：${JSON.stringify(dependencies)}\n对话摘要：${session.conversationSummary || '无'}`;
}

async function refreshRevision(session: AgentSessionV2, run: RunContext, role: McpRole, projectId = session.projectId) {
  if (!projectId) return;
  const loaded: any = await executeLlmTool('project.get', { projectId }, { ...run, projectId, mcpRole: role }); if (loaded.ok) { (session.projectRevisions ||= {})[projectId] = loaded.data.revision; if (projectId === session.projectId) session.checkpointRevision = loaded.data.revision; saveAgentSessionV2(session); }
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
  next.id = `pap2_${randomUUID()}`; next.revision = Math.max(...session.plans.map((plan) => plan.revision), 0) + 1; next.parentPlanId = source.id; next.revisionReason = reason;
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
  patch = normalizeRecoveryPatch(patch, failed.id); appendAgentEvent(session, 'task_graph_patch_proposed', { taskId: failed.id, cycle: state.cycles, patch });
  if (patch.action === 'ask_user') {
    session.questions = (patch.questions || []).slice(0, 3).map((item) => ({ ...item, id: `paq_${randomUUID()}` })); appendAgentEvent(session, 'question_requested', { questions: session.questions, reason: 'recovery' }); setAgentPhase(session, 'clarifying', { reason: 'recovery' }); return 'waiting';
  }
  if (patch.action === 'abort') { exhaustRecovery(session, failed, patch.reason || patch.diagnosis || '恢复规划判定不可继续'); return 'terminal'; }
  if (patch.action === 'retry' && failed.attempt >= failed.maxAttempts) { exhaustRecovery(session, failed, '同一任务策略已达到尝试上限，恢复规划未提供替代策略'); return 'terminal'; }
  let dynamicCount = patch.tasks?.length || 0; if (dynamicCount > state.maxDynamicTasks) { exhaustRecovery(session, failed, '已达到本轮动态任务上限'); return 'terminal'; }
  let key = strategyKey(patch.strategy || patch.diagnosis); let used = state.strategies[key] || 0;
  if (used >= 1 && patch.action !== 'retry') {
    appendAgentEvent(session, 'strategy_rejected', { taskId: failed.id, cycle: state.cycles, strategy: patch.strategy, strategyKey: key, reason: 'duplicate_failed_strategy' });
    try { patch = await requestRecoveryPatch(session, failed, failureClass, run); }
    catch (error) { exhaustRecovery(session, failed, `更换重复策略失败：${planningErrorMessage(error)}`); return 'terminal'; }
    patch = normalizeRecoveryPatch(patch, failed.id); appendAgentEvent(session, 'task_graph_patch_proposed', { taskId: failed.id, cycle: state.cycles, patch, replacesRejectedStrategyKey: key });
    if (patch.action === 'ask_user') {
      session.questions = (patch.questions || []).slice(0, 3).map((item) => ({ ...item, id: `paq_${randomUUID()}` })); appendAgentEvent(session, 'question_requested', { questions: session.questions, reason: 'recovery' }); setAgentPhase(session, 'clarifying', { reason: 'recovery' }); return 'waiting';
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

async function runSpecialist(session: AgentSessionV2, task: AgentTaskNode, run: RunContext, resume?: { runValue: any; routeIndex: number }) {
  const tools = allowedTools(session, task); const modelTools = tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })); const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!;
  const definition = { entrypoint: task.role, max_steps: bundle.budget.maxToolSteps, max_tool_failures: 3, tools: tools.map((tool) => tool.name), nodes: [{ id: task.role, type: 'model', config: { tool_mode: 'auto', tools: modelTools } }, { id: 'end', type: 'end' }], edges: [{ source: task.role, target: 'end' }] };
  const profile = llmManagement.resolveProfile(bundle.agents.find((agent) => agent.role === task.role)?.profileId || session.profileId, { tenantId: run.tenantId, projectId: session.projectId }); let runValue = resume?.runValue; let routeIndex = resume?.routeIndex ?? 0; let connection: any;
  if (!runValue) {
    let lastError: unknown;
    const customInstructions = bundle.agents.find((agent) => agent.role === task.role)?.instructions || '';
    const formInstructions = task.role === 'form' ? '表单控件必须具有稳定 id/type、有限 x/y、正数 width/height 和有效 props；优先使用 form.generate_from_table 或读取控件目录。局部修改现有控件前先 form.get，并只提交需要改变的字段，服务端会保留其余布局。每次写入后必须运行 project.validate，并用 form.preview 核对目标控件。按钮动作只能使用 props.events={onClick:"非空可执行脚本"}，或先读取 workflow.list 后使用 props.flowTriggers={onClick:{enabled:true,workflowId:"实际存在的流程 ID",parameterMap:{}}}；不得提交空 events、缺少 workflowId 的触发器或 props.onClick。' : '';
    const dataInstructions = task.role === 'data' ? '数据源创建固定顺序：先 project.get 和 data_source.list；资源不存在时不要循环 data_source.get，直接创建；创建成功后依次 data_source.get、data_keys.validate、project.validate。rows 必须是实际业务记录对象，不是 fieldId/title/type 形式的字段定义。空表使用 config.columns，例如 config={columns:[{name:"device_id",type:"string"}],keyFields:["device_id"],readOnly:false}。主键只放在顶层 config.keyFields，且名称必须与 rows 的对象键或 config.columns.name 完全一致；可编辑表必须有主键，只读表使用 config.readOnly=true。不得使用 config.sheets、editable 或 isEditable。TABLE_NOT_FOUND 表示应创建资源，不要继续读取同一不存在资源。' : '';
    const behaviorInstructions = task.role === 'behavior' ? '行为规则固定顺序：project.get 读取真实表单字段、控件、数据表和流程 ID → behavior.list 读取目标作用域 → 最多一次 rule_reference.search → rule_syntax.lint → rule_test.run → rule_code.update → project.validate。表单字段联动、计算、必填、状态和流程触发优先写 Behavior Rule DSL，不要先 behavior.upsert。behavior.upsert 仅用于确实需要 Trigger/Condition/Action 对象的全局、Sheet 或结构化行为，所有动作必须完整，setValue 禁止空 expression 占位。options() 只刷新目标字段的选项，不会把其他表的多列值自动写入多个普通字段；无法用现有 DSL 表达时报告能力缺口，不得写示例常量冒充实现。写错后使用同一资源的 upsert/update 原子修正，除非用户明确要求删除，否则不得调用 behavior.delete 回滚。lint 或 test 未通过时先按诊断修改代码，禁止写入。' : '';
    const roleBoundaryInstructions = task.role === 'delivery'
      ? '交付专家只处理输出、项目包校验和 release.preview。不得请求 project.quality.inspect 或 project_test.*；质量检查属于 quality 专家。若当前任务文字混入质量检查，只完成交付范围并把质量部分作为交接项，服务端将独立执行交付门禁。'
      : task.role === 'quality'
        ? '质量专家负责 project.validate、project.quality.inspect、Mock 和 project_test.*；不得执行 release.preview 或其他交付操作。'
        : '';
    for (const [index, route] of profile.routes.entries()) { try { connection = llmManagement.resolveConnection(route, { tenantId: run.tenantId, projectId: session.projectId }); runValue = await llmProviderClient.startAgent(definition, { messages: [{ role: 'system', content: `你是 ${roleTitles[task.role]}。只处理当前任务，只使用提供的工具。写入前读取最新状态；不要猜测资源 ID。不得调用 release.apply。总工具预算为 ${bundle.budget.maxToolSteps} 步：同一参考搜索不得重复，读取到资源 ID 后直接执行 lint、写入和验证；验收证据齐全后必须立即停止调用工具并给出交接。若缺少其他角色才能创建的字段或控件，立即报告阻断项，不要循环搜索。完成时简洁报告实际工具结果和阻断项。${roleBoundaryInstructions ? `\n角色边界：${roleBoundaryInstructions}` : ''}${formInstructions ? `\n表单规范：${formInstructions}` : ''}${dataInstructions ? `\n数据规范：${dataInstructions}` : ''}${behaviorInstructions ? `\n行为规则规范：${behaviorInstructions}` : ''}\n能力包指令：${customInstructions}\n${specialistContext(session, task)}` }] }, connection, run.requestId, run.tenantId, session.projectId); routeIndex = index; break; } catch (error) { lastError = error; if (!isRetryableLlmRpcError(error) || index === profile.routes.length - 1) throw error; } }
    if (!runValue) throw lastError || new Error('专家没有可用模型路由');
  } else connection = llmManagement.resolveConnection(profile.routes[routeIndex], { tenantId: run.tenantId, projectId: session.projectId });
  let processed = 0; let steps = 0; let referenceSearches = 0;
  while (runValue.status === 'waiting_tool' && steps < bundle.budget.maxToolSteps) {
    const fresh = (runValue.events || []).slice(processed); processed = runValue.events?.length || 0; for (const event of fresh) appendAgentEvent(session, event.type, { ...(event.data || {}), taskId: task.id, role: task.role });
    const call = [...(runValue.events || [])].reverse().find((event: any) => event.type === 'tool_call')?.data; if (!call) break;
    if (!tools.some((tool) => tool.name === call.name)) throw new Error(`工具 ${call.name} 不在任务能力范围内`);
    const prepared = prepareToolArguments(session, task, call.name, call.arguments || {}); const args = prepared.args;
    const originalArguments = compactAgentToolResult(call.arguments || {}, 12_000);
    const normalizedArguments = compactAgentToolResult(args, 12_000);
    if (prepared.preflight.normalizations.length) appendAgentEvent(session, 'tool_arguments_normalized', { taskId: task.id, role: task.role, toolName: call.name, originalArguments, normalizedArguments, normalizations: prepared.preflight.normalizations });
    let result: any; let automaticallyApproved = false; const preflightFailed = !prepared.preflight.ok;
    const referenceBudgetExceeded = task.role === 'behavior' && call.name === 'rule_reference.search' && referenceSearches >= 1;
    const behaviorDeleteOutOfScope = task.role === 'behavior' && call.name === 'behavior.delete' && !/(删除|移除|清理|废弃)/.test(`${activePlan(session)?.request || ''}\n${task.instruction}`);
    if (referenceBudgetExceeded || behaviorDeleteOutOfScope) {
      result = { ok: false, error: { code: referenceBudgetExceeded ? 'RULE_REFERENCE_BUDGET_EXHAUSTED' : 'BEHAVIOR_DELETE_OUT_OF_SCOPE', message: referenceBudgetExceeded ? '本任务已读取过权威规则参考，请使用已有参考和 lint 诊断继续，不要换关键词重复搜索' : '当前已确认目标没有删除行为；请用 upsert/update 原子修正已有资源', retryable: false }, meta: { requestId: run.requestId } };
      appendAgentEvent(session, 'tool_rejected', { taskId: task.id, role: task.role, toolName: call.name, error: result.error, reason: referenceBudgetExceeded ? 'reference_search_budget' : 'delete_not_in_confirmed_goal' });
    } else if (preflightFailed) { result = { ok: false, error: { code: prepared.preflight.error.code, message: prepared.preflight.error.message, path: prepared.preflight.error.path, details: prepared.preflight.error, retryable: false }, meta: { requestId: run.requestId } }; appendAgentEvent(session, 'tool_preflight_failed', { taskId: task.id, role: task.role, toolName: call.name, originalArguments, normalizedArguments, error: prepared.preflight.error, suggestedArguments: prepared.preflight.error.suggestedArguments, normalizations: prepared.preflight.normalizations }); }
    else { if (task.role === 'behavior' && call.name === 'rule_reference.search') referenceSearches += 1; appendAgentEvent(session, 'tool_started', { taskId: task.id, role: task.role, toolName: call.name, projectId: args.projectId || task.projectId || session.projectId }); result = await executeLlmTool(call.name, args, { ...run, projectId: args.projectId || task.projectId || session.projectId, mcpRole: task.role }); }
    if (result.status === 'confirmation_required' && shouldAutoApproveOperation(env.mode)) {
      if (!operationAllowedByPlan(call.name, activePlan(session)?.request || '', task)) { appendAgentEvent(session, 'operation_blocked', { taskId: task.id, toolName: call.name, reason: 'conflicts_with_confirmed_plan' }); throw new Error(`操作 ${call.name} 与已确认计划中的用户约束冲突`); }
      automaticallyApproved = true; appendAgentEvent(session, 'approval_decided', { taskId: task.id, toolName: call.name, approved: true, automatic: true, mode: 'local', impact: result.confirmation?.impact });
      result = await executeLlmTool(call.name, { ...args, confirmationToken: result.confirmation.token }, { ...run, projectId: args.projectId || task.projectId || session.projectId, mcpRole: task.role });
    }
    const contextResult = compactAgentToolResult(result);
    const failureFingerprint = task.role === 'data' && !result.ok && result.status !== 'confirmation_required' ? dataFailureFingerprint(call.name, result.error || {}, args) : undefined;
    const repeatedFailure = failureFingerprint ? hasRepeatedDataFailure(session.events, task.id, failureFingerprint.value) : false;
    const resource = task.role === 'data' && ['data_source.create', 'data_source.import'].includes(call.name) ? { tableId: String(args.id || ''), sheetName: String(args.sheetName || 'Sheet1'), keyFields: Array.isArray(args.config?.keyFields) ? args.config.keyFields.map(String) : [] }
      : task.role === 'behavior' && call.name === 'rule_code.update' ? { kind: 'rule_code', formId: String(args.formId || ''), code: String(args.code || '') }
        : task.role === 'behavior' && ['behavior.upsert', 'behavior.delete'].includes(call.name) ? { kind: 'behavior', scope: args.scope, id: String(args.behavior?.id || args.id || ''), formId: args.formId, tableId: args.tableId, sheetName: args.sheetName, deleted: call.name === 'behavior.delete' } : undefined;
    appendAgentEvent(session, 'tool_completed', { taskId: task.id, role: task.role, toolName: call.name, toolCallId: call.tool_call_id, result: contextResult, automaticallyApproved, preflightFailed, failureFingerprint: failureFingerprint?.value, resource });
    if (repeatedFailure && failureFingerprint) { appendAgentEvent(session, 'tool_failure_repeated', { taskId: task.id, role: task.role, toolName: call.name, failureFingerprint, error: result.error, reason: 'same_tool_error_and_argument_shape' }); throw new Error(`REPEATED_TOOL_FAILURE：${result.error?.code || 'TOOL_FAILED'}：${result.error?.message || '相同工具错误重复出现'}${result.error?.path ? `（${result.error.path}）` : ''}`); }
    const resultProjectId = String(args.projectId || result.meta?.projectId || task.projectId || session.projectId || '');
    if (result.meta?.revision && resultProjectId) { (session.projectRevisions ||= {})[resultProjectId] = result.meta.revision; if (resultProjectId === session.projectId) session.checkpointRevision = result.meta.revision; }
    if (result.ok && ['project.create', 'project.initialize', 'project.build_from_data'].includes(call.name)) {
      const createdProjectId = String(args.id || result.data?.project?.config?.id || result.meta?.projectId || '');
      if (createdProjectId) { const previousProjectIds = sessionProjectIds(session); setSessionProjectScope(session, [...previousProjectIds, createdProjectId], createdProjectId); task.projectId = createdProjectId; await refreshRevision(session, run, task.role, createdProjectId); appendAgentEvent(session, 'session_project_scope_changed', { projectIds: sessionProjectIds(session), currentProjectId: createdProjectId, addedProjectId: createdProjectId, reason: 'project_created' }); }
    }
    if (result.ok && call.name === 'project.delete' && resultProjectId) { const remaining = sessionProjectIds(session).filter((id) => id !== resultProjectId); setSessionProjectScope(session, remaining, remaining[0]); appendAgentEvent(session, 'session_project_scope_changed', { projectIds: remaining, currentProjectId: session.projectId, removedProjectId: resultProjectId, reason: 'project_deleted' }); }
    if (result.status === 'confirmation_required') {
      session.pendingApproval = { id: `pao_${randomUUID()}`, runId: runValue.runId, toolCallId: call.tool_call_id, toolName: call.name, taskId: task.id, role: task.role, routeIndex, arguments: args, confirmation: result.confirmation }; session.activeRunId = runValue.runId; setAgentPhase(session, 'awaiting_operation_approval'); appendAgentEvent(session, 'approval_required', { approval: session.pendingApproval }); return { waiting: true, interrupted: false, runValue };
    }
    if (!result.ok && result.error?.code === 'PROJECT_REVISION_CONFLICT') { await refreshRevision(session, run, task.role); throw new Error('PROJECT_REVISION_CONFLICT：已刷新 revision，需要重新计算本任务'); }
    runValue = await llmProviderClient.resumeAgent(runValue.runId, [{ tool_call_id: call.tool_call_id, result: contextResult }], run.requestId, connection); steps += 1;
    if (session.controlSignal) break;
  }
  for (const event of (runValue.events || []).slice(processed)) appendAgentEvent(session, event.type, { ...(event.data || {}), taskId: task.id, role: task.role });
  if (session.controlSignal) return { waiting: false, interrupted: true, output: '', runValue };
  if (runValue.status !== 'completed') { const providerError = [...(runValue.events || [])].reverse().find((event: any) => event.type === 'error')?.data; const toolErrorResult = [...(runValue.events || [])].reverse().find((event: any) => event.type === 'tool_result' && event.data?.result?.ok === false)?.data?.result?.error; const detail = toolErrorResult ? `${toolErrorResult.code || 'TOOL_FAILED'}：${toolErrorResult.message || '工具调用失败'}${toolErrorResult.path ? `（${toolErrorResult.path}）` : ''}` : ''; throw new Error([providerError?.code, detail, `专家运行状态：${runValue.status}`].filter(Boolean).join('：')); }
  const output = (runValue.events || []).filter((event: any) => event.type === 'message_delta').map((event: any) => event.data?.content || '').join('').trim(); return { waiting: false, interrupted: false, output, runValue };
}

async function executeTask(session: AgentSessionV2, task: AgentTaskNode, run: RunContext) {
  while (task.attempt < task.maxAttempts) {
    const taskProjectId = task.projectId || session.projectId; task.attempt += 1; task.status = 'running'; task.startRevision = taskProjectId ? session.projectRevisions?.[taskProjectId] || session.checkpointRevision : undefined; appendAgentEvent(session, 'task_started', { taskId: task.id, role: task.role, projectId: taskProjectId, attempt: task.attempt, access: task.access });
    try { const result = await runSpecialist(session, task, run); if (result.waiting) return false; if (result.interrupted) { task.status = 'pending'; task.attempt = Math.max(0, task.attempt - 1); appendAgentEvent(session, 'task_paused', { taskId: task.id, reason: session.controlSignal }); return true; } task.output = result.output; await verifyTask(session, task, run); task.status = 'passed'; task.failureClass = undefined; task.error = undefined; const completedProjectId = task.projectId || session.projectId; task.endRevision = completedProjectId ? session.projectRevisions?.[completedProjectId] || session.checkpointRevision : undefined; session.requirementCoverage = refreshRequirementCoverage(session.requirements || [], activePlan(session)?.tasks || [], session.artifacts); appendAgentEvent(session, 'coverage_updated', { coverage: session.requirementCoverage, requirements: session.requirements }); appendAgentEvent(session, 'task_completed', { taskId: task.id, projectId: completedProjectId, evidenceArtifactIds: task.evidenceArtifactIds, revision: task.endRevision }); return true; }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      task.error = message; appendAgentEvent(session, 'task_failed', { taskId: task.id, attempt: task.attempt, error: message });
      if (error instanceof QualityGateFailure) { task.status = 'failed'; task.failureClass = 'validation'; return false; }
      const retryable = error instanceof RemediationVerificationFailure || /PROJECT_REVISION_CONFLICT|UNAVAILABLE|DEADLINE|temporar|timeout|连接/i.test(message); if (!retryable || task.attempt >= task.maxAttempts) { task.status = 'failed'; return false; }
    }
  }
  task.status = 'failed'; return false;
}

async function executePlan(session: AgentSessionV2, run: RunContext) {
  if (!await acquireAgentLease(session.id)) return; setAgentPhase(session, 'executing');
  const heartbeat = setInterval(() => void renewAgentLease(session.id), 15_000);
  try {
    const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!; ensureRecoveryState(session, bundle.budget.maxRecoveryCycles ?? 6, bundle.budget.maxDynamicTasks ?? 24);
    while (true) {
      const plan = activePlan(session); if (!plan) throw new Error('当前没有活动计划'); if (plan.status === 'pending') return; if (plan.status !== 'confirmed') throw new Error('当前没有已确认计划');
      if (session.controlSignal === 'pause') { session.controlSignal = undefined; setAgentPhase(session, 'paused'); return; }
      if (session.controlSignal === 'stop') { session.controlSignal = undefined; setAgentPhase(session, 'stopped'); return; }
      if (session.controlSignal === 'steer') { const prompt = session.pendingSteer || ''; session.controlSignal = undefined; session.pendingSteer = undefined; for (const task of plan.tasks) if (task.status === 'running') task.status = 'pending'; setAgentPhase(session, 'planning', { reason: 'steer' }); await planTurn(session, prompt, run); return; }
      const existingFailure = plan.tasks.find((task) => task.status === 'failed' && task.remediation) || plan.tasks.find((task) => task.status === 'failed');
      if (existingFailure) { const outcome = await recoverFailedTask(session, existingFailure.id, run); if (outcome !== 'continued') return; setAgentPhase(session, 'executing', { reason: 'recovery_completed' }); continue; }
      for (const task of plan.tasks.filter((item) => item.status === 'pending')) {
        try { validatePlannerTaskRoleBoundaries([task]); }
        catch (error) { task.status = 'failed'; task.failureClass = 'tool_scope'; task.error = planningErrorMessage(error); appendAgentEvent(session, 'task_failed', { taskId: task.id, attempt: task.attempt, error: task.error, detectedBeforeExecution: true }); break; }
      }
      for (const change of syncBlockedTasks(plan.tasks)) appendAgentEvent(session, change.to === 'blocked' ? 'task_blocked' : 'task_unblocked', { taskId: change.task.id, blockedBy: change.task.blockedBy || [] });
      const unfinished = plan.tasks.filter((task) => ['pending', 'running', 'blocked', 'failed'].includes(task.status));
      if (!unfinished.length) {
        session.requirementCoverage = refreshRequirementCoverage(session.requirements || [], plan.tasks, session.artifacts);
        const unresolved = (session.requirements || []).filter((requirement) => requirement.capabilityStatus !== 'verified');
        if ((session.requirements || []).length && (!session.requirementCoverage.complete || unresolved.length)) {
          const artifact = addAgentArtifact(session, { kind: 'requirement_coverage', title: '需求验收未完成', data: { coverage: session.requirementCoverage, unresolved } });
          appendAgentEvent(session, 'capability_gap_detected', { artifactId: artifact.id, unresolved, coverage: session.requirementCoverage }); setAgentPhase(session, 'failed', { reason: 'requirements_not_verified', artifactId: artifact.id }); return;
        }
        plan.status = 'executed'; setAgentPhase(session, 'completed'); const summary = `目标已完成：${plan.tasks.filter((task) => task.status === 'passed').length} 个任务通过验收，${session.requirementCoverage?.verified || 0}/${session.requirementCoverage?.total || 0} 项需求获得证据，${plan.tasks.filter((task) => task.status === 'superseded').length} 个旧策略已替换。`; addMessage(session, 'assistant', summary); appendAgentEvent(session, 'message_delta', { content: summary }); return;
      }
      const unresolvedFailure = plan.tasks.find((task) => task.status === 'failed');
      if (unresolvedFailure) { const outcome = await recoverFailedTask(session, unresolvedFailure.id, run); if (outcome !== 'continued') return; setAgentPhase(session, 'executing', { reason: 'recovery_completed' }); continue; }
      const batch = selectRunnableTaskBatch(plan.tasks, bundle.budget.maxParallelReads);
      if (!batch.length) {
        const blocked = plan.tasks.find((task) => task.status === 'blocked'); if (blocked) { exhaustRecovery(session, blocked, '所有剩余任务都被失败依赖阻断'); return; }
        throw new Error('任务图没有可执行节点');
      }
      const results = await Promise.all(batch.map((task) => executeTask(session, task, run))); if (session.pendingApproval) return;
      const failures = batch.filter((_, index) => !results[index]);
      for (const task of failures) { const outcome = await recoverFailedTask(session, task.id, run); if (outcome !== 'continued') return; }
      if (failures.length) setAgentPhase(session, 'executing', { reason: 'recovery_completed' });
    }
  } catch (error) { setAgentPhase(session, 'failed', { error: error instanceof Error ? error.message : String(error) }); }
  finally { clearInterval(heartbeat); await releaseAgentLease(session.id); }
}

function writeSse(res: Response, event: { type: string; seq?: number; data: any }) { res.write(`id: ${event.seq || ''}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`); }

router.get('/sessions', (req: AuthRequest, res) => { try { res.json(listAgentSessionsV2(sessionListScope(req))); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.post('/sessions', (req: AuthRequest, res) => { try { const current = scope(req); const projectIds = [...new Set([...requestedProjectIds(req), ...(current.projectId ? [current.projectId] : [])])]; assertProjectScopeAccess(req, projectIds); const profileId = String(req.body.profileId || llmManagement.getProjectAgentProfileId({ tenantId: current.tenantId, projectId: current.projectId })); res.status(201).json(createAgentSessionV2({ ...current, projectIds, title: req.body.title, profileId, capabilityBundleVersionId: req.body.capabilityBundleVersionId })); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.get('/sessions/:id', (req: AuthRequest, res) => { try { res.json(sessionFor(req)); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.put('/sessions/:id/projects', (req: AuthRequest, res) => { try { const session = sessionFor(req); if (['executing', 'recovering', 'awaiting_operation_approval'].includes(session.phase) || hasAgentLease(session.id)) throw new Error('请先暂停当前任务，再调整限定项目'); const projectIds = requestedProjectIds(req); const currentProjectId = String(req.body.currentProjectId || '') || undefined; assertProjectScopeAccess(req, projectIds); const previous = sessionProjectIds(session); const removed = previous.filter((projectId) => !projectIds.includes(projectId)); const referenced = activePlan(session)?.tasks.filter((task) => task.projectId && removed.includes(task.projectId) && !['passed', 'superseded', 'cancelled'].includes(task.status)) || []; if (referenced.length) throw new Error(`以下未完成任务仍使用要移除的项目：${referenced.map((task) => task.title).join('、')}`); setSessionProjectScope(session, projectIds, currentProjectId); appendAgentEvent(session, 'session_project_scope_changed', { previousProjectIds: previous, projectIds: sessionProjectIds(session), currentProjectId: session.projectId, reason: 'user_updated_scope' }); res.json(session); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.delete('/sessions/:id', (req: AuthRequest, res) => { try { res.json(archiveAgentSessionV2(sessionFor(req))); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.get('/sessions/:id/events', (req: AuthRequest, res) => {
  try { const session = sessionFor(req); const after = Number(req.query.afterSeq || req.headers['last-event-id'] || 0); if (!req.headers.accept?.includes('text/event-stream')) return res.json({ events: eventsAfter(session, after), lastSeq: session.events.at(-1)?.seq || 0 });
    res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders(); eventsAfter(session, after).forEach((event) => writeSse(res, event)); const unsubscribe = subscribeAgentEvents(session.id, (event) => writeSse(res, event)); const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000); req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
  } catch (error) { if (!res.headersSent) errorResponse(res, error, requestId(req)); else res.end(); }
});
router.post('/sessions/:id/turns', async (req: AuthRequest, res) => {
  const id = requestId(req); let unsubscribe: (() => void) | undefined; let session: AgentSessionV2 | undefined; try { session = sessionFor(req); const prompt = String(req.body.prompt || '').trim(); if (!prompt) throw new Error('prompt 不能为空'); if (session.pendingApproval) throw new Error('当前有待确认操作'); const run = context(req); session.turnId = `paturn_${randomUUID()}`; addMessage(session, 'user', prompt); appendAgentEvent(session, 'turn_started', { turnId: session.turnId });
    if (hasAgentLease(session.id) || session.phase === 'executing') { session.controlSignal = 'steer'; session.pendingSteer = prompt; appendAgentEvent(session, 'steer_requested', { prompt }); return res.status(202).json({ turnId: session.turnId, session }); }
    const wantsStream = req.headers.accept?.includes('text/event-stream'); if (wantsStream) { res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders(); eventsAfter(session, Number(req.body.afterSeq || 0)).forEach((event) => writeSse(res, event)); unsubscribe = subscribeAgentEvents(session.id, (event) => writeSse(res, event)); }
    await planTurn(session, prompt, run); appendAgentEvent(session, 'turn_completed', { turnId: session.turnId, phase: session.phase }); const payload = { turnId: session.turnId, session }; if (wantsStream) res.end(); else res.status(202).json(payload);
  } catch (error) { if (session && ['grounding', 'planning'].includes(session.phase)) failPlanningTurn(session, error); if (res.headersSent) { writeSse(res, { type: 'error', data: { error: error instanceof Error ? error.message : String(error), requestId: id } }); res.end(); } else errorResponse(res, error, id); } finally { unsubscribe?.(); }
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
  } catch (error) { if (session && ['grounding', 'planning'].includes(session.phase)) failPlanningTurn(session, error); errorResponse(res, error, id); }
});
router.post('/sessions/:id/plans/:planId/confirm', (req: AuthRequest, res) => { const id = requestId(req); try { const session = sessionFor(req); const plan = session.plans.find((item) => item.id === param(req.params.planId)); if (!plan || plan.status !== 'pending') throw new Error('待确认计划不存在');
  for (const projectId of sessionProjectIds(session)) { const conflict = findActiveProjectAgentSession({ ...scope(req), projectId }, session.id); if (conflict) throw new Error(`项目 ${projectId} 的会话“${conflict.title}”仍在执行，必须先暂停或停止该会话`); }
  plan.status = 'confirmed'; plan.confirmedAt = new Date().toISOString(); session.activePlanId = plan.id; appendAgentEvent(session, 'plan_confirmed', { planId: plan.id }); saveAgentSessionV2(session); const run = context(req); void executePlan(session, run); res.status(202).json({ session }); } catch (error) { errorResponse(res, error, id); } });
router.post('/sessions/:id/operations/:operationId/decision', async (req: AuthRequest, res) => {
  const id = requestId(req); try { const session = sessionFor(req); const approval = session.pendingApproval; if (!approval || approval.id !== param(req.params.operationId)) throw new Error('待确认操作不存在'); const plan = activePlan(session)!; const task = plan.tasks.find((item) => item.id === approval.taskId)!;
    if (req.body.approved !== true) { task.status = 'failed'; task.error = '用户拒绝破坏性操作'; task.failureClass = 'user_rejected'; session.pendingApproval = undefined; session.activeRunId = undefined; appendAgentEvent(session, 'approval_decided', { approvalId: approval.id, approved: false }); pauseRecoveryForUser(session, task, '用户拒绝了必要的破坏性操作，请修改目标或明确新的处理方式'); saveAgentSessionV2(session); return res.json({ session }); }
    const run = context(req); const automatic = req.body.automatic === true && shouldAutoApproveOperation(env.mode);
    if (automatic && !operationAllowedByPlan(approval.toolName, activePlan(session)?.request || '', task)) { const message = `操作 ${approval.toolName} 与已确认计划中的用户约束冲突`; task.status = 'failed'; task.error = message; task.failureClass = 'permission'; session.pendingApproval = undefined; session.activeRunId = undefined; appendAgentEvent(session, 'operation_blocked', { approvalId: approval.id, taskId: task.id, toolName: approval.toolName, reason: 'conflicts_with_confirmed_plan' }); pauseRecoveryForUser(session, task, '操作超出已确认计划范围，需要用户调整目标或重新确认计划'); saveAgentSessionV2(session); return res.status(200).json({ session, blocked: true }); }
    const approvalProjectId = String(approval.arguments.projectId || session.projectId || '') || undefined;
    let result: any = await executeLlmTool(approval.toolName, { ...approval.arguments, confirmationToken: approval.confirmation.token }, { ...run, projectId: approvalProjectId, mcpRole: approval.role });
    if (automatic && result.status === 'confirmation_required') { appendAgentEvent(session, 'approval_refreshed', { approvalId: approval.id, toolName: approval.toolName, reason: 'expired_or_stale_token' }); result = await executeLlmTool(approval.toolName, { ...approval.arguments, confirmationToken: result.confirmation.token }, { ...run, projectId: approvalProjectId, mcpRole: approval.role }); }
    if (!result.ok) {
      const message = result.error?.message || '确认操作失败'; task.status = 'failed'; task.error = message; task.failureClass = classifyAgentFailure(message); session.pendingApproval = undefined; session.activeRunId = undefined; appendAgentEvent(session, 'task_failed', { taskId: task.id, attempt: task.attempt, error: message, afterApproval: true }); saveAgentSessionV2(session); void executePlan(session, run); return res.status(202).json({ session });
    }
    if (result.meta?.revision && approvalProjectId) { (session.projectRevisions ||= {})[approvalProjectId] = result.meta.revision; if (approvalProjectId === session.projectId) session.checkpointRevision = result.meta.revision; }
    if (approval.toolName === 'project.delete' && approvalProjectId) { const remaining = sessionProjectIds(session).filter((projectId) => projectId !== approvalProjectId); setSessionProjectScope(session, remaining, remaining[0]); appendAgentEvent(session, 'session_project_scope_changed', { projectIds: remaining, currentProjectId: session.projectId, removedProjectId: approvalProjectId, reason: 'project_deleted' }); }
    session.pendingApproval = undefined; appendAgentEvent(session, 'approval_decided', { approvalId: approval.id, approved: true, automatic, mode: env.mode });
    try {
      const bundle = getCapabilityBundle(session.capabilityBundleVersionId, session.userId)!; const profile = llmManagement.resolveProfile(bundle.agents.find((agent) => agent.role === approval.role)?.profileId || session.profileId, { tenantId: run.tenantId, projectId: session.projectId }); const route = profile.routes[approval.routeIndex]; if (!route) throw new Error('能力包模型路由不可恢复'); const connection = llmManagement.resolveConnection(route, { tenantId: run.tenantId, projectId: session.projectId }); const resumed = await llmProviderClient.resumeAgent(approval.runId, [{ tool_call_id: approval.toolCallId, result: compactAgentToolResult(result) }], run.requestId, connection); const continued = await runSpecialist(session, task, run, { runValue: resumed, routeIndex: approval.routeIndex });
      if (continued.waiting) return res.status(202).json({ session });
      task.output = continued.output; await verifyTask(session, task, run); task.status = 'passed'; appendAgentEvent(session, 'task_completed', { taskId: task.id, evidenceArtifactIds: task.evidenceArtifactIds }); void executePlan(session, run); return res.status(202).json({ session });
    } catch (error) {
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
router.post('/capability-bundles', (req: AuthRequest, res) => { try { res.status(201).json(saveCapabilityBundleDraft(req.body, scope(req).userId)); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.put('/capability-bundles/:id', (req: AuthRequest, res) => { try { res.json(saveCapabilityBundleDraft({ ...req.body, id: param(req.params.id) }, scope(req).userId)); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.post('/capability-bundles/:id/validate', (req: AuthRequest, res) => { try { const bundle = getCapabilityBundle(param(req.params.id), scope(req).userId); if (!bundle) throw new Error('能力包不存在'); res.json(validateCapabilityBundle(bundle)); } catch (error) { errorResponse(res, error, requestId(req)); } });
router.post('/capability-bundles/:id/publish', (req: AuthRequest, res) => { try { res.json(publishCapabilityBundle(param(req.params.id), scope(req).userId)); } catch (error) { errorResponse(res, error, requestId(req)); } });

export { router as projectAgentV2Router };
