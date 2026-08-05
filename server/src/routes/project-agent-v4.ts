/**
 * Project Agent V4 — thin HTTP/SSE route over the single-loop agent core.
 * All orchestration lives in server/src/agent-core/*.
 */
import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { env } from '../config/env';
import { canAccessProject } from '../services/permission';
import { readProjectPackage } from '../services/project-package-store';
import { executeLlmTool } from '../services/llm-tools';
import { llmManagement } from '../services/llm-management';
import { listFormFlowTools } from '../services/formflow-tool-registry';
import {
  appendAgentThreadEvent,
  archiveAgentThread,
  confirmPlan,
  createAgentThread,
  deleteAgentThread,
  effectiveScopeTools,
  executePlan,
  findActiveProjectThread,
  getAgentThread,
  getCapabilityBundle,
  hasAgentThreadLease,
  initializeAgentStore,
  listAgentThreads,
  listCapabilityBundles,
  listThreadHistory,
  planTurn,
  publishCapabilityBundle,
  recordToolResult,
  replanWithFeedback,
  restoreAgentThread,
  saveAgentThread,
  saveCapabilityBundleDraft,
  setAgentThreadProjectScope,
  skillDocument,
  subscribeAgentThreadEvents,
  threadEventsAfter,
  threadProjectIds,
  structuredToolDocs,
  updateAgentThreadMetadata,
  validateBundle,
  addThreadMessage,
  evaluateToolPolicy,
  shouldAutoApproveOperation,
  setAgentThreadMode,
  type AgentThread,
  type RunContext,
  listThreadCheckpoints,
  restoreProjectCheckpoint,
  listThreadMetrics,
} from '../agent-core';

const router = Router();

router.use(async (_req, res, next) => {
  try {
    await initializeAgentStore();
    next();
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

function requestId(req: AuthRequest) {
  return (req as AuthRequest & { requestId?: string }).requestId || `req_${randomUUID()}`;
}

function scope(req: AuthRequest) {
  return {
    tenantId: (req as AuthRequest & { tenantId?: string }).tenantId || 'local',
    userId: req.user?.id || 'local',
    projectId: String(req.body?.projectId || req.query.projectId || '') || undefined,
  };
}

function context(req: AuthRequest): RunContext {
  const value = scope(req);
  return { tenantId: value.tenantId, userId: value.userId, user: req.user, requestId: requestId(req) };
}

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function errorResponse(res: Response, error: unknown, id: string) {
  const message = error instanceof Error ? error.message : String(error);
  const status = /无权/.test(message) ? 403 : /不存在|不能为空|尚未|必须|无效|循环|依赖|发布|确认/.test(message) ? 422 : 500;
  res.status(status).json({ error: message, requestId: id });
}

function threadFor(req: AuthRequest) {
  const thread = getAgentThread(param(req.params.id));
  if (!thread) throw new Error('项目智能体会话不存在');
  const current = scope(req);
  if (thread.tenantId !== current.tenantId || thread.userId !== current.userId) throw new Error('无权访问该项目智能体会话');
  for (const projectId of threadProjectIds(thread)) {
    const project = readProjectPackage(projectId);
    if (project && !canAccessProject(req.user, project, 'view')) throw new Error(`无权查看项目 ${projectId}`);
  }
  return thread;
}

function requestedProjectIds(req: AuthRequest) {
  return Array.isArray(req.body?.projectIds)
    ? req.body.projectIds.map(String).map((id: string) => id.trim()).filter(Boolean)
    : [];
}

function assertProjectScopeAccess(req: AuthRequest, projectIds: string[]) {
  for (const projectId of projectIds) {
    const project = readProjectPackage(projectId);
    if (!project) throw new Error(`项目 ${projectId} 不存在`);
    if (!canAccessProject(req.user, project, 'view')) throw new Error(`无权查看项目 ${projectId}`);
  }
}

function writeSse(res: Response, event: { type: string; seq?: number; data: any }) {
  res.write(`id: ${event.seq || ''}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

// ─── Threads ─────────────────────────────────────────────────────────────────

router.get('/threads', (req: AuthRequest, res) => {
  try {
    const current = scope(req);
    const requested = String(req.query.scope || '');
    if (requested && !['unbound', 'all'].includes(requested)) throw new Error('线程查询 scope 无效');
    res.json(listAgentThreads({
      ...current,
      scopeKind: current.projectId ? 'project' : requested === 'all' ? 'all' : 'unbound',
    }));
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.post('/threads', (req: AuthRequest, res) => {
  try {
    const current = scope(req);
    const projectIds = [...new Set([...requestedProjectIds(req), ...(current.projectId ? [current.projectId] : [])])];
    assertProjectScopeAccess(req, projectIds);
    const profileId = String(req.body.profileId || llmManagement.getProjectAgentProfileId({ tenantId: current.tenantId, projectId: current.projectId }));
    const thread = createAgentThread({
      ...current,
      projectIds,
      currentProjectId: current.projectId || (projectIds.length === 1 ? projectIds[0] : undefined),
      title: req.body.title,
      profileId,
      capabilityBundleVersionId: req.body.capabilityBundleVersionId,
    });
    if (req.body.mode === 'goal') setAgentThreadMode(thread, 'goal');
    res.status(201).json(thread);
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.get('/threads/history', (req: AuthRequest, res) => {
  try {
    const current = scope(req);
    const status = String(req.query.status || '');
    if (status && !['active', 'attention', 'completed'].includes(status)) throw new Error('历史任务状态筛选无效');
    const result = listThreadHistory(
      {
        ...current,
        q: String(req.query.q || ''),
        status: (status || undefined) as 'active' | 'attention' | 'completed' | undefined,
        projectId: String(req.query.projectId || '') || undefined,
        archived: String(req.query.archived || '') === 'true',
        cursor: String(req.query.cursor || '') || undefined,
        limit: Number(req.query.limit || 30),
      },
      (thread) => threadProjectIds(thread).every((projectId) => {
        const project = readProjectPackage(projectId);
        return !project || canAccessProject(req.user, project, 'view');
      }),
    );
    res.json(result);
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.get('/threads/:id', (req: AuthRequest, res) => {
  try {
    res.json(threadFor(req));
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.patch('/threads/:id', (req: AuthRequest, res) => {
  try {
    const allowed = new Set(['title', 'pinned', 'mode']);
    const unexpected = Object.keys(req.body || {}).filter((key) => !allowed.has(key));
    if (unexpected.length) throw new Error(`不支持更新线程字段：${unexpected.join('、')}`);
    const thread = threadFor(req);
    if (req.body.mode !== undefined) setAgentThreadMode(thread, String(req.body.mode) === 'goal' ? 'goal' : 'plan');
    res.json(updateAgentThreadMetadata(thread, {
      title: req.body.title === undefined ? undefined : String(req.body.title),
      pinned: req.body.pinned === undefined ? undefined : req.body.pinned === true,
    }));
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.post('/threads/:id/restore', (req: AuthRequest, res) => {
  try {
    res.json(restoreAgentThread(threadFor(req)));
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.put('/threads/:id/projects', (req: AuthRequest, res) => {
  try {
    const thread = threadFor(req);
    if (['executing', 'awaiting_operation_approval'].includes(thread.status) || hasAgentThreadLease(thread.id)) throw new Error('请先暂停当前任务，再调整限定项目');
    const projectIds = requestedProjectIds(req);
    const currentProjectId = String(req.body.currentProjectId || '') || undefined;
    assertProjectScopeAccess(req, projectIds);
    const previous = threadProjectIds(thread);
    const removed = previous.filter((projectId) => !projectIds.includes(projectId));
    const referenced = thread.plan?.tasks.filter((task) => task.projectId && removed.includes(task.projectId) && !['passed', 'superseded', 'cancelled'].includes(task.status)) || [];
    if (referenced.length) throw new Error(`以下未完成任务仍使用要移除的项目：${referenced.map((task) => task.title).join('、')}`);
    setAgentThreadProjectScope(thread, projectIds, currentProjectId);
    appendAgentThreadEvent(thread, 'thread_project_scope_changed', { previousProjectIds: previous, projectIds: threadProjectIds(thread), currentProjectId: thread.currentProjectId, reason: 'user_updated_scope' });
    res.json(thread);
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.delete('/threads/:id/permanent', async (req: AuthRequest, res) => {
  try {
    const thread = threadFor(req);
    if (req.body?.confirmed !== true) throw new Error('永久删除需要明确确认');
    if (['executing', 'awaiting_operation_approval'].includes(thread.status) || hasAgentThreadLease(thread.id)) throw new Error('任务仍在执行，请先等待安全暂停');
    res.json(await deleteAgentThread(thread));
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.delete('/threads/:id', (req: AuthRequest, res) => {
  try {
    res.json(archiveAgentThread(threadFor(req)));
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

// ─── Events (SSE) ────────────────────────────────────────────────────────────

router.get('/threads/:id/events', (req: AuthRequest, res) => {
  try {
    const thread = threadFor(req);
    const after = Number(req.query.afterSeq || req.headers['last-event-id'] || 0);
    if (!req.headers.accept?.includes('text/event-stream')) {
      return res.json({ events: threadEventsAfter(thread, after), lastSeq: thread.events.at(-1)?.seq || 0 });
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    threadEventsAfter(thread, after).forEach((event) => writeSse(res, event));
    const unsubscribe = subscribeAgentThreadEvents(thread.id, (event) => writeSse(res, event));
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (error) {
    if (!res.headersSent) errorResponse(res, error, requestId(req));
    else res.end();
  }
});

// ─── Turns ───────────────────────────────────────────────────────────────────

function failPlanningTurn(thread: AgentThread, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  thread.status = 'failed';
  appendAgentThreadEvent(thread, 'turn_failed', { turnId: thread.turnId, stage: 'planning', error: message, retryable: true });
  saveAgentThread(thread);
}

function resetBlockedOrFailedTasks(thread: AgentThread) {
  let changed = false;
  for (const task of thread.plan?.tasks || []) {
    if (['failed', 'blocked'].includes(task.status)) {
      task.status = 'pending';
      task.attempt = 0;
      task.error = undefined;
      task.failureClass = undefined;
      task.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) appendAgentThreadEvent(thread, 'recovery_reset', { reason: 'user_continue' });
}

router.post('/threads/:id/turns', async (req: AuthRequest, res) => {
  const id = requestId(req);
  let unsubscribe: (() => void) | undefined;
  let thread: AgentThread | undefined;
  try {
    thread = threadFor(req);
    const prompt = String(req.body.prompt || '').trim();
    if (!prompt) throw new Error('prompt 不能为空');
    if (thread.pendingApproval) throw new Error('当前有待确认操作');
    const run = context(req);
    thread.turnId = `paturn_${randomUUID()}`;
    appendAgentThreadEvent(thread, 'turn_started', { turnId: thread.turnId });

    if (req.body.mode === 'goal' || req.body.mode === 'plan') {
      if (thread.mode !== req.body.mode) {
        setAgentThreadMode(thread, req.body.mode);
        appendAgentThreadEvent(thread, 'mode_changed', { mode: req.body.mode, reason: 'user_turn_override' });
      }
    }

    if (hasAgentThreadLease(thread.id) || thread.status === 'executing') {
      thread.controlSignal = 'steer';
      thread.pendingSteer = prompt;
      appendAgentThreadEvent(thread, 'steer_requested', { prompt });
      return res.status(202).json({ turnId: thread.turnId, thread });
    }

    const wantsStream = req.headers.accept?.includes('text/event-stream');
    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      threadEventsAfter(thread, Number(req.body.afterSeq || 0)).forEach((event) => writeSse(res, event));
      unsubscribe = subscribeAgentThreadEvents(thread.id, (event) => writeSse(res, event));
    }

    const hasConfirmedPlan = thread.plan?.status === 'confirmed';
    if (hasConfirmedPlan && !['awaiting_plan_approval', 'planning'].includes(thread.status)) {
      addThreadMessage(thread, 'user', 'prompt', prompt, thread.turnId);
      appendAgentThreadEvent(thread, 'user_input_applied', { turnId: thread.turnId });
      thread.consecutiveNoProgress = 0;
      thread.blockedCount = 0;
      thread.blockedConditionFingerprint = undefined;
      thread.decisionSteps = 0;
      resetBlockedOrFailedTasks(thread);
      saveAgentThread(thread);
      void executePlan(thread, run);
    } else {
      await planTurn(thread, prompt, run);
      if (thread.mode === 'goal' && thread.plan?.status === 'pending') {
        confirmPlan(thread);
        appendAgentThreadEvent(thread, 'goal_mode_auto_started', { planId: thread.plan.id, planRevision: thread.plan.revision });
        void executePlan(thread, run);
      }
    }

    appendAgentThreadEvent(thread, 'turn_completed', { turnId: thread.turnId, status: thread.status });
    const payload = { turnId: thread.turnId, thread };
    if (wantsStream) res.end();
    else res.status(202).json(payload);
  } catch (error) {
    if (thread && ['planning'].includes(thread.status)) failPlanningTurn(thread, error);
    if (res.headersSent) {
      writeSse(res, { type: 'error', data: { error: error instanceof Error ? error.message : String(error), requestId: id } });
      res.end();
    } else {
      errorResponse(res, error, id);
    }
  } finally {
    unsubscribe?.();
  }
});

router.post('/threads/:id/turns/retry', async (req: AuthRequest, res) => {
  const id = requestId(req);
  let thread: AgentThread | undefined;
  try {
    thread = threadFor(req);
    if (thread.pendingApproval) throw new Error('当前有待确认操作');
    if (hasAgentThreadLease(thread.id) || thread.status === 'executing') throw new Error('当前任务仍在执行，不能重试规划');
    const failure = [...thread.events].reverse().find((event) => event.type === 'turn_failed' && event.data?.stage === 'planning' && event.data?.retryable !== false);
    const prompt = [...thread.messages].reverse().find((message) => message.role === 'user')?.content;
    if (!failure || !prompt) throw new Error('可重试的规划失败记录不存在');
    thread.turnId = `paturn_${randomUUID()}`;
    appendAgentThreadEvent(thread, 'turn_retry_requested', { turnId: thread.turnId, retryOf: failure.data?.turnId, stage: 'planning' });
    appendAgentThreadEvent(thread, 'turn_started', { turnId: thread.turnId, retryOf: failure.data?.turnId });
    await planTurn(thread, prompt, context(req));
    appendAgentThreadEvent(thread, 'turn_completed', { turnId: thread.turnId, status: thread.status, retryOf: failure.data?.turnId });
    res.status(202).json({ turnId: thread.turnId, thread });
  } catch (error) {
    if (thread && ['planning'].includes(thread.status)) failPlanningTurn(thread, error);
    errorResponse(res, error, id);
  }
});

// ─── Plan ────────────────────────────────────────────────────────────────────

router.post('/threads/:id/plan/confirm', (req: AuthRequest, res) => {
  const id = requestId(req);
  try {
    const thread = threadFor(req);
    const plan = thread.plan;
    if (!plan || plan.status !== 'pending') throw new Error('待确认计划不存在');
    if (req.body.acknowledged !== true) throw new Error('请先核对并确认目标、成功标准和风险边界');
    if (Number(req.body.planRevision) !== Number(plan.revision)) throw new Error('计划已发生变化，请重新生成并核对');
    const current = scope(req);
    for (const projectId of threadProjectIds(thread)) {
      const conflict = findActiveProjectThread({ tenantId: current.tenantId, userId: current.userId, projectId }, thread.id);
      if (conflict) throw new Error(`项目 ${projectId} 的线程「${conflict.title}」仍在执行，必须先暂停或停止该线程`);
    }
    confirmPlan(thread);
    void executePlan(thread, context(req));
    res.status(202).json({ thread });
  } catch (error) {
    errorResponse(res, error, id);
  }
});

router.post('/threads/:id/plan/reject', async (req: AuthRequest, res) => {
  const id = requestId(req);
  try {
    const thread = threadFor(req);
    if (!thread.plan || thread.plan.status !== 'pending') throw new Error('待确认计划不存在');
    const feedback = String(req.body.feedback || '').trim();
    await replanWithFeedback(thread, feedback || '请重新规划', context(req));
    res.status(202).json({ thread });
  } catch (error) {
    if (threadFor(req) && ['planning'].includes(threadFor(req).status)) failPlanningTurn(threadFor(req), error);
    errorResponse(res, error, id);
  }
});

// ─── Operations (approval) ───────────────────────────────────────────────────

router.post('/threads/:id/operations/:operationId/decision', async (req: AuthRequest, res) => {
  const id = requestId(req);
  try {
    const thread = threadFor(req);
    const approval = thread.pendingApproval;
    if (!approval || approval.id !== param(req.params.operationId)) throw new Error('待确认操作不存在');
    const task = thread.plan?.tasks.find((item) => item.id === approval.taskId);
    const run = context(req);

    if (req.body.approved !== true) {
      thread.pendingApproval = undefined;
      if (task) {
        task.status = 'failed';
        task.error = '用户拒绝破坏性操作';
        task.failureClass = 'user_rejected';
        task.updatedAt = new Date().toISOString();
      }
      appendAgentThreadEvent(thread, 'approval_decided', { approvalId: approval.id, approved: false });
      thread.status = 'paused';
      saveAgentThread(thread);
      return res.json({ thread });
    }

    const policy = evaluateToolPolicy(approval.toolName, thread.plan?.request || '', task);
    if (policy.level === 'forbidden') {
      thread.pendingApproval = undefined;
      if (task) {
        task.status = 'blocked';
        task.error = policy.userMessage;
        task.failureClass = 'permission';
        task.updatedAt = new Date().toISOString();
      }
      appendAgentThreadEvent(thread, 'operation_blocked', { approvalId: approval.id, taskId: task?.id, toolName: approval.toolName, reason: policy.reason, summary: policy.userMessage });
      thread.status = 'paused';
      saveAgentThread(thread);
      return res.status(200).json({ thread, blocked: true });
    }

    const projectId = approval.projectId || thread.currentProjectId;
    const result = await executeLlmTool(approval.toolName, { ...approval.arguments, confirmationToken: approval.confirmation.token }, {
      tenantId: run.tenantId,
      projectId,
      userId: run.userId,
      user: run.user,
      requestId: run.requestId,
      mcpRole: approval.scope,
    });

    if ('status' in result && result.status === 'confirmation_required') {
      thread.pendingApproval = { ...approval, id: `pao_${randomUUID()}`, confirmation: result.confirmation };
      appendAgentThreadEvent(thread, 'approval_refreshed', { approvalId: approval.id, toolName: approval.toolName, reason: 'expired_or_stale_token' });
      saveAgentThread(thread);
      return res.status(202).json({ thread });
    }

    thread.pendingApproval = undefined;
    appendAgentThreadEvent(thread, 'approval_decided', { approvalId: approval.id, approved: true, automatic: req.body.automatic === true && shouldAutoApproveOperation(env.mode), mode: env.mode });
    const outcome = await recordToolResult(thread, run, {
      toolName: approval.toolName,
      scope: approval.scope,
      taskId: approval.taskId,
      arguments: approval.arguments,
    }, approval.scope, result);

    if (outcome === 'waiting') {
      return res.status(202).json({ thread });
    }
    saveAgentThread(thread);
    void executePlan(thread, run);
    res.status(202).json({ thread });
  } catch (error) {
    errorResponse(res, error, id);
  }
});

// ─── Control ─────────────────────────────────────────────────────────────────

router.post('/threads/:id/control', (req: AuthRequest, res) => {
  const id = requestId(req);
  try {
    const thread = threadFor(req);
    const action = String(req.body.action || '');
    if (!['pause', 'continue', 'stop', 'retry', 'replan'].includes(action)) throw new Error('控制动作无效');
    const running = hasAgentThreadLease(thread.id) || thread.status === 'executing';

    if (action === 'pause') {
      if (running) thread.controlSignal = 'pause';
      else thread.status = 'paused';
    }
    if (action === 'stop') {
      thread.pendingApproval = undefined;
      if (running) thread.controlSignal = 'stop';
      else {
        thread.status = 'stopped';
        for (const task of thread.plan?.tasks || []) if (['pending', 'running'].includes(task.status)) task.status = 'cancelled';
      }
    }
    if (action === 'retry') {
      thread.blockedCount = 0;
      thread.blockedConditionFingerprint = undefined;
      thread.consecutiveNoProgress = 0;
      for (const task of thread.plan?.tasks || []) {
        if (task.status === 'failed' || task.status === 'blocked') {
          task.status = 'pending';
          task.error = undefined;
          task.failureClass = undefined;
          task.attempt = 0;
          task.updatedAt = new Date().toISOString();
        }
      }
      appendAgentThreadEvent(thread, 'recovery_reset', { reason: 'user_retry' });
    }
    if (action === 'replan') {
      if (thread.plan) {
        if (thread.plan.status === 'confirmed' || thread.plan.status === 'executed') thread.plan.status = 'superseded';
        for (const task of thread.plan.tasks) if (['pending', 'running'].includes(task.status)) task.status = 'cancelled';
      }
      thread.status = 'idle';
    }

    appendAgentThreadEvent(thread, 'execution_control', { action });
    if (action === 'continue' || action === 'retry') {
      if (thread.pendingApproval) throw new Error('当前有待确认操作');
      thread.controlSignal = undefined;
      thread.decisionSteps = 0;
      resetBlockedOrFailedTasks(thread);
      if (thread.plan?.status === 'confirmed') {
        thread.status = 'idle';
        void executePlan(thread, context(req));
      } else {
        thread.status = 'paused';
      }
    }
    if (action === 'replan') {
      const lastPrompt = [...thread.messages].reverse().find((message) => message.role === 'user')?.content;
      if (lastPrompt) void planTurn(thread, lastPrompt, context(req));
    }
    res.status(202).json({ thread });
  } catch (error) {
    errorResponse(res, error, id);
  }
});

router.post('/threads/:id/steer', (req: AuthRequest, res) => {
  const id = requestId(req);
  try {
    const thread = threadFor(req);
    const prompt = String(req.body.prompt || '').trim();
    if (!prompt) throw new Error('prompt 不能为空');
    if (thread.pendingApproval) throw new Error('当前有待确认操作');
    if (hasAgentThreadLease(thread.id) || thread.status === 'executing') {
      thread.controlSignal = 'steer';
      thread.pendingSteer = prompt;
      appendAgentThreadEvent(thread, 'steer_requested', { prompt });
      return res.status(202).json({ thread });
    }
    thread.turnId = `paturn_${randomUUID()}`;
    addThreadMessage(thread, 'user', 'prompt', prompt, thread.turnId);
    thread.consecutiveNoProgress = 0;
    thread.blockedCount = 0;
    thread.blockedConditionFingerprint = undefined;
    thread.decisionSteps = 0;
    resetBlockedOrFailedTasks(thread);
    if (thread.plan?.status === 'confirmed') {
      thread.status = 'idle';
      void executePlan(thread, context(req));
    } else {
      void planTurn(thread, prompt, context(req));
    }
    res.status(202).json({ thread });
  } catch (error) {
    errorResponse(res, error, id);
  }
});

// ─── Checkpoints（写前自动快照 + 用户回滚） ──────────────────────────────────

router.get('/threads/:id/checkpoints', (req: AuthRequest, res) => {
  try {
    const thread = threadFor(req);
    res.json({ checkpoints: listThreadCheckpoints(thread.id) });
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.post('/threads/:id/checkpoints/restore', async (req: AuthRequest, res) => {
  const id = requestId(req);
  try {
    const thread = threadFor(req);
    if (['executing', 'awaiting_operation_approval'].includes(thread.status) || hasAgentThreadLease(thread.id)) {
      throw new Error('任务仍在执行，请先暂停或停止后再恢复');
    }
    const available = listThreadCheckpoints(thread.id);
    const requested = String(req.body.checkpointPath || available[0] || '');
    if (!requested) throw new Error('没有可恢复的检查点');
    const match = requested.match(/([A-Za-z0-9_-]+)__([\w.-]+)__(\d+)$/);
    if (!match) throw new Error('检查点路径无效');
    const [, projectId, taskId, attemptText] = match;
    const restored = restoreProjectCheckpoint(thread.id, projectId, taskId, Number(attemptText));
    if (!restored) throw new Error('检查点不存在');
    thread.projectRevisions = {};
    thread.status = 'paused';
    appendAgentThreadEvent(thread, 'checkpoint.restored', { projectId, taskId, attempt: Number(attemptText), by: 'user' });
    saveAgentThread(thread);
    res.json({ success: true, thread });
  } catch (error) {
    errorResponse(res, error, id);
  }
});

// ─── Metrics（运行统计） ───────────────────────────────────────────────────────

router.get('/threads/:id/metrics', (req: AuthRequest, res) => {
  try {
    const thread = threadFor(req);
    res.json({ metrics: thread.turnMetrics || null });
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.get('/metrics', (req: AuthRequest, res) => {
  try {
    if (env.mode === 'cloud' && req.user?.role !== 'admin') {
      res.status(403).json({ error: '需要管理员权限', requestId: requestId(req) });
      return;
    }
    const rows = listThreadMetrics();
    const summary = rows.reduce((acc, row) => {
      const metrics = row.metrics;
      if (!metrics) return acc;
      acc.threads += 1;
      acc.modelCalls += metrics.modelCalls;
      acc.toolCalls += metrics.toolCalls;
      acc.invalidToolCalls += metrics.invalidToolCalls;
      acc.approvals += metrics.approvals;
      acc.approvalRejections += metrics.approvalRejections;
      acc.retries += metrics.retries;
      acc.compactions += metrics.compactions;
      acc.pauses += metrics.pauses;
      acc.tokenPrompt += metrics.tokenUsage.prompt;
      acc.tokenCompletion += metrics.tokenUsage.completion;
      return acc;
    }, { threads: 0, modelCalls: 0, toolCalls: 0, invalidToolCalls: 0, approvals: 0, approvalRejections: 0, retries: 0, compactions: 0, pauses: 0, tokenPrompt: 0, tokenCompletion: 0 });
    const invalidRatio = summary.toolCalls ? Math.round((summary.invalidToolCalls / summary.toolCalls) * 100) : 0;
    res.json({ summary: { ...summary, invalidRatioPct: invalidRatio }, threads: rows.map((row) => ({ threadId: row.threadId, title: row.title, status: row.status, metrics: row.metrics })) });
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

// ─── Capability bundles ──────────────────────────────────────────────────────

router.get('/capability-bundles', (req: AuthRequest, res) => {
  try {
    res.json(listCapabilityBundles(scope(req).userId));
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.get('/capability-bundles/:id/scopes', (req: AuthRequest, res) => {
  try {
    const bundle = getCapabilityBundle(param(req.params.id), scope(req).userId);
    if (!bundle) throw new Error('能力包不存在');
    res.json({
      bundle,
      scopes: bundle.scopes.map((item) => {
        const full = skillDocument(item, bundle);
        return {
          ...item,
          effectiveTools: effectiveScopeTools(item).map((tool) => ({ name: tool.name, title: tool.title, risk: tool.risk })),
          availableTools: listFormFlowTools(item.role).filter((tool) => tool.name !== 'release.apply').map((tool) => ({ name: tool.name, title: tool.title, risk: tool.risk })),
          toolDocs: structuredToolDocs(item.role),
          skillPreview: full.length > 12000 ? `${full.slice(0, 12000)}\n\n…（预览截断，运行时会将完整 skill 注入模型上下文）` : full,
        };
      }),
    });
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.post('/capability-bundles', (req: AuthRequest, res) => {
  try {
    res.status(201).json(saveCapabilityBundleDraft(req.body, scope(req).userId));
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.put('/capability-bundles/:id', (req: AuthRequest, res) => {
  try {
    res.json(saveCapabilityBundleDraft({ ...req.body, id: param(req.params.id) }, scope(req).userId));
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.post('/capability-bundles/:id/validate', (req: AuthRequest, res) => {
  try {
    const bundle = getCapabilityBundle(param(req.params.id), scope(req).userId);
    if (!bundle) throw new Error('能力包不存在');
    res.json(validateBundle(bundle));
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.post('/capability-bundles/:id/publish', (req: AuthRequest, res) => {
  try {
    res.json(publishCapabilityBundle(param(req.params.id), scope(req).userId));
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

export { router as projectAgentV4Router };
