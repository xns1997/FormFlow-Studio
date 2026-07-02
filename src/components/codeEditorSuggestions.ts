import type { CodeEditorSuggestion } from './CodeEditor';
import type { CodeEditorExtraLib } from './CodeEditor';
import type { WorkflowFile } from '../project/types';
import {
  getBehaviorEventDoc,
  getEventDetailType,
  getEventReferenceShortcuts,
} from '../services/behaviorDocs';

export interface EventFieldDescriptor {
  name: string;
  type?: string;
}

export const ctxSuggestions: CodeEditorSuggestion[] = [
  { label: 'ctx.getValue', insertText: 'ctx.getValue(fieldId)', kind: 'Function', detail: '获取字段值', documentation: 'ctx.getValue(fieldId)', scope: 'ctx-member' },
  { label: 'ctx.setValue', insertText: 'ctx.setValue(fieldId, value)', kind: 'Function', detail: '设置字段值', documentation: 'ctx.setValue(fieldId, val)', scope: 'ctx-member' },
  { label: 'ctx.setVisible', insertText: 'ctx.setVisible(id, true)', kind: 'Function', detail: '显示或隐藏控件', documentation: 'ctx.setVisible(id, bool)', scope: 'ctx-member' },
  { label: 'ctx.setDisabled', insertText: 'ctx.setDisabled(id, true)', kind: 'Function', detail: '启用或禁用控件', documentation: 'ctx.setDisabled(id, bool)', scope: 'ctx-member' },
  { label: 'ctx.setRequired', insertText: 'ctx.setRequired(id, true)', kind: 'Function', detail: '设置字段必填', documentation: 'ctx.setRequired(id, bool)', scope: 'ctx-member' },
  { label: 'ctx.showMessage', insertText: "ctx.showMessage('提示内容', 'info')", kind: 'Function', detail: '弹出提示', documentation: 'ctx.showMessage(msg, type)', scope: 'ctx-member' },
  { label: 'ctx.validateField', insertText: 'ctx.validateField(id)', kind: 'Function', detail: '校验字段', documentation: 'ctx.validateField(id)', scope: 'ctx-member' },
  { label: 'ctx.querySheet', insertText: 'ctx.querySheet(sheetId, filter)', kind: 'Function', detail: '查询数据表', documentation: 'ctx.querySheet(sheetId, f)', scope: 'ctx-member' },
  { label: 'ctx.updateRow', insertText: 'ctx.updateRow(rowId, patch)', kind: 'Function', detail: '更新数据行', documentation: 'ctx.updateRow(rowId, patch)', scope: 'ctx-member' },
  { label: 'ctx.submit', insertText: 'ctx.submit()', kind: 'Function', detail: '提交当前表单', documentation: 'ctx.submit()', scope: 'ctx-member' },
];

export const jsonSuggestions: CodeEditorSuggestion[] = [
  {
    label: '{}',
    insertText: '{}',
    kind: 'Snippet',
    detail: '对象',
    documentation: '插入 JSON 对象',
    sortText: '001',
    scope: ['top-level', 'json-object-value', 'json-array-value'],
  },
  {
    label: '[]',
    insertText: '[]',
    kind: 'Snippet',
    detail: '数组',
    documentation: '插入 JSON 数组',
    sortText: '002',
    scope: ['top-level', 'json-object-value', 'json-array-value'],
  },
  {
    label: 'key',
    insertText: '"key"',
    kind: 'Property',
    detail: '对象键',
    sortText: '010',
    scope: 'json-object-key',
  },
  {
    label: 'key: ""',
    insertText: '"key": ""',
    kind: 'Property',
    detail: '字符串键值',
    sortText: '090',
    scope: 'json-object-key',
  },
  {
    label: 'key: {}',
    insertText: '"key": {}',
    kind: 'Property',
    detail: '对象键值',
    sortText: '091',
    scope: 'json-object-key',
  },
  {
    label: 'key: []',
    insertText: '"key": []',
    kind: 'Property',
    detail: '数组键值',
    sortText: '092',
    scope: 'json-object-key',
  },
  { label: 'true', kind: 'Keyword', detail: '布尔值', sortText: '020', scope: ['json-object-value', 'json-array-value'] },
  { label: 'false', kind: 'Keyword', detail: '布尔值', sortText: '021', scope: ['json-object-value', 'json-array-value'] },
  { label: 'null', kind: 'Keyword', detail: '空值', sortText: '022', scope: ['json-object-value', 'json-array-value'] },
];

function quoted(value: string) {
  return JSON.stringify(value);
}

function collectWorkflowVariableNames(workflow: WorkflowFile | undefined) {
  if (!workflow) return [];
  const variableNames = workflow.nodes.flatMap((node) => {
    if (node.specId !== 'generic:variable-input') return [];
    try {
      const raw = node.data?.propertiesJson;
      const props = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
      return props.varName ? [String(props.varName)] : [];
    } catch {
      return [];
    }
  });
  return [...new Set(variableNames.filter(Boolean))];
}

function collectWorkflowNodePortKeys(workflow: WorkflowFile | undefined) {
  if (!workflow) return [];
  return workflow.nodes
    .filter((node) => node.id)
    .map((node) => `${node.id}.port`);
}

function toTsType(type?: string) {
  switch (String(type || '').toLowerCase()) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'string';
    case 'enum':
      return 'string';
    case 'array':
      return 'unknown[]';
    case 'object':
      return 'Record<string, unknown>';
    case 'json':
      return 'Record<string, unknown>';
    case 'unknown':
      return 'unknown';
    default:
      return 'string';
  }
}

export function createEventContextSuggestions(options: {
  fields?: Array<string | EventFieldDescriptor>;
  workflows?: WorkflowFile[];
  eventName?: string;
  currentField?: string;
} = {}): CodeEditorSuggestion[] {
  const descriptors = (options.fields || []).map((field) => typeof field === 'string' ? { name: field } : field).filter((field) => field.name);
  const fields = [...new Map(descriptors.map((field) => [field.name, field])).values()];
  const workflows = options.workflows || [];
  const currentField = fields.find((field) => field.name === options.currentField);
  const eventDoc = getBehaviorEventDoc(options.eventName, 'control');
  return [
    { label: 'ctx.value', kind: 'Field', detail: `当前控件值${currentField?.type ? ` · ${toTsType(currentField.type)}` : ''}`, sortText: '010', scope: 'ctx-member' },
    { label: 'ctx.field', kind: 'Field', detail: '当前字段名', sortText: '011', scope: 'ctx-member' },
    { label: 'ctx.eventName', kind: 'Field', detail: `当前事件${options.eventName ? `：${options.eventName}` : ''}`, sortText: '012', scope: 'ctx-member' },
    { label: 'ctx.detail', kind: 'Field', detail: '事件附加数据', sortText: '013', scope: 'ctx-member' },
    { label: 'ctx.values', kind: 'Field', detail: '当前全部表单值', sortText: '014', scope: 'ctx-member' },
    { label: 'ctx.originalValues', kind: 'Field', detail: '表单原始值', sortText: '015', scope: 'ctx-member' },
    { label: 'ctx.component', kind: 'Field', detail: '当前控件定义', sortText: '016', scope: 'ctx-member' },
    { label: 'ctx.previousValue', kind: 'Field', detail: '事件发生前的字段值', sortText: '017', scope: 'ctx-member' },
    { label: 'ctx.timestamp', kind: 'Field', detail: '事件时间戳（毫秒）', sortText: '018', scope: 'ctx-member' },
    { label: 'ctx.dirty', kind: 'Field', detail: '当前字段是否已变化', sortText: '019', scope: 'ctx-member' },
    { label: 'ctx.changedFields', kind: 'Field', detail: '相对原始数据已变化的字段', sortText: '0191', scope: 'ctx-member' },
    { label: 'ctx.componentId', kind: 'Field', detail: '当前控件 ID', sortText: '0192', scope: 'ctx-member' },
    { label: 'ctx.componentType', kind: 'Field', detail: '当前控件类型', sortText: '0193', scope: 'ctx-member' },
    ...getEventReferenceShortcuts(options.eventName || '', 'control').map<CodeEditorSuggestion>(({ path, description }, index) => ({
      label: path.startsWith('ctx.') ? path : `ctx.${path}`,
      kind: 'Field',
      detail: description,
      sortText: `0194${index}`,
      scope: path.includes('.detail.') || path.startsWith('ctx.detail.') ? 'ctx-detail-member' : 'ctx-member',
    })),
    ...((eventDoc?.suggestions || []).map<CodeEditorSuggestion>((suggestion, index) => ({
      label: `suggestion ${index + 1}`,
      insertText: `// ${suggestion}`,
      kind: 'Snippet',
      detail: suggestion,
      sortText: `0198${index}`,
      scope: 'top-level',
    }))),
    { label: 'ctx.getValue', insertText: "ctx.getValue('字段名')", kind: 'Function', detail: '读取字段值', sortText: '020', scope: 'ctx-member' },
    { label: 'ctx.setValue', insertText: "await ctx.setValue('字段名', ctx.value)", kind: 'Function', detail: '设置字段值', sortText: '021', scope: 'ctx-member' },
    { label: 'ctx.setVisible', insertText: "await ctx.setVisible('组件ID', true)", kind: 'Function', detail: '切换控件显隐', sortText: '022', scope: 'ctx-member' },
    { label: 'ctx.setDisabled', insertText: "await ctx.setDisabled('组件ID', true)", kind: 'Function', detail: '切换控件禁用', sortText: '023', scope: 'ctx-member' },
    { label: 'ctx.setRequired', insertText: "await ctx.setRequired('字段名', true)", kind: 'Function', detail: '切换字段必填', sortText: '024', scope: 'ctx-member' },
    { label: 'ctx.showMessage', insertText: "await ctx.showMessage('处理完成', 'success')", kind: 'Function', detail: '显示即时提示', sortText: '025', scope: 'ctx-member' },
    { label: 'ctx.runConfiguredWorkflow', insertText: 'await ctx.runConfiguredWorkflow({ value: ctx.value })', kind: 'Function', detail: '执行本事件已绑定流程；不会再自动重复执行', sortText: '026', scope: 'ctx-member' },
    { label: 'ctx.runWorkflow', insertText: "await ctx.runWorkflow('流程 ID 或名称', { value: ctx.value })", kind: 'Function', detail: '按 ID 或名称执行任意流程', sortText: '027', scope: 'ctx-member' },
    { label: 'ctx.call', insertText: "await ctx.call('回调名称', ctx.value)", kind: 'Function', detail: '调用宿主注册的自定义回调函数', sortText: '028', scope: 'ctx-member' },
    { label: 'typed async callback', insertText: `/** @param {FormEventContext} ctx */\nasync (ctx) => {\n  ctx.console.log('${options.eventName || 'event'}', ctx.value);\n  return ctx.value;\n}`, kind: 'Snippet', detail: '完整异步事件回调模板', sortText: '001', scope: 'top-level' },
    ...fields.flatMap<CodeEditorSuggestion>((field, index) => [
      { label: `ctx.values.${field.name}`, kind: 'Field', detail: `字段：${field.name}${field.type ? ` · ${toTsType(field.type)}` : ''}`, sortText: `1${index.toString().padStart(3, '0')}`, scope: 'ctx-values-member' },
      { label: field.name, insertText: field.name, kind: 'Value', detail: `字段名${field.type ? ` · ${toTsType(field.type)}` : ''}`, sortText: `15${index.toString().padStart(3, '0')}`, scope: 'field-name' },
      { label: `getValue ${field.name}`, insertText: `ctx.getValue(${quoted(field.name)})`, kind: 'Function', detail: `读取 ${field.name}`, sortText: `2${index.toString().padStart(3, '0')}`, scope: 'top-level' },
      { label: `setValue ${field.name}`, insertText: `await ctx.setValue(${quoted(field.name)}, ctx.value)`, kind: 'Function', detail: `设置 ${field.name}`, sortText: `3${index.toString().padStart(3, '0')}`, scope: 'top-level' },
    ]),
    ...workflows.map<CodeEditorSuggestion>((workflow, index) => ({
      label: `运行流程 ${workflow.name}`,
      insertText: `await ctx.runWorkflow(${quoted(workflow.id)}, { value: ctx.value })`,
      kind: 'Function',
      detail: `${workflow.name} · ${workflow.nodes.length} 个节点`,
      documentation: `流程 ID：${workflow.id}`,
      sortText: `4${index.toString().padStart(3, '0')}`,
      scope: 'top-level',
    })),
  ];
}

export function createEventContextExtraLib(options: {
  filePath: string;
  fields?: Array<string | EventFieldDescriptor>;
  currentField?: string;
  eventName?: string;
}): CodeEditorExtraLib {
  const descriptors = (options.fields || []).map((field) => typeof field === 'string' ? { name: field } : field).filter((field) => field.name);
  const fields = [...new Map(descriptors.map((field) => [field.name, field])).values()];
  const currentField = fields.find((field) => field.name === options.currentField);
  const currentFieldName = JSON.stringify(currentField?.name || options.currentField || 'field');
  const currentFieldType = currentField ? toTsType(currentField.type) : 'unknown';
  const fieldEntries = fields.map((field) => `  ${JSON.stringify(field.name)}?: ${toTsType(field.type)};`).join('\n');
  const eventName = JSON.stringify(options.eventName || 'event');
  const detailType = getEventDetailType(options.eventName || '', 'control');

  return {
    filePath: options.filePath,
    content: `type EventFieldMap = {\n${fieldEntries || '  [key: string]: unknown;'}\n};\ntype EventFieldName = keyof EventFieldMap & string;\ntype CurrentEventField = ${currentFieldName};\ntype CurrentEventValue = ${currentFieldType};\ntype EventFlowResult = { success: boolean; errors: string[]; finalOutputs: Record<string, unknown> };\ntype EventCallback = (ctx: FormEventContext, ...args: unknown[]) => unknown | Promise<unknown>;\ninterface FormEventComponent {\n  id: string;\n  type: string;\n  fieldBinding?: string;\n  props: Record<string, unknown>;\n  visible?: boolean;\n}\ninterface FormEventContext {\n  event: ${eventName};\n  eventName: ${eventName};\n  field: CurrentEventField;\n  value: CurrentEventValue;\n  values: EventFieldMap & Record<string, unknown>;\n  formData: EventFieldMap & Record<string, unknown>;\n  originalValues: Partial<EventFieldMap> & Record<string, unknown>;\n  detail: ${detailType};\n  previousValue: CurrentEventValue;\n  timestamp: number;\n  dirty: boolean;\n  changedFields: EventFieldName[];\n  componentId: string;\n  componentType: string;\n  component: FormEventComponent;\n  getValue<K extends EventFieldName>(field: K): EventFieldMap[K];\n  getValue(field: string): unknown;\n  setValue<K extends EventFieldName>(field: K, value: EventFieldMap[K]): Promise<void>;\n  setValue(field: string, value: unknown): Promise<void>;\n  setVisible(componentId: string, visible: boolean): Promise<void>;\n  setDisabled(componentId: string, disabled: boolean): Promise<void>;\n  setRequired<K extends EventFieldName>(field: K, required: boolean): Promise<void>;\n  setRequired(field: string, required: boolean): Promise<void>;\n  showMessage(message: string, level?: 'info' | 'success' | 'warning' | 'error'): Promise<void>;\n  runWorkflow(workflow?: string, parameters?: Record<string, unknown>, options?: { targetNodeId?: string }): Promise<EventFlowResult>;\n  runConfiguredWorkflow(parameters?: Record<string, unknown>): Promise<EventFlowResult>;\n  call(name: string, ...args: unknown[]): Promise<unknown>;\n  callbacks: Record<string, EventCallback>;\n  console: Pick<Console, 'log' | 'warn' | 'error'>;\n}\ntype FormEventHandler = (ctx: FormEventContext) => unknown | Promise<unknown>;\ndeclare const ctx: FormEventContext;\n`,
  };
}

export function createFlowParameterSuggestions(
  workflow: WorkflowFile | undefined,
  fields: string[] = [],
): CodeEditorSuggestion[] {
  const uniqueFields = [...new Set(fields.filter(Boolean))];
  const variableNames = collectWorkflowVariableNames(workflow);
  const nodePortKeys = collectWorkflowNodePortKeys(workflow);
  return [
    ...jsonSuggestions,
    ...variableNames.map<CodeEditorSuggestion>((name, index) => ({
      label: name,
      insertText: quoted(name),
      kind: 'Property',
      detail: '流程变量键',
      sortText: `011${index.toString().padStart(3, '0')}`,
      scope: 'json-object-key',
    })),
    ...nodePortKeys.map<CodeEditorSuggestion>((key, index) => ({
      label: key,
      insertText: quoted(key),
      kind: 'Property',
      detail: '节点端口键',
      sortText: `012${index.toString().padStart(3, '0')}`,
      scope: 'json-object-key',
    })),
    {
      label: '$value',
      insertText: '"$value"',
      kind: 'Value',
      detail: '当前控件值',
      sortText: '020',
      scope: ['json-object-value', 'json-array-value', 'json-string-value'],
    },
    {
      label: '$field',
      insertText: '"$field"',
      kind: 'Value',
      detail: '当前字段名',
      sortText: '021',
      scope: ['json-object-value', 'json-array-value', 'json-string-value'],
    },
    {
      label: '$event',
      insertText: '"$event"',
      kind: 'Value',
      detail: '当前事件名',
      sortText: '022',
      scope: ['json-object-value', 'json-array-value', 'json-string-value'],
    },
    {
      label: '$values',
      insertText: '"$values"',
      kind: 'Value',
      detail: '全部表单数据',
      sortText: '023',
      scope: ['json-object-value', 'json-array-value', 'json-string-value'],
    },
    {
      label: '$originalValues',
      insertText: '"$originalValues"',
      kind: 'Value',
      detail: '全部原始数据',
      sortText: '024',
      scope: ['json-object-value', 'json-array-value', 'json-string-value'],
    },
    {
      label: '$detail',
      insertText: '"$detail"',
      kind: 'Value',
      detail: '事件附加数据',
      sortText: '025',
      scope: ['json-object-value', 'json-array-value', 'json-string-value'],
    },
    ...[
      ['$previousValue', '事件发生前的字段值'],
      ['$timestamp', '事件时间戳（毫秒）'],
      ['$dirty', '当前字段是否已变化'],
      ['$changedFields', '全部变更字段'],
      ['$context', '完整事件上下文'],
    ].map<CodeEditorSuggestion>(([label, detail], index) => ({
      label, insertText: quoted(label), kind: 'Value', detail,
      sortText: `026${index}`,
      scope: ['json-object-value', 'json-array-value', 'json-string-value'],
    })),
    ...uniqueFields.map<CodeEditorSuggestion>((field, index) => ({
      label: `$form.${field}`,
      insertText: quoted(`$form.${field}`),
      kind: 'Value',
      detail: `当前表单字段：${field}`,
      sortText: `03${index.toString().padStart(3, '0')}`,
      scope: ['json-object-value', 'json-array-value', 'json-string-value'],
    })),
    ...variableNames.map<CodeEditorSuggestion>((name, index) => ({
      label: `参数 ${name}`,
      insertText: `${quoted(name)}: ${quoted(`$form.${name}`)}`,
      kind: 'Property',
      detail: `流程变量：${name}`,
      sortText: `08${index.toString().padStart(3, '0')}`,
      scope: ['top-level', 'json-object-key'],
    })),
    ...nodePortKeys.map<CodeEditorSuggestion>((key, index) => ({
      label: `节点参数 ${key}`,
      insertText: `${quoted(key)}: "$value"`,
      kind: 'Property',
      detail: '向节点指定端口传值',
      sortText: `09${index.toString().padStart(3, '0')}`,
      scope: ['top-level', 'json-object-key'],
    })),
  ];
}
