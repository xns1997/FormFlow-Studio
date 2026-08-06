/**
 * Project Agent V5 — thin HTTP/SSE route over the v2 single-loop dynamic core.
 * No plan confirmation, no mode switch, no task checklist: a turn starts the
 * Codex-style loop immediately; users steer/pause/stop at any time.
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
  addThreadMessage,
  appendAgentThreadEvent,
  archiveAgentThread,
  createAgentThread,
  deleteAgentThread,
  effectiveScopeTools,
  findActiveProjectThread,
  getAgentThread,
  getCapabilityBundle,
  hasAgentThreadLease,
  initializeAgentStore,
  listAgentThreads,
  listCapabilityBundles,
  listThreadCheckpoints,
  listThreadHistory,
  listThreadMetrics,
  publishCapabilityBundle,
  recordToolResult,
  restoreAgentThread,
  restoreProjectCheckpoint,
  runTurn,
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
  evaluateToolPolicy,
  shouldAutoApproveOperation,
  type AgentThread,
  type RunContext,
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
  const scopeKind = ['all', 'project', 'unbound'].includes(String(req.query.scope || '')) ? String(req.query.scope) as 'all' | 'project' | 'unbound' : undefined;
  return {
    tenantId: (req as AuthRequest & { tenantId?: string }).tenantId || 'local',
    userId: req.user?.id || 'local',
    projectId: String(req.body?.projectId || req.query.projectId || '') || undefined,
    scopeKind,
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
  const status = /无权/.test(message) ? 403 : /不存在|不能为空|尚未|必须|失败|无效|循环|依赖|发布|确认/.test(message) ? 422 : 500;
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
    const items = listAgentThreads(scope(req));
    res.json({ items, total: items.length });
  } catch (error) {
    errorResponse(res, error, requestId(req));
  }
});

router.post('/threads', (req: AuthRequest, res) => {
  const id = requestId(req);
  try {
    const projectIds = requestedProjectIds(req);
    const bound = String(req.body.projectId || '') || projectIds[0];
    if (bound) assertProjectScopeAccess(req, [bound]);
    if (projectIds.length) assertProjectScopeAccess(req, projectIds);
    const value = createAgentThread({
      tenantId: scope(req).tenantId,
      userId: scope(req).userId,
      projectIds,
      currentProjectId: bound,
      title: String(req.body.title || ''),
      profileId: String(req.body.profileId || 'default-cloud'),
      capabilityBundleVersionId: String(req.body.capabilityBundleVersionId || 'cap_default_v1'),
    });
    res.status(201).json(value);
  } catch (error) {
    errorResponse(res, error, id);
  }
});

router.get('/threads/history', (req: AuthRequest, res) => {
  try {
    const value = scope(req);
    const status = ['active', 'attention', 'completed'].includes(String(req.query.status)) ? String(req.query.status) as 'active' | 'attention' | 'completed' : undefined;
    res.json(listThreadHistory({
      tenantId: value.tenantId,
      userId: value.userId,
      q: String(req.query.q || ''),
      status,
      projectId: String(req.query.projectId || ''),
      archived: req.query.archived === 'true',
      cursor: String(req.query.cursor || ''),
      limit: Number(req.query.limit || 30),
    }));
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
  const id = requestId(req);
  try {
    const thread = threadFor(req);
    res.json(updateAgentThreadMetadata(thread, { title: req.body.title, pinned: req.body.pinned }));
  } catch (error) {
    errorResponse(res, error, id);
  }
});

router.put('/threads/:id/projects', (req: AuthRequest, res) => {
  const id = requestId(req);
  try {
    const thread = threadFor(req);
    const projectIds = requestedProjectIds(req);
    assertProjectScopeAccess(req, projectIds);
    res.json(setAgentThreadProjectScope(thread, projectIds, String(req.body.currentProjectId || '')));
  } catch (error) {
    errorResponse(res, error, id);
  }
});

router.post('/threads/:id/restore', (req: AuthRequest, res) => {
  const id = requestId(req);
  try {
    res.json(restoreAgentThread(threadFor(req)));
  } catch (error) {
    errorResponse(res, error, id);
  }
});

router.delete('/threads/:id/permanent', async (req: AuthRequest, res) => {
  const id = requestId(req);
  try {
    const thread = threadFor(req);
    if (req.body.confirmed !== true) throw new Error('需要确认后才能永久删除');
    res.json(await deleteAgentThread(thread));
  } catch (error) {
    errorResponse(res, error, id);
  }
});

router.delete('/threads/:id', (req: AuthRequest, res) => {
  const id = requestId(req);
  try {
    res.json(archiveAgentThread(threadFor(req)));
  } catch (error) {
    errorResponse(res, error, id);
  }
});

// ─── Events / SSE ────────────────────────────────────────────────────────────

router.get('/threads/:id/events', (req: AuthRequest, res) => {
  const id = requestId(req);
  try {
    const thread = threadFor(req);
    if (!req.headers.accept?.includes('text/event-stream')) {
      res.json({ events: threadEventsAfter(thread, Number(req.query.afterSeq || 0)), total: thread.events.length });
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    threadEventsAfter(thread, Number(req.query.afterSeq || 0)).forEach((event) => writeSse(res, event));
    const unsubscribe = subscribeAgentThreadEvents(thread.id, (event) => writeSse(res, event));
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (error) {
    if (!res.headersSent) errorResponse(res, error, id);
    else res.end();
  }
});

// ─── Turns ───────────────────────────────────────────────────────────────────

function resetTurnCounters(thread: AgentThread) {
  thread.consecutiveNoProgress = 0;
  thread.blockedCount = 0;
  thread.blockedConditionFingerprint = undefined;
  thread.decisionSteps = 0;
  thread.recoveryCycles = 0;
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

    // 新用户输入 = 新 Turn：立即进入动态执行，无需确认、无需模式。
    thread.turnId = `paturn_${randomUUID()}`;
    thread.completionGate = req.body.finalGate === false ? 'light' : 'full';
    addThreadMessage(thread, 'user', 'prompt', prompt, thread.turnId);
    appendAgentThreadEvent(thread, 'user_input_applied', { turnId: thread.turnId });
    resetTurnCounters(thread);
    thread.pendingApproval = undefined;
    thread.status = 'idle';
    saveAgentThread(thread);
    void runTurn(thread, run);

    appendAgentThreadEvent(thread, 'turn_completed', { turnId: thread.turnId, status: thread.status });
    const payload = { turnId: thread.turnId, thread };
    if (wantsStream) res.end();
    else res.status(202).json(payload);
  } catch (error) {
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
  try {
    const thread = threadFor(req);
    if (thread.status !== 'failed') throw new Error('只有失败状态可以重试');
    thread.status = 'idle';
    resetTurnCounters(thread);
    thread.turnId = `paturn_${randomUUID()}`;
    saveAgentThread(thread);
    void runTurn(thread, context(req));
    res.status(202).json({ turnId: thread.turnId, thread });
  } catch (error) {
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
    const run = context(req);

    if (req.body.approved !== true) {
      thread.pendingApproval = undefined;
      appendAgentThreadEvent(thread, 'approval_decided', { approvalId: approval.id, approved: false });
      thread.status = 'paused';
      saveAgentThread(thread);
      return res.json({ thread });
    }

    const policy = evaluateToolPolicy(approval.toolName, thread.dynamicPlan?.goal || '');
    if (policy.level === 'forbidden') {
      thread.pendingApproval = undefined;
      appendAgentThreadEvent(thread, 'operation_blocked', { approvalId: approval.id, toolName: approval.toolName, reason: policy.reason, summary: policy.userMessage });
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
      arguments: approval.arguments,
    }, approval.scope, result);

    if (outcome === 'waiting') {
      return res.status(202).json({ thread });
    }
    thread.status = 'idle';
    saveAgentThread(thread);
    void runTurn(thread, run);
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
    if (!['pause', 'continue', 'stop', 'retry'].includes(action)) throw new Error('控制动作无效');
    const running = hasAgentThreadLease(thread.id) || thread.status === 'executing';

    if (action === 'pause') {
      if (running) thread.controlSignal = 'pause';
      else thread.status = 'paused';
    }
    if (action === 'stop') {
      thread.pendingApproval = undefined;
      if (running) thread.controlSignal = 'stop';
      else thread.status = 'stopped';
    }
    if (action === 'retry') {
      resetTurnCounters(thread);
      thread.pendingApproval = undefined;
      appendAgentThreadEvent(thread, 'recovery_reset', { reason: 'user_retry' });
    }

    appendAgentThreadEvent(thread, 'execution_control', { action });
    if (action === 'continue' || action === 'retry') {
      if (thread.pendingApproval) throw new Error('当前有待确认操作');
      thread.controlSignal = undefined;
      resetTurnCounters(thread);
      if (thread.status === 'blocked' || thread.status === 'failed') {
        thread.status = 'idle';
        if (action === 'retry') thread.turnId = `paturn_${randomUUID()}`;
      } else {
        thread.status = 'idle';
      }
      saveAgentThread(thread);
      void runTurn(thread, context(req));
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
    resetTurnCounters(thread);
    thread.status = 'idle';
    saveAgentThread(thread);
    void runTurn(thread, context(req));
    res.status(202).json({ thread });
  } catch (error) {
    errorResponse(res, error, id);
  }
});

// ─── Checkpoints ─────────────────────────────────────────────────────────────

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

// ─── Metrics ─────────────────────────────────────────────────────────────────

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

export { router as projectAgentV5Router };
