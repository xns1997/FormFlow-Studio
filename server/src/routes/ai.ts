import { Router, type NextFunction, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { AuthRequest } from '../middleware/auth';
import { env } from '../config/env';
import { llmManagement, type ScopeContext } from '../services/llm-management';
import { isRetryableLlmRpcError, llmProviderClient, LlmProviderRpcError, type LlmMessage } from '../services/llm-provider-client';
import { executeLlmTool, listFormFlowTools } from '../services/llm-tools';
import { getFormFlowTool, isMcpRole, MCP_ROLE_CATALOG, type McpRole } from '../services/formflow-tool-registry';
import { checkAiHealth, runtimeHealth } from '../services/runtime-health';
import { deleteKnowledge, searchKnowledge, upsertKnowledgeChunks } from '../services/vector-store';
import { createRuleAgentSession, getRuleAgentSession, listRuleAgentSessions, saveRuleAgentSession } from '../services/rule-agent-store';
import { applyRuleProposal, createRuleProposal, formContext, inferRuleAgentIntent, lintRuleCode, readRuleReference, runRuleSandbox } from '../services/rule-agent';
import { canAccessProject, type ProjectAccess } from '../services/permission';
import { readProjectPackage } from '../services/project-package-store';
import {
  addProjectAgentMessage, createProjectAgentSession, getProjectAgentSession, listProjectAgentSessions,
  recordProjectAgentEvents, saveProjectAgentSession, type ProjectAgentMode, type ProjectAgentSession, type ProjectAgentStage,
} from '../services/project-agent-store';
import { projectAgentV2Router } from './project-agent-v2';

const router = Router();
router.use('/project-agent/v2', projectAgentV2Router);

type AiRequest = {
  provider?: 'openai' | 'local';
  profileId?: string;
  projectId?: string;
  messages?: LlmMessage[];
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: unknown[];
  responseSchema?: Record<string, unknown>;
};

function contextOf(req: AuthRequest): ScopeContext {
  return { tenantId: (req as AuthRequest & { tenantId?: string }).tenantId, projectId: String(req.body?.projectId || req.query.projectId || '') || undefined };
}

function knowledgeContextOf(req: AuthRequest): ScopeContext {
  const context = contextOf(req);
  if (env.mode === 'cloud' && !context.tenantId) throw new Error('知识库操作必须指定租户');
  if (!context.projectId) throw new Error('知识库操作必须指定 projectId');
  return context;
}

function requestIdOf(req: AuthRequest) { return (req as AuthRequest & { requestId?: string }).requestId || `req_${Date.now()}`; }
function param(value: string | string[]) { return Array.isArray(value) ? value[0] : value; }

const runtimeAuthorizations = new Map<string, { sessionId: string; fields: string[]; expiresAt: number }>();
const sensitiveRuntimeField = /(password|passwd|pwd|token|secret|api.?key|access.?key|id.?card|身份证|手机|电话|phone|mobile|email|邮箱)/i;
function sanitizedRuntime(input: any, allowedRawFields: string[] = []) {
  const allowed = new Set(allowedRawFields); const runtime = input && typeof input === 'object' ? input : {};
  const mask = (values: any) => Object.fromEntries(Object.entries(values && typeof values === 'object' ? values : {}).map(([field, value]) => sensitiveRuntimeField.test(field) && !allowed.has(field) ? [field, { masked: true, type: Array.isArray(value) ? 'array' : typeof value, present: value != null && String(value).length > 0 }] : [field, value]));
  return { source: runtime.source === 'live' ? 'live' : 'synthetic', capturedAt: runtime.capturedAt || new Date().toISOString(), values: mask(runtime.values), originalValues: mask(runtime.originalValues), dirtyFields: Array.isArray(runtime.dirtyFields) ? runtime.dirtyFields.map(String) : [], componentStates: runtime.componentStates || {}, validationErrors: runtime.validationErrors || {}, recentLogs: Array.isArray(runtime.recentLogs) ? runtime.recentLogs.slice(-30) : [] };
}
function ruleScope(req: AuthRequest) { const context = contextOf(req); return { tenantId: context.tenantId || 'local', userId: req.user?.id || 'local', projectId: String(req.body?.projectId || req.query.projectId || ''), formId: String(req.body?.formId || req.query.formId || '') }; }
function assertRuleSessionScope(session: Awaited<ReturnType<typeof getRuleAgentSession>>, req: AuthRequest) {
  if (!session) throw new Error('规则智能体会话不存在');
  const scope = ruleScope(req);
  if (session.tenantId !== scope.tenantId || session.userId !== scope.userId || (scope.projectId && session.projectId !== scope.projectId)) throw new Error('无权访问该规则智能体会话');
  if (!canAccessProject(req.user, formContext(session.projectId, session.formId).project, 'view')) throw new Error('无权查看该项目');
  return session;
}
function assertRuleProjectAccess(req: AuthRequest, projectId: string, access: ProjectAccess) { const { project } = formContext(projectId, String(req.body?.formId || req.query.formId || req.body?.sessionFormId || '')); if (!canAccessProject(req.user, project, access)) throw new Error('无权访问该项目'); }

function projectAgentScope(req: AuthRequest) { const context = contextOf(req); return { tenantId: context.tenantId || 'local', userId: req.user?.id || 'local', projectId: String(req.body?.projectId || req.query.projectId || '') || undefined }; }
function assertProjectAgentSession(session: ProjectAgentSession | undefined, req: AuthRequest) {
  if (!session) throw new Error('项目智能体会话不存在'); const scope = projectAgentScope(req);
  if (session.tenantId !== scope.tenantId || session.userId !== scope.userId) throw new Error('无权访问该项目智能体会话');
  if (session.projectId) { const project = readProjectPackage(session.projectId); if (project && !canAccessProject(req.user, project, 'view')) throw new Error('无权查看该项目'); }
  return session;
}
const roleOrder: McpRole[] = ['project', 'data', 'form', 'workflow', 'behavior', 'quality', 'delivery'];
const roleTitles: Record<McpRole, string> = { project: '项目专家', data: '数据专家', form: '表单专家', workflow: '流程专家', behavior: '行为规则专家', quality: '质量专家', delivery: '交付专家' };
function stageForRole(role: McpRole): ProjectAgentStage {
  return { project: 'project_data', data: 'project_data', form: 'form_binding', workflow: 'workflow_binding', behavior: 'behavior_binding', quality: 'quality_repair', delivery: 'release_preview' }[role] as ProjectAgentStage;
}
function coordinatorPrompt(session: ProjectAgentSession) {
  return `你是 FormFlow 项目统筹智能体，当前处于 Plan 模式，不持有也不得调用任何项目工具。根据用户原始要求生成可确认、可执行、决策完整的实施方案。方案必须覆盖目标与成功标准、数据表及主键、窗体职责、工作流、行为规则、Mock/测试、质量门禁、交付结果、关键假设与风险。把实施工作拆成最少且完整的专职任务，严格按 project、data、form、workflow、behavior、quality、delivery 排序；不得规划自动调用 release.apply。为避免结构化响应被截断，每个角色最多一个任务，instruction 不超过 500 个汉字，acceptance 保留 2 至 6 条简短验收项，assumptions 和 risks 各不超过 6 条。\n${session.projectId ? `当前项目：${session.projectId}，方案用于编辑现有项目。` : '当前尚未绑定项目，方案用于从零创建项目。'}${session.blueprint ? `\n已有业务蓝图：${session.blueprint}` : ''}`;
}
function specialistPrompt(session: ProjectAgentSession, role: McpRole, instruction: string, retryCount = 0) {
  return `你是 FormFlow ${roleTitles[role]}，只能处理 ${role} 领域。任务：${instruction}\n${session.projectId ? `当前项目：${session.projectId}。每次修改前必须先 project.inspect、project.get 获取最新 revision；冲突时重新读取并重新计算。` : '当前尚未绑定项目，只能在 project 领域创建项目。'}${retryCount ? `\n这是失败后的第 ${retryCount} 次重试。项目可能保留了前次尝试的部分成果；先检查现有资源，已存在的资源应使用 update/upsert 补全，不要重复 create，也不要回放旧参数。` : ''}\n使用唯一且重试稳定的 idempotencyKey。完成后调用可用的项目校验工具。删除、覆盖必须等待确认。永不调用 release.apply。简洁报告完成项、校验和阻断项。`;
}
export function listProjectAgentTools(role: McpRole) { return listFormFlowTools(role).filter((tool) => tool.name !== 'release.apply'); }
export function projectAgentToolArguments(toolName: string, argumentsValue: Record<string, any>, checkpointRevision?: string) {
  const definition = getFormFlowTool(toolName); const supportsRevision = Boolean((definition?.inputSchema as any)?.properties?.baseRevision);
  return supportsRevision && checkpointRevision && !argumentsValue?.baseRevision ? { ...argumentsValue, baseRevision: checkpointRevision } : argumentsValue;
}

function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (env.mode !== 'cloud' || req.user?.role === 'admin') return next();
  return res.status(req.user ? 403 : 401).json({ error: req.user ? '需要管理员权限' : '需要登录' });
}

function scopedBody(req: AuthRequest) {
  const context = contextOf(req);
  const scope = req.body.scope || (context.projectId ? 'project' : context.tenantId ? 'tenant' : 'global');
  return { ...req.body, scope, tenantId: scope === 'tenant' || scope === 'project' ? context.tenantId : undefined, projectId: scope === 'project' ? context.projectId : undefined };
}

function sendError(res: Response, error: unknown, requestId: string) {
  const message = error instanceof Error ? error.message : String(error);
  const status = error instanceof LlmProviderRpcError ? error.httpStatus : /无权/.test(message) ? 403 : /不存在|无效|至少|引用|属于|必须|缺少|不能为空|Embedding|向量|过期|语法错误|测试失败/.test(message) ? 422 : 500;
  res.status(status).json({ error: message, requestId });
}

function resolveProfileId(body: AiRequest) { return body.profileId || (body.provider === 'local' ? 'default-local' : 'default-cloud'); }

async function complete(body: AiRequest, req: AuthRequest, overrideMessages?: LlmMessage[]) {
  const context = contextOf(req); const profile = llmManagement.resolveProfile(resolveProfileId(body), context);
  const messages = overrideMessages || body.messages || [{ role: 'user' as const, content: body.prompt || '' }];
  let lastError: unknown;
  for (const [index, route] of profile.routes.entries()) {
    try {
      return await llmProviderClient.chat({ connection: llmManagement.resolveConnection(route, context), messages, temperature: body.temperature ?? profile.defaults.temperature, maxTokens: body.maxTokens ?? profile.defaults.maxTokens, tools: body.tools, responseSchema: body.responseSchema, requestId: requestIdOf(req) });
    } catch (error) {
      lastError = error;
      if (!isRetryableLlmRpcError(error) || index === profile.routes.length - 1) throw error;
    }
  }
  throw lastError || new Error('没有可用模型路由');
}

async function embed(body: AiRequest & { input?: unknown }, req: AuthRequest) {
  const context = contextOf(req); const profile = llmManagement.resolveProfile(resolveProfileId(body), context);
  if (!profile.capabilities.includes('embedding')) throw new Error('模型 Profile 未声明 Embedding 能力');
  const input = Array.isArray(body.input) ? body.input.map(String) : [String(body.input || '')];
  let lastError: unknown;
  for (const [index, route] of profile.routes.entries()) {
    try { return await llmProviderClient.embed(llmManagement.resolveConnection(route, context), input, requestIdOf(req)); }
    catch (error) { lastError = error; if (!isRetryableLlmRpcError(error) || index === profile.routes.length - 1) throw error; }
  }
  throw lastError || new Error('没有可用的 Embedding 模型路由');
}

router.get('/health', async (req, res) => {
  const check = await checkAiHealth(() => llmProviderClient.health());
  const snapshot = runtimeHealth();
  res.status(check.available ? 200 : 503).json({
    ...check.details,
    status: check.available ? 'ok' : 'unavailable',
    available: check.available,
    checkedAt: check.checkedAt,
    latencyMs: check.latencyMs,
    error: check.error,
    checkpointStoreReady: (check.details as any)?.checkpointStoreReady,
    checkpointStore: (check.details as any)?.checkpointStore,
    capabilities: snapshot.capabilities,
    requestId: requestIdOf(req),
  });
});

router.all('/tools', (_req: AuthRequest, res) => res.status(410).json({ error: '统一工具目录已移除，请使用 /api/ai/mcp-roles/:role/tools', roles: MCP_ROLE_CATALOG }));
router.all('/tools/:name/invoke', (_req: AuthRequest, res) => res.status(410).json({ error: '无角色工具调用已移除，请使用 /api/ai/mcp-roles/:role/tools/:toolName/invoke', roles: MCP_ROLE_CATALOG }));
router.get('/mcp-roles', (_req: AuthRequest, res) => res.json({ roles: MCP_ROLE_CATALOG.map((role) => ({ ...role, tools: listFormFlowTools(role.id).length })) }));
router.get('/mcp-roles/:role/tools', (req: AuthRequest, res) => {
  const role = param(req.params.role);
  if (!isMcpRole(role)) return res.status(404).json({ error: `未知 MCP 角色：${role}`, roles: MCP_ROLE_CATALOG });
  res.json({ role, tools: listFormFlowTools(role) });
});

router.post('/mcp-roles/:role/tools/:toolName/invoke', async (req: AuthRequest, res) => {
  const requestId = requestIdOf(req);
  const role = param(req.params.role);
  if (!isMcpRole(role)) return res.status(404).json({ error: `未知 MCP 角色：${role}`, roles: MCP_ROLE_CATALOG, requestId });
  if (env.mode === 'cloud' && !(req as AuthRequest & { tenantId?: string }).tenantId) return res.status(422).json({ error: '工具调用必须指定 x-tenant-id', requestId });
  const argumentsValue = req.body?.arguments || req.body || {};
  const context = contextOf(req);
  const result = await executeLlmTool(param(req.params.toolName), argumentsValue, {
    ...context,
    projectId: String(argumentsValue.projectId || context.projectId || '') || undefined,
    userId: req.user?.id,
    user: req.user,
    requestId,
    mcpRole: role,
  });
  let status = 200;
  if (!result.ok && 'status' in result) status = 409;
  else if (!result.ok && 'error' in result) status = result.error.code === 'FORBIDDEN' ? 403 : result.error.code.endsWith('NOT_FOUND') ? 404 : 422;
  res.status(status).json(result);
});

router.post('/chat', async (req: AuthRequest, res) => {
  try { res.json(await complete(req.body || {}, req)); } catch (error) { sendError(res, error, requestIdOf(req)); }
});

router.post('/chat/stream', async (req: AuthRequest, res) => {
  const body = (req.body || {}) as AiRequest; const context = contextOf(req); const requestId = requestIdOf(req);
  try {
    const profile = llmManagement.resolveProfile(resolveProfileId(body), context);
    res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders();
    let currentCall: { cancel(): void } | undefined; let completed = false; let lastError: unknown;
    req.on('close', () => currentCall?.cancel());
    for (const [index, route] of profile.routes.entries()) {
      let emitted = false;
      const stream = llmProviderClient.chatStream({ connection: llmManagement.resolveConnection(route, context), messages: body.messages || [{ role: 'user', content: body.prompt || '' }], temperature: body.temperature ?? profile.defaults.temperature, maxTokens: body.maxTokens ?? profile.defaults.maxTokens, tools: body.tools, responseSchema: body.responseSchema, requestId }, (event) => { emitted = true; res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`); });
      currentCall = stream.call;
      try { await stream.done; completed = true; break; } catch (error) { lastError = error; if (emitted || !isRetryableLlmRpcError(error) || index === profile.routes.length - 1) throw error; }
    }
    if (!completed) throw lastError || new Error('没有可用模型路由');
    res.end();
  } catch (error) {
    if (!res.headersSent) return sendError(res, error, requestId);
    res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : String(error), requestId })}\n\n`); res.end();
  }
});

router.post('/embeddings', async (req: AuthRequest, res) => {
  const requestId = requestIdOf(req);
  try { res.json(await embed(req.body || {}, req)); } catch (error) { sendError(res, error, requestId); }
});

router.post('/knowledge/index', async (req: AuthRequest, res) => {
  const requestId = requestIdOf(req);
  if (!runtimeHealth().capabilities.vectorSearch) return res.status(503).json({ error: 'pgvector 当前不可用', requestId });
  try {
    const context = knowledgeContextOf(req);
    const documents = Array.isArray(req.body.documents) ? req.body.documents : [];
    if (!documents.length || documents.length > 100) return res.status(422).json({ error: 'documents 数量必须在 1 到 100 之间', requestId });
    const embedded = await embed({ ...req.body, input: documents.map((item: any) => String(item.content || '')) }, req);
    if (embedded.embeddings.length !== documents.length) throw new Error('Embedding 返回数量与文档数量不一致');
    const chunks = await upsertKnowledgeChunks({
      ...context,
      collection: String(req.body.collection || 'default'),
      embeddingModel: embedded.model,
      chunks: documents.map((item: any, index: number) => ({ id: item.id, sourceId: String(item.sourceId || ''), sourceType: item.sourceType, chunkIndex: item.chunkIndex, content: String(item.content || ''), metadata: item.metadata, embedding: embedded.embeddings[index] })),
    });
    res.status(201).json({ chunks, model: embedded.model, usage: embedded.usage, requestId });
  } catch (error) { sendError(res, error, requestId); }
});

router.post('/knowledge/search', async (req: AuthRequest, res) => {
  const requestId = requestIdOf(req);
  if (!runtimeHealth().capabilities.vectorSearch) return res.status(503).json({ error: 'pgvector 当前不可用', requestId });
  try {
    const context = knowledgeContextOf(req);
    const query = String(req.body.query || '').trim();
    if (!query) return res.status(422).json({ error: 'query 不能为空', requestId });
    const embedded = await embed({ ...req.body, input: [query] }, req);
    const results = await searchKnowledge({ ...context, collection: String(req.body.collection || 'default'), embeddingModel: embedded.model, embedding: embedded.embeddings[0], limit: req.body.limit, sourceTypes: req.body.sourceTypes, metadata: req.body.metadata });
    res.json({ results, model: embedded.model, usage: embedded.usage, requestId });
  } catch (error) { sendError(res, error, requestId); }
});

router.delete('/knowledge', async (req: AuthRequest, res) => {
  const requestId = requestIdOf(req);
  if (!runtimeHealth().capabilities.vectorSearch) return res.status(503).json({ error: 'pgvector 当前不可用', requestId });
  try {
    const deleted = await deleteKnowledge({ ...knowledgeContextOf(req), collection: String(req.body.collection || 'default'), sourceId: req.body.sourceId ? String(req.body.sourceId) : undefined });
    res.json({ deleted, requestId });
  } catch (error) { sendError(res, error, requestId); }
});

router.post('/query', async (req: AuthRequest, res) => {
  try { const schema = JSON.stringify(req.body.schema || []); res.json(await complete(req.body, req, [{ role: 'system', content: '将自然语言转换为只读 SQL。只输出 SQL，不要 Markdown。' }, { role: 'user', content: `表结构：${schema}\n问题：${req.body.question}` }])); } catch (error) { sendError(res, error, requestIdOf(req)); }
});

router.post('/insight', async (req: AuthRequest, res) => {
  try { const sample = JSON.stringify((req.body.rows || []).slice(0, 100)); res.json(await complete(req.body, req, [{ role: 'system', content: '你是数据分析师。总结趋势、异常，并给出可能解释，使用简洁中文。' }, { role: 'user', content: sample }])); } catch (error) { sendError(res, error, requestIdOf(req)); }
});

router.get('/rule-agent/sessions', async (req: AuthRequest, res) => {
  try { const scope = ruleScope(req); if (!scope.projectId || !scope.formId) throw new Error('projectId 和 formId 不能为空'); assertRuleProjectAccess(req, scope.projectId, 'view'); res.json(await listRuleAgentSessions(scope)); }
  catch (error) { sendError(res, error, requestIdOf(req)); }
});

router.post('/rule-agent/sessions', async (req: AuthRequest, res) => {
  try {
    const scope = ruleScope(req); if (!scope.projectId || !scope.formId) throw new Error('projectId 和 formId 不能为空'); assertRuleProjectAccess(req, scope.projectId, 'view');
    const settings = llmManagement.getRuleAgentSettings(contextOf(req));
    if (!settings.enabled) return res.status(503).json({ error: '规则语法智能体已禁用', requestId: requestIdOf(req) });
    res.status(201).json(await createRuleAgentSession({ ...scope, profileId: String(req.body.profileId || settings.profileId), title: req.body.title }));
  } catch (error) { sendError(res, error, requestIdOf(req)); }
});

router.get('/rule-agent/sessions/:id', async (req: AuthRequest, res) => {
  try { res.json(assertRuleSessionScope(await getRuleAgentSession(param(req.params.id)), req)); }
  catch (error) { sendError(res, error, requestIdOf(req)); }
});

router.delete('/rule-agent/sessions/:id', async (req: AuthRequest, res) => {
  try { const session = assertRuleSessionScope(await getRuleAgentSession(param(req.params.id)), req); session.archived = true; await saveRuleAgentSession(session); res.json({ success: true }); }
  catch (error) { sendError(res, error, requestIdOf(req)); }
});

router.post('/rule-agent/sessions/:id/runtime-authorizations', async (req: AuthRequest, res) => {
  try {
    const session = assertRuleSessionScope(await getRuleAgentSession(param(req.params.id)), req);
    const fields = Array.isArray(req.body.fields) ? req.body.fields.map(String).slice(0, 50) : [];
    const token = `raa_${randomUUID()}`; runtimeAuthorizations.set(token, { sessionId: session.id, fields, expiresAt: Date.now() + 5 * 60_000 });
    res.status(201).json({ token, fields, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });
  } catch (error) { sendError(res, error, requestIdOf(req)); }
});

router.post('/rule-agent/sessions/:id/turns', async (req: AuthRequest, res) => {
  const requestId = requestIdOf(req);
  try {
    const session = assertRuleSessionScope(await getRuleAgentSession(param(req.params.id)), req);
    const prompt = String(req.body.prompt || '').trim(); if (!prompt) throw new Error('prompt 不能为空');
    const current = formContext(session.projectId, session.formId); const code = String(req.body.code ?? current.form.ruleCode ?? '');
    const intent = inferRuleAgentIntent(prompt); const events: any[] = [{ type: 'planning', data: { intent }, requestId }];
    let message = ''; let proposal: any; let diagnostics: any; let testResult: any; let runtime: any;
    if (intent === 'lint') {
      events.push({ type: 'tool_started', data: { name: 'rule_syntax.lint' }, requestId }); diagnostics = lintRuleCode(session.projectId, session.formId, code).diagnostics;
      message = diagnostics.length ? `发现 ${diagnostics.length} 条诊断，其中 ${diagnostics.filter((item: any) => item.severity === 'error').length} 条错误。` : '语法检查通过，未发现诊断。';
      events.push({ type: 'tool_completed', data: { name: 'rule_syntax.lint', count: diagnostics.length }, requestId });
    } else if (intent === 'test') {
      events.push({ type: 'tool_started', data: { name: 'rule_test.run' }, requestId }); testResult = runRuleSandbox(session.projectId, session.formId, code);
      message = testResult.passed ? '隔离运行测试通过。' : '隔离运行测试失败，请查看场景结果。'; events.push({ type: 'tool_completed', data: { name: 'rule_test.run', passed: testResult.passed }, requestId });
    } else if (intent === 'inspect') {
      const authToken = String(req.body.runtimeAuthorization || ''); const authorization = runtimeAuthorizations.get(authToken);
      const rawFields = authorization && authorization.sessionId === session.id && authorization.expiresAt > Date.now() ? authorization.fields : [];
      if (authorization) runtimeAuthorizations.delete(authToken);
      runtime = sanitizedRuntime(req.body.runtime, rawFields);
      message = runtime.source === 'live' ? '已读取当前实时预览状态。' : '当前没有实时预览，已使用表单设计默认状态。';
      events.push({ type: 'tool_completed', data: { name: 'form_state.read', source: runtime.source }, requestId });
    } else {
      const reference = readRuleReference(prompt);
      const response = await complete({ profileId: session.profileId, projectId: session.projectId, responseSchema: intent === 'edit' ? { type: 'object', required: ['summary', 'proposedCode', 'changes', 'assumptions'], properties: { summary: { type: 'string' }, proposedCode: { type: 'string' }, changes: { type: 'array', items: { type: 'string' } }, assumptions: { type: 'array', items: { type: 'string' } } } } : undefined }, req, [
        { role: 'system', content: intent === 'edit' ? '你是 FormFlow 规则 DSL 代码编辑智能体。仅输出结构化结果，不编写 JavaScript，不伪造字段、控件、数据表或流程。' : '你是 FormFlow 规则语法统筹智能体，根据权威语法文档用简洁中文回答。' },
        { role: 'user', content: `用户需求：${prompt}\n当前规则：\n${code}\n可用字段：${current.fields.join(', ')}\n可用控件：${current.components.map((item: any) => item.id).join(', ')}\n语法参考：\n${reference}` },
      ]);
      if (intent === 'edit') {
        let structured = response.structured as any;
        if (!structured && response.content) { try { structured = JSON.parse(response.content.replace(/^```json\s*|\s*```$/g, '')); } catch { /* handled below */ } }
        if (!structured?.proposedCode) throw new Error('模型未返回有效规则代码提案');
        proposal = createRuleProposal(session, { code, ...structured }); session.proposals.push(proposal); message = proposal.summary; events.push({ type: 'proposal', data: proposal, requestId });
      } else message = response.content;
    }
    session.messages.push({ id: `ram_${randomUUID()}`, role: 'user', content: prompt, createdAt: new Date().toISOString() }, { id: `ram_${randomUUID()}`, role: 'assistant', content: message, artifact: proposal ? { proposalId: proposal.id } : undefined, createdAt: new Date().toISOString() });
    if (session.messages.length === 2) session.title = prompt.slice(0, 32); await saveRuleAgentSession(session); events.push({ type: 'completed', data: {}, requestId });
    const payload = { intent, message, proposal, diagnostics, testResult, runtime, events, requestId };
    if (req.headers.accept?.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive');
      events.forEach((event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify({ ...event, result: event.type === 'completed' ? payload : undefined })}\n\n`)); res.end();
    } else res.json(payload);
  } catch (error) { sendError(res, error, requestId); }
});

router.post('/rule-agent/proposals/:id/apply', async (req: AuthRequest, res) => {
  try {
    const session = assertRuleSessionScope(await getRuleAgentSession(String(req.body.sessionId || '')), req);
    req.body.sessionFormId = session.formId; assertRuleProjectAccess(req, session.projectId, 'edit');
    const proposal = session.proposals.find((item) => item.id === param(req.params.id)); if (!proposal) throw new Error('规则代码提案不存在');
    const result = applyRuleProposal(session, proposal, String(req.body.baseRuleHash || ''), Boolean(req.body.confirmFailedTests)); proposal.appliedAt = new Date().toISOString(); await saveRuleAgentSession(session); res.json(result);
  } catch (error) { sendError(res, error, requestIdOf(req)); }
});

function runMessage(run: any) { return (run.events || []).filter((event: any) => event.type === 'message_delta').map((event: any) => event.data?.content || '').join('').trim(); }
function syntheticRun(content: string, status = 'completed') { return { runId: `run_${randomUUID()}`, status, events: [{ type: 'message_delta', data: { content } }] }; }

const projectAgentControlSignals = new Map<string, ProjectAgentSession['executionState']>();
const activeProjectAgentExecutions = new Set<string>();
const archivedProjectAgentSessions = new Set<string>();
const specialistMaxRetries = 3;
function executionSignal(session: ProjectAgentSession) { return projectAgentControlSignals.get(session.id) || session.executionState; }
function saveProjectAgentProgress(session: ProjectAgentSession) { session.executionState = executionSignal(session); if (archivedProjectAgentSessions.has(session.id)) session.archived = true; return saveProjectAgentSession(session); }
function setExecutionState(session: ProjectAgentSession, state: ProjectAgentSession['executionState']) {
  session.executionState = state; projectAgentControlSignals.set(session.id, state); saveProjectAgentSession(session);
}
function resetProjectAgentExecution(session: ProjectAgentSession) {
  session.delegationQueue = session.delegationQueue.map((task) => ({ ...task, status: 'pending', retryCount: 0, maxRetries: specialistMaxRetries }));
  session.specialistRuns = []; session.pendingConfirmation = undefined; session.activeRunId = undefined; session.currentRole = undefined;
  session.currentStage = session.delegationQueue[0] ? stageForRole(session.delegationQueue[0].role) : session.proposedPlan ? 'complete' : 'blueprint';
  session.stageResults = session.stageResults.filter((item) => item.stage === 'blueprint');
  if (session.proposedPlan?.status === 'executed') { session.proposedPlan.status = 'confirmed'; session.proposedPlan.executedAt = undefined; }
  recordProjectAgentEvents(session, [{ type: 'execution_reset', data: { checkpointRevision: session.checkpointRevision } }]);
  setExecutionState(session, 'idle');
}
function stopOrPauseAtBoundary(session: ProjectAgentSession) {
  const signal = executionSignal(session);
  if (signal === 'reset_requested') { resetProjectAgentExecution(session); return syntheticRun('执行记录已重置，项目内容和当前 revision 保留。', 'paused'); }
  if (signal === 'stop_requested' || signal === 'stopped') {
    session.currentRole = undefined; setExecutionState(session, 'stopped'); return syntheticRun('执行已手动停止。', 'stopped');
  }
  if (signal === 'pause_requested' || signal === 'paused') {
    session.currentRole = undefined; setExecutionState(session, 'paused'); return syntheticRun('执行已在专家交接边界暂停。', 'paused');
  }
  return undefined;
}

async function continueProjectAgentRun(run: any, session: ProjectAgentSession, req: AuthRequest, connection: any, role: McpRole, taskId: string) {
  let processedEvents = 0; let autoSteps = 0; const requestId = requestIdOf(req);
  while (true) {
    const freshEvents = (run.events || []).slice(processedEvents); processedEvents = (run.events || []).length;
    recordProjectAgentEvents(session, freshEvents.map((event: any) => ({ ...event, data: { ...(event.data || {}), specialistRole: role, specialistTaskId: taskId } })));
    if (run.status !== 'waiting_tool' || autoSteps >= 32) break;
    const toolCall = [...(run.events || [])].reverse().find((event: any) => event.type === 'tool_call')?.data;
    if (!toolCall) break;
    const effectiveArguments = projectAgentToolArguments(toolCall.name, toolCall.arguments, session.checkpointRevision);
    if (effectiveArguments !== toolCall.arguments) recordProjectAgentEvents(session, [{ type: 'revision_rebased', data: { specialistRole: role, specialistTaskId: taskId, toolName: toolCall.name, from: toolCall.arguments?.baseRevision, to: session.checkpointRevision } }]);
    const result: any = await executeLlmTool(toolCall.name, effectiveArguments, { ...projectAgentScope(req), projectId: session.projectId, userId: req.user?.id, user: req.user, requestId, mcpRole: role });
    const stage = stageForRole(role); session.currentStage = stage; session.currentRole = role;
    session.stageResults = [...session.stageResults.filter((item) => item.stage !== stage), { stage, status: result.ok ? 'running' : result.status === 'confirmation_required' ? 'pending' : 'failed', summary: result.ok ? `${roleTitles[role]}：${toolCall.name} 执行成功` : result.status === 'confirmation_required' ? `${roleTitles[role]}：${toolCall.name} 等待确认` : `${roleTitles[role]}：${toolCall.name}: ${result.error?.message || '失败'}`, updatedAt: new Date().toISOString() }];
    if (result.meta?.revision) session.checkpointRevision = result.meta.revision;
    if (!session.projectId && result.ok && ['project.create', 'project.initialize', 'project.build_from_data'].includes(toolCall.name)) {
      session.projectId = String(effectiveArguments.id || result.data?.project?.config?.id || '');
      if (session.projectId) {
        const loaded: any = await executeLlmTool('project.get', { projectId: session.projectId }, { ...projectAgentScope(req), projectId: session.projectId, userId: req.user?.id, user: req.user, requestId, mcpRole: role });
        if (loaded.ok) session.checkpointRevision = loaded.data.revision;
      }
    }
    saveProjectAgentProgress(session);
    if (result.status === 'confirmation_required') {
      session.pendingConfirmation = { runId: run.runId, toolCallId: toolCall.tool_call_id, toolName: toolCall.name, role, taskId, arguments: effectiveArguments, confirmation: result.confirmation };
      session.activeRunId = run.runId; saveProjectAgentProgress(session); break;
    }
    run = await llmProviderClient.resumeAgent(run.runId, [{ tool_call_id: toolCall.tool_call_id, result }], requestId, connection); autoSteps += 1;
  }
  recordProjectAgentEvents(session, (run.events || []).slice(processedEvents).map((event: any) => ({ ...event, data: { ...(event.data || {}), specialistRole: role, specialistTaskId: taskId } })));
  session.activeRunId = run.status === 'completed' ? undefined : run.runId;
  saveProjectAgentProgress(session);
  return run;
}

async function buildProjectAgentPlan(session: ProjectAgentSession, prompt: string, req: AuthRequest) {
  let structured: any;
  let responseContent = '';
  let fallbackWarning = '';
  try {
    const response = await complete({
      profileId: session.profileId,
      maxTokens: 8192,
      responseSchema: {
        type: 'object', required: ['summary', 'tasks'], properties: {
          summary: { type: 'string' }, assumptions: { type: 'array', items: { type: 'string' } }, risks: { type: 'array', items: { type: 'string' } },
          tasks: { type: 'array', items: { type: 'object', required: ['role', 'instruction'], properties: { role: { type: 'string', enum: roleOrder }, instruction: { type: 'string' }, acceptance: { type: 'array', items: { type: 'string' } } } } },
        },
      },
    }, req, [
      { role: 'system', content: coordinatorPrompt(session) },
      { role: 'user', content: prompt },
    ]);
    structured = response.structured;
    responseContent = response.content || '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/模型未返回合法的结构化 JSON|结构化输出不符合 Schema/.test(message)) throw error;
    fallbackWarning = '模型的结构化方案输出不完整，已按用户原始要求生成确定性领域方案；确认前请重点核对各专家任务。';
  }
  if (!structured && responseContent) {
    const unfenced = responseContent.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try { structured = JSON.parse(unfenced); } catch {
      const start = unfenced.indexOf('{'); const end = unfenced.lastIndexOf('}');
      if (start >= 0 && end > start) { try { structured = JSON.parse(unfenced.slice(start, end + 1)); } catch { /* fallback below */ } }
    }
  }
  let tasks = Array.isArray(structured?.tasks) ? structured.tasks.filter((task: any) => isMcpRole(task.role) && String(task.instruction || '').trim()) : [];
  if (!tasks.length) {
    const keywords: Record<McpRole, RegExp> = { project: /项目|创建|初始化|模板|导入|克隆|元信息/, data: /数据|表格|sheet|主键|行|导入/i, form: /表单|控件|字段|绑定/, workflow: /流程|节点|连线|审批/, behavior: /行为|事件|规则|脚本/, quality: /测试|mock|质量|校验|修复/i, delivery: /输出|导出|交付|发布|预检/ };
    const selected = session.projectId ? roleOrder.filter((role) => keywords[role].test(prompt)) : [...roleOrder];
    tasks = (selected.length ? selected : ['quality']).map((role) => ({ role, instruction: prompt, acceptance: [] }));
  }
  const unique = new Map<McpRole, any>(); for (const task of tasks) unique.set(task.role, task);
  if (!session.projectId && !unique.has('project')) unique.set('project', { role: 'project', instruction: '先根据已确认蓝图创建并初始化项目，再交接稳定项目 ID。', acceptance: ['项目已创建', '已取得最新 revision'] });
  const plannedTasks = roleOrder.filter((role) => unique.has(role)).map((role) => { const task = unique.get(role); return { id: `pat_${randomUUID()}`, role, instruction: String(task.instruction), acceptance: Array.isArray(task.acceptance) ? task.acceptance.map(String) : [], status: 'pending' as const }; });
  return {
    summary: String(structured?.summary || `将用户要求拆分为 ${plannedTasks.length} 个专职阶段，确认后按顺序执行。`),
    assumptions: Array.isArray(structured?.assumptions) ? structured.assumptions.map(String) : [],
    risks: [...(fallbackWarning ? [fallbackWarning] : []), ...(Array.isArray(structured?.risks) ? structured.risks.map(String) : [])],
    tasks: plannedTasks,
  };
}

function formatProjectAgentPlan(plan: { summary: string; assumptions: string[]; risks: string[]; tasks: ProjectAgentSession['delegationQueue'] }) {
  const tasks = plan.tasks.map((task, index) => `${index + 1}. ${roleTitles[task.role]}：${task.instruction}${task.acceptance.length ? `\n   验收：${task.acceptance.join('；')}` : ''}`).join('\n');
  return `方案摘要：${plan.summary}\n\n专职执行计划：\n${tasks}${plan.assumptions.length ? `\n\n假设：\n- ${plan.assumptions.join('\n- ')}` : ''}${plan.risks.length ? `\n\n风险与门禁：\n- ${plan.risks.join('\n- ')}` : ''}\n\n当前仅生成方案，尚未调用任何项目工具。确认方案后才能切换到 Execute 模式。`;
}

function confirmProjectAgentPlan(session: ProjectAgentSession) {
  const plan = session.proposedPlan; if (!plan || plan.status !== 'pending') throw new Error('当前没有待确认方案');
  plan.status = 'confirmed'; plan.confirmedAt = new Date().toISOString(); session.agentMode = 'execute';
  session.executionState = 'idle'; projectAgentControlSignals.set(session.id, 'idle');
  session.delegationQueue = plan.tasks.map((task) => ({ ...task, acceptance: [...task.acceptance], status: 'pending', retryCount: 0, maxRetries: specialistMaxRetries }));
  session.currentStage = session.delegationQueue[0] ? stageForRole(session.delegationQueue[0].role) : 'complete';
  session.stageResults = [...session.stageResults.filter((item) => item.stage !== 'blueprint'), { stage: 'blueprint', status: 'passed', summary: '实施方案已由用户确认', updatedAt: new Date().toISOString() }];
  return session;
}

async function startSpecialistTask(session: ProjectAgentSession, task: ProjectAgentSession['delegationQueue'][number], req: AuthRequest) {
  const requestId = requestIdOf(req); const context = { ...contextOf(req), projectId: session.projectId }; const profile = llmManagement.resolveProfile(session.profileId, context);
  const definitions = listProjectAgentTools(task.role);
  const modelTools = definitions.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));
  const definition = { entrypoint: task.role, max_steps: 48, max_tool_failures: 3, tools: definitions.map((tool) => tool.name), nodes: [{ id: task.role, type: 'model', config: { tool_mode: 'auto', tools: modelTools } }, { id: 'end', type: 'end' }], edges: [{ source: task.role, target: 'end' }] };
  const previousAttempts = session.specialistRuns.filter((run) => run.taskId === task.id && run.status === 'failed').length;
  const messages = [{ role: 'system', content: specialistPrompt(session, task.role, task.instruction, previousAttempts) }, ...session.messages.slice(-12).map((item) => ({ role: item.role, content: item.content }))];
  let lastError: unknown;
  for (const [index, route] of profile.routes.entries()) {
    const connection = llmManagement.resolveConnection(route, context);
    try {
      const started = await llmProviderClient.startAgent(definition, { messages }, connection, requestId, context.tenantId, session.projectId);
      const run = await continueProjectAgentRun(started, session, req, connection, task.role, task.id); if (session.pendingConfirmation) session.pendingConfirmation.routeIndex = index;
      return { run, connection };
    } catch (error) { lastError = error; if (!isRetryableLlmRpcError(error) || index === profile.routes.length - 1) throw error; }
  }
  throw lastError || new Error(`${roleTitles[task.role]}没有可用模型路由`);
}

async function validateSpecialistHandoff(session: ProjectAgentSession, role: McpRole, taskId: string, req: AuthRequest) {
  if (!session.projectId) throw new Error(`${roleTitles[role]}未交接项目 ID`);
  if (!readProjectPackage(session.projectId)) {
    if (role !== 'project') throw new Error(`${roleTitles[role]}交接时项目不存在`);
    recordProjectAgentEvents(session, [{ type: 'specialist_handoff', data: { specialistRole: role, specialistTaskId: taskId, projectId: session.projectId, deleted: true } }]); session.projectId = undefined; session.checkpointRevision = undefined; return { valid: true, deleted: true };
  }
  const context = { ...projectAgentScope(req), projectId: session.projectId, userId: req.user?.id, user: req.user, requestId: requestIdOf(req), mcpRole: role };
  const validation: any = await executeLlmTool('project.validate', { projectId: session.projectId }, context);
  if (!validation.ok) throw new Error(`${roleTitles[role]}交接校验失败：${validation.error?.message || '无法校验项目'}`);
  if (validation.data?.valid === false) throw new Error(`${roleTitles[role]}交接校验发现 ${validation.data.errors?.length || 0} 个结构错误`);
  let gate: any;
  if (role === 'quality') gate = await executeLlmTool('project.quality.inspect', { projectId: session.projectId }, context);
  if (role === 'delivery') gate = await executeLlmTool('release.preview', { projectId: session.projectId }, context);
  if (gate && !gate.ok) throw new Error(`${roleTitles[role]}门禁检查失败：${gate.error?.message || '无法执行门禁'}`);
  if (gate?.ok && gate.data?.ready === false) throw new Error(`${roleTitles[role]}门禁未通过`);
  recordProjectAgentEvents(session, [{ type: 'specialist_handoff', data: { specialistRole: role, specialistTaskId: taskId, revision: session.checkpointRevision, valid: true, ready: gate?.ok ? Boolean(gate.data?.ready) : undefined } }]);
  return { valid: true, ready: gate?.ok ? Boolean(gate.data?.ready) : undefined };
}

async function runDelegationQueueInternal(session: ProjectAgentSession, req: AuthRequest) {
  setExecutionState(session, 'running');
  for (const task of session.delegationQueue) {
    if (task.status === 'passed') continue;
    task.maxRetries = specialistMaxRetries;
    if (task.status === 'running') task.status = 'pending';
    const boundary = stopOrPauseAtBoundary(session); if (boundary) return boundary;
    while (task.status !== 'passed') {
      const requested = stopOrPauseAtBoundary(session); if (requested) return requested;
      const now = new Date().toISOString(); const attempt = (task.retryCount || 0) + 1;
      task.status = 'running'; session.currentRole = task.role; session.currentStage = stageForRole(task.role);
      const specialist: ProjectAgentSession['specialistRuns'][number] = { id: `pasr_${randomUUID()}`, taskId: task.id, role: task.role, status: 'running', attempt, input: task.instruction, startRevision: session.checkpointRevision, createdAt: now, updatedAt: now };
      session.specialistRuns.push(specialist); saveProjectAgentProgress(session);
      try {
        const { run } = await startSpecialistTask(session, task, req); specialist.runId = run.runId; specialist.output = runMessage(run); specialist.updatedAt = new Date().toISOString(); specialist.endRevision = session.checkpointRevision;
        if (session.pendingConfirmation) { specialist.status = 'waiting_confirmation'; saveProjectAgentProgress(session); return run; }
        if (run.status !== 'completed') throw new Error(`专家运行状态：${run.status}`);
        await validateSpecialistHandoff(session, task.role, task.id, req);
        specialist.status = 'passed'; task.status = 'passed'; const stage = stageForRole(task.role);
        session.stageResults = [...session.stageResults.filter((item) => item.stage !== stage), { stage, status: 'passed', summary: `${roleTitles[task.role]}完成并交接 revision ${session.checkpointRevision || 'unchanged'}`, updatedAt: new Date().toISOString() }];
        saveProjectAgentProgress(session);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error); specialist.status = 'failed'; specialist.error = message; specialist.updatedAt = new Date().toISOString();
        const retryCount = task.retryCount || 0;
        if (retryCount < specialistMaxRetries) {
          task.retryCount = retryCount + 1; task.status = 'pending'; const stage = stageForRole(task.role);
          session.stageResults = [...session.stageResults.filter((item) => item.stage !== stage), { stage, status: 'running', summary: `${roleTitles[task.role]}第 ${attempt} 次尝试失败，准备第 ${task.retryCount + 1} 次尝试：${message}`, updatedAt: new Date().toISOString() }];
          saveProjectAgentProgress(session); continue;
        }
        task.status = 'failed'; session.currentRole = undefined; const stage = stageForRole(task.role);
        session.stageResults = [...session.stageResults.filter((item) => item.stage !== stage), { stage, status: 'failed', summary: `${roleTitles[task.role]}已完成 ${specialistMaxRetries} 次重试：${message}`, updatedAt: new Date().toISOString() }];
        setExecutionState(session, 'failed'); return syntheticRun(`${roleTitles[task.role]}失败，已达到最多 ${specialistMaxRetries} 次自动重试。可手动继续或重置。`, 'failed');
      }
    }
  }
  session.currentRole = undefined; session.currentStage = 'complete';
  if (session.proposedPlan?.status === 'confirmed') { session.proposedPlan.status = 'executed'; session.proposedPlan.executedAt = new Date().toISOString(); }
  const completed = session.specialistRuns.slice(-session.delegationQueue.length).map((run) => `${roleTitles[run.role]}：${run.status}${run.output ? `，${run.output}` : ''}`).join('\n');
  setExecutionState(session, 'completed');
  try {
    const summary = await complete({ profileId: session.profileId, maxTokens: 1024 }, req, [{ role: 'system', content: '你是 FormFlow 项目协调者。根据专家交接记录给出简洁完成摘要、校验结果和阻断项，不声称执行未发生的操作。' }, { role: 'user', content: completed || '本轮没有需要执行的领域任务。' }]);
    return syntheticRun(summary.content || '本轮专职任务已完成。');
  } catch { return syntheticRun('全部专职任务已完成，汇总模型暂不可用。'); }
}

async function runDelegationQueue(session: ProjectAgentSession, req: AuthRequest) {
  activeProjectAgentExecutions.add(session.id);
  try { return await runDelegationQueueInternal(session, req); }
  finally { activeProjectAgentExecutions.delete(session.id); }
}

async function startProjectAgentTurn(session: ProjectAgentSession, prompt: string, req: AuthRequest) {
  if (session.agentMode === 'plan' || !session.blueprintConfirmed || session.proposedPlan?.status !== 'confirmed') {
    const plan = await buildProjectAgentPlan(session, prompt, req); const content = formatProjectAgentPlan(plan); const now = new Date().toISOString();
    session.agentMode = 'plan'; session.executionState = 'idle'; projectAgentControlSignals.set(session.id, 'idle'); session.proposedPlan = { id: `pap_${randomUUID()}`, request: prompt, ...plan, status: 'pending', createdAt: now };
    session.delegationQueue = plan.tasks.map((task) => ({ ...task, acceptance: [...task.acceptance], status: 'pending', retryCount: 0, maxRetries: specialistMaxRetries })); session.currentRole = undefined; session.currentStage = 'blueprint';
    session.stageResults = [...session.stageResults.filter((item) => item.stage !== 'blueprint'), { stage: 'blueprint', status: 'pending', summary: 'Plan 模式方案等待用户确认', updatedAt: now }];
    if (!session.projectId) { session.blueprint = content; session.blueprintConfirmed = false; }
    saveProjectAgentSession(session); return { run: syntheticRun(content) };
  }
  if (!session.delegationQueue.length) session.delegationQueue = session.proposedPlan.tasks.map((task) => ({ ...task, acceptance: [...task.acceptance], status: 'pending', retryCount: 0, maxRetries: specialistMaxRetries }));
  else session.delegationQueue.forEach((task) => { if (task.status === 'failed') { task.status = 'pending'; task.retryCount = 0; } });
  session.executionState = 'running'; projectAgentControlSignals.set(session.id, 'running');
  saveProjectAgentSession(session);
  return { run: await runDelegationQueue(session, req) };
}

router.use('/project-agent/sessions', (_req: AuthRequest, res) => res.status(410).json({ error: '项目智能体 V1 已移除，请使用 /api/ai/project-agent/v2/sessions', schemaVersion: 2 }));
router.get('/project-agent/sessions', async (req: AuthRequest, res) => {
  try { res.json(listProjectAgentSessions(projectAgentScope(req))); } catch (error) { sendError(res, error, requestIdOf(req)); }
});
router.post('/project-agent/sessions', async (req: AuthRequest, res) => {
  try {
    const scope = projectAgentScope(req); if (scope.projectId) { const project = readProjectPackage(scope.projectId); if (!project || !canAccessProject(req.user, project, 'view')) throw new Error('无权查看该项目'); }
    const agentMode: ProjectAgentMode = req.body.agentMode === 'execute' ? 'execute' : 'plan';
    const profileId = String(req.body.profileId || llmManagement.getProjectAgentProfileId(contextOf(req)));
    res.status(201).json(createProjectAgentSession({ ...scope, profileId, title: req.body.title, agentMode }));
  } catch (error) { sendError(res, error, requestIdOf(req)); }
});
router.get('/project-agent/sessions/:id', async (req: AuthRequest, res) => {
  try { res.json(assertProjectAgentSession(getProjectAgentSession(param(req.params.id)), req)); } catch (error) { sendError(res, error, requestIdOf(req)); }
});
router.delete('/project-agent/sessions/:id', async (req: AuthRequest, res) => {
  try {
    const session = assertProjectAgentSession(getProjectAgentSession(param(req.params.id)), req); archivedProjectAgentSessions.add(session.id);
    projectAgentControlSignals.set(session.id, activeProjectAgentExecutions.has(session.id) ? 'stop_requested' : 'stopped');
    session.executionState = projectAgentControlSignals.get(session.id)!; session.archived = true; saveProjectAgentSession(session); res.json({ success: true });
  } catch (error) { sendError(res, error, requestIdOf(req)); }
});
router.post('/project-agent/sessions/:id/confirm-blueprint', async (req: AuthRequest, res) => {
  try { const session = assertProjectAgentSession(getProjectAgentSession(param(req.params.id)), req); if (!session.blueprint) throw new Error('当前没有待确认蓝图'); session.blueprintConfirmed = true; if (session.proposedPlan?.status === 'pending') confirmProjectAgentPlan(session); else session.agentMode = 'execute'; res.json(saveProjectAgentSession(session)); } catch (error) { sendError(res, error, requestIdOf(req)); }
});
router.post('/project-agent/sessions/:id/confirm-plan', async (req: AuthRequest, res) => {
  try { const session = assertProjectAgentSession(getProjectAgentSession(param(req.params.id)), req); confirmProjectAgentPlan(session); res.json(saveProjectAgentSession(session)); } catch (error) { sendError(res, error, requestIdOf(req)); }
});
router.post('/project-agent/sessions/:id/control', async (req: AuthRequest, res) => {
  const requestId = requestIdOf(req);
  try {
    const session = assertProjectAgentSession(getProjectAgentSession(param(req.params.id)), req); const action = String(req.body.action || '');
    if (!['pause', 'continue', 'stop', 'reset'].includes(action)) return res.status(422).json({ error: 'action 必须是 pause、continue、stop 或 reset', requestId });
    if (action === 'pause') {
      const state = executionSignal(session); setExecutionState(session, activeProjectAgentExecutions.has(session.id) && !session.pendingConfirmation ? 'pause_requested' : 'paused');
      recordProjectAgentEvents(session, [{ type: 'execution_control', data: { action, state: session.executionState } }]); saveProjectAgentSession(session);
      return res.status(state === 'running' ? 202 : 200).json({ session, requestId });
    }
    if (action === 'stop') {
      const state = executionSignal(session); const requestStop = !session.pendingConfirmation && activeProjectAgentExecutions.has(session.id); setExecutionState(session, requestStop ? 'stop_requested' : 'stopped');
      if (session.pendingConfirmation) { session.pendingConfirmation = undefined; session.activeRunId = undefined; const task = session.delegationQueue.find((item) => item.status === 'running'); if (task) task.status = 'pending'; }
      recordProjectAgentEvents(session, [{ type: 'execution_control', data: { action, state: session.executionState } }]); saveProjectAgentSession(session);
      return res.status(requestStop ? 202 : 200).json({ session, requestId });
    }
    if (action === 'reset') {
      if (activeProjectAgentExecutions.has(session.id)) {
        setExecutionState(session, 'reset_requested'); recordProjectAgentEvents(session, [{ type: 'execution_control', data: { action, state: 'reset_requested' } }]); saveProjectAgentSession(session);
        return res.status(202).json({ session, requestId });
      }
      resetProjectAgentExecution(session); return res.json({ session, requestId });
    }
    if (session.pendingConfirmation) return res.status(409).json({ error: '当前有待确认操作，请先确认、拒绝或停止', requestId });
    if (!session.proposedPlan || session.proposedPlan.status === 'pending') return res.status(409).json({ error: '当前没有已确认方案', requestId });
    const state = executionSignal(session);
    if (activeProjectAgentExecutions.has(session.id)) {
      if (state === 'pause_requested' || state === 'stop_requested') { setExecutionState(session, 'running'); return res.json({ session, requestId }); }
      return res.status(409).json({ error: '执行队列已经在运行', session, requestId });
    }
    session.delegationQueue.forEach((task) => { if (task.status === 'failed' || task.status === 'running') { task.status = 'pending'; task.retryCount = 0; } });
    recordProjectAgentEvents(session, [{ type: 'execution_control', data: { action, from: state } }]); setExecutionState(session, 'running');
    const run = await runDelegationQueue(session, req); const message = runMessage(run) || '执行控制已完成。';
    addProjectAgentMessage(session, 'assistant', message); saveProjectAgentProgress(session);
    return res.json({ message, session, run: { runId: run.runId, status: run.status }, requestId });
  } catch (error) { sendError(res, error, requestId); }
});
router.post('/project-agent/sessions/:id/turns', async (req: AuthRequest, res) => {
  const requestId = requestIdOf(req);
  try {
    const session = assertProjectAgentSession(getProjectAgentSession(param(req.params.id)), req); const prompt = String(req.body.prompt || '').trim(); if (!prompt) throw new Error('prompt 不能为空'); if (session.pendingConfirmation) throw new Error('当前有待确认操作，请先确认或拒绝');
    const requestedMode: ProjectAgentMode = req.body.agentMode === 'execute' ? 'execute' : 'plan';
    if (requestedMode === 'execute' && session.proposedPlan?.status === 'pending') throw new Error('当前方案尚未确认，请先确认方案再执行'); session.agentMode = requestedMode;
    addProjectAgentMessage(session, 'user', prompt); const { run } = await startProjectAgentTurn(session, prompt, req);
    const pending = session.pendingConfirmation as ProjectAgentSession['pendingConfirmation'];
    const message = (run.events || []).filter((event: any) => event.type === 'message_delta').map((event: any) => event.data?.content || '').join('').trim() || (pending ? `操作 ${pending.toolName} 等待确认。` : '本轮处理完成。');
    addProjectAgentMessage(session, 'assistant', message); if (!session.blueprintConfirmed) { session.blueprint = message; session.currentStage = 'blueprint'; session.stageResults = [{ stage: 'blueprint', status: 'pending', summary: '等待用户确认 Plan 模式方案', updatedAt: new Date().toISOString() }]; }
    saveProjectAgentSession(session); const payload = { message, session, run: { runId: run.runId, status: run.status }, requestId };
    if (req.headers.accept?.includes('text/event-stream')) { res.setHeader('Content-Type', 'text/event-stream'); res.write(`event: completed\ndata: ${JSON.stringify(payload)}\n\n`); res.end(); } else res.json(payload);
  } catch (error) { sendError(res, error, requestId); }
});
router.post('/project-agent/sessions/:id/confirm-operation', async (req: AuthRequest, res) => {
  try {
    const session = assertProjectAgentSession(getProjectAgentSession(param(req.params.id)), req); const pending = session.pendingConfirmation; if (!pending) throw new Error('当前没有待确认操作');
    const task = session.delegationQueue.find((item) => item.id === pending.taskId); const specialist = [...session.specialistRuns].reverse().find((item) => item.taskId === pending.taskId);
    if (req.body.approved !== true) { if (task) task.status = 'failed'; if (specialist) { specialist.status = 'failed'; specialist.error = '用户拒绝破坏性操作'; specialist.updatedAt = new Date().toISOString(); } session.pendingConfirmation = undefined; session.activeRunId = undefined; session.currentRole = undefined; saveProjectAgentSession(session); return res.json({ rejected: true, session }); }
    const context = { ...contextOf(req), projectId: session.projectId }; const profile = llmManagement.resolveProfile(session.profileId, context); const route = profile.routes[pending.routeIndex || 0]; if (!route) throw new Error('模型 Profile 没有可恢复的路由'); const connection = llmManagement.resolveConnection(route, context);
    const result: any = await executeLlmTool(pending.toolName, { ...pending.arguments, confirmationToken: pending.confirmation.token }, { ...context, userId: req.user?.id, user: req.user, requestId: requestIdOf(req), mcpRole: pending.role });
    if (!result.ok) throw new Error(result.error?.message || '确认操作执行失败'); session.pendingConfirmation = undefined; if (result.meta?.revision) session.checkpointRevision = result.meta.revision;
    let run = await llmProviderClient.resumeAgent(pending.runId, [{ tool_call_id: pending.toolCallId, result }], requestIdOf(req), connection); run = await continueProjectAgentRun(run, session, req, connection, pending.role, pending.taskId);
    if (!session.pendingConfirmation && run.status === 'completed') {
      await validateSpecialistHandoff(session, pending.role, pending.taskId, req);
      if (task) task.status = 'passed'; if (specialist) { specialist.status = 'passed'; specialist.output = runMessage(run); specialist.endRevision = session.checkpointRevision; specialist.updatedAt = new Date().toISOString(); }
      const stage = stageForRole(pending.role); session.stageResults = [...session.stageResults.filter((item) => item.stage !== stage), { stage, status: 'passed', summary: `${roleTitles[pending.role]}完成并交接 revision ${session.checkpointRevision || 'unchanged'}`, updatedAt: new Date().toISOString() }];
      run = await runDelegationQueue(session, req);
    } else if (!session.pendingConfirmation) { if (task) task.status = 'failed'; if (specialist) { specialist.status = 'failed'; specialist.error = `专家运行状态：${run.status}`; specialist.updatedAt = new Date().toISOString(); } }
    saveProjectAgentSession(session); res.json({ result, run: { runId: run.runId, status: run.status }, session });
  } catch (error) { sendError(res, error, requestIdOf(req)); }
});

router.get('/providers', adminOnly, (req: AuthRequest, res) => res.json(llmManagement.listProviders(contextOf(req))));
router.post('/providers', adminOnly, (req: AuthRequest, res) => { try { res.status(201).json(llmManagement.saveProvider(scopedBody(req), contextOf(req))); } catch (error) { sendError(res, error, requestIdOf(req)); } });
router.put('/providers/:id', adminOnly, (req: AuthRequest, res) => { try { res.json(llmManagement.saveProvider({ ...scopedBody(req), id: req.params.id }, contextOf(req))); } catch (error) { sendError(res, error, requestIdOf(req)); } });
router.delete('/providers/:id', adminOnly, (req: AuthRequest, res) => { try { res.json({ success: llmManagement.removeProvider(param(req.params.id), contextOf(req)) }); } catch (error) { sendError(res, error, requestIdOf(req)); } });
router.post('/providers/:id/test', adminOnly, async (req: AuthRequest, res) => { try { const provider = llmManagement.getProvider(param(req.params.id), contextOf(req)); if (!provider) return res.status(404).json({ error: 'Provider 不存在' }); const connection = llmManagement.resolveConnection({ providerId: provider.id, model: String(req.body.model || 'default') }, contextOf(req)); res.json(await llmProviderClient.listModels(connection, requestIdOf(req))); } catch (error) { sendError(res, error, requestIdOf(req)); } });
router.get('/providers/:id/models', adminOnly, async (req: AuthRequest, res) => { try { const provider = llmManagement.getProvider(param(req.params.id), contextOf(req)); if (!provider) return res.status(404).json({ error: 'Provider 不存在' }); res.json(await llmProviderClient.listModels(llmManagement.resolveConnection({ providerId: provider.id, model: String(req.query.model || 'default') }, contextOf(req)), requestIdOf(req))); } catch (error) { sendError(res, error, requestIdOf(req)); } });

router.get('/profiles', adminOnly, (req: AuthRequest, res) => res.json(llmManagement.listProfiles(contextOf(req))));
router.post('/profiles', adminOnly, (req: AuthRequest, res) => { try { res.status(201).json(llmManagement.saveProfile(scopedBody(req), contextOf(req))); } catch (error) { sendError(res, error, requestIdOf(req)); } });
router.put('/profiles/:id', adminOnly, (req: AuthRequest, res) => { try { res.json(llmManagement.saveProfile({ ...scopedBody(req), id: req.params.id }, contextOf(req))); } catch (error) { sendError(res, error, requestIdOf(req)); } });
router.delete('/profiles/:id', adminOnly, (req: AuthRequest, res) => { try { res.json({ success: llmManagement.removeProfile(param(req.params.id), contextOf(req)) }); } catch (error) { sendError(res, error, requestIdOf(req)); } });
router.get('/rule-agent/settings', adminOnly, (req: AuthRequest, res) => { try { res.json(llmManagement.getRuleAgentSettings(contextOf(req))); } catch (error) { sendError(res, error, requestIdOf(req)); } });
router.put('/rule-agent/settings', adminOnly, (req: AuthRequest, res) => { try { res.json(llmManagement.saveRuleAgentSettings(req.body || {}, contextOf(req))); } catch (error) { sendError(res, error, requestIdOf(req)); } });

router.get('/agents', adminOnly, (req: AuthRequest, res) => res.json(llmManagement.listAgents(contextOf(req))));
router.post('/agents', adminOnly, (req: AuthRequest, res) => { try { res.status(201).json(llmManagement.saveAgent(scopedBody(req), contextOf(req))); } catch (error) { sendError(res, error, requestIdOf(req)); } });
router.put('/agents/:id', adminOnly, (req: AuthRequest, res) => { try { res.json(llmManagement.saveAgent({ ...scopedBody(req), id: req.params.id }, contextOf(req))); } catch (error) { sendError(res, error, requestIdOf(req)); } });
router.delete('/agents/:id', adminOnly, (req: AuthRequest, res) => { try { res.json({ success: llmManagement.removeAgent(param(req.params.id), contextOf(req)) }); } catch (error) { sendError(res, error, requestIdOf(req)); } });
router.post('/agents/:id/runs', async (req: AuthRequest, res) => {
  const requestId = requestIdOf(req); const context = contextOf(req);
  try {
    if (context.projectId) { const project = readProjectPackage(context.projectId); if (!project || !canAccessProject(req.user, project, 'run')) return res.status(403).json({ error: '无权在该项目运行 Agent', requestId }); }
    const agent = llmManagement.getAgent(param(req.params.id), context); if (!agent?.enabled) return res.status(404).json({ error: 'Agent 不存在或已禁用', requestId });
    const profile = llmManagement.resolveProfile(agent.modelProfileId, context);
    let connection: ReturnType<typeof llmManagement.resolveConnection> | undefined; let run: Awaited<ReturnType<typeof llmProviderClient.startAgent>> | undefined; let lastError: unknown;
    for (const [index, route] of profile.routes.entries()) {
      connection = llmManagement.resolveConnection(route, context);
      try { run = await llmProviderClient.startAgent(agent.definition, req.body.input || {}, connection, requestId, context.tenantId, context.projectId); break; }
      catch (error) { lastError = error; if (!isRetryableLlmRpcError(error) || index === profile.routes.length - 1) throw error; }
    }
    if (!run || !connection) throw lastError || new Error('Agent 模型 Profile 没有可用路由');
    let autoSteps = 0;
    while (run.status === 'waiting_tool' && req.body.autoTools !== false && autoSteps < 16) {
      const toolCall = [...run.events].reverse().find((event: any) => event.type === 'tool_call')?.data;
      if (!toolCall) break;
      const result = await executeLlmTool(toolCall.name, toolCall.arguments, { ...context, userId: req.user?.id, user: req.user, requestId });
      run = await llmProviderClient.resumeAgent(run.runId, [{ tool_call_id: toolCall.tool_call_id, result }], requestId, connection); autoSteps += 1;
    }
    res.status(run.status === 'waiting_tool' ? 202 : 200).json(run);
  } catch (error) { sendError(res, error, requestId); }
});
router.get('/runs/:runId', async (req: AuthRequest, res) => { try { const run = await llmProviderClient.getAgent(param(req.params.runId), requestIdOf(req)); const context = contextOf(req); if ((run.tenantId && run.tenantId !== context.tenantId) || (run.projectId && run.projectId !== context.projectId)) return res.status(403).json({ error: '无权访问该 Agent run' }); res.json(run); } catch (error) { sendError(res, error, requestIdOf(req)); } });
router.post('/runs/:runId/resume', async (req: AuthRequest, res) => { try { const context = contextOf(req); const runId = param(req.params.runId); const existing = await llmProviderClient.getAgent(runId, requestIdOf(req)); if ((existing.tenantId && existing.tenantId !== context.tenantId) || (existing.projectId && existing.projectId !== context.projectId)) return res.status(403).json({ error: '无权恢复该 Agent run' }); const profile = llmManagement.resolveProfile(String(req.body.profileId || ''), context); const route = profile.routes[0]; if (!route) throw new Error('模型 Profile 没有路由'); res.json(await llmProviderClient.resumeAgent(runId, req.body.toolResults || [], requestIdOf(req), llmManagement.resolveConnection(route, context))); } catch (error) { sendError(res, error, requestIdOf(req)); } });
router.get('/plugins', adminOnly, async (req: AuthRequest, res) => { try { res.json(await llmProviderClient.listPlugins(requestIdOf(req))); } catch (error) { sendError(res, error, requestIdOf(req)); } });

export { router as aiRouter };
