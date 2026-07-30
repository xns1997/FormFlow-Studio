import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { env } from '../config/env';
import { canAccessProject } from '../services/permission';
import { readProjectPackage } from '../services/project-package-store';
import { evaluateToolPolicy, shouldAutoApproveOperation } from '../services/project-agent-v2-policy';
import { compactToolObservation } from '../services/project-agent-v2-context';
import { approvalRevisionChanged, nextRevisionConflictCount, projectChangedToolObservation } from '../services/project-agent-revision';
import { classifyAgentFailure } from '../services/project-agent-v3-recovery';
import {
  goalContractReady, prepareAssignments, resumeActionWithUserInput, PROJECT_AGENT_ROLES,
} from '../services/project-agent-actions';
import {
  acquireAgentLease, appendAgentEvent, archiveAgentSessionV2, createAgentSessionV2, deleteAgentSessionV2,
  eventsAfter, findActiveProjectAgentSession, getAgentSessionV2, getCapabilityBundle, hasAgentLease, initializeProjectAgentV2Store,
  listAgentSessionHistory, listAgentSessionsV2, listCapabilityBundles, publishCapabilityBundle, releaseAgentLease, renewAgentLease,
  saveAgentSessionV2, saveCapabilityBundleDraft, setAgentPhase, subscribeAgentEvents, restoreAgentSessionV2,
  sessionProjectIds, setSessionProjectScope, updateAgentSessionMetadata, validateCapabilityBundle,
  type AgentSessionV2, type ProjectAgentHistoryStatus,
} from '../services/project-agent-v2-store';
import { materializeAnalyzedRequirements, refreshRequirementCoverage } from '../services/project-agent-requirements';
import { executeLlmTool } from '../services/llm-tools';
import { llmManagement } from '../services/llm-management';
import { llmProviderClient } from '../services/llm-provider-client';
import { buildExpertRegistry } from '../services/project-agent-expert-registry';
import {
  activePlan, addMessage, questionMetadata, chat,
  planTurn, failPlanningTurn, executePlan, executeStepTasks,
  requestTaskAssistance, blockTaskForRevisionChanges,
  stallOrchestrationForUser, failOrchestrationAtBudget,
  ground, checkCurrentProjectState,
  requestNextAction, verifyTask,
  recoverFailedTask, requestRecoveryPatch, recoveryRevision,
  exhaustRecovery, pauseRecoveryForUser, resetRecoveryBudget,
  runSpecialist, refreshRevision, taskProjectRevision,
  RevisionRecomputeBlocked, ExpertAssistanceRequired,
  QualityGateFailure, RemediationVerificationFailure, roleTitles,
  PROJECT_AGENT_ROLES as AGENT_ROLES,
  type AgentRecoveryPatch,
} from '../agent';
import type { McpRole } from '../services/formflow-tool-registry';
import type { RunContext, AgentPlanRevision, AgentTaskNode, NextActionDecision, AgentOrchestrationStep } from '../agent';

const router = Router();
router.use(async (_req, res, next) => { try { await initializeProjectAgentV2Store(); next(); } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : String(error) }); } });

type RunContextLocal = { tenantId: string; userId: string; user: AuthRequest['user']; requestId: string };
function requestId(req: AuthRequest) { return (req as AuthRequest & { requestId?: string }).requestId || `req_${randomUUID()}`; }
function scope(req: AuthRequest) { return { tenantId: (req as AuthRequest & { tenantId?: string }).tenantId || 'local', userId: req.user?.id || 'local', projectId: String(req.body?.projectId || req.query.projectId || '') || undefined }; }
function sessionListScope(req: AuthRequest) {
  const current = scope(req); const requested = String(req.query.scope || '');
  if (requested && !['unbound', 'all'].includes(requested)) throw new Error('会话查询 scope 无效');
  return { ...current, sessionScope: current.projectId ? 'project' as const : requested === 'all' ? 'all' as const : 'unbound' as const };
}
function context(req: AuthRequest): RunContextLocal { const value = scope(req); return { tenantId: value.tenantId, userId: value.userId, user: req.user, requestId: requestId(req) }; }
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
  for (const projectId of sessionProjectIds(session)) { const conflict = findActiveProjectAgentSession({ ...scope(req), projectId }, session.id); if (conflict) throw new Error(`项目 ${projectId} 的会话"${conflict.title}"仍在执行，必须先暂停或停止该会话`); }
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
