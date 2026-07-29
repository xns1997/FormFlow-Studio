import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import JSZip from 'jszip';
import type { AuthUser } from '../middleware/auth';
import { REPOSITORY_ROOT, serverDataPath } from '../config/paths';
import { canAccessProject, type ProjectAccess } from './permission';
import { addAudit, listAudit } from './audit-store';
import { formContext, lintRuleCode, readRuleReference, runRuleSandbox } from './rule-agent';
import {
  assertRevision, batchProjectRows, commitProject as persistProject, createEmptyProject, generatedForm, listProjectPackages,
  fullSourceRows, normalizeFormComponents, normalizeFormDesign, packageProject, projectRevision, projectSummary, queryProjectRows, requireProject, tableFromInput,
  serializeTableSource, toolError, validateProjectModel, type JsonObject,
} from './project-authoring';
import { consumeConfirmation, issueConfirmation, operationHash } from './tool-confirmations';
import {
  generateMockData, generateProjectTestSuite, inspectProjectQuality, profileMockData, runProjectTests,
} from './project-quality';
import { buildProjectTemplate, PROJECT_TEMPLATES, resolveProjectTemplateId } from '../../../shared/project-templates';
import { applyBehaviorDslToComponents, hasBehaviorDslErrors } from '../../../shared/formflow-core/behaviorDsl';
import { compileDataToolArguments, type DataArgumentNormalization } from './data-tool-preflight';
import { compileBehaviorToolArguments } from './behavior-tool-preflight';
import { compileToolArguments } from './tool-argument-contract';
import {
  OPERATION_TEMPLATES, analyzeOperationTemplate, applyDataRowsTransaction, applyOperationPlan,
  deleteTemplateInstanceResources, exportOperationTemplatePackage, getOperationTemplate, inspectTemplateInstanceDrift, planOperationTemplate, queryRelationRows, recommendOperationTemplates, regenerateTemplateInstance, suggestDataRelations, validateImportedOperationTemplate, validateRelation, type DataRelation,
} from './template-operation-center';
import { analysisRunStatus, appendAnalysisRun, applyPredictionWriteback, runAnalysisTemplate } from './analysis-template-runtime';
import { consumeStagedUpload, getStagedUpload } from './upload-staging';
import { projectMutation } from './project-mutation';
import type { ProjectSourceFile } from './project-authoring';
import { createFileProjectMutationReplayStore } from './project-mutation-replay-store';

export type ToolRisk = 'read' | 'write' | 'destructive';
export const MCP_ROLES = ['project', 'data', 'form', 'workflow', 'behavior', 'quality', 'delivery'] as const;
export type McpRole = typeof MCP_ROLES[number];
export const MCP_ROLE_CATALOG: ReadonlyArray<{ id: McpRole; title: string; description: string }> = [
  { id: 'project', title: '项目专家', description: '项目创建、模板初始化、整包导入、克隆、元信息和项目删除' },
  { id: 'data', title: '数据专家', description: '数据源、Sheet、主键、查询和批量写回' },
  { id: 'form', title: '表单专家', description: '表单、控件、字段绑定和表单状态' },
  { id: 'workflow', title: '流程专家', description: '工作流、节点、连线及流程校验' },
  { id: 'behavior', title: '行为规则专家', description: '行为、事件、规则参考、语法检查和规则测试' },
  { id: 'quality', title: '质量专家', description: 'Mock 数据、回归套件、项目质量和结构校验' },
  { id: 'delivery', title: '交付专家', description: '输出定义、项目包导出、发布草稿、预检和发布' },
];
export type ToolWarning = { code: string; message: string; path?: string };
export type ToolContext = { tenantId?: string; projectId?: string; userId?: string; user?: AuthUser; requestId?: string; mcpRole?: McpRole };
export type ToolResult<T = unknown> =
  | { ok: true; data: T; meta: { requestId: string; projectId?: string; revision?: string; warnings?: ToolWarning[]; argumentNormalizations?: DataArgumentNormalization[] } }
  | { ok: false; error: { code: string; message: string; path?: string; details?: unknown; retryable: boolean }; meta: { requestId: string } }
  | { ok: false; status: 'confirmation_required'; confirmation: { token: string; expiresAt: string; summary: string; impact: unknown }; meta: { requestId: string } };

export interface FormFlowToolDefinition {
  name: string; title: string; description: string; inputSchema: JsonSchema; outputSchema: JsonSchema;
  risk: ToolRisk; requiredAccess?: ProjectAccess; ownerRole: McpRole; sharedReadRoles?: McpRole[];
  handler(input: JsonObject, context: ToolContext): Promise<unknown> | unknown;
  impact?: (input: JsonObject, context: ToolContext) => unknown;
  confirmWhen?: (input: JsonObject) => boolean;
}

import {
  anyObject, resultMetaSchema, resultSchema, schema, string, array, object, boolean,
  dataColumnSchema, dataSourceConfigSchema, dataRowUpdateSchema,
  behaviorTriggerSchema, behaviorConditionSchema, behaviorActionSchema, behaviorRuleSchema,
  workflowNodeSchema, workflowEdgeSchema, workflowItemSchema, formComponentItemSchema,
  type JsonSchema,
} from './tool-schemas';
export type { JsonSchema } from './tool-schemas';

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
import { FIELD_DESCRIPTIONS } from './field-descriptions';

const allRoles = () => [...MCP_ROLES];

function clarifyInputSchema(name: string, title: string, risk: ToolRisk, inputSchema: JsonSchema): JsonSchema {
  const next = structuredClone(inputSchema) as Record<string, any>;
  next.additionalProperties ??= false;
  const effect = risk === 'read'
    ? '这是只读操作，不会修改项目。'
    : risk === 'destructive'
      ? '这是破坏性操作：首次调用只返回影响范围，不执行；确认后成功执行才会修改项目。'
      : '这是写操作：仅成功结果会修改项目；失败或待确认不会提交变更。';
  next.description = `${title}。${effect}`;
  for (const [key, property] of Object.entries(next.properties || {}) as Array<[string, Record<string, any>]>) {
    const described = structuredClone(property);
    described.description ||= FIELD_DESCRIPTIONS[key] || `${title} 的 ${key} 参数。`;
    next.properties[key] = described;
  }
  if (next.properties?.scope && next.properties?.formId && next.properties?.tableId && next.properties?.sheetName && !next.allOf) {
    next.allOf = [
      { if: { properties: { scope: { const: 'form' } } }, then: { required: ['formId'] } },
      { if: { properties: { scope: { const: 'sheet' } } }, then: { required: ['tableId', 'sheetName'] } },
    ];
  }
  if (['data_source.create', 'data_source.import'].includes(name)) {
    next['x-formflow-source-selection'] = {
      rule: 'exactlyOne',
      choices: ['fileId', 'csv', 'rows', 'config.columns（仅创建空表）'],
      outcome: '同时提供多个数据内容来源时返回 DATA_SOURCE_INPUT_AMBIGUOUS，项目不修改。',
    };
  }
  next['x-formflow-outcome'] = {
    risk,
    onSuccess: risk === 'read' ? '返回读取结果，项目不变。' : '返回已完成变更及最新 revision。',
    onFailure: '返回结构化 error，操作不提交。',
    ...(risk === 'destructive' || 'confirmationToken' in (next.properties || {}) ? { confirmation: '可能先返回 confirmation_required；此时操作尚未执行。' } : {}),
  };
  return next;
}

const behaviorListInputSchema: JsonSchema = {
  ...schema(['projectId', 'scope'], {
    projectId: string,
    scope: { type: 'string', enum: ['global', 'sheet', 'form'] },
    formId: string,
    tableId: string,
    sheetName: string,
  }),
  allOf: [
    { if: { properties: { scope: { const: 'form' } } }, then: { required: ['formId'] } },
    { if: { properties: { scope: { const: 'sheet' } } }, then: { required: ['tableId', 'sheetName'] } },
  ],
};

function endpoint(value: unknown): { nodeId: string; portId?: string } {
  if (typeof value === 'string') return { nodeId: value };
  const entry = value && typeof value === 'object' ? value as JsonObject : {};
  return { nodeId: String(entry.nodeId || entry.id || ''), portId: entry.portId ? String(entry.portId) : entry.port ? String(entry.port) : undefined };
}

function normalizeWorkflowNode(value: any) {
  const properties = value?.data?.propertiesJson !== undefined
    ? value.data.propertiesJson
    : JSON.stringify(value?.props || value?.config || {});
  return {
    id: String(value?.id || ''), type: 'formflow', specId: String(value?.specId || value?.type || ''),
    position: value?.position || { x: Number(value?.x || 0), y: Number(value?.y || 0) },
    data: {
      ...(value?.data || {}),
      propertiesJson: typeof properties === 'string' ? properties : JSON.stringify(properties || {}),
      connectedPortsJson: typeof value?.data?.connectedPortsJson === 'string' ? value.data.connectedPortsJson : '[]',
    },
  };
}

function normalizeWorkflowEdge(value: any) {
  const source = endpoint(value?.source); const target = endpoint(value?.target);
  return {
    id: String(value?.id || ''), source: source.nodeId, target: target.nodeId,
    sourceHandle: String(value?.sourceHandle || `out:${source.portId || 'trigger'}`),
    targetHandle: String(value?.targetHandle || `in:${target.portId || 'trigger'}`),
  };
}

function normalizeWorkflowItem(value: any, fallbackId?: unknown) {
  return {
    ...(value || {}), id: String(value?.id || fallbackId || ''), name: String(value?.name || value?.label || fallbackId || value?.id || ''),
    nodes: Array.isArray(value?.nodes) ? value.nodes.map(normalizeWorkflowNode) : [],
    edges: Array.isArray(value?.edges) ? value.edges.map(normalizeWorkflowEdge) : [],
  };
}

export function isMcpRole(value: unknown): value is McpRole { return MCP_ROLES.includes(value as McpRole); }

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

function register(definition: Omit<FormFlowToolDefinition, 'outputSchema' | 'ownerRole' | 'sharedReadRoles'> & { outputSchema?: JsonSchema; ownerRole?: McpRole; sharedReadRoles?: McpRole[] }) {
  if (!/^[a-z][a-z0-9_.-]{1,63}$/i.test(definition.name)) throw new Error(`工具名称无效：${definition.name}`);
  if (registry.has(definition.name)) throw new Error(`工具重复注册：${definition.name}`);
  const ownerRole = definition.ownerRole || inferredRole(definition.name);
  const sharedReadRoles = definition.sharedReadRoles || inferredSharedReadRoles(definition.name, definition.risk, ownerRole);
  if (definition.risk !== 'read' && sharedReadRoles?.length) throw new Error(`写工具不能共享角色：${definition.name}`);
  if (sharedReadRoles?.some((role) => role === ownerRole || !isMcpRole(role))) throw new Error(`工具共享角色无效：${definition.name}`);
  registry.set(definition.name, {
    ...definition,
    inputSchema: clarifyInputSchema(definition.name, definition.title, definition.risk, definition.inputSchema),
    ownerRole,
    sharedReadRoles,
    outputSchema: definition.outputSchema || resultSchema,
  });
}

function projectId(input: JsonObject, context: ToolContext) { return String(input.projectId || context.projectId || ''); }
function editable(input: JsonObject, context: ToolContext) {
  const pid = projectId(input, context);
  const active = toolMutationState.getStore();
  if (active?.projectId === pid) return active.draft;
  const project = requireProject(pid);
  assertRevision(project, input.baseRevision);
  return project;
}
function touch(project: JsonObject) { project.config.updatedAt = new Date().toISOString(); return project; }
function user(context: ToolContext): AuthUser | undefined { return context.user || (context.userId ? { id: context.userId, username: context.userId, role: 'viewer' } : undefined); }
function findById(items: any[], id: string, code: string) { const item = items.find((entry) => entry.id === id); if (!item) throw toolError(code, `${id} 不存在`); return item; }
function upsert(items: any[], item: any) { const index = items.findIndex((entry) => entry.id === item.id); if (index >= 0) items[index] = item; else items.push(item); return item; }
function remove(items: any[], id: string) { const index = items.findIndex((entry) => entry.id === id); if (index < 0) return false; items.splice(index, 1); return true; }
/** Check if a form references the given ID anywhere in its structure (bindings, behaviors, flow triggers). */
function formReferencesId(form: any, id: string): boolean {
  const str = JSON.stringify(form);
  return str.includes(id);
}

let _componentCatalog: Array<{ type: string; label: string; category: string; allowedProps: string[]; defaultSize?: { width: number; height: number }; source: string }> | undefined;
function componentCatalog() {
  if (_componentCatalog) return _componentCatalog;
  const directory = join(REPOSITORY_ROOT, 'ui', 'src', 'designer', 'controls');
  if (!existsSync(directory)) return [];
  _componentCatalog = readdirSync(directory).filter((name) => name.endsWith('.tsx')).flatMap((name) => {
    const source = readFileSync(join(directory, name), 'utf8');
    return source.split('registerControl({').slice(1).flatMap((block) => {
      const match = block.match(/^\s*\n?\s*type:\s*'([^']+)',\s*label:\s*'([^']+)',\s*category:\s*'([^']+)'/);
      if (!match) return [];
      const allowedProps = [...new Set([...block.matchAll(/\{\s*key:\s*'([^']+)'/g)].map((item) => item[1]))];
      const size = block.match(/defaultSize:\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)\s*\}/);
      return [{ type: match[1], label: match[2], category: match[3], allowedProps, defaultSize: size ? { width: Number(size[1]), height: Number(size[2]) } : undefined, source: name }];
    });
  });
  return _componentCatalog;
}

let _workflowCatalog: JsonObject[] | undefined;
function workflowCatalog() {
  if (_workflowCatalog) return _workflowCatalog;
  const root = join(REPOSITORY_ROOT, 'ui', 'nodes'); const result: JsonObject[] = [];
  if (!existsSync(root)) return _workflowCatalog = result;
  const walk = (directory: string) => { for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) walk(path); else if (entry.name === 'schema.json') { try { result.push(JSON.parse(readFileSync(path, 'utf8'))); } catch { /* invalid plugin schema stays undiscoverable */ } } } };
  walk(root); _workflowCatalog = result.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return _workflowCatalog;
}

register({ name: 'system.capabilities.get', title: '获取能力', description: '返回当前专职 MCP 的能力、限制和版本。', inputSchema: schema(), risk: 'read', handler: (_input, context) => ({ formatVersion: 2, role: context.mcpRole, tools: context.mcpRole ? listFormFlowTools(context.mcpRole).length : registry.size, roles: MCP_ROLE_CATALOG, limits: { uploadBytes: 50 * 1024 * 1024, inlineBytes: 5 * 1024 * 1024, inlineRows: 10_000, queryPageSize: 500, batchChanges: 1000 }, transports: ['agent', 'mcp-http', 'mcp-stdio'] }) });
register({ name: 'catalog.templates.list', title: '项目模板目录', description: '列出可用于初始化项目的模板。', inputSchema: schema(), risk: 'read', handler: () => PROJECT_TEMPLATES });
register({ name: 'catalog.operation_templates.list', title: '操作模板目录', description: '列出内置与当前项目导入的操作模板及其选择契约。', inputSchema: schema([], { projectId: string, category: string }), risk: 'read', handler: (input, context) => { const custom = input.projectId ? requireProject(projectId(input, context)).customOperationTemplates || [] : []; const templates = [...OPERATION_TEMPLATES, ...custom]; return input.category ? templates.filter((item: any) => item.category === input.category) : templates; } });
register({ name: 'catalog.operation_templates.get', title: '操作模板详情', description: '读取内置或当前项目导入模板的定义、参数 Schema 和生成物摘要。', inputSchema: schema(['templateId'], { projectId: string, templateId: string }), risk: 'read', handler: (input, context) => getOperationTemplate(input.templateId, input.projectId ? requireProject(projectId(input, context)) : undefined) });
register({ name: 'catalog.components.list', title: '控件目录', description: '列出当前 UI 注册的表单控件。', inputSchema: schema(), risk: 'read', handler: componentCatalog });
register({ name: 'catalog.components.get', title: '控件详情', description: '读取指定表单控件。', inputSchema: schema(['type'], { type: string }), risk: 'read', handler: (input) => { const found = componentCatalog().find((item) => item.type === input.type); if (!found) throw toolError('COMPONENT_TYPE_NOT_FOUND', `控件 ${input.type} 不存在`); return found; } });
register({ name: 'catalog.workflow_nodes.list', title: '流程节点目录', description: '列出全部工作流节点 Schema。', inputSchema: schema(), risk: 'read', handler: () => workflowCatalog().map(({ id, label, description, category, kind, ports }) => ({ id, label, description, category, kind, ports })) });
register({ name: 'catalog.workflow_nodes.get', title: '流程节点详情', description: '读取工作流节点完整 Schema。', inputSchema: schema(['id'], { id: string }), risk: 'read', handler: (input) => { const found = workflowCatalog().find((item) => item.id === input.id); if (!found) throw toolError('WORKFLOW_NODE_NOT_FOUND', `节点 ${input.id} 不存在`); return found; } });
register({ name: 'catalog.events.list', title: '事件目录', description: '列出表单、字段、控件和工作表行为事件。', inputSchema: schema(), risk: 'read', handler: () => ['formLoad', 'formSubmit', 'fieldChange', 'fieldFocus', 'fieldBlur', 'onClick', 'onChange', 'onFocus', 'onBlur', 'onSubmit', 'onTabChange', 'sheetLoad', 'rowChange'] });

register({ name: 'project.list', title: '项目列表', description: '列出可见 FormFlow 项目。', inputSchema: schema(), risk: 'read', handler: (_input, context) => listProjectPackages().filter((item) => { try { return canAccessProject(user(context), requireProject(item.id), 'view'); } catch { return false; } }) });
register({ name: 'project.get', title: '读取项目', description: '读取完整项目模型和 revision。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => { const project = requireProject(projectId(input, context)); return { project, summary: projectSummary(project), revision: projectRevision(project) }; } });
register({ name: 'project.inspect', title: '检查项目', description: '返回适合大模型消费的项目摘要。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => projectSummary(requireProject(projectId(input, context))) });
register({ name: 'project.validate', title: '校验项目', description: '运行 FormFlow v2 结构、引用和主键校验。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => validateProjectModel(requireProject(projectId(input, context))) });
register({ name: 'project.create', title: '创建项目', description: '创建空 FormFlow v2 项目。', inputSchema: schema(['id', 'name', 'idempotencyKey'], { id: string, name: string, idempotencyKey: string }), risk: 'write', handler: (input, context) => commitProject(createEmptyProject({ ...input, ownerId: context.userId })) });
register({ name: 'project.initialize', title: '初始化项目', description: '创建项目并按模板生成基础表单骨架。', inputSchema: schema(['id', 'name', 'idempotencyKey'], { id: string, name: string, description: string, author: string, tags: { type: 'array', items: string }, templateId: string, idempotencyKey: string }), risk: 'write', handler: (input, context) => {
  createEmptyProject({ ...input, ownerId: context.userId });
  const requestedTemplateId = String(input.templateId || 'game_analytics');
  const templateId = resolveProjectTemplateId(requestedTemplateId);
  if (!templateId) throw toolError('TEMPLATE_NOT_FOUND', `模板 ${requestedTemplateId} 不存在`, 'templateId');
  const project = buildProjectTemplate(templateId, {
    id: String(input.id), name: String(input.name), description: String(input.description || ''), author: String(input.author || 'FormFlow Agent'),
    tags: Array.isArray(input.tags) ? input.tags.map(String) : ['模板', templateId], ownerId: context.userId,
  });
  return commitProject(project);
} });
register({ name: 'project.update', title: '更新项目', description: '更新项目元信息或设置；发布草稿由 release.update 负责。', inputSchema: schema(['projectId', 'baseRevision', 'idempotencyKey'], { projectId: string, baseRevision: string, idempotencyKey: string, config: object, settings: object }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { if (input.release) throw toolError('INVALID_ARGUMENT', 'release 草稿必须使用 delivery MCP 的 release.update', 'release'); const project = editable(input, context); if (input.config) project.config = { ...project.config, ...input.config, id: project.config.id }; if (input.settings) project.settings = { ...project.settings, ...input.settings }; return commitProject(touch(project)); } });
register({ name: 'project.clone', title: '克隆项目', description: '将项目克隆为新稳定 ID。', inputSchema: schema(['projectId', 'newId', 'idempotencyKey'], { projectId: string, newId: string, name: string, idempotencyKey: string }), risk: 'write', requiredAccess: 'view', handler: (input, context) => {
  const source = structuredClone(requireProject(projectId(input, context)));
  const sourceId = source.config.id;
  if (existsSync(join(REPOSITORY_ROOT, 'projects', 'data', `${input.newId}.formflow`))) throw toolError('PROJECT_EXISTS', '目标项目已存在');
  const now = new Date().toISOString();
  source.config = { ...source.config, id: input.newId, name: input.name || `${source.config.name} (副本)`, createdAt: now, updatedAt: now, access: context.userId ? { ownerId: context.userId, members: {} } : source.config.access };
  const sourceFiles = (source.srcTable || []).map((table: any) => {
    const path = join(REPOSITORY_ROOT, 'projects', 'data', `${sourceId}.formflow`, 'data', basename(table.fileName));
    if (!existsSync(path)) throw toolError('SOURCE_FILE_MISSING', `原表 ${table.fileName} 不存在`);
    return { fileName: table.fileName, buffer: readFileSync(path) };
  });
  return commitProject(source, sourceFiles);
} });
register({ name: 'project.delete', title: '删除项目', description: '永久删除项目包。', inputSchema: schema(['projectId', 'idempotencyKey'], { projectId: string, confirmationToken: string, idempotencyKey: string }), risk: 'destructive', requiredAccess: 'manage', impact: (input) => ({ projectId: input.projectId, deletes: 'entire_project' }), handler: async (input) => { const { deleteProjectPackage } = await import('./project-package-store'); deleteProjectPackage(input.projectId); return { deleted: true, projectId: input.projectId }; } });
register({ name: 'project.diff', title: '项目差异', description: '比较当前项目和候选 patch 的顶层资源差异。', inputSchema: schema(['projectId', 'patch'], { projectId: string, patch: object }), risk: 'read', requiredAccess: 'view', handler: (input, context) => { const project = requireProject(projectId(input, context)); const changes = Object.keys(input.patch || {}).filter((key) => JSON.stringify(project[key]) !== JSON.stringify(input.patch[key])); return { revision: projectRevision(project), changedSections: changes }; } });
register({ name: 'template.analyze', title: '模板可行性检查', description: '按模板专属规则检查选择对象、主键、关系、字段角色、样本量和必填参数。', inputSchema: schema(['projectId', 'templateId'], { projectId: string, templateId: string, selection: object, parameters: object }), risk: 'read', requiredAccess: 'view', handler: (input, context) => analyzeOperationTemplate(requireProject(projectId(input, context)), input.templateId, input.selection || {}, input.parameters || {}) });
register({ name: 'template.recommend', title: '按数据选择推荐模板', description: '评估全部操作模板，返回稳定排序、匹配原因、可安全推断参数和未解决配置。', inputSchema: schema(['projectId', 'selection'], { projectId: string, selection: object }), risk: 'read', requiredAccess: 'view', handler: (input, context) => recommendOperationTemplates(requireProject(projectId(input, context)), input.selection || {}) });
register({ name: 'template.plan', title: '生成计划预览', description: '构建确定性的模板生成计划，返回完整生成物摘要和 ID 冲突，不写项目。', inputSchema: schema(['projectId', 'templateId'], { projectId: string, templateId: string, selection: object, parameters: object }), risk: 'read', requiredAccess: 'view', handler: (input, context) => { const project = requireProject(projectId(input, context)); return { plan: { ...planOperationTemplate(project, input.templateId, input.selection || {}, input.parameters || {}), baseRevision: projectRevision(project) }, revision: projectRevision(project) }; } });
register({ name: 'template.apply', title: '应用模板生成计划', description: '基于最新 revision 原子应用已预览的生成计划，并记录模板实例。', inputSchema: schema(['projectId', 'baseRevision', 'idempotencyKey', 'plan'], { projectId: string, baseRevision: string, idempotencyKey: string, plan: object, confirmationToken: string }), risk: 'write', requiredAccess: 'edit', confirmWhen: (input) => !!input.plan?.summary?.destructive, impact: (input) => ({ templateId: input.plan?.templateId, summary: input.plan?.summary, conflicts: input.plan?.conflicts?.length || 0 }), handler: (input, context) => { const project = editable(input, context); if (input.plan?.baseRevision && input.plan.baseRevision !== input.baseRevision) throw toolError('PLAN_REVISION_MISMATCH', '生成计划与提交 revision 不一致', 'plan.baseRevision'); const next = applyOperationPlan(project, input.plan as any); const committed = commitProject(next); return { instanceId: input.plan.instanceId, resources: input.plan.artifacts, revision: committed.revision }; } });
register({ name: 'template.instance.list', title: '模板实例列表', description: '列出项目内受模板管理的实例及其生成资源。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => requireProject(projectId(input, context)).templateInstances || [] });
register({ name: 'template.instance.detach', title: '脱离模板管理', description: '保留生成资源，但将实例标记为不再受模板管理。', inputSchema: schema(['projectId', 'id', 'baseRevision', 'idempotencyKey'], { projectId: string, id: string, baseRevision: string, idempotencyKey: string }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); const instance = findById(project.templateInstances || [], input.id, 'TEMPLATE_INSTANCE_NOT_FOUND'); instance.status = 'detached'; instance.updatedAt = new Date().toISOString(); const committed = commitProject(touch(project)); return { instance, revision: committed.revision }; } });
register({ name: 'template.instance.drift', title: '检查模板实例漂移', description: '比较生成时资源指纹与当前资源，区分缺失、手工修改和未变化。', inputSchema: schema(['projectId', 'id'], { projectId: string, id: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => inspectTemplateInstanceDrift(requireProject(projectId(input, context)), input.id) });
register({ name: 'template.instance.regenerate', title: '安全重新生成模板实例', description: '重新生成仍归属于实例的资源；发现手工修改时默认阻止，明确 overwriteModified 后需二次确认。', inputSchema: schema(['projectId', 'id', 'baseRevision', 'idempotencyKey'], { projectId: string, id: string, baseRevision: string, idempotencyKey: string, overwriteModified: boolean, confirmationToken: string }), risk: 'write', requiredAccess: 'edit', confirmWhen: (input) => !!input.overwriteModified, impact: (input, context) => ({ instanceId: input.id, overwriteModified: !!input.overwriteModified, drift: inspectTemplateInstanceDrift(requireProject(projectId(input, context)), input.id) }), handler: (input, context) => { const project = editable(input, context); const regenerated = regenerateTemplateInstance(project, input.id, !!input.overwriteModified); const committed = commitProject(regenerated.project); return { instanceId: input.id, overwritten: regenerated.overwritten, resources: regenerated.plan.artifacts, revision: committed.revision }; } });
register({ name: 'template.instance.delete', title: '删除模板实例生成物', description: '仅删除仍明确归属于实例的生成资源；手工资源不会被误删。', inputSchema: schema(['projectId', 'id', 'baseRevision', 'idempotencyKey'], { projectId: string, id: string, baseRevision: string, idempotencyKey: string, confirmationToken: string }), risk: 'destructive', requiredAccess: 'edit', impact: (input, context) => { const project = requireProject(projectId(input, context)); const instance = (project.templateInstances || []).find((item: any) => item.id === input.id); return { instanceId: input.id, resources: instance?.resources || {} }; }, handler: (input, context) => { const project = editable(input, context); const next = deleteTemplateInstanceResources(project, input.id); const committed = commitProject(next); return { deleted: true, revision: committed.revision }; } });
register({ name: 'template.preset.list', title: '模板参数预设', description: '列出项目内可复用的模板参数预设。', inputSchema: schema(['projectId'], { projectId: string, templateId: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => { const presets = requireProject(projectId(input, context)).templatePresets || []; return input.templateId ? presets.filter((item: any) => item.templateId === input.templateId) : presets; } });
register({ name: 'template.preset.upsert', title: '保存模板参数预设', description: '按稳定 ID 保存模板参数，不包含数据选择或业务数据。', inputSchema: schema(['projectId', 'preset', 'baseRevision', 'idempotencyKey'], { projectId: string, preset: object, baseRevision: string, idempotencyKey: string }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); const preset = input.preset as any; if (!preset?.id || !preset?.name || !preset?.templateId) throw toolError('REQUIRED_ARGUMENT', '预设必须包含 id、name 和 templateId', 'preset'); if (!OPERATION_TEMPLATES.some((item) => item.id === preset.templateId)) throw toolError('TEMPLATE_NOT_FOUND', '预设引用的模板不存在', 'preset.templateId'); const now = new Date().toISOString(); project.templatePresets ||= []; const previous = project.templatePresets.find((item: any) => item.id === preset.id); upsert(project.templatePresets, { id: preset.id, name: preset.name, templateId: preset.templateId, parameters: preset.parameters || {}, createdAt: previous?.createdAt || now, updatedAt: now }); const committed = commitProject(touch(project)); return { preset: project.templatePresets.find((item: any) => item.id === preset.id), revision: committed.revision }; } });
register({ name: 'template.preset.delete', title: '删除模板参数预设', description: '删除参数预设，不影响已生成实例。', inputSchema: schema(['projectId', 'id', 'baseRevision', 'idempotencyKey'], { projectId: string, id: string, baseRevision: string, idempotencyKey: string }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); project.templatePresets ||= []; if (!project.templatePresets.some((item: any) => item.id === input.id)) throw toolError('TEMPLATE_PRESET_NOT_FOUND', '参数预设不存在', 'id'); remove(project.templatePresets, input.id); const committed = commitProject(touch(project)); return { deleted: true, revision: committed.revision }; } });
register({ name: 'template.statistics', title: '模板使用与失败统计', description: '汇总模板实例、分析运行、工具调用和结构化失败原因，便于发现高频问题。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => { const pid = projectId(input, context); const project = requireProject(pid); const audit = listAudit({ projectId: pid, limit: 10_000 }).filter((entry) => entry.action.startsWith('llm_tool.template.') || entry.action.startsWith('llm_tool.project_analysis.')); const failures = audit.filter((entry) => (entry.detail as any)?.ok === false); const modelFailures = (project.modelRuns || []).filter((run: any) => run.status === 'failed'); const reasons = [...failures.map((entry) => ({ code: (entry.detail as any)?.code || 'UNKNOWN', message: (entry.detail as any)?.message || '工具调用失败' })), ...modelFailures.map((run: any) => ({ code: 'ANALYSIS_FAILED', message: run.error || '分析任务失败' }))]; return { installed: (project.templateInstances || []).length, managed: (project.templateInstances || []).filter((item: any) => item.status === 'managed').length, presets: (project.templatePresets || []).length, analysisRuns: (project.modelRuns || []).length, successfulRuns: (project.modelRuns || []).filter((run: any) => run.status === 'succeeded').length, failedRuns: modelFailures.length, toolCalls: audit.length, byTemplate: Object.entries((project.templateInstances || []).reduce((counts: any, item: any) => ({ ...counts, [item.templateId]: (counts[item.templateId] || 0) + 1 }), {})).map(([templateId, count]) => ({ templateId, count })), failureReasons: Object.entries(reasons.reduce((counts: any, reason) => { const key = `${reason.code}|${reason.message}`; counts[key] = (counts[key] || 0) + 1; return counts; }, {})).map(([key, count]) => { const [code, message] = key.split('|'); return { code, message, count }; }).sort((left: any, right: any) => right.count - left.count) }; } });
register({ name: 'template.package.export', title: '导出操作模板', description: '导出内置或项目自定义模板的纯声明 JSON 包，不包含业务数据。', inputSchema: schema(['projectId', 'templateIds'], { projectId: string, templateIds: array }), risk: 'read', requiredAccess: 'view', handler: (input, context) => exportOperationTemplatePackage(requireProject(projectId(input, context)), (input.templateIds || []).map(String)) });
register({ name: 'template.package.import', title: '导入操作模板', description: '校验并导入纯声明操作模板；不接受脚本或任意代码。', inputSchema: schema(['projectId', 'package', 'baseRevision', 'idempotencyKey'], { projectId: string, package: object, overwrite: boolean, baseRevision: string, idempotencyKey: string }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); const packageValue = input.package as any; if (packageValue?.kind !== 'formflow-operation-template-package' || packageValue?.formatVersion !== 1 || !Array.isArray(packageValue.templates)) throw toolError('INVALID_TEMPLATE_PACKAGE', '模板包格式无效', 'package'); const suppliedChecksum = packageValue.checksum; if (suppliedChecksum) { const { checksum: _checksum, ...payload } = packageValue; const actual = createHash('sha256').update(JSON.stringify(payload)).digest('hex'); if (actual !== suppliedChecksum) throw toolError('TEMPLATE_PACKAGE_CHECKSUM_MISMATCH', '模板包校验和不匹配', 'package.checksum'); } const templates = packageValue.templates.map((item: any) => validateImportedOperationTemplate(item)); const builtIn = new Set(OPERATION_TEMPLATES.map((item) => item.id)); if (templates.some((item: any) => builtIn.has(item.id))) throw toolError('BUILT_IN_TEMPLATE_CONFLICT', '不能覆盖内置模板', 'package.templates'); project.customOperationTemplates ||= []; for (const template of templates) { const exists = project.customOperationTemplates.some((item: any) => item.id === template.id); if (exists && !input.overwrite) throw toolError('TEMPLATE_EXISTS', `模板 ${template.id} 已存在`, 'package.templates'); upsert(project.customOperationTemplates, template); } const committed = commitProject(touch(project)); return { imported: templates.map((item: any) => ({ id: item.id, version: item.version })), revision: committed.revision }; } });
register({ name: 'template.instance.upgrade', title: '升级模板实例', description: '按当前目录版本安全重新生成实例；手工漂移默认阻止覆盖。', inputSchema: schema(['projectId', 'id', 'baseRevision', 'idempotencyKey'], { projectId: string, id: string, overwriteModified: boolean, baseRevision: string, idempotencyKey: string, confirmationToken: string }), risk: 'write', requiredAccess: 'edit', confirmWhen: (input) => !!input.overwriteModified, impact: (input, context) => ({ instanceId: input.id, overwriteModified: !!input.overwriteModified, drift: inspectTemplateInstanceDrift(requireProject(projectId(input, context)), input.id) }), handler: (input, context) => { const project = editable(input, context); const instance = findById(project.templateInstances || [], input.id, 'TEMPLATE_INSTANCE_NOT_FOUND'); const target = getOperationTemplate(instance.templateId, project); if (instance.templateVersion === target.version) return { upgraded: false, fromVersion: instance.templateVersion, toVersion: target.version, revision: projectRevision(project) }; const fromVersion = instance.templateVersion; const regenerated = regenerateTemplateInstance(project, input.id, !!input.overwriteModified); const committed = commitProject(regenerated.project); return { upgraded: true, fromVersion, toVersion: target.version, overwritten: regenerated.overwritten, revision: committed.revision }; } });
register({ name: 'project.import', title: '导入项目包', description: '从已上传的单文件 .formflow 项目包导入；校验后解包写入项目存储目录。', inputSchema: schema(['fileId', 'idempotencyKey'], { fileId: string, projectId: string, overwrite: boolean, baseRevision: string, idempotencyKey: string, confirmationToken: string }), risk: 'write', confirmWhen: (input) => !!input.overwrite, impact: (input) => ({ projectId: input.projectId, overwrite: !!input.overwrite }), handler: async (input, context) => {
  const meta = getStagedUpload(String(input.fileId)); if (!meta) throw toolError('FILE_NOT_FOUND', '上传的 .formflow 文件不存在或已过期', 'fileId');
  if (!String(meta.originalName || '').toLowerCase().endsWith('.formflow')) throw toolError('INVALID_PROJECT_PACKAGE_EXTENSION', '仅支持 .formflow 项目包', 'fileId'); if (context.tenantId && meta.tenantId !== context.tenantId) throw toolError('FORBIDDEN_FILE', '上传文件不属于当前租户', 'fileId');
  const zip = await JSZip.loadAsync(readFileSync(meta.path)); const readJson = async (name: string, fallback: any = undefined) => { const entry = zip.file(name); if (!entry) { if (fallback !== undefined) return fallback; throw toolError('INVALID_PROJECT_PACKAGE', `项目包缺少 ${name}`); } return JSON.parse(await entry.async('string')); };
  const manifest = await readJson('project.json'); if (manifest.kind !== 'formflow-project' || manifest.formatVersion !== 2) throw toolError('UNSUPPORTED_PROJECT_PACKAGE', '仅支持 FormFlow v2 项目包');
  const formIndex = await readJson('forms/_index.json', { forms: [] }); const forms: any[] = [];
  for (const entry of formIndex.forms || []) { const design = normalizeFormDesign(await readJson(`forms/${entry.fileName}`)); const behaviors = await readJson(`forms/${entry.behaviorsFileName}`, { behaviors: [], ruleCode: '' }); forms.push({ id: entry.id, name: entry.name, design, behaviors: behaviors.behaviors || [], ruleCode: behaviors.ruleCode || '', createdAt: design.createdAt, updatedAt: design.updatedAt }); }
  const dataIndex = await readJson('data/_index.json', { sources: [] }); const srcTable: any[] = []; const sheetBehaviors: any[] = []; const sourceFiles: Array<{ buffer: Buffer; fileName: string }> = [];
  for (const entry of dataIndex.sources || []) { srcTable.push(await readJson(`data/${entry.metaFile}`)); const behaviorFile = await readJson(`data/${entry.behaviorsFile}`, { sheets: [] }); sheetBehaviors.push(...(behaviorFile.sheets || [])); const raw = zip.file(`data/${entry.fileName}`); if (!raw) throw toolError('INVALID_PROJECT_PACKAGE', `项目包缺少原表 data/${entry.fileName}`); sourceFiles.push({ buffer: await raw.async('nodebuffer'), fileName: entry.fileName }); }
  const global = await readJson('global-behaviors.json', { behaviors: [] }); const workflows = await readJson('workflows/workflows.json', { workflows: [] }); const outputs = await readJson('outputs/outputs.json', { outputs: [] }); const testing = await readJson('testing/testing.json', { profiles: [], suites: [], fixtures: [], runs: [] }); const id = String(input.projectId || manifest.config.id); const existing = (() => { try { return requireProject(id); } catch { return undefined; } })();
  if (existing && !canAccessProject(user(context), existing, 'manage')) throw toolError('FORBIDDEN', '需要项目 manage 权限'); if (existing && !input.overwrite) throw toolError('PROJECT_EXISTS', `项目 ${id} 已存在`); if (existing) assertRevision(existing, input.baseRevision);
  const project = { config: { ...manifest.config, id, updatedAt: new Date().toISOString(), ...(context.userId ? { access: { ownerId: context.userId, members: {} } } : {}) }, settings: manifest.settings, release: await readJson('release.json', manifest.release), forms, srcTable, sheetBehaviors, globalBehaviors: global.behaviors || [], workflows: workflows.workflows || [], outputs: outputs.outputs || [], testing };
  const committed = commitProject(project, sourceFiles);
  consumeStagedUpload(meta.id);
  return committed;
} });

register({ name: 'data_source.list', title: '数据源列表', description: '列出项目数据源。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => requireProject(projectId(input, context)).srcTable || [] });
register({ name: 'data_source.get', title: '读取数据源', description: '读取数据源及 Sheet 元数据。', inputSchema: schema(['projectId', 'id'], { projectId: string, id: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => findById(requireProject(projectId(input, context)).srcTable || [], input.id, 'TABLE_NOT_FOUND') });
for (const [name, title] of [['data_source.create', '创建数据表'], ['data_source.import', '导入数据源']] as const) register({ name, title, description: '从上传 fileId、业务数据行 rows、CSV 或 config.columns 创建数据源。rows 中每个对象代表一条业务记录，不是字段定义；空表使用 config.columns。config.keyFields 必须位于 config 顶层并匹配 rows 键或 columns.name。', inputSchema: schema(['projectId', 'id', 'baseRevision', 'idempotencyKey'], { projectId: string, id: string, baseRevision: string, idempotencyKey: string, fileId: string, rows: { type: 'array', items: { type: 'object', additionalProperties: true }, description: '业务记录数组；字段名作为列名。不要传 fieldId/title/type 字段定义。' }, csv: string, sheetName: string, config: dataSourceConfigSchema }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); if ((project.srcTable || []).some((item: any) => item.id === input.id)) throw toolError('TABLE_EXISTS', `数据表 ${input.id} 已存在`); const built = tableFromInput({ ...input, tenantId: context.tenantId }); project.srcTable.push(built.table); return commitProject(touch(project), built.sourceFiles); } });
register({ name: 'data_source.update', title: '更新数据源', description: '更新数据源显示元信息；原表和 Sheet 结构只能由专用数据接口修改。', inputSchema: schema(['projectId', 'id', 'baseRevision', 'idempotencyKey', 'patch'], { projectId: string, id: string, baseRevision: string, idempotencyKey: string, patch: object }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); const table = findById(project.srcTable || [], input.id, 'TABLE_NOT_FOUND'); const protectedFields = ['fileName', 'fileType', 'fileSize', 'dataHash', 'uploadedAt', 'sheets', 'preview', 'rows']; const invalid = protectedFields.find((field) => input.patch?.[field] !== undefined); if (invalid) throw toolError('PROTECTED_DATA_FIELD', `${invalid} 只能由项目数据接口修改`, `patch.${invalid}`); Object.assign(table, input.patch, { id: table.id }); return commitProject(touch(project)); } });
register({ name: 'data_source.delete', title: '删除数据源', description: '删除数据源；有引用时必须显式 cascade。', inputSchema: schema(['projectId', 'id', 'baseRevision', 'idempotencyKey'], { projectId: string, id: string, baseRevision: string, idempotencyKey: string, cascade: boolean, confirmationToken: string }), risk: 'destructive', requiredAccess: 'edit', impact: (input) => ({ dataSourceId: input.id, cascade: !!input.cascade }), handler: (input, context) => { const project = editable(input, context); const refs = (project.forms || []).filter((form: any) => formReferencesId(form, input.id)); if (refs.length && !input.cascade) throw toolError('RESOURCE_REFERENCED', '数据源仍被表单引用', 'id', { forms: refs.map((item: any) => item.id) }); remove(project.srcTable, input.id); if (input.cascade) project.forms = (project.forms || []).filter((form: any) => !formReferencesId(form, input.id)); project.sheetBehaviors = (project.sheetBehaviors || []).filter((item: any) => item.tableId !== input.id); return commitProject(touch(project)); } });
register({ name: 'data_sheet.get', title: '读取 Sheet', description: '读取 Sheet 元数据和行版本。', inputSchema: schema(['projectId', 'tableId', 'sheetName'], { projectId: string, tableId: string, sheetName: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => { const table = findById(requireProject(projectId(input, context)).srcTable || [], input.tableId, 'TABLE_NOT_FOUND'); const sheet = (table.sheets || []).find((item: any) => item.name === input.sheetName); if (!sheet) throw toolError('SHEET_NOT_FOUND', 'Sheet 不存在'); return sheet; } });
register({ name: 'data_sheet.configure', title: '配置 Sheet', description: '设置主键、只读、冻结、筛选和排序。', inputSchema: schema(['projectId', 'tableId', 'sheetName', 'baseRevision', 'idempotencyKey', 'config'], { projectId: string, tableId: string, sheetName: string, baseRevision: string, idempotencyKey: string, config: dataSourceConfigSchema }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); const table = findById(project.srcTable || [], input.tableId, 'TABLE_NOT_FOUND'); const sheet = (table.sheets || []).find((item: any) => item.name === input.sheetName); if (!sheet) throw toolError('SHEET_NOT_FOUND', 'Sheet 不存在'); sheet.config = { ...sheet.config, ...input.config, id: sheet.config?.id || sheet.name, tableName: sheet.name }; return commitProject(touch(project)); } });
register({ name: 'data_keys.validate', title: '校验主键', description: '校验指定或已配置的组合主键。', inputSchema: schema(['projectId', 'tableId', 'sheetName'], { projectId: string, tableId: string, sheetName: string, keyFields: array }), risk: 'read', requiredAccess: 'view', handler: (input, context) => { const project = requireProject(projectId(input, context)); const table = findById(project.srcTable || [], input.tableId, 'TABLE_NOT_FOUND'); const sheet = (table.sheets || []).find((item: any) => item.name === input.sheetName); if (!sheet) throw toolError('SHEET_NOT_FOUND', 'Sheet 不存在'); const keys = input.keyFields || sheet.config?.keyFields || []; const seen = new Set(); const errors: any[] = []; fullSourceRows(project, table, sheet).forEach((row: any, index: number) => { const values = keys.map((key: string) => row[key]); const hash = JSON.stringify(values); if (values.some((value: any) => value === '' || value == null)) errors.push({ index, code: 'EMPTY_KEY' }); else if (seen.has(hash)) errors.push({ index, code: 'DUPLICATE_KEY', values }); seen.add(hash); }); return { valid: errors.length === 0, keyFields: keys, errors }; } });
register({ name: 'data_rows.query', title: '查询数据行', description: '分页搜索、筛选、排序并返回稳定 rowKey。', inputSchema: schema(['projectId', 'tableId', 'sheetName'], {
  projectId: string, tableId: string, sheetName: string,
  page: { type: 'number', minimum: 1 },
  pageSize: { type: 'number', minimum: 1, maximum: 500 },
  search: string,
  keySearch: { type: 'object', additionalProperties: true, description: '按主键字段精确匹配的键值对象；与全文 search 同时提供时两种条件共同生效。' },
  sortModel: array,
  filterModel: object,
}), risk: 'read', requiredAccess: 'view', handler: (input, context) => queryProjectRows(requireProject(projectId(input, context)), input) });
register({ name: 'data_rows.batch', title: '批量写回数据', description: '按稳定 rowKey 原子应用新增、更新和删除；单次最多 1000 个变更。', inputSchema: schema(['projectId', 'tableId', 'sheetName', 'baseRevision', 'idempotencyKey'], { projectId: string, tableId: string, sheetName: string, baseRevision: string, baseVersion: string, idempotencyKey: string, adds: { type: 'array', items: { type: 'object', additionalProperties: true } }, updates: { type: 'array', items: dataRowUpdateSchema }, deletes: { type: 'array', items: string }, confirmationToken: string }), risk: 'write', requiredAccess: 'edit', confirmWhen: (input) => Array.isArray(input.deletes) && input.deletes.length > 0, impact: (input) => ({ deletes: input.deletes?.length || 0, tableId: input.tableId, sheetName: input.sheetName }), handler: (input, context) => { const project = editable(input, context); const result = batchProjectRows(project, input); const committed = commitProject(project, serializeTableSource(project, input.tableId, input.sheetName)); return { ...result, revision: committed.revision }; } });
register({ name: 'data_rows.transaction', title: '跨表原子写回', description: '在项目副本中预检并应用多个 Sheet 变更，全部成功后一次提交；支持事务内生成键引用。', inputSchema: schema(['projectId', 'baseRevision', 'idempotencyKey', 'operations'], { projectId: string, baseRevision: string, idempotencyKey: string, operations: { type: 'array', items: { type: 'object', additionalProperties: true } }, confirmationToken: string }), risk: 'write', requiredAccess: 'edit', confirmWhen: (input) => (input.operations || []).some((item: any) => Array.isArray(item.deletes) && item.deletes.length > 0), impact: (input) => ({ tables: (input.operations || []).map((item: any) => `${item.tableId}/${item.sheetName}`), changes: (input.operations || []).reduce((total: number, item: any) => total + (item.adds?.length || 0) + (item.updates?.length || 0) + (item.deletes?.length || 0), 0), deletes: (input.operations || []).reduce((total: number, item: any) => total + (item.deletes?.length || 0), 0) }), handler: (input, context) => { const project = editable(input, context); const result = applyDataRowsTransaction(project, input.operations || []); const sources = (input.operations || []).flatMap((item: any) => serializeTableSource(result.project, item.tableId, item.sheetName)); const committed = commitProject(result.project, sources); return { applied: result.applied, totalChanges: result.totalChanges, revision: committed.revision }; } });
register({ name: 'data_relation.list', title: '数据关系列表', description: '列出项目中声明的等值数据关系。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => requireProject(projectId(input, context)).relations || [] });
register({ name: 'data_relation.suggest', title: '建议数据关系', description: '按字段名称、类型、主键和样本值重合度生成可审计的关系建议，不自动写入。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => suggestDataRelations(requireProject(projectId(input, context))) });
register({ name: 'data_relation.validate', title: '校验数据关系', description: '校验关系两侧表、字段、数量和类型兼容性。', inputSchema: schema(['projectId', 'relation'], { projectId: string, relation: object }), risk: 'read', requiredAccess: 'view', handler: (input, context) => validateRelation(requireProject(projectId(input, context)), input.relation as DataRelation) });
register({ name: 'data_relation.upsert', title: '保存数据关系', description: '新增或更新正式数据关系；写入前执行完整校验。', inputSchema: schema(['projectId', 'baseRevision', 'idempotencyKey', 'relation'], { projectId: string, baseRevision: string, idempotencyKey: string, relation: object }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); const relation = input.relation as DataRelation; if (!relation?.id) throw toolError('REQUIRED_ARGUMENT', '关系必须包含 id', 'relation.id'); const report = validateRelation(project, relation); if (!report.valid) throw toolError('RELATION_INVALID', '关系定义无效', 'relation', report); project.relations ||= []; upsert(project.relations, relation); const committed = commitProject(touch(project)); return { relation, validation: report, revision: committed.revision }; } });
register({ name: 'data_relation.delete', title: '删除数据关系', description: '删除关系定义；被模板实例引用时需显式 cascade。', inputSchema: schema(['projectId', 'id', 'baseRevision', 'idempotencyKey'], { projectId: string, id: string, baseRevision: string, idempotencyKey: string, cascade: boolean, confirmationToken: string }), risk: 'destructive', requiredAccess: 'edit', impact: (input) => ({ relationId: input.id, cascade: !!input.cascade }), handler: (input, context) => { const project = editable(input, context); const refs = (project.templateInstances || []).filter((item: any) => item.selection?.relationIds?.includes(input.id) || item.parameters?.relationId === input.id); if (refs.length && !input.cascade) throw toolError('RESOURCE_REFERENCED', '关系仍被模板实例引用', 'id', { templateInstances: refs.map((item: any) => item.id) }); remove(project.relations ||= [], input.id); if (input.cascade) project.templateInstances = (project.templateInstances || []).filter((item: any) => !refs.includes(item)); const committed = commitProject(touch(project)); return { deleted: true, revision: committed.revision }; } });
register({ name: 'data_relation.query', title: '关联查询', description: '按已声明关系分页、筛选和排序，保留源主键；exportAll 可返回至多一万条导出数据。', inputSchema: schema(['projectId', 'relationId'], { projectId: string, relationId: string, joinType: { type: 'string', enum: ['inner', 'left'] }, page: { type: 'number' }, pageSize: { type: 'number' }, search: string, sortModel: array, filterModel: object, exportAll: boolean }), risk: 'read', requiredAccess: 'view', handler: (input, context) => queryRelationRows(requireProject(projectId(input, context)), input as any) });

register({ name: 'form.list', title: '表单列表', description: '列出项目表单。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => (requireProject(projectId(input, context)).forms || []).map((form: any) => ({ id: form.id, name: form.name, mode: form.design?.formMode, updatedAt: form.updatedAt })) });
register({ name: 'form.get', title: '读取表单', description: '读取表单设计、行为和规则。', inputSchema: schema(['projectId', 'id'], { projectId: string, id: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => findById(requireProject(projectId(input, context)).forms || [], input.id, 'FORM_NOT_FOUND') });
register({ name: 'form.create', title: '创建表单', description: '创建空表单或保存完整设计；服务端会补齐表单窗体与控件几何。', inputSchema: schema(['projectId', 'id', 'name', 'baseRevision', 'idempotencyKey'], { projectId: string, id: string, name: string, mode: { type: 'string', enum: ['create', 'edit', 'detail', 'lookup-edit'] }, baseRevision: string, idempotencyKey: string, design: object }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); if ((project.forms || []).some((item: any) => item.id === input.id)) throw toolError('FORM_EXISTS', '表单已存在'); const now = new Date().toISOString(); const supplied = input.design || { id: `${input.id}_design`, name: input.name, formMode: input.mode || 'create', viewport: { zoom: 1, panX: 0, panY: 0 }, gridSize: 12, formWindow: { x: 40, y: 40, width: 900, height: 600, props: { title: input.name, showFooter: false } }, components: [], bindings: [] }; const design = { ...normalizeFormDesign(supplied), createdAt: supplied.createdAt || now, updatedAt: supplied.updatedAt || now }; project.forms.push({ id: input.id, name: input.name, design, behaviors: [], ruleCode: '', createdAt: design.createdAt, updatedAt: design.updatedAt }); project.release.defaultFormId ||= input.id; return commitProject(touch(project)); } });
register({ name: 'form.generate_from_table', title: '从数据表生成表单', description: '根据列类型和主键生成 create/edit/detail/lookup-edit 表单。', inputSchema: schema(['projectId', 'tableId', 'sheetName', 'id', 'baseRevision', 'idempotencyKey'], { projectId: string, tableId: string, sheetName: string, id: string, mode: { type: 'string', enum: ['create', 'edit', 'detail', 'lookup-edit'] }, baseRevision: string, idempotencyKey: string }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); const table = findById(project.srcTable || [], input.tableId, 'TABLE_NOT_FOUND'); const sheet = (table.sheets || []).find((item: any) => item.name === input.sheetName); if (!sheet) throw toolError('SHEET_NOT_FOUND', 'Sheet 不存在'); const form = generatedForm(table, sheet, input); if ((project.forms || []).some((item: any) => item.id === form.id)) throw toolError('FORM_EXISTS', '表单已存在'); project.forms.push(form); project.release.defaultFormId ||= form.id; return commitProject(touch(project)); } });
register({ name: 'form.update', title: '更新表单', description: '更新表单元信息和设计；设计控件会规范化布局，行为与规则由 behavior MCP 管理。', inputSchema: schema(['projectId', 'id', 'baseRevision', 'idempotencyKey', 'patch'], { projectId: string, id: string, baseRevision: string, idempotencyKey: string, patch: object }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { if (input.patch?.ruleCode !== undefined || input.patch?.behaviors !== undefined) throw toolError('INVALID_ARGUMENT', 'ruleCode 和 behaviors 必须由 behavior MCP 更新', 'patch'); const project = editable(input, context); const form = findById(project.forms || [], input.id, 'FORM_NOT_FOUND'); const now = new Date().toISOString(); const patch = { ...input.patch }; if (patch.design) patch.design = { ...normalizeFormDesign(patch.design), createdAt: patch.design.createdAt || form.design?.createdAt || form.createdAt || now, updatedAt: now }; Object.assign(form, patch, { id: form.id, updatedAt: now }); return commitProject(touch(project)); } });
register({ name: 'form.delete', title: '删除表单', description: '删除表单并检查 release 默认引用。', inputSchema: schema(['projectId', 'id', 'baseRevision', 'idempotencyKey'], { projectId: string, id: string, baseRevision: string, idempotencyKey: string, confirmationToken: string, cascade: boolean }), risk: 'destructive', requiredAccess: 'edit', impact: (input) => ({ formId: input.id }), handler: (input, context) => { const project = editable(input, context); if (project.release?.defaultFormId === input.id && !input.cascade) throw toolError('RESOURCE_REFERENCED', '表单是 release 默认表单；需 cascade=true'); remove(project.forms, input.id); if (project.release?.defaultFormId === input.id) project.release.defaultFormId = project.forms[0]?.id; return commitProject(touch(project)); } });
for (const kind of ['component', 'binding'] as const) {
  register({ name: `form_${kind}.upsert`, title: `保存表单${kind === 'component' ? '控件' : '绑定'}`, description: kind === 'component' ? '按稳定 ID 新增或局部更新控件；表单窗体是实例固有配置，不能作为 form 控件新增。按钮动作使用 props.events 的非空脚本，或 props.flowTriggers 中指向现有流程的启用触发器。' : '按稳定 ID 新增或替换表单绑定。', inputSchema: schema(['projectId', 'formId', 'item', 'baseRevision', 'idempotencyKey'], { projectId: string, formId: string, item: kind === 'component' ? formComponentItemSchema : object, baseRevision: string, idempotencyKey: string }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); const form = findById(project.forms || [], input.formId, 'FORM_NOT_FOUND'); const collection = kind === 'component' ? (form.design.components ||= []) : (form.design.bindings ||= []); if (!input.item.id) throw toolError('INVALID_ID', 'item.id 不能为空', 'item.id'); if (kind === 'component') { if (input.item.type === 'form') throw toolError('FORM_WINDOW_IS_INTRINSIC', '表单窗体属于表单实例，不能作为控件新增', 'item.type'); const existing = collection.find((item: any) => item.id === input.item.id); const merged = existing ? { ...existing, ...input.item, props: { ...(existing.props || {}), ...(input.item.props || {}) } } : input.item; upsert(collection, normalizeFormComponents([merged])[0]); } else upsert(collection, input.item); form.updatedAt = new Date().toISOString(); return commitProject(touch(project)); } });
  register({ name: `form_${kind}.delete`, title: `删除表单${kind === 'component' ? '控件' : '绑定'}`, description: `删除指定表单${kind === 'component' ? '控件' : '绑定'}。`, inputSchema: schema(['projectId', 'formId', 'id', 'baseRevision', 'idempotencyKey'], { projectId: string, formId: string, id: string, baseRevision: string, idempotencyKey: string, confirmationToken: string }), risk: 'destructive', requiredAccess: 'edit', impact: (input) => ({ formId: input.formId, [kind + 'Id']: input.id }), handler: (input, context) => { const project = editable(input, context); const form = findById(project.forms || [], input.formId, 'FORM_NOT_FOUND'); const collection = kind === 'component' ? form.design.components : form.design.bindings; remove(collection || [], input.id); if (kind === 'component') { for (const component of form.design.components || []) { component.children = (component.children || []).filter((id: string) => id !== input.id); if (component.parentId === input.id) delete component.parentId; } form.design.bindings = (form.design.bindings || []).filter((binding: any) => binding.sourceId !== input.id && binding.targetId !== input.id); } return commitProject(touch(project)); } });
}
register({ name: 'form.preview', title: '表单预览', description: '返回可供模型检查的表单字段、控件和绑定摘要。', inputSchema: schema(['projectId', 'formId'], { projectId: string, formId: string }), risk: 'read', requiredAccess: 'view', handler: (input) => { const context = formContext(input.projectId, input.formId); return { form: context.form, fields: context.fields, components: context.components.map((item: any) => ({ id: item.id, type: item.type, field: item.fieldBinding, label: item.props?.label })) }; } });

register({ name: 'behavior.list', title: '行为列表', description: '按 global/sheet/form 作用域列出行为；form 必须传 formId，sheet 必须传 tableId 和 sheetName。', inputSchema: behaviorListInputSchema, risk: 'read', requiredAccess: 'view', handler: (input, context) => {
  const project = requireProject(projectId(input, context));
  if (input.scope === 'global') return project.globalBehaviors || [];
  if (input.scope === 'form') { if (!input.formId) throw toolError('REQUIRED_ARGUMENT', 'scope=form 时缺少参数 formId', 'formId'); return findById(project.forms || [], input.formId, 'FORM_NOT_FOUND').behaviors || []; }
  if (input.scope === 'sheet') { if (!input.tableId) throw toolError('REQUIRED_ARGUMENT', 'scope=sheet 时缺少参数 tableId', 'tableId'); if (!input.sheetName) throw toolError('REQUIRED_ARGUMENT', 'scope=sheet 时缺少参数 sheetName', 'sheetName'); return (project.sheetBehaviors || []).find((item: any) => item.tableId === input.tableId && item.sheetName === input.sheetName)?.behaviors || []; }
  throw toolError('INVALID_ARGUMENT', 'scope 必须是 global、sheet 或 form', 'scope');
} });
register({ name: 'behavior.upsert', title: '保存结构化行为', description: '在 global/sheet/form 作用域保存完整 Trigger/Condition/Action 行为。表单字段联动优先使用 rule_code.update；禁止空 expression 占位。', inputSchema: schema(['projectId', 'scope', 'behavior', 'baseRevision', 'idempotencyKey'], { projectId: string, scope: { type: 'string', enum: ['global', 'sheet', 'form'] }, behavior: behaviorRuleSchema, baseRevision: string, idempotencyKey: string, formId: string, tableId: string, sheetName: string }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); let collection: any[]; if (input.scope === 'global') collection = project.globalBehaviors ||= []; else if (input.scope === 'form') collection = findById(project.forms || [], input.formId, 'FORM_NOT_FOUND').behaviors ||= []; else { let entry = (project.sheetBehaviors ||= []).find((item: any) => item.tableId === input.tableId && item.sheetName === input.sheetName); if (!entry) { entry = { tableId: input.tableId, sheetName: input.sheetName, behaviors: [], updatedAt: new Date().toISOString() }; project.sheetBehaviors.push(entry); } collection = entry.behaviors; } upsert(collection, { enabled: true, priority: 20, conditions: [], ...input.behavior, updatedAt: new Date().toISOString() }); return commitProject(touch(project)); } });
register({ name: 'behavior.delete', title: '删除行为', description: '从指定作用域删除行为。', inputSchema: schema(['projectId', 'scope', 'id', 'baseRevision', 'idempotencyKey'], { projectId: string, scope: { type: 'string', enum: ['global', 'sheet', 'form'] }, id: string, baseRevision: string, idempotencyKey: string, formId: string, tableId: string, sheetName: string, confirmationToken: string }), risk: 'destructive', requiredAccess: 'edit', impact: (input) => ({ scope: input.scope, behaviorId: input.id }), handler: (input, context) => { const project = editable(input, context); let collection: any[] = project.globalBehaviors || []; if (input.scope === 'form') collection = findById(project.forms || [], input.formId, 'FORM_NOT_FOUND').behaviors || []; else if (input.scope === 'sheet') collection = (project.sheetBehaviors || []).find((item: any) => item.tableId === input.tableId && item.sheetName === input.sheetName)?.behaviors || []; remove(collection, input.id); return commitProject(touch(project)); } });
register({ name: 'rule_code.update', title: '更新表单规则', description: '校验 Behavior Rule DSL，通过后写入表单并编译为可执行的控件联动。', inputSchema: schema(['projectId', 'formId', 'code', 'baseRevision', 'idempotencyKey'], { projectId: string, formId: string, code: string, baseRevision: string, idempotencyKey: string }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); const form = findById(project.forms || [], input.formId, 'FORM_NOT_FOUND'); const compilation = lintRuleCode(project.config.id, form.id, String(input.code || '')); if (hasBehaviorDslErrors(compilation)) throw toolError('RULE_SYNTAX_INVALID', '规则语法或引用校验失败', 'code', compilation.diagnostics); const applied = applyBehaviorDslToComponents(form.design?.components || [], String(input.code || ''), form.design?.formWindow); if (applied.unapplied.length) throw toolError('RULE_APPLY_FAILED', applied.unapplied[0], 'code', applied.unapplied); const now = new Date().toISOString(); form.ruleCode = String(input.code || ''); form.design.components = applied.components; form.design.formWindow = applied.formWindow || form.design.formWindow; form.design.updatedAt = now; form.updatedAt = now; return commitProject(touch(project)); } });

function collectionTools(prefix: 'workflow' | 'output', property: 'workflows' | 'outputs') {
  register({ name: `${prefix}.list`, title: `${prefix} 列表`, description: `列出项目 ${prefix}。`, inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => requireProject(projectId(input, context))[property] || [] });
  register({ name: `${prefix}.get`, title: `读取 ${prefix}`, description: `读取指定 ${prefix}。`, inputSchema: schema(['projectId', 'id'], { projectId: string, id: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => findById(requireProject(projectId(input, context))[property] || [], input.id, `${prefix.toUpperCase()}_NOT_FOUND`) });
  for (const action of ['create', 'update'] as const) register({ name: `${prefix}.${action}`, title: `${action === 'create' ? '创建' : '更新'} ${prefix}`, description: prefix === 'workflow' ? `按稳定 ID ${action === 'create' ? '创建' : '替换'}工作流；节点使用 specId/position/data，连线使用 source/target 节点 ID 和 out:/in: 端口。` : `按稳定 ID ${action === 'create' ? '创建' : '替换'} ${prefix}。`, inputSchema: schema(['projectId', 'item', 'baseRevision', 'idempotencyKey'], { projectId: string, id: string, item: prefix === 'workflow' ? workflowItemSchema : object, baseRevision: string, idempotencyKey: string }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); project[property] ||= []; const item = prefix === 'workflow' ? normalizeWorkflowItem(input.item, input.id) : input.item; if (!item.id) throw toolError('INVALID_ID', 'item.id 不能为空', 'item.id'); if (action === 'create' && project[property].some((entry: any) => entry.id === item.id)) throw toolError('RESOURCE_EXISTS', `${prefix} 已存在`); upsert(project[property], item); return commitProject(touch(project)); } });
  register({ name: `${prefix}.delete`, title: `删除 ${prefix}`, description: `删除指定 ${prefix}。`, inputSchema: schema(['projectId', 'id', 'baseRevision', 'idempotencyKey'], { projectId: string, id: string, baseRevision: string, idempotencyKey: string, confirmationToken: string, cascade: boolean }), risk: 'destructive', requiredAccess: 'edit', impact: (input) => ({ type: prefix, id: input.id }), handler: (input, context) => { const project = editable(input, context); const refs = prefix === 'workflow' ? (project.forms || []).filter((form: any) => formReferencesId(form, input.id)) : []; if (refs.length && !input.cascade) throw toolError('RESOURCE_REFERENCED', '流程仍被表单引用', 'id', { forms: refs.map((item: any) => item.id) }); remove(project[property] || [], input.id); return commitProject(touch(project)); } });
}
collectionTools('workflow', 'workflows'); collectionTools('output', 'outputs');
register({ name: 'output.upsert', title: '保存输出定义', description: '按稳定 ID 新增或替换输出定义。', inputSchema: schema(['projectId', 'item', 'baseRevision', 'idempotencyKey'], { projectId: string, item: object, baseRevision: string, idempotencyKey: string }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); upsert(project.outputs ||= [], input.item); return commitProject(touch(project)); } });
register({ name: 'workflow.validate', title: '校验工作流', description: '校验单个工作流节点、边和端口引用。', inputSchema: schema(['projectId', 'id'], { projectId: string, id: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => { const project = requireProject(projectId(input, context)); findById(project.workflows || [], input.id, 'WORKFLOW_NOT_FOUND'); const report = validateProjectModel(project); return { valid: !report.errors.some((item) => item.path.startsWith(`workflows.${input.id}`)), errors: report.errors.filter((item) => item.path.startsWith(`workflows.${input.id}`)) }; } });
for (const kind of ['node', 'edge'] as const) for (const action of ['upsert', 'delete'] as const) register({ name: `workflow_${kind}.${action}`, title: `${action === 'upsert' ? '保存' : '删除'}流程${kind === 'node' ? '节点' : '连线'}`, description: `按稳定 ID ${action} 工作流${kind}。`, inputSchema: schema(['projectId', 'workflowId', action === 'upsert' ? 'item' : 'id', 'baseRevision', 'idempotencyKey'], { projectId: string, workflowId: string, item: kind === 'node' ? workflowNodeSchema : workflowEdgeSchema, id: string, baseRevision: string, idempotencyKey: string, confirmationToken: string, cascade: boolean }), risk: action === 'delete' ? 'destructive' : 'write', requiredAccess: 'edit', impact: (input) => ({ workflowId: input.workflowId, kind, id: input.id, cascade: !!input.cascade }), handler: (input, context) => { const project = editable(input, context); const flow = findById(project.workflows || [], input.workflowId, 'WORKFLOW_NOT_FOUND'); const collection = kind === 'node' ? (flow.nodes ||= []) : (flow.edges ||= []); if (action === 'upsert') upsert(collection, kind === 'node' ? normalizeWorkflowNode(input.item) : normalizeWorkflowEdge(input.item)); else { const referenced = kind === 'node' && (flow.edges || []).some((edge: any) => edge.source === input.id || edge.target === input.id); if (referenced && !input.cascade) throw toolError('RESOURCE_REFERENCED', '节点仍被连线引用；需 cascade=true'); if (referenced) flow.edges = (flow.edges || []).filter((edge: any) => edge.source !== input.id && edge.target !== input.id); remove(collection, input.id); } return commitProject(touch(project)); } });

register({ name: 'output.generate', title: '生成输出', description: '按输出定义导出项目数据或项目包。', inputSchema: schema(['projectId', 'id'], { projectId: string, id: string }), risk: 'read', requiredAccess: 'run', handler: async (input, context) => { const project = requireProject(projectId(input, context)); const output = findById(project.outputs || [], input.id, 'OUTPUT_NOT_FOUND'); if (output.format === 'json') return { format: 'json', content: projectSummary(project) }; const buffer = await packageProject(project.config.id); return { format: 'formflow', fileName: `${project.config.id}.formflow`, encoding: 'base64', content: buffer.toString('base64'), bytes: buffer.length }; } });
register({ name: 'project.export', title: '导出项目', description: '生成确定性的单文件 .formflow 项目包。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: async (input, context) => { const buffer = await packageProject(projectId(input, context)); return { fileName: `${projectId(input, context)}.formflow`, encoding: 'base64', content: buffer.toString('base64'), bytes: buffer.length }; } });
register({ name: 'project.package.export', title: '导出项目包', description: 'project.export 的 .formflow 项目包别名。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: async (input, context) => registry.get('project.export')!.handler!(input, context) });
register({ name: 'project.package.validate', title: '校验项目包', description: '校验当前项目包。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => validateProjectModel(requireProject(projectId(input, context))) });
register({ name: 'release.get', title: '读取发布状态', description: '读取项目 release 配置。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => requireProject(projectId(input, context)).release });
register({ name: 'release.update', title: '更新发布草稿', description: '更新默认表单、默认 Sheet 和设计入口权限等发布草稿，不切换发布模式。', inputSchema: schema(['projectId', 'patch', 'baseRevision', 'idempotencyKey'], { projectId: string, patch: object, baseRevision: string, idempotencyKey: string }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => { if (input.patch?.mode !== undefined || input.patch?.lastVerifiedAt !== undefined) throw toolError('INVALID_ARGUMENT', 'mode 和 lastVerifiedAt 只能由 release.apply 更新', 'patch'); const project = editable(input, context); project.release = { ...project.release, ...(input.patch || {}) }; return commitProject(touch(project)); } });
register({ name: 'release.preview', title: '发布预检', description: '执行结构、绑定、主键和最近回归门禁但不修改项目。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'edit', handler: (input, context) => { const project = requireProject(projectId(input, context)); const quality = inspectProjectQuality(project); return { ready: quality.ready, release: project.release, validation: quality.validation, quality, revision: projectRevision(project) }; } });
register({ name: 'release.apply', title: '应用发布', description: '通过校验后切换 design/test/use 状态；use 会关闭设计器、行为编辑器和流程编辑器入口，design/test 保持这些入口可用。', inputSchema: schema(['projectId', 'mode', 'baseRevision', 'idempotencyKey'], { projectId: string, mode: { type: 'string', enum: ['design', 'test', 'use'], description: 'design：保留全部编辑入口；test：进入测试状态且保留编辑入口；use：进入使用状态并关闭设计、行为和流程编辑入口。' }, baseRevision: string, idempotencyKey: string, confirmationToken: string }), risk: 'destructive', requiredAccess: 'manage', impact: (input) => ({ projectId: input.projectId, releaseMode: input.mode, editorAccess: input.mode === 'use' ? 'disabled' : 'enabled' }), handler: (input, context) => { const project = editable(input, context); const report = validateProjectModel(project); if (!report.valid) throw toolError('RELEASE_VALIDATION_FAILED', '项目未通过发布校验', undefined, report); if (!['design', 'test', 'use'].includes(input.mode)) throw toolError('INVALID_RELEASE_MODE', 'mode 必须为 design、test 或 use'); project.release = { ...project.release, mode: input.mode, lastVerifiedAt: new Date().toISOString(), allowDesigner: input.mode !== 'use', allowBehaviorEditor: input.mode !== 'use', allowWorkflowEditor: input.mode !== 'use' }; return commitProject(touch(project)); } });

register({ name: 'project.build_from_data', title: '从数据构建项目', description: '一次创建项目、导入数据、配置主键并生成表单。', inputSchema: schema(['id', 'name', 'dataSource', 'idempotencyKey'], { id: string, name: string, dataSource: object, forms: array, idempotencyKey: string }), risk: 'write', handler: (input, context) => { const project = createEmptyProject({ ...input, ownerId: context.userId }); const built = tableFromInput({ ...input.dataSource, tenantId: context.tenantId }); project.srcTable.push(built.table); const sheet = built.table.sheets[0]; const formSpecs = input.forms?.length ? input.forms : [{ id: `${built.table.id}_create`, mode: 'create' }, { id: `${built.table.id}_edit`, mode: 'edit' }, { id: `${built.table.id}_detail`, mode: 'detail' }]; for (const formInput of formSpecs) project.forms.push(generatedForm(built.table, sheet, formInput)); project.release.defaultFormId = project.forms[0]?.id; return commitProject(project, built.sourceFiles); } });

register({ name: 'project.quality.inspect', title: '项目质量检查', description: '汇总阶段门禁、结构诊断、绑定缺口和最近测试状态。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => inspectProjectQuality(requireProject(projectId(input, context))) });

register({ name: 'mock_data.profile', title: '分析 Mock 数据模型', description: '分析列类型、主键和本地化生成器，不修改项目。', inputSchema: schema(['projectId', 'tableId', 'sheetName'], { projectId: string, tableId: string, sheetName: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => profileMockData(requireProject(projectId(input, context)), input as any) });
for (const name of ['generate', 'preview'] as const) register({ name: `mock_data.${name}`, title: `${name === 'generate' ? '生成' : '预览'} Mock 数据`, description: '按固定 seed 生成可追加的有效行和隔离负向场景。', inputSchema: schema(['projectId', 'tableId', 'sheetName'], { projectId: string, tableId: string, sheetName: string, rowCount: { type: 'number' }, seed: {}, scenarios: array }), risk: 'read', requiredAccess: 'view', handler: (input, context) => generateMockData(requireProject(projectId(input, context)), input as any) });
register({ name: 'mock_data.apply', title: '追加 Mock 数据', description: '确定性生成并向目标 Sheet 追加有效 Mock 行；负向场景只保存为隔离夹具。', inputSchema: schema(['projectId', 'tableId', 'sheetName', 'baseRevision', 'idempotencyKey'], { projectId: string, tableId: string, sheetName: string, rowCount: { type: 'number' }, seed: {}, scenarios: array, baseRevision: string, idempotencyKey: string }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => {
  const project = editable(input, context); const generated = generateMockData(project, input as any); const result = batchProjectRows(project, { tableId: input.tableId, sheetName: input.sheetName, adds: generated.rows });
  project.testing ||= { profiles: [], suites: [], fixtures: [], runs: [] };
  upsert(project.testing.profiles ||= [], { id: generated.id, ...profileMockData(project, input as any), seed: generated.seed, updatedAt: new Date().toISOString() });
  upsert(project.testing.fixtures ||= [], { id: generated.id, seed: generated.seed, tableId: input.tableId, sheetName: input.sheetName, scenarios: generated.isolatedCases, updatedAt: new Date().toISOString() });
  const committed = commitProject(project, serializeTableSource(project, input.tableId, input.sheetName));
  return { ...result, generated: generated.rows.length, isolatedCases: generated.isolatedCases.length, seed: generated.seed, revision: committed.revision };
} });

register({ name: 'project_test.generate', title: '生成项目回归套件', description: '根据表单约束生成并持久化主路径和失败路径用例。', inputSchema: schema(['projectId', 'baseRevision', 'idempotencyKey'], { projectId: string, seed: {}, baseRevision: string, idempotencyKey: string }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => {
  const project = editable(input, context); const suite = generateProjectTestSuite(project, Number(input.seed || 20260715)); project.testing ||= { profiles: [], suites: [], fixtures: [], runs: [] }; upsert(project.testing.suites ||= [], suite); commitProject(touch(project)); return suite;
} });
register({ name: 'project_test.run', title: '运行项目回归', description: '运行结构、规则沙箱和表单约束测试并持久化有界结果。', inputSchema: schema(['projectId', 'baseRevision', 'idempotencyKey'], { projectId: string, suiteId: string, baseRevision: string, idempotencyKey: string }), risk: 'write', requiredAccess: 'edit', handler: (input, context) => {
  const project = editable(input, context); const suite = input.suiteId ? (project.testing?.suites || []).find((item: any) => item.id === input.suiteId) : undefined; if (input.suiteId && !suite) throw toolError('TEST_SUITE_NOT_FOUND', '测试套件不存在'); const run = runProjectTests(project, suite); project.testing ||= { profiles: [], suites: [], fixtures: [], runs: [] }; project.testing.runs = [...(project.testing.runs || []), run].slice(-20); commitProject(touch(project)); return run;
} });
register({ name: 'project_test.history', title: '读取回归历史', description: '读取持久化测试套件和最近二十次运行摘要。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => { const testing = requireProject(projectId(input, context)).testing || {}; return { suites: testing.suites || [], fixtures: testing.fixtures || [], runs: testing.runs || [] }; } });
register({ name: 'project_analysis.run', title: '运行分析或预测模板', description: '对当前数据版本运行分析/预测，记录配置、指标、基线、模型版本、完整结果和质量结论；低于基线的预测不会标记为可用。', inputSchema: schema(['projectId', 'templateId', 'tableId', 'sheetName', 'baseRevision', 'idempotencyKey'], { projectId: string, templateId: string, tableId: string, tableIds: array, relationIds: array, sheetName: string, fields: array, parameters: object, baseRevision: string, idempotencyKey: string }), risk: 'write', ownerRole: 'quality', requiredAccess: 'edit', handler: (input, context) => { const project = editable(input, context); const revision = projectRevision(project); const run = runAnalysisTemplate(project, input as any, revision); const committed = commitProject(appendAnalysisRun(project, run.record)); return { ...run, revision: committed.revision }; } });
register({ name: 'project_analysis.list', title: '分析与预测结果', description: '列出结果并按当前输入数据版本标记是否过期。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', ownerRole: 'quality', requiredAccess: 'view', handler: (input, context) => { const project = requireProject(projectId(input, context)); return (project.modelRuns || []).map((record: any) => analysisRunStatus(project, record)); } });
register({ name: 'project_analysis.status', title: '分析结果状态', description: '检查单个结果是否因输入数据变化而过期，并返回可操作原因。', inputSchema: schema(['projectId', 'id'], { projectId: string, id: string }), risk: 'read', ownerRole: 'quality', requiredAccess: 'view', handler: (input, context) => { const project = requireProject(projectId(input, context)); const record = (project.modelRuns || []).find((item: any) => item.id === input.id); if (!record) throw toolError('ANALYSIS_RUN_NOT_FOUND', '分析结果不存在', 'id'); return analysisRunStatus(project, record); } });
register({ name: 'project_analysis.writeback', title: '写回预测结果', description: '把可用回归或分类结果按原始稳定行键写回新字段；输入数据变化时拒绝，覆盖已有字段需确认。', inputSchema: schema(['projectId', 'id', 'fieldName', 'baseRevision', 'idempotencyKey'], { projectId: string, id: string, fieldName: string, overwrite: boolean, baseRevision: string, idempotencyKey: string, confirmationToken: string }), risk: 'write', ownerRole: 'quality', requiredAccess: 'edit', confirmWhen: (input) => !!input.overwrite, impact: (input) => ({ runId: input.id, fieldName: input.fieldName, overwrite: !!input.overwrite }), handler: (input, context) => { const result = applyPredictionWriteback(editable(input, context), input.id, String(input.fieldName), !!input.overwrite); const committed = commitProject(result.project, serializeTableSource(result.project, result.tableId, result.sheetName)); return { applied: result.applied, fieldName: result.fieldName, dataVersion: result.dataVersion, revision: committed.revision }; } });
register({ name: 'project_analysis.history', title: '读取分析与模型运行历史', description: '读取最近五十次分析/预测运行的有界摘要，不复制业务数据。', inputSchema: schema(['projectId'], { projectId: string }), risk: 'read', ownerRole: 'quality', requiredAccess: 'view', handler: (input, context) => ({ runs: requireProject(projectId(input, context)).modelRuns || [] }) });

register({ name: 'form_state.read', title: '读取表单状态', description: '读取表单结构和脱敏运行时值。', inputSchema: schema(['formId'], { projectId: string, formId: string, runtime: object }), risk: 'read', requiredAccess: 'view', handler: (input, context) => { const pid = projectId(input, context); const { form, components, fields } = formContext(pid, input.formId); const sensitive = /(password|passwd|pwd|token|secret|api.?key|身份证|手机|电话|phone|mobile|email|邮箱)/i; const runtime = input.runtime || { source: 'synthetic', values: {} }; const values = Object.fromEntries(Object.entries(runtime.values || {}).map(([field, value]) => sensitive.test(field) ? [field, { masked: true, present: value != null && String(value).length > 0 }] : [field, value])); return { formId: input.formId, formName: form.name, fields, components: components.map((item: any) => ({ id: item.id, type: item.type, field: item.fieldBinding || item.props?.name, label: item.props?.label })), runtime: { ...runtime, values } }; } });
register({ name: 'rule_syntax.lint', title: '规则语法检查', description: '检查 FormFlow 受控规则 DSL。', inputSchema: schema(['formId', 'code'], { projectId: string, formId: string, code: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => lintRuleCode(projectId(input, context), input.formId, input.code) });
register({ name: 'rule_test.run', title: '规则隔离测试', description: '在隔离沙箱运行规则测试。', inputSchema: schema(['formId', 'code'], { projectId: string, formId: string, code: string }), risk: 'read', requiredAccess: 'view', handler: (input, context) => runRuleSandbox(projectId(input, context), input.formId, input.code) });
register({ name: 'rule_reference.search', title: '规则参考搜索', description: '搜索权威规则语法参考。', inputSchema: schema(['query'], { query: string }), risk: 'read', handler: (input) => readRuleReference(input.query) });

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
      const before = pid && existsSync(join(REPOSITORY_ROOT, 'projects', 'data', `${pid}.formflow`)) ? projectRevision(requireProject(pid)) : undefined;
      const usesSharedMutation = Boolean(
        pid
        && input.baseRevision
        && !['project.clone', 'project.delete', 'project.import'].includes(name),
      );
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
            const state: ToolMutationState = {
              projectId: pid!,
              draft,
              baseRevision: String(input.baseRevision),
              sourceFiles,
              committed: false,
            };
            const handlerResult = await toolMutationState.run(
              state,
              () => definition.handler(input, { ...context, projectId: pid, requestId }),
            );
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

export function registerExternalFormFlowTool(definition: FormFlowToolDefinition) { register(definition); return () => registry.delete(definition.name); }
export { anyObject };
