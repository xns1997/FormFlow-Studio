import type { CodeEditorSuggestion } from './CodeEditor';
import type { CodeEditorExtraLib } from './CodeEditor';
import type { WorkflowFile } from '../project/types';
import {
  getBehaviorEventDoc,
  getEventDetailType,
  getEventReferenceShortcuts,
} from '../services/io/behaviorDocs';

export interface EventFieldDescriptor {
  name: string;
  type?: string;
}

const ctxBatchMethodSuggestions: CodeEditorSuggestion[] = [
  { label: 'ctx.getValues', insertText: 'ctx.getValues([fieldId])', kind: 'Function', detail: '批量读取字段值', documentation: 'ctx.getValues(["fieldA", "fieldB"])', scope: 'ctx-member' },
  { label: 'ctx.setValues', insertText: 'ctx.setValues({ fieldId: value })', kind: 'Function', detail: '批量设置字段值', documentation: 'await ctx.setValues({ customerName: "张三" })', scope: 'ctx-member' },
  { label: 'ctx.clearValue', insertText: 'ctx.clearValue(fieldId)', kind: 'Function', detail: '清空单个字段', documentation: 'await ctx.clearValue("remark")', scope: 'ctx-member' },
  { label: 'ctx.clearValues', insertText: 'ctx.clearValues([fieldId])', kind: 'Function', detail: '批量清空字段', documentation: 'await ctx.clearValues(["comment", "remark"])', scope: 'ctx-member' },
  { label: 'ctx.toggleVisible', insertText: 'ctx.toggleVisible(componentId)', kind: 'Function', detail: '切换控件显隐', documentation: 'await ctx.toggleVisible("customer_name")', scope: 'ctx-member' },
  { label: 'ctx.toggleDisabled', insertText: 'ctx.toggleDisabled(componentId)', kind: 'Function', detail: '切换控件禁用', documentation: 'await ctx.toggleDisabled("submit_button")', scope: 'ctx-member' },
  { label: 'ctx.toggleRequired', insertText: 'ctx.toggleRequired(fieldId)', kind: 'Function', detail: '切换字段必填', documentation: 'await ctx.toggleRequired("customerName")', scope: 'ctx-member' },
  { label: 'ctx.setFieldState', insertText: 'ctx.setFieldState(fieldOrComponentId, patch)', kind: 'Function', detail: '批量更新字段/控件状态', documentation: 'await ctx.setFieldState("customerName", { required: true, visible: true })', scope: 'ctx-member' },
];

const ctxNavigationSuggestions: CodeEditorSuggestion[] = [
  { label: 'ctx.focusField', insertText: 'ctx.focusField(fieldId)', kind: 'Function', detail: '聚焦字段', documentation: 'await ctx.focusField("customerName")', scope: 'ctx-member' },
  { label: 'ctx.focusControl', insertText: 'ctx.focusControl(componentId)', kind: 'Function', detail: '聚焦控件', documentation: 'await ctx.focusControl("submit_button")', scope: 'ctx-member' },
  { label: 'ctx.scrollToField', insertText: 'ctx.scrollToField(fieldId)', kind: 'Function', detail: '滚动到字段', documentation: 'await ctx.scrollToField("approvalComment")', scope: 'ctx-member' },
  { label: 'ctx.scrollToControl', insertText: 'ctx.scrollToControl(componentId)', kind: 'Function', detail: '滚动到控件', documentation: 'await ctx.scrollToControl("section_header")', scope: 'ctx-member' },
  { label: 'ctx.switchTab', insertText: 'ctx.switchTab(tabIdOrIndex)', kind: 'Function', detail: '切换页签', documentation: 'await ctx.switchTab(1)', scope: 'ctx-member' },
  { label: 'ctx.openTab', insertText: 'ctx.openTab(tabIdOrIndex)', kind: 'Function', detail: '切换页签（业务别名）', documentation: 'await ctx.openTab("审批信息")', scope: 'ctx-member' },
];

const ctxCrudSuggestions: CodeEditorSuggestion[] = [
  { label: 'ctx.findRows', insertText: 'ctx.findRows(sheetId, criteria, options)', kind: 'Function', detail: '按条件查询多条记录', documentation: "ctx.findRows('employees', { 部门: '技术部' }, { limit: 10 })", scope: 'ctx-member' },
  { label: 'ctx.findRow', insertText: 'ctx.findRow(sheetId, criteria, options)', kind: 'Function', detail: '按条件查询单条记录', documentation: "ctx.findRow('employees', { 员工ID: 1001 })", scope: 'ctx-member' },
  { label: 'ctx.nextSequence', insertText: 'ctx.nextSequence(sheetId, column, options)', kind: 'Function', detail: '生成下一个顺序编号', documentation: "ctx.nextSequence('employees', '员工ID', { start: 1000 })", scope: 'ctx-member' },
  { label: 'ctx.fillForm', insertText: 'ctx.fillForm(record, fieldMap, options)', kind: 'Function', detail: '按记录批量回填表单', documentation: "await ctx.fillForm(row, { 姓名: 'customerName' })", scope: 'ctx-member' },
  { label: 'ctx.requireFields', insertText: 'ctx.requireFields(fields, options)', kind: 'Function', detail: '批量校验必填字段', documentation: "await ctx.requireFields(['姓名', '手机号'])", scope: 'ctx-member' },
  { label: 'ctx.resetForm', insertText: 'ctx.resetForm(options)', kind: 'Function', detail: '按默认值重置表单', documentation: "await ctx.resetForm({ clearFields: ['姓名'], defaults: { 状态: '草稿' } })", scope: 'ctx-member' },
];

export const ctxSuggestions: CodeEditorSuggestion[] = [
  { label: 'ctx.getValue', insertText: 'ctx.getValue(fieldId)', kind: 'Function', detail: '获取字段值', documentation: 'ctx.getValue(fieldId)', scope: 'ctx-member' },
  ...ctxBatchMethodSuggestions,
  { label: 'ctx.setValue', insertText: 'ctx.setValue(fieldId, value)', kind: 'Function', detail: '设置字段值', documentation: 'ctx.setValue(fieldId, val)', scope: 'ctx-member' },
  { label: 'ctx.setVisible', insertText: 'ctx.setVisible(id, true)', kind: 'Function', detail: '显示或隐藏控件', documentation: 'ctx.setVisible(id, bool)', scope: 'ctx-member' },
  { label: 'ctx.setDisabled', insertText: 'ctx.setDisabled(id, true)', kind: 'Function', detail: '启用或禁用控件', documentation: 'ctx.setDisabled(id, bool)', scope: 'ctx-member' },
  { label: 'ctx.setRequired', insertText: 'ctx.setRequired(id, true)', kind: 'Function', detail: '设置字段必填', documentation: 'ctx.setRequired(id, bool)', scope: 'ctx-member' },
  ...ctxNavigationSuggestions,
  { label: 'ctx.showMessage', insertText: "ctx.showMessage('提示内容', 'info')", kind: 'Function', detail: '弹出提示', documentation: 'ctx.showMessage(msg, type)', scope: 'ctx-member' },
  { label: 'ctx.validateField', insertText: 'ctx.validateField(id)', kind: 'Function', detail: '校验字段', documentation: 'ctx.validateField(id)', scope: 'ctx-member' },
  { label: 'ctx.querySheet', insertText: 'ctx.querySheet(sheetId, filter)', kind: 'Function', detail: '查询数据表', documentation: 'ctx.querySheet(sheetId, f)', scope: 'ctx-member' },
  ...ctxCrudSuggestions,
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
    { label: 'ctx.controls', kind: 'Field', detail: '按控件名访问其它控件句柄', sortText: '01935', scope: 'ctx-member' },
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
    { label: 'ctx.getValues', insertText: "ctx.getValues(['字段A', '字段B'])", kind: 'Function', detail: '批量读取字段值', sortText: '021', scope: 'ctx-member' },
    { label: 'ctx.setValue', insertText: "await ctx.setValue('字段名', ctx.value)", kind: 'Function', detail: '设置字段值', sortText: '022', scope: 'ctx-member' },
    { label: 'ctx.setValues', insertText: "await ctx.setValues({ customerName: '张三', status: '草稿' })", kind: 'Snippet', detail: '批量设置字段值', sortText: '023', scope: 'ctx-member' },
    { label: 'ctx.clearValue', insertText: "await ctx.clearValue('备注')", kind: 'Function', detail: '清空单个字段', sortText: '024', scope: 'ctx-member' },
    { label: 'ctx.clearValues', insertText: "await ctx.clearValues(['comment', 'remark'])", kind: 'Snippet', detail: '批量清空字段', sortText: '025', scope: 'ctx-member' },
    { label: 'ctx.setVisible', insertText: "await ctx.setVisible('组件ID', true)", kind: 'Function', detail: '切换控件显隐', sortText: '026', scope: 'ctx-member' },
    { label: 'ctx.toggleVisible', insertText: "await ctx.toggleVisible('组件ID')", kind: 'Function', detail: '切换控件显隐', sortText: '027', scope: 'ctx-member' },
    { label: 'ctx.setDisabled', insertText: "await ctx.setDisabled('组件ID', true)", kind: 'Function', detail: '切换控件禁用', sortText: '028', scope: 'ctx-member' },
    { label: 'ctx.toggleDisabled', insertText: "await ctx.toggleDisabled('组件ID')", kind: 'Function', detail: '切换控件禁用', sortText: '029', scope: 'ctx-member' },
    { label: 'ctx.setRequired', insertText: "await ctx.setRequired('字段名', true)", kind: 'Function', detail: '切换字段必填', sortText: '030', scope: 'ctx-member' },
    { label: 'ctx.toggleRequired', insertText: "await ctx.toggleRequired('字段名')", kind: 'Function', detail: '切换字段必填', sortText: '031', scope: 'ctx-member' },
    { label: 'ctx.setFieldState', insertText: "await ctx.setFieldState('customerName', { required: true, visible: true })", kind: 'Snippet', detail: '批量更新字段/控件状态', sortText: '032', scope: 'ctx-member' },
    { label: 'ctx.focusField', insertText: "await ctx.focusField('customerName')", kind: 'Function', detail: '聚焦字段', sortText: '033', scope: 'ctx-member' },
    { label: 'ctx.focusControl', insertText: "await ctx.focusControl('component_id')", kind: 'Function', detail: '聚焦控件', sortText: '034', scope: 'ctx-member' },
    { label: 'ctx.scrollToField', insertText: "await ctx.scrollToField('customerName')", kind: 'Function', detail: '滚动到字段', sortText: '035', scope: 'ctx-member' },
    { label: 'ctx.scrollToControl', insertText: "await ctx.scrollToControl('component_id')", kind: 'Function', detail: '滚动到控件', sortText: '036', scope: 'ctx-member' },
    { label: 'ctx.switchTab', insertText: 'await ctx.switchTab(1)', kind: 'Function', detail: '切换到指定页签', sortText: '037', scope: 'ctx-member' },
    { label: 'ctx.openTab', insertText: "await ctx.openTab('审批信息')", kind: 'Function', detail: '切换页签（业务别名）', sortText: '038', scope: 'ctx-member' },
    { label: 'ctx.showMessage', insertText: "await ctx.showMessage('处理完成', 'success')", kind: 'Function', detail: '显示即时提示', sortText: '039', scope: 'ctx-member' },
    { label: 'ctx.findRows', insertText: "ctx.findRows('employees', { 部门: '技术部' }, { limit: 10 })", kind: 'Function', detail: '按条件查询多条记录', sortText: '040', scope: 'ctx-member' },
    { label: 'ctx.findRow', insertText: "ctx.findRow('employees', { 员工ID: 1001 })", kind: 'Function', detail: '按条件查询单条记录', sortText: '041', scope: 'ctx-member' },
    { label: 'ctx.nextSequence', insertText: "ctx.nextSequence('employees', '员工ID', { start: 1000 })", kind: 'Function', detail: '生成下一个顺序编号', sortText: '042', scope: 'ctx-member' },
    { label: 'ctx.fillForm', insertText: "await ctx.fillForm(row, { 姓名: 'customerName' }, { originalFieldMap: { 姓名: '原始姓名' } })", kind: 'Function', detail: '按记录回填表单', sortText: '043', scope: 'ctx-member' },
    { label: 'ctx.requireFields', insertText: "await ctx.requireFields(['姓名', '手机号'])", kind: 'Function', detail: '批量校验必填字段', sortText: '044', scope: 'ctx-member' },
    { label: 'ctx.resetForm', insertText: "await ctx.resetForm({ clearFields: ['姓名', '手机号'], defaults: { 状态: '草稿' } })", kind: 'Function', detail: '按默认值重置表单', sortText: '045', scope: 'ctx-member' },
    { label: 'ctx.runConfiguredWorkflow', insertText: 'await ctx.runConfiguredWorkflow({ value: ctx.value })', kind: 'Function', detail: '执行本事件已绑定流程；不会再自动重复执行', sortText: '046', scope: 'ctx-member' },
    { label: 'ctx.runWorkflow', insertText: "await ctx.runWorkflow('流程 ID 或名称', { value: ctx.value })", kind: 'Function', detail: '按 ID 或名称执行任意流程', sortText: '047', scope: 'ctx-member' },
    { label: 'ctx.call', insertText: "await ctx.call('回调名称', ctx.value)", kind: 'Function', detail: '调用宿主注册的自定义回调函数', sortText: '048', scope: 'ctx-member' },
    { label: '批量赋值模板', insertText: "await ctx.setValues({\n  customerName: '张三',\n  status: '草稿',\n});", kind: 'Snippet', detail: '高频写法糖：批量赋值', sortText: '050', scope: 'top-level' },
    { label: '清空字段模板', insertText: "await ctx.clearValues(['comment', 'remark']);", kind: 'Snippet', detail: '高频写法糖：一键清空字段', sortText: '051', scope: 'top-level' },
    { label: '字段状态模板', insertText: "await ctx.setFieldState('customerName', {\n  visible: true,\n  required: true,\n});", kind: 'Snippet', detail: '高频写法糖：批量切状态', sortText: '052', scope: 'top-level' },
    { label: '切换页签模板', insertText: "await ctx.switchTab(1);\nawait ctx.showMessage('请继续填写下一页签', 'info');", kind: 'Snippet', detail: '高频写法糖：切页签并提示', sortText: '053', scope: 'top-level' },
    { label: '生成下一个编号', insertText: "const nextId = ctx.nextSequence('employees', '员工ID', { start: 1000 });\nawait ctx.setValue('员工ID', nextId);", kind: 'Snippet', detail: 'CRUD 模板：生成下一个编号', sortText: '054', scope: 'top-level' },
    { label: '按主键查询并回填', insertText: "const row = ctx.findRow('employees', { 员工ID: ctx.getValue('员工ID') });\nif (!row) return ctx.showMessage('未找到记录', 'warning');\nawait ctx.fillForm(row);", kind: 'Snippet', detail: 'CRUD 模板：查询并回填表单', sortText: '055', scope: 'top-level' },
    { label: '提交前必填校验', insertText: "const check = await ctx.requireFields(['姓名', '手机号']);\nif (!check.valid) return;", kind: 'Snippet', detail: 'CRUD 模板：批量必填校验', sortText: '056', scope: 'top-level' },
    { label: '提交后重置为下一条', insertText: "const nextId = ctx.nextSequence('employees', '员工ID', { start: 1000 });\nawait ctx.resetForm({\n  clearFields: ['姓名', '手机号', '备注'],\n  defaults: { 员工ID: nextId, 状态: '草稿' },\n  focusField: '姓名',\n  message: '表单已重置，可继续录入。',\n});", kind: 'Snippet', detail: 'CRUD 模板：重置为下一条', sortText: '057', scope: 'top-level' },
    { label: '加载筛选列表', insertText: "const rows = ctx.findRows('employees', { 部门: ctx.getValue('筛选部门') || '技术部' });\nawait ctx.setValue('员工列表', rows);\nawait ctx.setValue('处理提示', `已加载 ${rows.length} 条记录`);", kind: 'Snippet', detail: 'CRUD 模板：加载筛选列表', sortText: '058', scope: 'top-level' },
    { label: 'typed async callback', insertText: `/** @param {FormEventContext} ctx */\nasync (ctx) => {\n  ctx.console.log('${options.eventName || 'event'}', ctx.value);\n  return ctx.value;\n}`, kind: 'Snippet', detail: '完整异步事件回调模板', sortText: '001', scope: 'top-level' },
    ...fields.flatMap<CodeEditorSuggestion>((field, index) => [
      { label: `ctx.values.${field.name}`, kind: 'Field', detail: `字段：${field.name}${field.type ? ` · ${toTsType(field.type)}` : ''}`, sortText: `1${index.toString().padStart(3, '0')}`, scope: 'ctx-values-member' },
      { label: `ctx.controls.${field.name}`, kind: 'Field', detail: `控件句柄：${field.name}`, sortText: `11${index.toString().padStart(3, '0')}`, scope: 'ctx-member' },
      { label: `ctx.controls.${field.name}.value`, kind: 'Field', detail: `控件值句柄：${field.name}${field.type ? ` · ${toTsType(field.type)}` : ''}`, sortText: `12${index.toString().padStart(3, '0')}`, scope: 'ctx-member' },
      { label: `ctx.controls.${field.name}.disabled`, kind: 'Field', detail: `控件禁用句柄：${field.name}`, sortText: `13${index.toString().padStart(3, '0')}`, scope: 'ctx-member' },
      { label: `ctx.controls.${field.name}.visible`, kind: 'Field', detail: `控件显隐句柄：${field.name}`, sortText: `14${index.toString().padStart(3, '0')}`, scope: 'ctx-member' },
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
    content: `type EventFieldMap = {\n${fieldEntries || '  [key: string]: unknown;'}\n};\ntype EventFieldName = keyof EventFieldMap & string;\ntype CurrentEventField = ${currentFieldName};\ntype CurrentEventValue = ${currentFieldType};\ntype EventFlowResult = { success: boolean; errors: string[]; finalOutputs: Record<string, unknown> };\ntype EventCallback = (ctx: FormEventContext, ...args: unknown[]) => unknown | Promise<unknown>;\ntype FormFindRowsOptions = { limit?: number; sortBy?: string; sortOrder?: 'asc' | 'desc'; pickFields?: string[] };\ntype FormFindRowOptions = FormFindRowsOptions & { strictUnique?: boolean };\ntype FormNextSequenceOptions = { start?: number; step?: number };\ntype FormFillFormOptions = { originalFieldMap?: Record<string, string>; enableComponentIds?: string[]; skipUndefined?: boolean };\ntype FormFillFormResult = { patch: Record<string, unknown>; originalPatch: Record<string, unknown>; appliedFields: string[]; enableComponentIds: string[] };\ntype FormRequireFieldsOptions = { focus?: boolean; level?: 'info' | 'success' | 'warning' | 'error'; messageTemplate?: string };\ntype FormRequireFieldsResult = { valid: boolean; firstMissingField?: string; missingFields: string[]; message: string };\ntype FormResetFormOptions = { clearFields?: string[]; defaults?: Record<string, unknown>; preserveFields?: string[]; message?: string; focusField?: string };\ntype FormResetFormResult = { patch: Record<string, unknown>; clearedFields: string[]; preservedFields: string[]; focusedField?: string; message?: string };\ninterface FormEventComponent {\n  id: string;\n  type: string;\n  fieldBinding?: string;\n  props: Record<string, unknown>;\n  visible?: boolean;\n}\ninterface FormEventControlHandle {\n  id: string;\n  name: string;\n  type: string;\n  component: FormEventComponent;\n  value: unknown;\n  visible: boolean;\n  disabled: boolean;\n  required: boolean;\n}\ninterface FormEventContext {\n  event: ${eventName};\n  eventName: ${eventName};\n  field: CurrentEventField;\n  value: CurrentEventValue;\n  values: EventFieldMap & Record<string, unknown>;\n  formData: EventFieldMap & Record<string, unknown>;\n  originalValues: Partial<EventFieldMap> & Record<string, unknown>;\n  detail: ${detailType};\n  previousValue: CurrentEventValue;\n  timestamp: number;\n  dirty: boolean;\n  changedFields: EventFieldName[];\n  componentId: string;\n  componentType: string;\n  component: FormEventComponent;\n  controls: Record<string, FormEventControlHandle>;\n  getValue<K extends EventFieldName>(field: K): EventFieldMap[K];\n  getValue(field: string): unknown;\n  getValues<K extends EventFieldName>(fields: readonly K[]): Partial<Pick<EventFieldMap, K>> & Record<string, unknown>;\n  getValues(fields: readonly string[]): Record<string, unknown>;\n  setValue<K extends EventFieldName>(field: K, value: EventFieldMap[K]): Promise<void>;\n  setValue(field: string, value: unknown): Promise<void>;\n  setValues(patch: Partial<EventFieldMap> & Record<string, unknown>): Promise<void>;\n  clearValue<K extends EventFieldName>(field: K): Promise<void>;\n  clearValue(field: string): Promise<void>;\n  clearValues<K extends EventFieldName>(fields: readonly K[]): Promise<void>;\n  clearValues(fields: readonly string[]): Promise<void>;\n  setVisible(componentId: string, visible: boolean): Promise<void>;\n  toggleVisible(componentId: string): Promise<boolean>;\n  setDisabled(componentId: string, disabled: boolean): Promise<void>;\n  toggleDisabled(componentId: string): Promise<boolean>;\n  setRequired<K extends EventFieldName>(field: K, required: boolean): Promise<void>;\n  setRequired(field: string, required: boolean): Promise<void>;\n  toggleRequired<K extends EventFieldName>(field: K): Promise<boolean>;\n  toggleRequired(field: string): Promise<boolean>;\n  setFieldState<K extends EventFieldName>(fieldOrComponentId: K | string, patch: { value?: EventFieldMap[K] | unknown; visible?: boolean; disabled?: boolean; required?: boolean }): Promise<void>;\n  focusField<K extends EventFieldName>(field: K): Promise<void>;\n  focusField(field: string): Promise<void>;\n  focusControl(componentId: string): Promise<void>;\n  scrollToField<K extends EventFieldName>(field: K): Promise<void>;\n  scrollToField(field: string): Promise<void>;\n  scrollToControl(componentId: string): Promise<void>;\n  switchTab(tabIdOrIndex: string | number): Promise<void>;\n  openTab(tabIdOrIndex: string | number): Promise<void>;\n  showMessage(message: string, level?: 'info' | 'success' | 'warning' | 'error'): Promise<void>;\n  findRows(sheetId: string, criteria?: Record<string, unknown>, options?: FormFindRowsOptions): Record<string, unknown>[];\n  findRow(sheetId: string, criteria: Record<string, unknown>, options?: FormFindRowOptions): Record<string, unknown> | null;\n  nextSequence(sheetId: string, column: string, options?: FormNextSequenceOptions): number;\n  fillForm(record: Record<string, unknown> | null | undefined, fieldMap?: Record<string, string>, options?: FormFillFormOptions): Promise<FormFillFormResult>;\n  requireFields(fields: string[], options?: FormRequireFieldsOptions): Promise<FormRequireFieldsResult>;\n  resetForm(options?: FormResetFormOptions): Promise<FormResetFormResult>;\n  runWorkflow(workflow?: string, parameters?: Record<string, unknown>, options?: { targetNodeId?: string }): Promise<EventFlowResult>;\n  runConfiguredWorkflow(parameters?: Record<string, unknown>): Promise<EventFlowResult>;\n  call(name: string, ...args: unknown[]): Promise<unknown>;\n  callbacks: Record<string, EventCallback>;\n  console: Pick<Console, 'log' | 'warn' | 'error'>;\n}\ntype FormEventHandler = (ctx: FormEventContext) => unknown | Promise<unknown>;\ndeclare const ctx: FormEventContext;\n`,
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
      ['$component', '当前组件定义'],
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
