import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { JsonObject } from './project-authoring';
import { commitProject as persistProject, toolError } from './project-authoring';
import { consumeConfirmation, issueConfirmation, operationHash } from './tool-confirmations';
import { compileDataToolArguments, type DataArgumentNormalization } from './data-tool-preflight';
import { compileBehaviorToolArguments } from './behavior-tool-preflight';
import { compileToolArguments } from './tool-argument-contract';
import { projectMutation } from './project-mutation';
import type { ProjectSourceFile } from './project-authoring';
import { createFileProjectMutationReplayStore } from './project-mutation-replay-store';
import { addAudit } from './audit-store';
import { canAccessProject, type ProjectAccess } from './permission';
import { requireProject, projectRevision } from './project-authoring';
import { serverDataPath } from '../config/paths';
import {
  MCP_ROLES, MCP_ROLE_CATALOG, resultSchema,
  type FormFlowToolDefinition, type JsonSchema, type McpRole, type ToolContext, type ToolResult, type ToolRisk,
  isMcpRole, allRoles, schema, string, array, object, boolean, clarifyInputSchema,
} from './tool-shared';
import type { RegisterFn, ToolHelpers } from './tools/types';

// Re-export for backward compatibility
export { MCP_ROLES, MCP_ROLE_CATALOG, isMcpRole, resultSchema, anyObject } from './tool-shared';
export type { JsonSchema, ToolRisk, McpRole, ToolContext, ToolResult, ToolWarning, FormFlowToolDefinition } from './tool-shared';

// ─── Registry infrastructure ──────────────────────────────────────────────────

const registry = new Map<string, FormFlowToolDefinition>();
const toolReplayStore = createFileProjectMutationReplayStore(serverDataPath('tool-mutation-replays.json'));
type ToolMutationState = {
  projectId: string;
  draft: JsonObject;
  baseRevision: string;
  sourceFiles: ProjectSourceFile[];
  committed: boolean;
};
const toolMutationState = new AsyncLocalStorage<ToolMutationState>();

/**
 * Tool handlers keep their compact "mutate then commit" interface, while this
 * adapter redirects the commit into the shared project mutation seam.
 */
function commitProject(project: JsonObject, sourceFiles: ProjectSourceFile[] = []) {
  const active = toolMutationState.getStore();
  if (!active) return persistProject(project, sourceFiles);
  if (project.config?.id !== active.projectId) throw toolError('PROJECT_ID_MISMATCH', '工具提交了错误的项目');
  const snapshot = structuredClone(project);
  for (const key of Object.keys(active.draft)) delete active.draft[key];
  Object.assign(active.draft, snapshot);
  active.sourceFiles.push(...sourceFiles);
  active.committed = true;
  return { revision: active.baseRevision };
}

// ─── Shared helpers (exported for domain modules) ─────────────────────────────

function projectId(input: JsonObject, context: ToolContext) { return String(input.projectId || context.projectId || ''); }
function user(context: ToolContext) { return context.user || (context.userId ? { id: context.userId, username: context.userId, role: 'viewer' } : undefined); }

// ─── Registration ─────────────────────────────────────────────────────────────

function inferredRole(name: string): McpRole {
  if (name.startsWith('data_')) return 'data';
  if (name.startsWith('form.') || name.startsWith('form_')) return 'form';
  if (name.startsWith('workflow')) return 'workflow';
  if (name.startsWith('behavior.') || name.startsWith('rule_')) return 'behavior';
  if (name.startsWith('mock_data.') || name.startsWith('project_test.') || name.startsWith('project.quality')) return 'quality';
  if (name.startsWith('output.') || name.startsWith('release.') || name === 'project.export' || name.startsWith('project.package.')) return 'delivery';
  if (name.startsWith('catalog.components')) return 'form';
  if (name.startsWith('catalog.workflow_nodes')) return 'workflow';
  if (name.startsWith('catalog.events')) return 'behavior';
  return 'project';
}

function inferredSharedReadRoles(name: string, risk: ToolRisk, ownerRole: McpRole): McpRole[] | undefined {
  if (risk !== 'read') return undefined;
  if (name === 'system.capabilities.get' || ['project.get', 'project.inspect', 'project.validate'].includes(name)) return allRoles().filter((role) => role !== ownerRole);
  if (name === 'catalog.events.list') return ['form'];
  if (name === 'project.package.validate') return ['quality'];
  return undefined;
}

const register: RegisterFn = (definition) => {
  if (!/^[a-z][a-z0-9_.-]{1,63}$/i.test(definition.name)) throw new Error(`工具名称无效：${definition.name}`);
  if (registry.has(definition.name)) throw new Error(`工具重复注册：${definition.name}`);
  const ownerRole = definition.ownerRole || inferredRole(definition.name);
  const sharedReadRoles = definition.sharedReadRoles || inferredSharedReadRoles(definition.name, definition.risk, ownerRole as McpRole);
  if (definition.risk !== 'read' && sharedReadRoles?.length) throw new Error(`写工具不能共享角色：${definition.name}`);
  if (sharedReadRoles?.some((role) => role === ownerRole || !isMcpRole(role))) throw new Error(`工具共享角色无效：${definition.name}`);
  registry.set(definition.name, {
    ...definition,
    inputSchema: clarifyInputSchema(definition.name, definition.title, definition.risk, definition.inputSchema),
    ownerRole: ownerRole as McpRole,
    sharedReadRoles: sharedReadRoles as McpRole[] | undefined,
    outputSchema: definition.outputSchema || resultSchema,
  } as FormFlowToolDefinition);
};

const helpers: ToolHelpers = {
  schema, string, array, object, boolean, commitProject,
  projectId: (input: Record<string, any>, context: { projectId?: string }) => String(input.projectId || context.projectId || ''),
  findById: (items: any[], id: string, code: string) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) throw toolError(code, `${id} 不存在`);
    return item;
  },
  upsert: (items: any[], item: any) => {
    const index = items.findIndex((entry) => entry.id === item.id);
    if (index >= 0) items[index] = item; else items.push(item);
    return item;
  },
  remove: (items: any[], id: string) => {
    const index = items.findIndex((entry) => entry.id === id);
    if (index < 0) return false;
    items.splice(index, 1);
    return true;
  },
};

// ─── Import and register domain tools ─────────────────────────────────────────

import { registerCatalogTools } from './tools/catalog';
import { registerProjectTools } from './tools/project';
import { registerDataTools } from './tools/data';
import { registerFormTools } from './tools/form';
import { registerWorkflowTools } from './tools/workflow';
import { registerBehaviorTools } from './tools/behavior';
import { registerTemplateTools } from './tools/template';
import { registerQualityTools } from './tools/quality';
import { registerDeliveryTools } from './tools/delivery';

registerCatalogTools(register, helpers, [...MCP_ROLES], (role?: string) => listFormFlowTools(role as McpRole));
registerProjectTools(register, helpers);
registerDataTools(register, helpers);
registerFormTools(register, helpers);
registerWorkflowTools(register, helpers);
registerBehaviorTools(register, helpers);
registerTemplateTools(register, helpers);
registerQualityTools(register, helpers);
registerDeliveryTools(register, helpers);

// ─── Validation ───────────────────────────────────────────────────────────────

function availableToRole(definition: FormFlowToolDefinition, role: McpRole) { return definition.ownerRole === role || Boolean(definition.sharedReadRoles?.includes(role)); }

export function validateMcpToolRegistry() {
  for (const definition of registry.values()) {
    if (!isMcpRole(definition.ownerRole)) throw new Error(`工具缺少有效负责人：${definition.name}`);
    if (definition.risk !== 'read' && definition.sharedReadRoles?.length) throw new Error(`写工具不能跨角色共享：${definition.name}`);
    const exposedRoles = MCP_ROLES.filter((role) => availableToRole(definition, role));
    if (!exposedRoles.length) throw new Error(`工具未暴露给任何角色：${definition.name}`);
    if (definition.risk !== 'read' && exposedRoles.length !== 1) throw new Error(`写工具必须且只能归属一个角色：${definition.name}`);
    if ((definition.inputSchema as any).additionalProperties !== false) throw new Error(`工具顶层 Schema 必须拒绝未知参数：${definition.name}`);
    if (!(definition.inputSchema as any).description) throw new Error(`工具输入 Schema 缺少操作结果说明：${definition.name}`);
    for (const [key, property] of Object.entries((definition.inputSchema as any).properties || {}) as Array<[string, any]>) {
      if (!property?.description) throw new Error(`工具参数缺少说明：${definition.name}.${key}`);
    }
    if (!Array.isArray((definition.outputSchema as any).oneOf) || (definition.outputSchema as any).oneOf.length !== 3) throw new Error(`工具输出 Schema 必须区分成功、失败和待确认：${definition.name}`);
  }
  if (registry.has('project.apply_patch')) throw new Error('跨领域 project.apply_patch 不得注册');
  return { tools: registry.size, roles: Object.fromEntries(MCP_ROLES.map((role) => [role, [...registry.values()].filter((definition) => availableToRole(definition, role)).length])) };
}

validateMcpToolRegistry();

// ─── Public API ───────────────────────────────────────────────────────────────

export function listFormFlowTools(role?: McpRole) {
  const definitions = role ? [...registry.values()].filter((definition) => availableToRole(definition, role)) : [...registry.values()];
  return definitions.map(({ handler: _handler, impact: _impact, confirmWhen: _confirmWhen, ...definition }) => definition);
}
export function getFormFlowTool(name: string) { return registry.get(name); }

export async function executeFormFlowTool(name: string, argumentsValue: unknown, context: ToolContext = {}): Promise<ToolResult> {
  const requestId = context.requestId || `tool_${randomUUID()}`; const definition = registry.get(name);
  if (!definition) return { ok: false, error: { code: 'TOOL_NOT_FOUND', message: `未注册工具：${name}`, retryable: false }, meta: { requestId } };
  if (context.mcpRole && !availableToRole(definition, context.mcpRole)) return { ok: false, error: { code: 'TOOL_NOT_AVAILABLE_IN_ROLE', message: `工具 ${name} 不属于 ${context.mcpRole} MCP`, details: { role: context.mcpRole, ownerRole: definition.ownerRole }, retryable: false }, meta: { requestId } };
  try {
    validateInput(argumentsValue, definition);
    const contract = compileToolArguments(name, argumentsValue as JsonObject, definition.inputSchema);
    if (!contract.ok) throw toolError(contract.error.code, contract.error.message, contract.error.path, contract.error);
    const dataPreflight = compileDataToolArguments(name, contract.arguments as JsonObject);
    if (!dataPreflight.ok) throw toolError(dataPreflight.error.code, dataPreflight.error.message, dataPreflight.error.path, dataPreflight.error);
    const preflight = compileBehaviorToolArguments(name, dataPreflight.arguments as JsonObject);
    if (!preflight.ok) throw toolError(preflight.error.code, preflight.error.message, preflight.error.path, preflight.error);
    const input = preflight.arguments as JsonObject; const pid = projectId(input, context) || undefined;
    if (definition.requiredAccess && pid) { const project = requireProject(pid); if (!canAccessProject(user(context), project, definition.requiredAccess)) throw toolError('FORBIDDEN', `需要项目 ${definition.requiredAccess} 权限`); }
    if (definition.risk !== 'read') {
      if (!input.idempotencyKey) throw toolError('IDEMPOTENCY_KEY_REQUIRED', '写操作必须提供 idempotencyKey', 'idempotencyKey');
      const key = createHash('sha256').update(JSON.stringify({ name, idempotencyKey: input.idempotencyKey, userId: context.userId || '', tenantId: context.tenantId || '' })).digest('hex');
      const fingerprint = createHash('sha256').update(JSON.stringify({ name, input, userId: context.userId || '', tenantId: context.tenantId || '' })).digest('hex');
      const previous = toolReplayStore.get<ToolResult>(key);
      if (previous && previous.fingerprint !== fingerprint) throw toolError('IDEMPOTENCY_KEY_REUSED', '幂等键已绑定到另一项操作', 'idempotencyKey');
      if (previous) return previous.result;
      if (definition.risk === 'destructive' || definition.confirmWhen?.(input)) {
        const hash = operationHash(name, input, { ...context, projectId: pid }); const expected = { operationHash: hash, userId: context.userId || 'local', tenantId: context.tenantId, projectId: pid, toolName: name };
        if (!await consumeConfirmation(String(input.confirmationToken || ''), expected)) { const confirmation = await issueConfirmation(expected); return { ok: false, status: 'confirmation_required', confirmation: { ...confirmation, summary: `${definition.title}需要确认`, impact: definition.impact?.(input, context) || { projectId: pid } }, meta: { requestId } }; }
      }
      const before = pid ? (() => { try { return projectRevision(requireProject(pid)); } catch { return undefined; } })() : undefined;
      const usesSharedMutation = Boolean(pid && input.baseRevision && !['project.clone', 'project.delete', 'project.import'].includes(name));
      let data: unknown;
      if (usesSharedMutation) {
        const sourceFiles: ProjectSourceFile[] = [];
        const mutation = await projectMutation.applyAsync({
          projectId: pid!,
          operation: `mcp.${name}`,
          payload: input,
          baseRevision: String(input.baseRevision),
          idempotencyKey: String(input.idempotencyKey),
          user: user(context),
          access: definition.requiredAccess || 'edit',
          sourceFiles,
          change: async (draft) => {
            const state: ToolMutationState = { projectId: pid!, draft, baseRevision: String(input.baseRevision), sourceFiles, committed: false };
            const handlerResult = await toolMutationState.run(state, () => definition.handler(input, { ...context, projectId: pid, requestId }));
            if (!state.committed) throw toolError('MUTATION_NOT_COMMITTED', `写工具 ${name} 未提交项目变更`);
            return handlerResult;
          },
        });
        data = mutation.data && typeof mutation.data === 'object' && !Array.isArray(mutation.data)
          ? { ...(mutation.data as JsonObject), revision: mutation.revision }
          : mutation.data;
      } else {
        data = await definition.handler(input, { ...context, projectId: pid, requestId });
      }
      const afterProject = pid ? (() => { try { return requireProject(pid); } catch { return undefined; } })() : undefined;
      const result: ToolResult = { ok: true, data, meta: { requestId, projectId: pid, revision: afterProject ? projectRevision(afterProject) : undefined, ...(dataPreflight.normalizations.length ? { argumentNormalizations: dataPreflight.normalizations } : {}) } };
      toolReplayStore.set(key, { fingerprint, result, expiresAt: Date.now() + 24 * 60 * 60 * 1_000 });
      addAudit({ userId: context.userId, username: context.user?.username, action: `llm_tool.${name}`, resource: pid || name, projectId: pid, detail: { requestId, risk: definition.risk, beforeRevision: before, afterRevision: result.meta.revision } });
      return result;
    }
    const data = await definition.handler(input, { ...context, projectId: pid, requestId }); const revision = pid ? projectRevision(requireProject(pid)) : undefined;
    return { ok: true, data, meta: { requestId, projectId: pid, revision, ...(dataPreflight.normalizations.length ? { argumentNormalizations: dataPreflight.normalizations } : {}) } };
  } catch (error: any) {
    const code = String(error?.code || 'TOOL_EXECUTION_FAILED');
    const pid = String((argumentsValue as JsonObject)?.projectId || context.projectId || '') || undefined;
    if (name.startsWith('template.') || name.startsWith('project_analysis.')) addAudit({ userId: context.userId, username: context.user?.username, action: `llm_tool.${name}`, resource: pid || name, projectId: pid, detail: { requestId, ok: false, code, message: error instanceof Error ? error.message : String(error), path: error?.path } });
    return { ok: false, error: { code, message: error instanceof Error ? error.message : String(error), path: error?.path, details: error?.details, retryable: ['PROJECT_REVISION_CONFLICT', 'DATA_VERSION_CONFLICT'].includes(code) }, meta: { requestId } };
  }
}

function validateInput(value: unknown, definition: FormFlowToolDefinition) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw toolError('INVALID_ARGUMENTS', '工具参数必须是对象');
  for (const key of (definition.inputSchema.required as string[] || [])) if ((value as JsonObject)[key] === undefined || (value as JsonObject)[key] === '') throw toolError('REQUIRED_ARGUMENT', `缺少参数 ${key}`, key);
  const properties = definition.inputSchema.properties as Record<string, any> || {};
  for (const [key, property] of Object.entries(properties)) {
    const current = (value as JsonObject)[key]; if (current === undefined) continue;
    if (property.type === 'string' && typeof current !== 'string') throw toolError('INVALID_ARGUMENT', `${key} 必须是字符串`, key);
    if (property.type === 'array' && !Array.isArray(current)) throw toolError('INVALID_ARGUMENT', `${key} 必须是数组`, key);
    if (property.type === 'object' && (!current || typeof current !== 'object' || Array.isArray(current))) throw toolError('INVALID_ARGUMENT', `${key} 必须是对象`, key);
    if (property.type === 'boolean' && typeof current !== 'boolean') throw toolError('INVALID_ARGUMENT', `${key} 必须是布尔值`, key);
  }
}

export function registerExternalFormFlowTool(definition: FormFlowToolDefinition) { register(definition); return () => registry.delete(definition.name); }
