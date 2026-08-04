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
import { projectAgentV4Router } from './project-agent-v4';

const router = Router();
router.use('/project-agent/v4', projectAgentV4Router);

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
