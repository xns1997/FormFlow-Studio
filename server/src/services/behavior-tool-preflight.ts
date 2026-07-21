export interface BehaviorToolPreflightError {
  code: string;
  message: string;
  path?: string;
  expectedShape: unknown;
  receivedShape: unknown;
  suggestedArguments?: Record<string, unknown>;
  normalizationsApplied: [];
}

export type BehaviorToolPreflightResult =
  | { ok: true; arguments: Record<string, any>; normalizations: [] }
  | { ok: false; arguments: Record<string, any>; normalizations: []; error: BehaviorToolPreflightError };

const TRIGGERS = new Set(['formLoad', 'rowLoad', 'fieldChange', 'fieldBlur', 'fieldFocus', 'buttonClick', 'validate', 'submit', 'submitSuccess', 'submitError', 'dataSourceChange', 'tabChange', 'formReady', 'formReset', 'beforeSubmit', 'fieldKeyDown', 'fieldPaste', 'fieldClear', 'rowAdd', 'rowDelete', 'rowSelect', 'dataImport', 'dataExport', 'valueChange']);
const ACTIONS = new Set(['setValue', 'clearValue', 'setVisible', 'setHidden', 'setEnabled', 'setDisabled', 'setRequired', 'setOptional', 'showMessage', 'logMessage', 'switchTab', 'executeScript', 'submitData', 'callApi', 'refreshData', 'navigate', 'runWorkflow', 'setOptions']);
const FIELD_ACTIONS = new Set(['setValue', 'clearValue', 'setRequired', 'setOptional', 'setOptions']);
const COMPONENT_ACTIONS = new Set(['setVisible', 'setHidden', 'setEnabled', 'setDisabled']);
const BEHAVIOR_FIELDS = new Set(['id', 'name', 'event', 'code', 'priority', 'enabled', 'createdAt', 'updatedAt', 'trigger', 'conditions', 'actions']);

function object(value: unknown): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}; }
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, shape(entry)]));
  return typeof value;
}
function fail(args: Record<string, any>, code: string, message: string, path: string | undefined, expectedShape: unknown, suggestedArguments?: Record<string, unknown>): BehaviorToolPreflightResult {
  return { ok: false, arguments: args, normalizations: [], error: { code, message, path, expectedShape, receivedShape: shape(args), suggestedArguments, normalizationsApplied: [] } };
}
function validateScope(args: Record<string, any>): BehaviorToolPreflightResult | undefined {
  if (!['global', 'sheet', 'form'].includes(String(args.scope || ''))) return fail(args, 'BEHAVIOR_SCOPE_INVALID', 'scope 必须是 global、sheet 或 form', 'scope', { scope: 'global | sheet | form' });
  if (args.scope === 'form' && !args.formId) return fail(args, 'BEHAVIOR_FORM_REQUIRED', 'scope=form 时必须提供 formId', 'formId', { scope: 'form', formId: 'stable-form-id' });
  if (args.scope === 'sheet' && (!args.tableId || !args.sheetName)) return fail(args, 'BEHAVIOR_SHEET_REQUIRED', 'scope=sheet 时必须提供 tableId 和 sheetName', !args.tableId ? 'tableId' : 'sheetName', { scope: 'sheet', tableId: 'stable-table-id', sheetName: 'Sheet1' });
}

export function compileBehaviorToolArguments(name: string, original: Record<string, any>): BehaviorToolPreflightResult {
  const args = structuredClone(original);
  if (!['behavior.list', 'behavior.upsert', 'behavior.delete'].includes(name)) return { ok: true, arguments: args, normalizations: [] };
  const scopeFailure = validateScope(args); if (scopeFailure) return scopeFailure;
  if (name === 'behavior.list') return { ok: true, arguments: args, normalizations: [] };
  if (name === 'behavior.delete') return args.id ? { ok: true, arguments: args, normalizations: [] } : fail(args, 'BEHAVIOR_ID_REQUIRED', '删除行为必须提供稳定 id', 'id', { id: 'behavior-id' });
  const behavior = object(args.behavior);
  const unknownFields = Object.keys(behavior).filter((key) => !BEHAVIOR_FIELDS.has(key));
  if (unknownFields.length) return fail(args, 'BEHAVIOR_UNKNOWN_FIELD', `行为包含冻结 FormFlow v2 不支持的字段：${unknownFields.join('、')}`, `behavior.${unknownFields[0]}`, { behavior: [...BEHAVIOR_FIELDS] }, { ...args, behavior: Object.fromEntries(Object.entries(behavior).filter(([key]) => BEHAVIOR_FIELDS.has(key))) });
  if (!behavior.id || !behavior.name) return fail(args, 'BEHAVIOR_IDENTITY_REQUIRED', 'behavior 必须提供稳定 id 和 name', !behavior.id ? 'behavior.id' : 'behavior.name', { behavior: { id: 'behavior-id', name: '行为名称' } });
  const trigger = object(behavior.trigger);
  if (!TRIGGERS.has(String(trigger.type || ''))) return fail(args, 'BEHAVIOR_TRIGGER_INVALID', 'behavior.trigger.type 无效', 'behavior.trigger.type', { behavior: { trigger: { type: 'fieldChange', fieldName: '字段名' } } });
  if (trigger.type === 'fieldChange' && !trigger.fieldName) return fail(args, 'BEHAVIOR_TRIGGER_FIELD_REQUIRED', 'fieldChange 触发器必须提供 fieldName', 'behavior.trigger.fieldName', { behavior: { trigger: { type: 'fieldChange', fieldName: '字段名' } } });
  if (!Array.isArray(behavior.conditions) || !Array.isArray(behavior.actions)) return fail(args, 'BEHAVIOR_ARRAYS_REQUIRED', 'behavior.conditions 和 behavior.actions 必须是数组', 'behavior', { behavior: { conditions: [], actions: [{ type: 'setValue', targetField: '状态', value: '草稿' }] } });
  if (!behavior.actions.length) return fail(args, 'BEHAVIOR_ACTIONS_REQUIRED', '行为至少需要一个动作', 'behavior.actions', { behavior: { actions: [{ type: 'showMessage', message: '操作完成', messageType: 'success' }] } });
  const writtenTargets = new Set<string>();
  for (let index = 0; index < behavior.actions.length; index += 1) {
    const action = object(behavior.actions[index]); const path = `behavior.actions[${index}]`;
    if (!ACTIONS.has(String(action.type || ''))) return fail(args, 'BEHAVIOR_ACTION_INVALID', `动作类型无效：${String(action.type || '')}`, `${path}.type`, { type: [...ACTIONS] });
    if (FIELD_ACTIONS.has(action.type) && !action.targetField) return fail(args, 'BEHAVIOR_ACTION_TARGET_REQUIRED', `${action.type} 必须提供 targetField`, `${path}.targetField`, { type: action.type, targetField: '字段名' });
    if (COMPONENT_ACTIONS.has(action.type) && !action.targetComponent) return fail(args, 'BEHAVIOR_ACTION_TARGET_REQUIRED', `${action.type} 必须提供 targetComponent`, `${path}.targetComponent`, { type: action.type, targetComponent: 'stable-component-id' });
    if (action.type === 'setValue' && action.value === undefined && (typeof action.expression !== 'string' || !action.expression.trim())) return fail(args, 'BEHAVIOR_SET_VALUE_EMPTY', 'setValue 必须提供非空 expression 或明确 value；禁止用空表达式占位', `${path}.expression`, { oneOf: [{ value: '明确值' }, { expression: '$来源字段' }] }, { ...args, behavior: { ...behavior, actions: behavior.actions.map((item: any, actionIndex: number) => actionIndex === index ? { ...item, expression: '$来源字段' } : item) } });
    if (action.type === 'setValue' && typeof action.expression === 'string' && /[A-Za-z0-9_-]+\s*\[[^\]]+=.*\]\s*\./.test(action.expression)) return fail(args, 'BEHAVIOR_EXPRESSION_UNSUPPORTED', '结构化行为不支持直接使用 table[field=value].field 跨表表达式；请改用 lookup/query 工作流并验证返回值', `${path}.expression`, { expression: '受支持的属性表达式', alternative: 'lookup/query workflow' });
    if (action.targetField && ['setValue', 'clearValue'].includes(action.type)) {
      const target = String(action.targetField);
      if (writtenTargets.has(target)) return fail(args, 'BEHAVIOR_DUPLICATE_TARGET', `同一行为重复写入字段 ${target}`, `${path}.targetField`, { uniqueTargetFields: true });
      writtenTargets.add(target);
    }
    if (action.type === 'setOptions') { const config = object(action.optionsConfig); if (!config.table || !config.filterField) return fail(args, 'BEHAVIOR_OPTIONS_CONFIG_INVALID', 'setOptions 必须提供 optionsConfig.table 和 filterField', `${path}.optionsConfig`, { table: 'table-id', filterField: '字段名', filterValue: '$触发字段', labelField: '显示列', valueField: '值列' }); }
    if (action.type === 'runWorkflow' && !action.workflowId) return fail(args, 'BEHAVIOR_WORKFLOW_REQUIRED', 'runWorkflow 必须提供 workflowId', `${path}.workflowId`, { type: 'runWorkflow', workflowId: 'workflow-id' });
  }
  return { ok: true, arguments: args, normalizations: [] };
}
