import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { serverDataPath } from '../config/paths';

export type LlmProviderKind = 'openai' | 'openai_compatible' | 'anthropic' | 'gemini' | 'ollama' | 'lmstudio';
export type LlmScope = 'global' | 'tenant' | 'project';
export type LlmCapability = 'chat' | 'stream' | 'tools' | 'structured_output' | 'embedding';

export interface ProviderConfig {
  id: string;
  name: string;
  kind: LlmProviderKind;
  scope: LlmScope;
  tenantId?: string;
  projectId?: string;
  baseUrl: string;
  encryptedApiKey?: string;
  timeoutMs: number;
  headers?: Record<string, string>;
  tls?: { serverName?: string };
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelRoute { providerId: string; model: string; }
export interface ModelProfile {
  id: string;
  name: string;
  scope: LlmScope;
  tenantId?: string;
  projectId?: string;
  capabilities: LlmCapability[];
  defaults: { temperature?: number; maxTokens?: number };
  routes: ModelRoute[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  version: number;
  scope: LlmScope;
  tenantId?: string;
  projectId?: string;
  modelProfileId: string;
  definition: {
    entrypoint: string;
    nodes: Array<{ id: string; type: 'model' | 'router' | 'tool' | 'subgraph' | 'plugin' | 'end'; config?: Record<string, unknown> }>;
    edges: Array<{ source: string; target: string; condition?: { path: string; equals: unknown } }>;
    tools?: string[];
    max_steps?: number;
    max_tool_failures?: number;
  };
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RuleAgentSettings { enabled: boolean; profileId: string; maxIterations: number; updatedAt: string; }
interface StoreFile { providers: ProviderConfig[]; profiles: ModelProfile[]; agents: AgentDefinition[]; ruleAgent: RuleAgentSettings; }
export interface ScopeContext { tenantId?: string; projectId?: string; }

const STORE_PATH = process.env.LLM_MANAGEMENT_STORE_PATH || serverDataPath('configs', 'llm-management.json');
const now = () => new Date().toISOString();

function masterKey() {
  const raw = process.env.LLM_CONFIG_MASTER_KEY || process.env.JWT_SECRET || 'formflow-development-secret-change-me';
  if (process.env.NODE_ENV === 'production' && !process.env.LLM_CONFIG_MASTER_KEY) throw new Error('生产环境必须设置 LLM_CONFIG_MASTER_KEY');
  return createHash('sha256').update(raw).digest();
}

export function encryptLlmSecret(value: string) {
  if (!value) return undefined;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptLlmSecret(value?: string) {
  if (!value) return '';
  const [version, iv, tag, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('模型密钥格式无效');
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

function seed(): StoreFile {
  const createdAt = now();
  const providers: ProviderConfig[] = [];
  const profiles: ModelProfile[] = [];
  providers.push({ id: 'provider-openai-default', name: '默认云端模型', kind: 'openai', scope: 'global', baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', encryptedApiKey: encryptLlmSecret(process.env.OPENAI_API_KEY || ''), timeoutMs: 60_000, enabled: true, createdAt, updatedAt: createdAt });
  profiles.push({ id: 'default-cloud', name: '默认云端模型', scope: 'global', capabilities: ['chat', 'stream', 'tools', 'structured_output', 'embedding'], defaults: { temperature: 0.2 }, routes: [{ providerId: 'provider-openai-default', model: process.env.OPENAI_MODEL || 'gpt-4.1-mini' }], enabled: true, createdAt, updatedAt: createdAt });
  providers.push({ id: 'provider-ollama-default', name: '默认 Ollama', kind: 'ollama', scope: 'global', baseUrl: process.env.LOCAL_LLM_URL || 'http://localhost:11434', timeoutMs: 120_000, enabled: true, createdAt, updatedAt: createdAt });
  profiles.push({ id: 'default-local', name: '默认本地模型', scope: 'global', capabilities: ['chat', 'stream', 'tools', 'structured_output', 'embedding'], defaults: { temperature: 0.2 }, routes: [{ providerId: 'provider-ollama-default', model: process.env.LOCAL_LLM_MODEL || 'qwen2.5' }], enabled: true, createdAt, updatedAt: createdAt });
  const agents: AgentDefinition[] = [{ id: 'rule-syntax-agent', name: '规则语法统筹智能体', version: 1, scope: 'global', modelProfileId: 'default-cloud', enabled: true, createdAt, updatedAt: createdAt, definition: {
    entrypoint: 'orchestrator', max_steps: 12, tools: ['form_state.read', 'rule_syntax.lint', 'rule_test.run', 'rule_reference.search'],
    nodes: [
      { id: 'orchestrator', type: 'model', config: { prompt: '识别用户对 FormFlow 规则 DSL 的意图，输出 intent: explain|inspect|edit|lint|test。\n{{input}}', response_schema: { type: 'object', required: ['intent'], properties: { intent: { enum: ['explain', 'inspect', 'edit', 'lint', 'test'] } } } } },
      { id: 'state', type: 'tool', config: { name: 'form_state.read', arguments: { $path: 'input' } } },
      { id: 'lint', type: 'tool', config: { name: 'rule_syntax.lint', arguments: { $path: 'input' } } },
      { id: 'test', type: 'tool', config: { name: 'rule_test.run', arguments: { $path: 'input' } } },
      { id: 'reference', type: 'tool', config: { name: 'rule_reference.search', arguments: { query: { $path: 'input.prompt' } } } },
      { id: 'editor', type: 'model', config: { prompt: '仅编辑规则 DSL，返回 summary、proposedCode、changes、assumptions。\n上下文：{{outputs.state}}\n需求：{{input.prompt}}\n当前代码：{{input.code}}' } },
      { id: 'end', type: 'end' },
    ],
    edges: [
      { source: 'orchestrator', target: 'state', condition: { path: 'outputs.orchestrator.structured.intent', equals: 'inspect' } },
      { source: 'orchestrator', target: 'lint', condition: { path: 'outputs.orchestrator.structured.intent', equals: 'lint' } },
      { source: 'orchestrator', target: 'test', condition: { path: 'outputs.orchestrator.structured.intent', equals: 'test' } },
      { source: 'orchestrator', target: 'state', condition: { path: 'outputs.orchestrator.structured.intent', equals: 'edit' } },
      { source: 'orchestrator', target: 'reference', condition: { path: 'outputs.orchestrator.structured.intent', equals: 'explain' } },
      { source: 'state', target: 'editor' }, { source: 'editor', target: 'end' }, { source: 'lint', target: 'end' }, { source: 'test', target: 'end' }, { source: 'reference', target: 'end' },
    ],
  } }, { id: 'project-orchestrator-agent', name: '项目编排智能体', version: 1, scope: 'global', modelProfileId: 'default-cloud', enabled: true, createdAt, updatedAt: createdAt, definition: {
    entrypoint: 'orchestrator', max_steps: 96, max_tool_failures: 3, tools: [],
    nodes: [{ id: 'orchestrator', type: 'model', config: { tool_mode: 'auto', prompt: '使用实时注入的 FormFlow 工具完成项目创建、编辑、测试、自检与发布预检。永不自动发布。' } }, { id: 'end', type: 'end' }],
    edges: [{ source: 'orchestrator', target: 'end' }],
  } }];
  return { providers, profiles, agents, ruleAgent: { enabled: true, profileId: 'default-cloud', maxIterations: 12, updatedAt: createdAt } };
}

function readStore(): StoreFile {
  if (!existsSync(STORE_PATH)) {
    const initial = seed();
    writeStore(initial);
    return initial;
  }
  const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Partial<StoreFile>;
  const agents = parsed.agents || [];
  if (!agents.some((item) => item.id === 'project-orchestrator-agent')) {
    const builtin = seed().agents.find((item) => item.id === 'project-orchestrator-agent');
    if (builtin) agents.push(builtin);
  }
  return { providers: parsed.providers || [], profiles: parsed.profiles || [], agents, ruleAgent: parsed.ruleAgent || { enabled: true, profileId: 'default-cloud', maxIterations: 12, updatedAt: now() } };
}

function writeStore(store: StoreFile) {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  const temporary = `${STORE_PATH}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(store, null, 2));
  renameSync(temporary, STORE_PATH);
}

function visible<T extends { scope: LlmScope; tenantId?: string; projectId?: string }>(item: T, context: ScopeContext) {
  if (item.scope === 'global') return true;
  if (item.scope === 'tenant') return !!context.tenantId && item.tenantId === context.tenantId;
  return !!context.projectId && item.projectId === context.projectId && (!item.tenantId || item.tenantId === context.tenantId);
}

function assertScope(value: Pick<ProviderConfig, 'scope' | 'tenantId' | 'projectId'>, context: ScopeContext) {
  if (value.scope === 'tenant' && (!context.tenantId || value.tenantId !== context.tenantId)) throw new Error('租户级配置必须属于当前租户');
  if (value.scope === 'project' && (!context.projectId || value.projectId !== context.projectId)) throw new Error('项目级配置必须属于当前项目');
}

function validateAgentDefinition(definition: AgentDefinition['definition']) {
  const allowed = new Set(['model', 'router', 'tool', 'subgraph', 'plugin', 'end']);
  if (!definition?.entrypoint || !Array.isArray(definition.nodes) || !definition.nodes.length) throw new Error('Agent 定义必须包含 entrypoint 和 nodes');
  const ids = definition.nodes.map((node) => node.id);
  if (new Set(ids).size !== ids.length || ids.some((id) => !id)) throw new Error('Agent 节点 ID 不能为空或重复');
  if (!ids.includes(definition.entrypoint)) throw new Error('Agent entrypoint 不存在');
  for (const node of definition.nodes) if (!allowed.has(node.type)) throw new Error(`不支持 Agent 节点：${node.type}`);
  for (const edge of definition.edges || []) if (!ids.includes(edge.source) || !ids.includes(edge.target)) throw new Error(`Agent 边引用不存在的节点：${edge.source} -> ${edge.target}`);
}

export function publicProvider(provider: ProviderConfig) {
  const { encryptedApiKey, ...safe } = provider;
  return { ...safe, apiKeyConfigured: !!encryptedApiKey, apiKeyMasked: encryptedApiKey ? '••••••••' : '' };
}

export const llmManagement = {
  getRuleAgentSettings(context: ScopeContext) { const settings = readStore().ruleAgent; if (!this.getProfile(settings.profileId, context)?.enabled) return { ...settings, profileId: 'default-cloud' }; return settings; },
  saveRuleAgentSettings(input: Partial<RuleAgentSettings>, context: ScopeContext) { const store = readStore(); const profileId = String(input.profileId || store.ruleAgent.profileId); if (!this.getProfile(profileId, context)?.enabled) throw new Error('规则智能体引用的模型 Profile 不存在或已禁用'); store.ruleAgent = { enabled: input.enabled ?? store.ruleAgent.enabled, profileId, maxIterations: Math.min(Math.max(Number(input.maxIterations || store.ruleAgent.maxIterations), 2), 32), updatedAt: now() }; writeStore(store); return store.ruleAgent; },
  listProviders(context: ScopeContext) { return readStore().providers.filter((item) => visible(item, context)).map(publicProvider); },
  getProvider(id: string, context: ScopeContext) { return readStore().providers.find((item) => item.id === id && visible(item, context)); },
  saveProvider(input: Partial<ProviderConfig> & { name: string; kind: LlmProviderKind; scope: LlmScope; baseUrl: string; apiKey?: string }, context: ScopeContext) {
    assertScope(input as ProviderConfig, context);
    const sensitiveHeaders = Object.keys(input.headers || {}).filter((key) => ['authorization', 'x-api-key', 'api-key'].includes(key.toLowerCase()));
    if (sensitiveHeaders.length) throw new Error(`敏感认证信息必须写入 apiKey，不能放在 headers：${sensitiveHeaders.join(', ')}`);
    const store = readStore(); const previous = store.providers.find((item) => item.id === input.id); const timestamp = now();
    const provider: ProviderConfig = { id: input.id || `provider_${randomUUID()}`, name: input.name, kind: input.kind, scope: input.scope, tenantId: input.tenantId, projectId: input.projectId, baseUrl: input.baseUrl.replace(/\/$/, ''), encryptedApiKey: input.apiKey ? encryptLlmSecret(input.apiKey) : previous?.encryptedApiKey, timeoutMs: input.timeoutMs || 60_000, headers: input.headers || {}, tls: input.tls, enabled: input.enabled ?? true, createdAt: previous?.createdAt || timestamp, updatedAt: timestamp };
    store.providers = [...store.providers.filter((item) => item.id !== provider.id), provider]; writeStore(store); return publicProvider(provider);
  },
  removeProvider(id: string, context: ScopeContext) { const store = readStore(); const target = store.providers.find((item) => item.id === id && visible(item, context)); if (!target) return false; if (store.profiles.some((profile) => profile.routes.some((route) => route.providerId === id))) throw new Error('Provider 仍被模型 Profile 引用'); store.providers = store.providers.filter((item) => item.id !== id); writeStore(store); return true; },
  listProfiles(context: ScopeContext) { return readStore().profiles.filter((item) => visible(item, context)); },
  getProfile(id: string, context: ScopeContext) { return readStore().profiles.find((item) => item.id === id && visible(item, context)); },
  saveProfile(input: Partial<ModelProfile> & Pick<ModelProfile, 'name' | 'scope' | 'capabilities' | 'defaults' | 'routes'>, context: ScopeContext) {
    assertScope(input as ModelProfile, context); const store = readStore(); const previous = store.profiles.find((item) => item.id === input.id); const timestamp = now();
    if (!input.routes.length) throw new Error('模型 Profile 至少需要一条路由');
    for (const route of input.routes) if (!store.providers.some((item) => item.id === route.providerId && visible(item, context))) throw new Error(`Provider 不存在或不可见：${route.providerId}`);
    const profile: ModelProfile = { id: input.id || `profile_${randomUUID()}`, name: input.name, scope: input.scope, tenantId: input.tenantId, projectId: input.projectId, capabilities: input.capabilities, defaults: input.defaults, routes: input.routes, enabled: input.enabled ?? true, createdAt: previous?.createdAt || timestamp, updatedAt: timestamp };
    store.profiles = [...store.profiles.filter((item) => item.id !== profile.id), profile]; writeStore(store); return profile;
  },
  removeProfile(id: string, context: ScopeContext) { const store = readStore(); const target = store.profiles.find((item) => item.id === id && visible(item, context)); if (!target) return false; if (store.agents.some((agent) => agent.modelProfileId === id)) throw new Error('模型 Profile 仍被 Agent 引用'); store.profiles = store.profiles.filter((item) => item.id !== id); writeStore(store); return true; },
  listAgents(context: ScopeContext) { return readStore().agents.filter((item) => visible(item, context)); },
  getAgent(id: string, context: ScopeContext) { return readStore().agents.find((item) => item.id === id && visible(item, context)); },
  getProjectAgentProfileId(context: ScopeContext) {
    const agent = this.getAgent('project-orchestrator-agent', context);
    if (agent?.enabled && this.getProfile(agent.modelProfileId, context)?.enabled) return agent.modelProfileId;
    return 'default-cloud';
  },
  saveAgent(input: Partial<AgentDefinition> & Pick<AgentDefinition, 'name' | 'scope' | 'modelProfileId' | 'definition'>, context: ScopeContext) {
    assertScope(input as AgentDefinition, context); const store = readStore(); const previous = store.agents.find((item) => item.id === input.id); const timestamp = now();
    if (!store.profiles.some((item) => item.id === input.modelProfileId && visible(item, context))) throw new Error('Agent 引用的模型 Profile 不存在');
    validateAgentDefinition(input.definition);
    const agent: AgentDefinition = { id: input.id || `agent_${randomUUID()}`, name: input.name, version: previous ? previous.version + 1 : 1, scope: input.scope, tenantId: input.tenantId, projectId: input.projectId, modelProfileId: input.modelProfileId, definition: input.definition, enabled: input.enabled ?? true, createdAt: previous?.createdAt || timestamp, updatedAt: timestamp };
    store.agents = [...store.agents.filter((item) => item.id !== agent.id), agent]; writeStore(store); return agent;
  },
  removeAgent(id: string, context: ScopeContext) { const store = readStore(); const target = store.agents.find((item) => item.id === id && visible(item, context)); if (!target) return false; store.agents = store.agents.filter((item) => item.id !== id); writeStore(store); return true; },
  resolveProfile(id: string, context: ScopeContext) { const profile = this.getProfile(id, context); if (!profile?.enabled) throw new Error(`模型 Profile 不存在或已禁用：${id}`); return profile; },
  resolveConnection(route: ModelRoute, context: ScopeContext) { const provider = this.getProvider(route.providerId, context); if (!provider?.enabled) throw new Error(`Provider 不存在或已禁用：${route.providerId}`); return { provider: provider.kind, baseUrl: provider.baseUrl, apiKey: decryptLlmSecret(provider.encryptedApiKey), model: route.model, timeoutMs: provider.timeoutMs, headers: provider.headers || {} }; },
};
