export type JsonSchema = Record<string, unknown>;

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

/** 工具统一结果 schema（成功/失败/待确认）。 */
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
export const schema = (required: string[] = [], properties: Record<string, unknown> = {}): JsonSchema => ({ type: 'object', required, properties, additionalProperties: false });

/** 数据列定义 schema。 */
export const dataColumnSchema: JsonSchema = { type: 'object', required: ['name'], properties: { name: string, title: string, type: { type: 'string', enum: ['string', 'number', 'boolean', 'date', 'enum'] }, nullable: boolean, enum: { type: 'array', items: string } }, additionalProperties: true };
/** 数据源配置 schema。 */
export const dataSourceConfigSchema: JsonSchema = { type: 'object', properties: { name: string, keyFields: { type: 'array', items: string, description: '主键列名，必须与 rows 对象键或 columns.name 完全一致。' }, readOnly: { type: 'boolean', description: '只读表设为 true；可编辑表保持 false 并配置 keyFields。' }, columns: { type: 'array', items: dataColumnSchema, description: '空表的列定义；有 rows 时可以省略并自动推断。' }, frozenRows: { type: 'number' }, frozenColumns: { type: 'number' }, filterEnabled: boolean, sortEnabled: boolean }, additionalProperties: true };
/** 数据行更新 schema。 */
export const dataRowUpdateSchema: JsonSchema = { type: 'object', required: ['rowKey', 'changes'], properties: { rowKey: string, changes: { type: 'object', additionalProperties: true } }, additionalProperties: false };
/** 行为触发器 schema。 */
export const behaviorTriggerSchema: JsonSchema = { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['formLoad', 'rowLoad', 'fieldChange', 'fieldBlur', 'fieldFocus', 'buttonClick', 'validate', 'submit', 'submitSuccess', 'submitError', 'dataSourceChange', 'tabChange', 'formReady', 'formReset', 'beforeSubmit', 'fieldKeyDown', 'fieldPaste', 'fieldClear', 'rowAdd', 'rowDelete', 'rowSelect', 'dataImport', 'dataExport', 'valueChange'] }, fieldName: string, componentName: string, buttonName: string, debounce: { type: 'number' } }, additionalProperties: false };
/** 行为条件 schema。 */
export const behaviorConditionSchema: JsonSchema = { type: 'object', required: ['fieldName', 'operator', 'logic'], properties: { fieldName: string, operator: { type: 'string', enum: ['==', '!=', '>', '<', '>=', '<=', 'contains', 'notContains', 'startsWith', 'notStartsWith', 'endsWith', 'notEndsWith', 'isEmpty', 'isNotEmpty', 'regex', 'custom'] }, value: {}, value2: {}, customExpression: string, logic: { type: 'string', enum: ['AND', 'OR'] }, dataSource: { type: 'string', enum: ['form', 'flow', 'behavior'] }, flowOutputField: string, behaviorName: string }, additionalProperties: false };
/** 行为动作 schema。 */
export const behaviorActionSchema: JsonSchema = { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['setValue', 'clearValue', 'setVisible', 'setHidden', 'setEnabled', 'setDisabled', 'setRequired', 'setOptional', 'showMessage', 'logMessage', 'switchTab', 'executeScript', 'submitData', 'callApi', 'refreshData', 'navigate', 'runWorkflow', 'setOptions'] }, targetField: string, targetComponent: string, value: {}, expression: string, message: string, messageType: { type: 'string', enum: ['info', 'success', 'warning', 'error'] }, tabName: string, scriptCode: string, workflowId: string, workflowParameters: object, optionsConfig: { type: 'object', required: ['table', 'filterField'], properties: { table: string, filterField: string, filterValue: {}, labelField: string, valueField: string }, additionalProperties: false } }, additionalProperties: true };
/** 行为规则 schema。 */
export const behaviorRuleSchema: JsonSchema = { type: 'object', required: ['id', 'name', 'trigger', 'conditions', 'actions'], properties: { id: string, name: string, enabled: boolean, priority: { type: 'number' }, trigger: behaviorTriggerSchema, conditions: { type: 'array', items: behaviorConditionSchema }, actions: { type: 'array', minItems: 1, items: behaviorActionSchema } }, additionalProperties: false };

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
  properties: { id: string, name: string, description: string, nodes: { type: 'array', items: workflowNodeSchema }, edges: { type: 'array', items: workflowEdgeSchema } },
};
/** 表单控件项 schema。 */
export const formComponentItemSchema: JsonSchema = {
  type: 'object', required: ['id'], additionalProperties: true,
  properties: {
    id: string, type: string, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 }, zIndex: { type: 'number' }, parentId: string, fieldBinding: string,
    props: {
      type: 'object', additionalProperties: true, properties: {
        events: { type: 'object', description: '事件名到非空 JavaScript 处理代码的映射，例如 {onClick:"return true;"}。', additionalProperties: { type: 'string', minLength: 1 } },
        flowTriggers: { type: 'object', description: '事件名到流程触发配置的映射；启用时 workflowId 必须引用已有流程。', additionalProperties: { type: 'object', required: ['enabled', 'workflowId'], properties: { enabled: { type: 'boolean' }, workflowId: { type: 'string', minLength: 1 }, parameterMap: object, targetNodeId: string } } },
      },
    },
    children: array,
  },
};
