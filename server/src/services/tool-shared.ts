/**
 * Shared types, schemas, and helper functions for FormFlow tool definitions.
 *
 * Domain-specific tool modules import from here to define their tools,
 * keeping the registry file focused on infrastructure and execution.
 */
import type { AuthUser } from '../middleware/auth';
import type { ProjectAccess } from './permission';
import type { ToolArgumentNormalization } from './tool-argument-contract';
import type { ProjectSourceFile } from './project-authoring';
import { toolError } from './project-authoring';

// ─── Types ────────────────────────────────────────────────────────────────────

export type JsonSchema = Record<string, unknown>;
export type ToolRisk = 'read' | 'write' | 'destructive';
/** 合法 MCP 角色列表。 */
export const MCP_ROLES = ['project', 'data', 'form', 'workflow', 'behavior', 'quality', 'delivery'] as const;
export type McpRole = typeof MCP_ROLES[number];
/** MCP 角色目录（标题与职责描述）。 */
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
  | { ok: true; data: T; meta: { requestId: string; projectId?: string; revision?: string; warnings?: ToolWarning[]; argumentNormalizations?: ToolArgumentNormalization[] } }
  | { ok: false; error: { code: string; message: string; path?: string; details?: unknown; retryable: boolean }; meta: { requestId: string } }
  | { ok: false; status: 'confirmation_required'; confirmation: { token: string; expiresAt: string; summary: string; impact: unknown }; meta: { requestId: string } };

/** 一个“看起来能过、实际会失败”的错误调用示例，用于 skill 与工具手册中提示不要照抄。 */
export interface ToolWrongExample {
  /** 一句话说明为什么这是错误调用。 */
  summary: string;
  /** 错误调用示例参数（禁止照抄）。 */
  arguments: Record<string, any>;
  /** 预期失败/返回的错误码或后果；没有固定错误码时说明后果。 */
  expectedError?: string;
}

/** 一个可直接照抄的工具调用示例（字段名与 schema 一致，值是示意业务值）。 */
export interface ToolExample {
  /** 一句话说明这个示例在做什么。 */
  summary?: string;
  /** 完整 arguments 示例；示例中的 id/名称等需替换为真实值。 */
  arguments: Record<string, any>;
  /** 成功返回的数据形状（data 部分），帮助模型解读工具结果。 */
  success?: unknown;
  /** 常见错误返回（code + message），帮助模型在失败时正确修复。 */
  errors?: Array<{ code: string; message: string }>;
  /** 与该正确示例配对的常见错误调用（禁止照抄）。 */
  wrong?: ToolWrongExample[];
}

export interface FormFlowToolDefinition {
  name: string; title: string; description: string; inputSchema: JsonSchema; outputSchema: JsonSchema;
  risk: ToolRisk; requiredAccess?: ProjectAccess; ownerRole: McpRole; sharedReadRoles?: McpRole[];
  /** 供智能体与 skill 照抄的调用示例。 */
  examples?: ToolExample[];
  handler(input: Record<string, any>, context: ToolContext): Promise<unknown> | unknown;
  impact?: (input: Record<string, any>, context: ToolContext) => unknown;
  confirmWhen?: (input: Record<string, any>) => boolean;
}

// ─── Schema primitives ────────────────────────────────────────────────────────

/** 任意对象 schema。 */
export const anyObject: JsonSchema = { type: 'object', additionalProperties: true };
/** 字符串 schema。 */
export const string = { type: 'string' };
/** 数组 schema。 */
export const array = { type: 'array' };
/** 对象 schema。 */
export const object = { type: 'object' };
/** 布尔 schema。 */
export const boolean = { type: 'boolean' };

/** 工具结果审计元数据 schema。 */
export const resultMetaSchema: JsonSchema = {
  type: 'object',
  required: ['requestId'],
  additionalProperties: false,
  description: '本次调用的审计元数据。写操作成功时 revision 是修改后的项目版本；失败或待确认不会产生新 revision。',
  properties: {
    requestId: { type: 'string', description: '本次调用的唯一追踪 ID。' },
    projectId: { type: 'string', description: '本次调用实际作用的项目 ID；无项目上下文时省略。' },
    revision: { type: 'string', description: '调用完成后项目的最新 revision；仅在项目可读取时返回。' },
    warnings: { type: 'array', description: '调用成功但仍需注意的非阻断问题。', items: { type: 'object' } },
    argumentNormalizations: { type: 'array', description: '服务端为消除输入歧义而执行的安全参数规范化。', items: { type: 'object' } },
  },
};

/** 工具统一结果 schema。 */
export const resultSchema: JsonSchema = {
  oneOf: [
    {
      type: 'object', additionalProperties: false, required: ['ok', 'data', 'meta'],
      description: '操作成功。读取操作未修改项目；写操作的实际结果在 data 中，修改后的版本在 meta.revision。',
      properties: { ok: { const: true }, data: { description: '工具成功返回的数据或已完成变更的摘要。' }, meta: resultMetaSchema },
    },
    {
      type: 'object', additionalProperties: false, required: ['ok', 'error', 'meta'],
      description: '操作失败且未完成。除非错误明确说明部分成功，否则项目保持调用前状态。',
      properties: {
        ok: { const: false },
        error: {
          type: 'object', additionalProperties: false, required: ['code', 'message', 'retryable'],
          properties: {
            code: { type: 'string', description: '稳定的机器可读错误码。' },
            message: { type: 'string', description: '面向调用方的失败原因。' },
            path: { type: 'string', description: '出错参数或资源路径；无法定位到单一路径时省略。' },
            details: { description: '用于修正或诊断失败的结构化详情。' },
            retryable: { type: 'boolean', description: '是否应在重新读取状态或修正参数后重试。' },
          },
        },
        meta: resultMetaSchema,
      },
    },
    {
      type: 'object', additionalProperties: false, required: ['ok', 'status', 'confirmation', 'meta'],
      description: '操作尚未执行，正在等待用户确认。使用完全相同的业务参数并补充 confirmationToken 后才会执行。',
      properties: {
        ok: { const: false },
        status: { const: 'confirmation_required' },
        confirmation: {
          type: 'object', additionalProperties: false, required: ['token', 'expiresAt', 'summary', 'impact'],
          properties: {
            token: { type: 'string', description: '一次性确认令牌；绑定调用人、工具和原始参数。' },
            expiresAt: { type: 'string', format: 'date-time', description: '确认令牌过期时间。' },
            summary: { type: 'string', description: '用户需要确认的操作。' },
            impact: { description: '执行后将发生的删除、覆盖、级联或发布影响。' },
          },
        },
        meta: resultMetaSchema,
      },
    },
  ],
};

/** 构造对象参数 schema。 */
export const schema = (required: string[] = [], properties: Record<string, unknown> = {}): JsonSchema =>
  ({ type: 'object', required, properties, additionalProperties: false });

// ─── Domain-specific schemas ──────────────────────────────────────────────────

/** 数据列定义 schema。 */
export const dataColumnSchema: JsonSchema = {
  type: 'object', required: ['name'],
  properties: { name: string, title: string, type: { type: 'string', enum: ['string', 'text', 'number', 'integer', 'float', 'double', 'boolean', 'bool', 'date', 'datetime', 'enum'], description: '列类型。常用别名（text/integer/float/double/bool/datetime）会自动规范化为 string/number/boolean/date。' }, nullable: boolean, enum: { type: 'array', items: string } },
  additionalProperties: true,
};

/** 数据源配置 schema。 */
export const dataSourceConfigSchema: JsonSchema = {
  type: 'object',
  properties: {
    name: string,
    keyFields: { type: 'array', items: string, description: '主键列名，必须与 rows 对象键或 columns.name 完全一致。' },
    readOnly: { type: 'boolean', description: '只读表设为 true；可编辑表保持 false 并配置 keyFields。' },
    columns: { type: 'array', items: dataColumnSchema, description: '空表的列定义；有 rows 时可以省略并自动推断。' },
    frozenRows: { type: 'number' }, frozenColumns: { type: 'number' },
    filterEnabled: boolean, sortEnabled: boolean,
  },
  additionalProperties: true,
};

/** 数据行更新 schema。 */
export const dataRowUpdateSchema: JsonSchema = {
  type: 'object', required: ['rowKey', 'changes'],
  properties: {
    rowKey: { type: 'string', description: '稳定行键，格式 "key:<主键值>"（如 "key:S-001"）；新增/更新/删除都按主键值定位。' },
    changes: { type: 'object', additionalProperties: true, description: '业务字段名到值的映射；新增行需包含全部必填列。' },
  },
  additionalProperties: false,
};

/** 行为触发器 schema。 */
export const behaviorTriggerSchema: JsonSchema = {
  type: 'object', required: ['type'],
  properties: {
    type: { type: 'string', enum: ['formLoad', 'rowLoad', 'fieldChange', 'fieldBlur', 'fieldFocus', 'buttonClick', 'validate', 'submit', 'submitSuccess', 'submitError', 'dataSourceChange', 'tabChange', 'formReady', 'formReset', 'beforeSubmit', 'fieldKeyDown', 'fieldPaste', 'fieldClear', 'rowAdd', 'rowDelete', 'rowSelect', 'dataImport', 'dataExport', 'valueChange'] },
    fieldName: string, componentName: string, buttonName: string, debounce: { type: 'number' },
  },
  additionalProperties: false,
};

/** 行为条件 schema。 */
export const behaviorConditionSchema: JsonSchema = {
  type: 'object', required: ['fieldName', 'operator', 'logic'],
  properties: {
    fieldName: string,
    operator: { type: 'string', enum: ['==', '!=', '>', '<', '>=', '<=', 'contains', 'notContains', 'startsWith', 'notStartsWith', 'endsWith', 'notEndsWith', 'isEmpty', 'isNotEmpty', 'regex', 'custom'] },
    value: {}, value2: {}, customExpression: string,
    logic: { type: 'string', enum: ['AND', 'OR'] },
    dataSource: { type: 'string', enum: ['form', 'flow', 'behavior'] },
    flowOutputField: string, behaviorName: string,
  },
  additionalProperties: false,
};

/** 行为动作 schema。 */
export const behaviorActionSchema: JsonSchema = {
  type: 'object', required: ['type'],
  properties: {
    type: { type: 'string', enum: ['setValue', 'clearValue', 'setVisible', 'setHidden', 'setEnabled', 'setDisabled', 'setRequired', 'setOptional', 'showMessage', 'logMessage', 'switchTab', 'executeScript', 'submitData', 'callApi', 'refreshData', 'navigate', 'runWorkflow', 'setOptions'] },
    targetField: string, targetComponent: string, value: {}, expression: string,
    message: string, messageType: { type: 'string', enum: ['info', 'success', 'warning', 'error'] },
    tabName: string, scriptCode: string, workflowId: string, workflowParameters: object,
    optionsConfig: {
      type: 'object', required: ['table', 'filterField'],
      properties: { table: string, filterField: string, filterValue: {}, labelField: string, valueField: string },
      additionalProperties: false,
    },
  },
  additionalProperties: true,
};

/** 行为规则 schema。 */
export const behaviorRuleSchema: JsonSchema = {
  type: 'object', required: ['id', 'name', 'trigger', 'conditions', 'actions'],
  properties: {
    id: string, name: string, enabled: boolean, priority: { type: 'number' },
    trigger: behaviorTriggerSchema,
    conditions: { type: 'array', items: behaviorConditionSchema },
    actions: { type: 'array', minItems: 1, items: behaviorActionSchema },
  },
  additionalProperties: false,
};

/** 行为列表输入 schema。 */
export const behaviorListInputSchema: JsonSchema = {
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

/** 工作流节点 schema。 */
export const workflowNodeSchema: JsonSchema = {
  type: 'object', required: ['id'], additionalProperties: true,
  properties: {
    id: string, specId: string, type: string,
    position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
    data: { type: 'object', properties: { propertiesJson: string, connectedPortsJson: string } },
    x: { type: 'number' }, y: { type: 'number' }, config: object, props: object,
  },
};

/** 工作流边 schema。 */
export const workflowEdgeSchema: JsonSchema = {
  type: 'object', required: ['id', 'source', 'target'], additionalProperties: true,
  properties: {
    id: string,
    source: { oneOf: [string, { type: 'object', required: ['nodeId'], properties: { nodeId: string, portId: string } }] },
    target: { oneOf: [string, { type: 'object', required: ['nodeId'], properties: { nodeId: string, portId: string } }] },
    sourceHandle: string, targetHandle: string,
  },
};

/** 工作流项 schema。 */
export const workflowItemSchema: JsonSchema = {
  type: 'object', required: ['name', 'nodes', 'edges'], additionalProperties: true,
  properties: {
    id: string, name: string, description: string,
    nodes: { type: 'array', items: workflowNodeSchema },
    edges: { type: 'array', items: workflowEdgeSchema },
  },
};

/** 表单控件项 schema。 */
export const formComponentItemSchema: JsonSchema = {
  type: 'object', required: ['id'], additionalProperties: true,
  properties: {
    id: string, type: string,
    x: { type: 'number' }, y: { type: 'number' },
    width: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 },
    zIndex: { type: 'number' }, parentId: string, fieldBinding: string,
    props: {
      type: 'object', additionalProperties: true,
      properties: {
        events: { type: 'object', description: '事件名到非空 JavaScript 处理代码的映射，例如 {onClick:"return true;"}。', additionalProperties: { type: 'string', minLength: 1 } },
        flowTriggers: { type: 'object', description: '事件名到流程触发配置的映射；启用时 workflowId 必须引用已有流程。', additionalProperties: { type: 'object', required: ['enabled', 'workflowId'], properties: { enabled: { type: 'boolean' }, workflowId: { type: 'string', minLength: 1 }, parameterMap: object, targetNodeId: string } } },
      },
    },
    children: array,
  },
};

// ─── Field descriptions ───────────────────────────────────────────────────────

/** 工具参数中文文档（catalog 与模型参考）。 */
export const FIELD_DESCRIPTIONS: Record<string, string> = {
  projectId: '目标项目的稳定 ID。省略仅在调用上下文已经唯一绑定项目且该字段非必填时有效。',
  baseRevision: '最近一次 project.get 返回的 revision。服务端仅在它仍是最新版本时执行写入，否则拒绝且不修改项目。',
  idempotencyKey: '本次写操作的稳定幂等键。重试同一意图必须复用；新的业务操作必须生成新键。',
  confirmationToken: '仅在首次返回 confirmation_required 后填写；必须保持其他业务参数完全不变。令牌一次性且会过期。',
  id: '当前工具目标资源的稳定 ID；创建时成为新资源 ID，读取、更新或删除时用于精确定位现有资源。',
  name: '面向用户显示的名称；不作为稳定引用 ID。',
  description: '面向用户显示的项目或资源说明。',
  author: '项目元数据中的作者名称；不改变访问权限或所有者。',
  tags: '用于项目检索和分类的标签列表。',
  newId: '克隆后新项目的稳定 ID；不会修改原项目。',
  type: '目标类型的稳定标识。可用值应先从对应 catalog 工具读取。',
  category: '可选的目录分类过滤条件；省略时返回全部分类。',
  templateId: '操作或项目模板的稳定 ID；先从对应模板目录读取，不要猜测。',
  templateIds: '要处理的模板稳定 ID 列表；只影响明确列出的模板。',
  tableId: '目标数据源/表的稳定 ID。',
  tableIds: '参与本次操作的数据源/表稳定 ID 列表。',
  sheetName: '目标数据源内的 Sheet 名称；必须与现有名称完全一致。',
  formId: '目标表单的稳定 ID。',
  workflowId: '目标工作流的稳定 ID。',
  relationId: '目标数据关系的稳定 ID。',
  relationIds: '参与本次操作的数据关系稳定 ID 列表。',
  relation: '完整的数据关系定义；明确指定两端表、Sheet、连接字段与关系类型，校验或保存后按 relation.id 引用。',
  suiteId: '要运行的已保存回归套件 ID；省略时按工具说明使用默认套件。',
  fieldName: '目标字段名；必须与目标 Sheet 或结果中的字段名完全一致。',
  fields: '明确选择的字段名列表；未列出的字段不参与本次操作。',
  keyFields: '组合主键字段列表；按给定顺序共同标识唯一数据行。',
  scope: '行为作用域：global 影响整个项目，sheet 仅影响指定 Sheet，form 仅影响指定表单。',
  mode: '操作模式。仅接受 schema enum 中列出的值；不同值会产生不同运行或编辑结果。',
  joinType: '数据关系查询的连接方式；决定未匹配记录是否保留。',
  fileId: '通过上传接口获得的暂存文件 ID；不是服务器文件路径或远程 URL。',
  csv: '内联 CSV 文本。与 fileId、rows 互斥，作为本次导入的唯一数据内容。',
  rows: '内联业务记录数组。与 fileId、csv 互斥；每个对象是一条记录。',
  rowCount: '要生成的数据行数；不会改变现有行，除非调用的是明确的 apply 工具。',
  adds: '要新增的完整业务记录；成功后追加到目标 Sheet。',
  updates: '按稳定 rowKey 定位的字段变更；未列出的字段保持不变。',
  deletes: '要删除的稳定 rowKey 列表；非空时执行前需要确认。',
  operations: '按顺序原子执行的数据变更列表；任一项失败时整体不提交。',
  patch: '局部更新对象；仅其中明确出现且允许修改的字段会被覆盖。',
  config: '目标资源配置。具体允许字段、默认值与限制见此对象的子 schema。',
  settings: '项目设置的局部更新；未提供的设置保持不变。',
  design: '完整或新建表单设计对象；不会自动修改行为规则代码。',
  item: '要创建、替换或局部合并的资源对象；其稳定 ID 决定新增还是更新。',
  behavior: '完整的结构化行为定义；成功后在指定 scope 内按 behavior.id 保存。',
  code: '要检查、测试或保存的规则代码；保存前必须通过对应语法检查。',
  dataSource: '用于一次构建项目的数据源定义；导入规则与 data_source.create 相同。',
  forms: '从数据源生成的表单定义列表；省略时创建 create、edit 和 detail 三个表单。',
  selection: '模板或分析明确选中的表、关系和字段；只对列出的资源生成计划。',
  parameters: '模板或分析参数；允许字段与默认值由所选模板的 parameterSchema 决定。',
  plan: '由 template.plan 返回且尚未应用的原始计划；不得手工改写，其 baseRevision 必须与提交版本一致。',
  preset: '要保存的模板参数预设；只保存参数，不保存业务数据选择。',
  package: '待导入的纯声明模板包；校验通过后才写入项目。',
  overwrite: '为 true 时允许覆盖同名目标，并在执行前要求确认；false 时遇到冲突会失败且不修改。',
  overwriteModified: '为 true 时允许覆盖检测到的手工修改，并在执行前要求确认；false 时保留手工修改并阻止覆盖。',
  cascade: '为 true 时同时处理明确报告的下游引用，并在执行前要求确认；false 时存在引用会拒绝且不修改。',
  page: '从 1 开始的结果页码。',
  pageSize: '每页返回数量；服务端会限制到 schema 或能力目录声明的最大值。',
  baseVersion: '最近一次数据查询返回的 dataVersion。数据已变化时拒绝整批写入，避免覆盖并发修改。',
  keySearch: '按主键字段精确匹配的键值对象；与全文 search 同时提供时两种条件共同生效。',
  search: '可选的全文搜索文本；省略或为空时不应用全文过滤。',
  query: '只读搜索关键词；不会修改项目。',
  sortModel: '排序规则列表；按数组顺序确定多字段排序优先级。',
  filterModel: '字段过滤条件对象；只影响本次查询结果。',
  exportAll: '为 true 时返回全部匹配结果而非当前分页；仍不修改项目。',
  runtime: '用于只读规则或表单检查的运行时快照；敏感字段会脱敏返回。',
  seed: '确定性生成随机种子；相同输入与 seed 产生相同候选数据。',
  scenarios: '要包含的测试或 Mock 场景列表；负向场景不会写入业务数据。',
};

// ─── Normalization helpers ────────────────────────────────────────────────────

/** 解析端口端点（nodeId/portId）。 */
export function endpoint(value: unknown): { nodeId: string; portId?: string } {
  if (typeof value === 'string') return { nodeId: value };
  const entry = value && typeof value === 'object' ? value as Record<string, any> : {};
  return { nodeId: String(entry.nodeId || entry.id || ''), portId: entry.portId ? String(entry.portId) : entry.port ? String(entry.port) : undefined };
}

/** 归一化工作流节点（补默认端口与属性）。 */
export function normalizeWorkflowNode(value: any) {
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

/** 归一化工作流边。 */
export function normalizeWorkflowEdge(value: any) {
  const source = endpoint(value?.source); const target = endpoint(value?.target);
  return {
    id: String(value?.id || ''), source: source.nodeId, target: target.nodeId,
    sourceHandle: String(value?.sourceHandle || `out:${source.portId || 'trigger'}`),
    targetHandle: String(value?.targetHandle || `in:${target.portId || 'trigger'}`),
  };
}

/** 归一化工作流项（节点/边通用）。 */
export function normalizeWorkflowItem(value: any, fallbackId?: unknown) {
  return {
    ...(value || {}), id: String(value?.id || fallbackId || ''), name: String(value?.name || value?.label || fallbackId || value?.id || ''),
    nodes: Array.isArray(value?.nodes) ? value.nodes.map(normalizeWorkflowNode) : [],
    edges: Array.isArray(value?.edges) ? value.edges.map(normalizeWorkflowEdge) : [],
  };
}

/** 全部合法角色。 */
export function allRoles(): McpRole[] { return [...MCP_ROLES]; }
/** 是否为合法 MCP 角色。 */
export function isMcpRole(value: unknown): value is McpRole { return MCP_ROLES.includes(value as McpRole); }

/** 为工具输入 schema 补充名称/标题/风险描述。 */
export function clarifyInputSchema(name: string, title: string, risk: ToolRisk, inputSchema: JsonSchema): JsonSchema {
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
