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

const topLevelApiSuggestions: CodeEditorSuggestion[] = [
  { label: 'getValue', insertText: "getValue('字段名')", kind: 'Function', detail: '读取字段值', documentation: "getValue('customerName')", sortText: '005', scope: 'top-level' },
  { label: 'getValues', insertText: "getValues(['字段A', '字段B'])", kind: 'Function', detail: '批量读取字段值', documentation: "getValues(['fieldA', 'fieldB'])", sortText: '006', scope: 'top-level' },
  { label: 'setValue', insertText: "await setValue('字段名', value)", kind: 'Function', detail: '设置字段值', documentation: "await setValue('customerName', '张三')", sortText: '007', scope: 'top-level' },
  { label: 'setValues', insertText: "await setValues({ fieldId: value })", kind: 'Function', detail: '批量设置字段值', documentation: 'await setValues({ customerName: "张三" })', sortText: '008', scope: 'top-level' },
  { label: 'showMessage', insertText: "await showMessage('处理完成', 'success')", kind: 'Function', detail: '显示即时提示', documentation: "await showMessage('处理完成', 'success')", sortText: '009', scope: 'top-level' },
  { label: 'runConfiguredWorkflow', insertText: 'await runConfiguredWorkflow({ value })', kind: 'Function', detail: '执行本事件已绑定流程', documentation: 'await runConfiguredWorkflow(parameters?)', sortText: '010', scope: 'top-level' },
  { label: 'runWorkflow', insertText: "await runWorkflow('流程 ID 或名称', { value })", kind: 'Function', detail: '按 ID 或名称执行任意流程', documentation: "await runWorkflow('workflowId', parameters)", sortText: '011', scope: 'top-level' },
  { label: 'debug', insertText: "debug('调试标题', { value })", kind: 'Function', detail: '写入结构化调试日志', documentation: "debug('label', data, options)", sortText: '011a', scope: 'top-level' },
  { label: 'Print', insertText: "Print('调试信息')", kind: 'Function', detail: '写入内部调试日志', documentation: "Print('message')", sortText: '012', scope: 'top-level' },
  { label: 'PrintInfo', insertText: "PrintInfo('调试信息')", kind: 'Function', detail: '写入 info 调试日志', documentation: "PrintInfo('message')", sortText: '013', scope: 'top-level' },
  { label: 'PrintWarn', insertText: "PrintWarn('告警信息')", kind: 'Function', detail: '写入 warn 调试日志', documentation: "PrintWarn('message')", sortText: '014', scope: 'top-level' },
  { label: 'PrintError', insertText: "PrintError('错误信息')", kind: 'Function', detail: '写入 error 调试日志', documentation: "PrintError('message')", sortText: '015', scope: 'top-level' },
  { label: 'PrintDebug', insertText: "PrintDebug('调试信息', value)", kind: 'Function', detail: '写入 debug 调试日志', documentation: "PrintDebug('message', data)", sortText: '016', scope: 'top-level' },
  { label: 'PrintJson', insertText: "PrintJson('调试对象', value)", kind: 'Function', detail: '以 JSON 形式输出调试信息', documentation: "PrintJson('payload', data)", sortText: '017', scope: 'top-level' },
  { label: 'PrintTable', insertText: "PrintTable('结果表', rows)", kind: 'Function', detail: '以表格形式输出数组对象', documentation: "PrintTable('rows', data)", sortText: '018', scope: 'top-level' },
  { label: 'PrintGroup', insertText: "PrintGroup('阶段标题', data)", kind: 'Function', detail: '输出分组调试日志', documentation: "PrintGroup('before submit', data)", sortText: '019', scope: 'top-level' },
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
  { label: 'ctx.debug', insertText: "ctx.debug('调试标题', { value })", kind: 'Function', detail: '写入结构化调试日志', documentation: 'ctx.debug(label, data?, options?)', scope: 'ctx-member' },
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
    if (node.specId !== 'generic:value-input') return [];
    try {
      const raw = node.data?.propertiesJson;
      const props = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
      return props.name ? [String(props.name)] : [];
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
    ...topLevelApiSuggestions,
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
    { label: 'ctx.fields', insertText: "await ctx.fields(['字段A', '字段B']).show().required()", kind: 'Snippet', detail: '链式批量更新字段状态', sortText: '0451', scope: 'ctx-member' },
    { label: 'ctx.form.require', insertText: "const check = await ctx.form.require(['姓名', '手机号']).focusFirstInvalid()", kind: 'Snippet', detail: '链式校验表单必填项', sortText: '0452', scope: 'ctx-member' },
    { label: 'ctx.table', insertText: "await ctx.table('employees').find({ 员工ID: ctx.getValue('员工ID') }).fillForm()", kind: 'Snippet', detail: '链式查询并回填', sortText: '0453', scope: 'ctx-member' },
    { label: 'ctx.table.upsert', insertText: "await ctx.table('employees').upsert(ctx.form.values(), { key: '员工ID' })", kind: 'Snippet', detail: '链式按主键新增或更新', sortText: '04535', scope: 'ctx-member' },
    { label: 'ctx.flow', insertText: "await ctx.flow('流程 ID').run({ formData: ctx.form.values() }).writeBack()", kind: 'Snippet', detail: '链式运行流程并回写', sortText: '0454', scope: 'ctx-member' },
    { label: 'ctx.evaluate', insertText: "ctx.evaluate('$数量 * $单价')", kind: 'Function', detail: '执行安全字段表达式', sortText: '0455', scope: 'ctx-member' },
    { label: 'ctx.runConfiguredWorkflow', insertText: 'await ctx.runConfiguredWorkflow({ value: ctx.value })', kind: 'Function', detail: '执行本事件已绑定流程；不会再自动重复执行', sortText: '046', scope: 'ctx-member' },
    { label: 'ctx.runWorkflow', insertText: "await ctx.runWorkflow('流程 ID 或名称', { value: ctx.value })", kind: 'Function', detail: '按 ID 或名称执行任意流程', sortText: '047', scope: 'ctx-member' },
    { label: 'ctx.call', insertText: "await ctx.call('回调名称', ctx.value)", kind: 'Function', detail: '调用宿主注册的自定义回调函数', sortText: '048', scope: 'ctx-member' },
    { label: '批量赋值模板', insertText: "await setValues({\n  customerName: '张三',\n  status: '草稿',\n});", kind: 'Snippet', detail: '高频写法糖：批量赋值', sortText: '050', scope: 'top-level' },
    { label: '清空字段模板', insertText: "await clearValues(['comment', 'remark']);", kind: 'Snippet', detail: '高频写法糖：一键清空字段', sortText: '051', scope: 'top-level' },
    { label: '字段状态模板', insertText: "await setFieldState('customerName', {\n  visible: true,\n  required: true,\n});", kind: 'Snippet', detail: '高频写法糖：批量切状态', sortText: '052', scope: 'top-level' },
    { label: '切换页签模板', insertText: "await switchTab(1);\nawait showMessage('请继续填写下一页签', 'info');", kind: 'Snippet', detail: '高频写法糖：切页签并提示', sortText: '053', scope: 'top-level' },
    { label: '生成下一个编号', insertText: "const nextId = nextSequence('employees', '员工ID', { start: 1000 });\nawait setValue('员工ID', nextId);", kind: 'Snippet', detail: 'CRUD 模板：生成下一个编号', sortText: '054', scope: 'top-level' },
    { label: '按主键查询并回填', insertText: "const row = findRow('employees', { 员工ID: getValue('员工ID') });\nif (!row) return showMessage('未找到记录', 'warning');\nawait fillForm(row);", kind: 'Snippet', detail: 'CRUD 模板：查询并回填表单', sortText: '055', scope: 'top-level' },
    { label: '提交前必填校验', insertText: "const check = await requireFields(['姓名', '手机号']);\nif (!check.valid) return;", kind: 'Snippet', detail: 'CRUD 模板：批量必填校验', sortText: '056', scope: 'top-level' },
    { label: '提交后重置为下一条', insertText: "const nextId = nextSequence('employees', '员工ID', { start: 1000 });\nawait resetForm({\n  clearFields: ['姓名', '手机号', '备注'],\n  defaults: { 员工ID: nextId, 状态: '草稿' },\n  focusField: '姓名',\n  message: '表单已重置，可继续录入。',\n});", kind: 'Snippet', detail: 'CRUD 模板：重置为下一条', sortText: '057', scope: 'top-level' },
    { label: '加载筛选列表', insertText: "const rows = findRows('employees', { 部门: getValue('筛选部门') || '技术部' });\nawait setValue('员工列表', rows);\nawait setValue('处理提示', `已加载 ${rows.length} 条记录`);", kind: 'Snippet', detail: 'CRUD 模板：加载筛选列表', sortText: '058', scope: 'top-level' },
    { label: 'typed async callback', insertText: `/** @param {FormEventContext} ctx */\nasync (ctx) => {\n  PrintDebug('${options.eventName || 'event'}', value);\n  return value;\n}`, kind: 'Snippet', detail: '完整异步事件回调模板', sortText: '001', scope: 'top-level' },
    ...fields.flatMap<CodeEditorSuggestion>((field, index) => [
      { label: `ctx.values.${field.name}`, kind: 'Field', detail: `字段：${field.name}${field.type ? ` · ${toTsType(field.type)}` : ''}`, sortText: `1${index.toString().padStart(3, '0')}`, scope: 'ctx-values-member' },
      { label: `ctx.controls.${field.name}`, kind: 'Field', detail: `控件句柄：${field.name}`, sortText: `11${index.toString().padStart(3, '0')}`, scope: 'ctx-member' },
      { label: `ctx.controls.${field.name}.value`, kind: 'Field', detail: `控件值句柄：${field.name}${field.type ? ` · ${toTsType(field.type)}` : ''}`, sortText: `12${index.toString().padStart(3, '0')}`, scope: 'ctx-member' },
      { label: `ctx.controls.${field.name}.disabled`, kind: 'Field', detail: `控件禁用句柄：${field.name}`, sortText: `13${index.toString().padStart(3, '0')}`, scope: 'ctx-member' },
      { label: `ctx.controls.${field.name}.visible`, kind: 'Field', detail: `控件显隐句柄：${field.name}`, sortText: `14${index.toString().padStart(3, '0')}`, scope: 'ctx-member' },
      { label: field.name, insertText: field.name, kind: 'Value', detail: `字段名${field.type ? ` · ${toTsType(field.type)}` : ''}`, sortText: `15${index.toString().padStart(3, '0')}`, scope: 'field-name' },
      { label: `getValue ${field.name}`, insertText: `getValue(${quoted(field.name)})`, kind: 'Function', detail: `读取 ${field.name}`, sortText: `2${index.toString().padStart(3, '0')}`, scope: 'top-level' },
      { label: `setValue ${field.name}`, insertText: `await setValue(${quoted(field.name)}, value)`, kind: 'Function', detail: `设置 ${field.name}`, sortText: `3${index.toString().padStart(3, '0')}`, scope: 'top-level' },
    ]),
    ...workflows.map<CodeEditorSuggestion>((workflow, index) => ({
      label: `运行流程 ${workflow.name}`,
      insertText: `await runWorkflow(${quoted(workflow.id)}, { value })`,
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
    content: `type EventFieldMap = {\n${fieldEntries || '  [key: string]: unknown;'}\n};\ntype EventFieldName = keyof EventFieldMap & string;\ntype CurrentEventField = ${currentFieldName};\ntype CurrentEventValue = ${currentFieldType};\ntype EventFlowDebug = { requestId?: string; workflowId?: string; executedNodeCount: number; exportKeys: string[]; duration: number; errors: string[] };\ntype EventFlowResult = { success: boolean; errors: string[]; finalOutputs: Record<string, unknown>; debug?: EventFlowDebug };\ntype EventCallback = (ctx: FormEventContext, ...args: unknown[]) => unknown | Promise<unknown>;\ntype FormFindRowsOptions = { limit?: number; sortBy?: string; sortOrder?: 'asc' | 'desc'; pickFields?: string[] };\ntype FormFindRowOptions = FormFindRowsOptions & { strictUnique?: boolean };\ntype FormNextSequenceOptions = { start?: number; step?: number };\ntype FormFillFormOptions = { originalFieldMap?: Record<string, string>; enableComponentIds?: string[]; skipUndefined?: boolean };\ntype FormFillFormResult = { patch: Record<string, unknown>; originalPatch: Record<string, unknown>; appliedFields: string[]; enableComponentIds: string[] };\ntype FormRequireFieldsOptions = { focus?: boolean; level?: 'info' | 'success' | 'warning' | 'error'; messageTemplate?: string };\ntype FormRequireFieldsResult = { valid: boolean; firstMissingField?: string; missingFields: string[]; message: string };\ntype FormResetFormOptions = { clearFields?: string[]; defaults?: Record<string, unknown>; preserveFields?: string[]; message?: string; focusField?: string };\ntype FormResetFormResult = { patch: Record<string, unknown>; clearedFields: string[]; preservedFields: string[]; focusedField?: string; message?: string };\ninterface FormEventComponent {\n  id: string;\n  type: string;\n  fieldBinding?: string;\n  props: Record<string, unknown>;\n  visible?: boolean;\n}\ninterface FormEventControlHandle {\n  id: string;\n  name: string;\n  type: string;\n  component: FormEventComponent;\n  value: unknown;\n  visible: boolean;\n  disabled: boolean;\n  required: boolean;\n}\ninterface FormEventContext {\n  event: ${eventName};\n  eventName: ${eventName};\n  field: CurrentEventField;\n  value: CurrentEventValue;\n  values: EventFieldMap & Record<string, unknown>;\n  formData: EventFieldMap & Record<string, unknown>;\n  originalValues: Partial<EventFieldMap> & Record<string, unknown>;\n  detail: ${detailType};\n  previousValue: CurrentEventValue;\n  timestamp: number;\n  dirty: boolean;\n  changedFields: EventFieldName[];\n  componentId: string;\n  componentType: string;\n  component: FormEventComponent;\n  controls: Record<string, FormEventControlHandle>;\n  getValue<K extends EventFieldName>(field: K): EventFieldMap[K];\n  getValue(field: string): unknown;\n  getValues<K extends EventFieldName>(fields: readonly K[]): Partial<Pick<EventFieldMap, K>> & Record<string, unknown>;\n  getValues(fields: readonly string[]): Record<string, unknown>;\n  setValue<K extends EventFieldName>(field: K, value: EventFieldMap[K]): Promise<void>;\n  setValue(field: string, value: unknown): Promise<void>;\n  setValues(patch: Partial<EventFieldMap> & Record<string, unknown>): Promise<void>;\n  clearValue<K extends EventFieldName>(field: K): Promise<void>;\n  clearValue(field: string): Promise<void>;\n  clearValues<K extends EventFieldName>(fields: readonly K[]): Promise<void>;\n  clearValues(fields: readonly string[]): Promise<void>;\n  setVisible(componentId: string, visible: boolean): Promise<void>;\n  toggleVisible(componentId: string): Promise<boolean>;\n  setDisabled(componentId: string, disabled: boolean): Promise<void>;\n  toggleDisabled(componentId: string): Promise<boolean>;\n  setRequired<K extends EventFieldName>(field: K, required: boolean): Promise<void>;\n  setRequired(field: string, required: boolean): Promise<void>;\n  toggleRequired<K extends EventFieldName>(field: K): Promise<boolean>;\n  toggleRequired(field: string): Promise<boolean>;\n  setFieldState<K extends EventFieldName>(fieldOrComponentId: K | string, patch: { value?: EventFieldMap[K] | unknown; visible?: boolean; disabled?: boolean; required?: boolean }): Promise<void>;\n  focusField<K extends EventFieldName>(field: K): Promise<void>;\n  focusField(field: string): Promise<void>;\n  focusControl(componentId: string): Promise<void>;\n  scrollToField<K extends EventFieldName>(field: K): Promise<void>;\n  scrollToField(field: string): Promise<void>;\n  scrollToControl(componentId: string): Promise<void>;\n  switchTab(tabIdOrIndex: string | number): Promise<void>;\n  openTab(tabIdOrIndex: string | number): Promise<void>;\n  showMessage(message: string, level?: 'info' | 'success' | 'warning' | 'error'): Promise<void>;\n  debug(label: string, data?: unknown, options?: Record<string, unknown>): void;\n  findRows(sheetId: string, criteria?: Record<string, unknown>, options?: FormFindRowsOptions): Record<string, unknown>[];\n  findRow(sheetId: string, criteria: Record<string, unknown>, options?: FormFindRowOptions): Record<string, unknown> | null;\n  nextSequence(sheetId: string, column: string, options?: FormNextSequenceOptions): number;\n  fillForm(record: Record<string, unknown> | null | undefined, fieldMap?: Record<string, string>, options?: FormFillFormOptions): Promise<FormFillFormResult>;\n  requireFields(fields: string[], options?: FormRequireFieldsOptions): Promise<FormRequireFieldsResult>;\n  resetForm(options?: FormResetFormOptions): Promise<FormResetFormResult>;\n  runWorkflow(workflow?: string, parameters?: Record<string, unknown>, options?: { targetNodeId?: string }): Promise<EventFlowResult>;\n  runConfiguredWorkflow(parameters?: Record<string, unknown>): Promise<EventFlowResult>;\n  call(name: string, ...args: unknown[]): Promise<unknown>;\n  callbacks: Record<string, EventCallback>;\n  console: Pick<Console, 'log' | 'warn' | 'error' | 'debug'>;\n}\ntype FormEventHandler = (ctx: FormEventContext) => unknown | Promise<unknown>;\ndeclare const ctx: FormEventContext;\ndeclare const callbacks: Record<string, EventCallback>;\ndeclare const field: CurrentEventField;\ndeclare const value: CurrentEventValue;\ndeclare const values: EventFieldMap & Record<string, unknown>;\ndeclare const formData: EventFieldMap & Record<string, unknown>;\ndeclare const originalValues: Partial<EventFieldMap> & Record<string, unknown>;\ndeclare const detail: ${detailType};\ndeclare const previousValue: CurrentEventValue;\ndeclare const timestamp: number;\ndeclare const dirty: boolean;\ndeclare const changedFields: EventFieldName[];\ndeclare const componentId: string;\ndeclare const componentType: string;\ndeclare const component: FormEventComponent;\ndeclare const controls: Record<string, FormEventControlHandle>;\ndeclare function getValue<K extends EventFieldName>(field: K): EventFieldMap[K];\ndeclare function getValue(field: string): unknown;\ndeclare function getValues<K extends EventFieldName>(fields: readonly K[]): Partial<Pick<EventFieldMap, K>> & Record<string, unknown>;\ndeclare function getValues(fields: readonly string[]): Record<string, unknown>;\ndeclare function setValue<K extends EventFieldName>(field: K, value: EventFieldMap[K]): Promise<void>;\ndeclare function setValue(field: string, value: unknown): Promise<void>;\ndeclare function setValues(patch: Partial<EventFieldMap> & Record<string, unknown>): Promise<void>;\ndeclare function clearValue<K extends EventFieldName>(field: K): Promise<void>;\ndeclare function clearValue(field: string): Promise<void>;\ndeclare function clearValues<K extends EventFieldName>(fields: readonly K[]): Promise<void>;\ndeclare function clearValues(fields: readonly string[]): Promise<void>;\ndeclare function setVisible(componentId: string, visible: boolean): Promise<void>;\ndeclare function toggleVisible(componentId: string): Promise<boolean>;\ndeclare function setDisabled(componentId: string, disabled: boolean): Promise<void>;\ndeclare function toggleDisabled(componentId: string): Promise<boolean>;\ndeclare function setRequired<K extends EventFieldName>(field: K, required: boolean): Promise<void>;\ndeclare function setRequired(field: string, required: boolean): Promise<void>;\ndeclare function toggleRequired<K extends EventFieldName>(field: K): Promise<boolean>;\ndeclare function toggleRequired(field: string): Promise<boolean>;\ndeclare function setFieldState<K extends EventFieldName>(fieldOrComponentId: K | string, patch: { value?: EventFieldMap[K] | unknown; visible?: boolean; disabled?: boolean; required?: boolean }): Promise<void>;\ndeclare function focusField<K extends EventFieldName>(field: K): Promise<void>;\ndeclare function focusField(field: string): Promise<void>;\ndeclare function focusControl(componentId: string): Promise<void>;\ndeclare function scrollToField<K extends EventFieldName>(field: K): Promise<void>;\ndeclare function scrollToField(field: string): Promise<void>;\ndeclare function scrollToControl(componentId: string): Promise<void>;\ndeclare function switchTab(tabIdOrIndex: string | number): Promise<void>;\ndeclare function openTab(tabIdOrIndex: string | number): Promise<void>;\ndeclare function showMessage(message: string, level?: 'info' | 'success' | 'warning' | 'error'): Promise<void>;\ndeclare function debug(label: string, data?: unknown, options?: Record<string, unknown>): void;\ndeclare function findRows(sheetId: string, criteria?: Record<string, unknown>, options?: FormFindRowsOptions): Record<string, unknown>[];\ndeclare function findRow(sheetId: string, criteria: Record<string, unknown>, options?: FormFindRowOptions): Record<string, unknown> | null;\ndeclare function nextSequence(sheetId: string, column: string, options?: FormNextSequenceOptions): number;\ndeclare function fillForm(record: Record<string, unknown> | null | undefined, fieldMap?: Record<string, string>, options?: FormFillFormOptions): Promise<FormFillFormResult>;\ndeclare function requireFields(fields: string[], options?: FormRequireFieldsOptions): Promise<FormRequireFieldsResult>;\ndeclare function resetForm(options?: FormResetFormOptions): Promise<FormResetFormResult>;\ndeclare function runWorkflow(workflow?: string, parameters?: Record<string, unknown>, options?: { targetNodeId?: string }): Promise<EventFlowResult>;\ndeclare function runConfiguredWorkflow(parameters?: Record<string, unknown>): Promise<EventFlowResult>;\ndeclare function call(name: string, ...args: unknown[]): Promise<unknown>;\ndeclare function Print(...args: unknown[]): void;\ndeclare function PrintInfo(...args: unknown[]): void;\ndeclare function PrintWarn(...args: unknown[]): void;\ndeclare function PrintError(...args: unknown[]): void;\ndeclare function PrintDebug(...args: unknown[]): void;\ndeclare function PrintJson(label: string, data?: unknown): void;\ndeclare function PrintTable(label: string, rows?: unknown): void;\ndeclare function PrintGroup(label: string, data?: unknown): void;\n`,
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

export function createChainApiExtraLib(filePath = 'inmemory://formflow-chain-api.d.ts'): CodeEditorExtraLib {
  return {
    filePath,
    content: `
interface FormFlowFieldChain extends PromiseLike<void> {
  show(): FormFlowFieldChain; hide(): FormFlowFieldChain;
  enable(): FormFlowFieldChain; disable(): FormFlowFieldChain;
  required(): FormFlowFieldChain; optional(): FormFlowFieldChain;
  clear(): FormFlowFieldChain; set(value: unknown): FormFlowFieldChain;
}
interface FormFlowRequireChain extends PromiseLike<FormRequireFieldsResult> { focusFirstInvalid(): FormFlowRequireChain; }
interface FormFlowTableFindChain extends PromiseLike<Record<string, unknown> | null> {
  fillForm(fieldMap?: Record<string, string>, options?: FormFillFormOptions): Promise<FormFillFormResult | null>;
}
interface FormFlowRunChain extends PromiseLike<EventFlowResult> { writeBack(): Promise<EventFlowResult>; }
interface FormEventContext {
  evaluate(expression: string): unknown;
  fields(fields: string | string[]): FormFlowFieldChain;
  form: { values(): EventFieldMap & Record<string, unknown>; require(fields: string[]): FormFlowRequireChain };
  table(sheetId: string): {
    find(criteria: Record<string, unknown>, options?: FormFindRowOptions): FormFlowTableFindChain;
    rows(criteria?: Record<string, unknown>, options?: FormFindRowsOptions): Record<string, unknown>[];
    upsert(record: Record<string, unknown>, options: { key: string }): Promise<{ created: boolean; updated: boolean; key: unknown; record: Record<string, unknown> }>;
  };
  flow(workflow?: string): { run(parameters?: Record<string, unknown>, options?: { targetNodeId?: string }): FormFlowRunChain };
}
`,
  };
}
