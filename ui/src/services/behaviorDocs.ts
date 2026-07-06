export type BehaviorDocScope = 'script' | 'control';

export interface BehaviorReferenceField {
  name: string;
  type: string;
  description: string;
}

export interface BehaviorApiReference {
  name: string;
  signature: string;
  description: string;
}

export interface BehaviorDocExample {
  title: string;
  code: string;
}

export interface BehaviorReferenceShortcut {
  path: string;
  description: string;
}

export interface BehaviorEventDocEntry {
  id: string;
  eventName: string;
  slug: string;
  title: string;
  category: string;
  scope: BehaviorDocScope;
  summary: string;
  triggerWhen: string;
  contextFields: BehaviorReferenceField[];
  detailFields: BehaviorReferenceField[];
  apis: BehaviorApiReference[];
  suggestions: string[];
  examples: BehaviorDocExample[];
  relatedEvents: string[];
  detailType?: string;
  referenceShortcuts?: BehaviorReferenceShortcut[];
}

export interface BehaviorTopicDocEntry {
  id: string;
  slug: string;
  title: string;
  summary: string;
  sections: Array<{
    title: string;
    body?: string;
    fields?: BehaviorReferenceField[];
    apis?: BehaviorApiReference[];
    shortcuts?: BehaviorReferenceShortcut[];
  }>;
}

const sharedContextFields: BehaviorReferenceField[] = [
  { name: 'ctx.field', type: 'string', description: '当前触发事件的字段名或绑定键。' },
  { name: 'ctx.value', type: 'unknown', description: '当前事件对应的值。不同事件下会映射成当前控件值、提交结果或触发值。' },
  { name: 'ctx.values', type: 'Record<string, unknown>', description: '当前完整表单值快照。' },
  { name: 'ctx.formData', type: 'Record<string, unknown>', description: '与 ctx.values 等价，便于脚本或流程复用。' },
  { name: 'ctx.originalValues', type: 'Record<string, unknown>', description: '表单初始值快照，适合做差异比较。' },
  { name: 'ctx.detail', type: 'unknown', description: '事件专属附加数据。具体结构取决于事件类型。' },
];

const controlOnlyContextFields: BehaviorReferenceField[] = [
  { name: 'ctx.eventName', type: 'string', description: '当前控件事件名，例如 onChange、onDrop。' },
  { name: 'ctx.component', type: 'FormEventComponent', description: '当前控件定义，可读取 id、type、props 等信息。' },
  { name: 'ctx.componentId', type: 'string', description: '当前控件 ID，便于控制显隐和跳转文档。' },
  { name: 'ctx.componentType', type: 'string', description: '当前控件类型，例如 input、tabs、table。' },
  { name: 'ctx.controls', type: 'Record<string, FormEventControlHandle>', description: '按控件 name 或 componentId 暴露的运行时控件句柄，可直接访问 value / visible / disabled / required。' },
  { name: 'ctx.previousValue', type: 'unknown', description: '事件发生前的字段值。表单级事件通常是旧快照。' },
  { name: 'ctx.timestamp', type: 'number', description: '事件上下文创建时的毫秒时间戳。' },
  { name: 'ctx.dirty', type: 'boolean', description: '当前字段值是否相对原始值发生变化。' },
  { name: 'ctx.changedFields', type: 'string[]', description: '相对原始值发生变化的字段列表。' },
];

const scriptOnlyContextFields: BehaviorReferenceField[] = [
  { name: 'ctx.getValue(fieldId)', type: 'unknown', description: '读取行为脚本当前看到的字段值。' },
  { name: 'ctx.setValue(fieldId, value)', type: 'void', description: '修改字段值，并立即更新运行时数据。' },
  { name: 'ctx.originalData', type: 'Record<string, unknown>', description: '测试面板和行为脚本中可读取的原始数据快照。' },
];

const flowParameterShortcuts: BehaviorReferenceShortcut[] = [
  { path: '$value', description: '当前事件值。' },
  { path: '$field', description: '当前字段名。' },
  { path: '$event', description: '当前事件名。' },
  { path: '$values', description: '当前表单值快照。' },
  { path: '$formData', description: '当前表单值快照的别名。' },
  { path: '$originalValues', description: '原始表单值快照。' },
  { path: '$component', description: '当前控件定义对象。' },
  { path: '$componentId', description: '当前控件 ID。' },
  { path: '$detail', description: '当前事件 detail 对象。' },
  { path: '$previousValue', description: '当前字段旧值。' },
  { path: '$timestamp', description: '事件时间戳。' },
  { path: '$dirty', description: '当前字段是否脏数据。' },
  { path: '$changedFields', description: '已变化字段列表。' },
  { path: '$context', description: '完整事件上下文对象。' },
];

const scriptApis: BehaviorApiReference[] = [
  { name: 'ctx.getValue', signature: 'ctx.getValue(fieldId)', description: '获取字段当前值。' },
  { name: 'ctx.setValue', signature: 'ctx.setValue(fieldId, value)', description: '设置字段值。' },
  { name: 'ctx.setVisible', signature: 'ctx.setVisible(componentId, visible)', description: '控制组件显示或隐藏。' },
  { name: 'ctx.setDisabled', signature: 'ctx.setDisabled(componentId, disabled)', description: '控制组件禁用状态。' },
  { name: 'ctx.setRequired', signature: 'ctx.setRequired(fieldId, required)', description: '控制字段是否必填。' },
  { name: 'ctx.showMessage', signature: "ctx.showMessage(message, type = 'info')", description: '弹出消息提示。' },
  { name: 'ctx.validateField', signature: 'ctx.validateField(fieldId)', description: '触发字段校验并返回结果。' },
  { name: 'ctx.querySheet', signature: 'ctx.querySheet(sheetId, filter?)', description: '查询表数据。' },
  { name: 'ctx.updateRow', signature: 'ctx.updateRow(rowId, patch)', description: '更新数据行。' },
  { name: 'ctx.submit', signature: 'ctx.submit()', description: '触发表单提交。' },
];

const controlApis: BehaviorApiReference[] = [
  { name: 'ctx.controls', signature: 'ctx.controls.controlName.value = nextValue', description: '通过控件句柄直接读写其它控件。支持 value / visible / disabled / required。' },
  { name: 'ctx.getValue', signature: 'ctx.getValue(fieldId)', description: '读取任意字段的当前值。' },
  { name: 'ctx.setValue', signature: 'await ctx.setValue(fieldId, value)', description: '异步修改字段值。' },
  { name: 'ctx.setVisible', signature: 'await ctx.setVisible(componentId, visible)', description: '异步修改控件显隐。' },
  { name: 'ctx.setDisabled', signature: 'await ctx.setDisabled(componentId, disabled)', description: '异步修改控件禁用状态。' },
  { name: 'ctx.setRequired', signature: 'await ctx.setRequired(fieldId, required)', description: '异步修改字段必填状态。' },
  { name: 'ctx.showMessage', signature: "await ctx.showMessage(message, type = 'info')", description: '显示即时提示消息。' },
  { name: 'ctx.runConfiguredWorkflow', signature: 'await ctx.runConfiguredWorkflow(parameters?)', description: '执行当前事件已绑定的流程。' },
  { name: 'ctx.runWorkflow', signature: 'await ctx.runWorkflow(workflowIdOrName, parameters?, options?)', description: '按 ID 或名称执行任意流程。' },
  { name: 'ctx.call', signature: 'await ctx.call(name, ...args)', description: '调用宿主注册的回调函数。' },
  { name: 'ctx.console.log', signature: 'ctx.console.log(...args)', description: '输出调试日志。' },
];

function mergeContextFields(scope: BehaviorDocScope) {
  return scope === 'control'
    ? [...sharedContextFields, ...controlOnlyContextFields]
    : [...sharedContextFields, ...scriptOnlyContextFields];
}

function createEventDoc(entry: Omit<BehaviorEventDocEntry, 'contextFields' | 'apis'> & {
  contextFields?: BehaviorReferenceField[];
  apis?: BehaviorApiReference[];
}): BehaviorEventDocEntry {
  return {
    ...entry,
    contextFields: entry.contextFields || mergeContextFields(entry.scope),
    apis: entry.apis || (entry.scope === 'control' ? controlApis : scriptApis),
  };
}

export const behaviorEventDocs: BehaviorEventDocEntry[] = [
  createEventDoc({
    id: 'script:onFormLoad',
    eventName: 'onFormLoad',
    slug: 'form-load',
    title: '表单加载',
    category: '行为脚本事件',
    scope: 'script',
    summary: '表单初次装载完成后触发，适合填充默认值和初始化 UI。',
    triggerWhen: '项目测试运行或行为脚本宿主完成表单初始化后触发。',
    detailFields: [],
    suggestions: ['优先在这里做默认值填充和首屏提示，不要把依赖用户输入的逻辑也塞进初始化。'],
    examples: [{ title: '初始化默认值', code: "if (!ctx.getValue('status')) ctx.setValue('status', '草稿');" }],
    relatedEvents: ['onFormReady', 'onRowLoad'],
  }),
  createEventDoc({
    id: 'script:onRowLoad',
    eventName: 'onRowLoad',
    slug: 'row-load',
    title: '数据行加载',
    category: '行为脚本事件',
    scope: 'script',
    summary: '切换到某条数据记录或重新装载当前行时触发。',
    triggerWhen: '测试运行中切换当前数据行或刷新当前行时触发。',
    detailFields: [],
    suggestions: ['适合做行级联动和状态恢复，例如根据行数据控制字段显隐。'],
    examples: [{ title: '按行状态禁用字段', code: "ctx.setDisabled('approvalComment', ctx.getValue('status') !== '待审批');" }],
    relatedEvents: ['onFormLoad', 'onDataImport'],
  }),
  createEventDoc({
    id: 'script:onFieldChange',
    eventName: 'onFieldChange',
    slug: 'field-change',
    title: '字段变更',
    category: '行为脚本事件',
    scope: 'script',
    summary: '任意字段值发生变化后触发，适合做联动赋值和条件校验。',
    triggerWhen: '字段编辑完成并提交最新值后触发。',
    detailFields: [],
    suggestions: ['把依赖单字段变化的计算放在这里；多字段提交前校验放到 onBeforeSubmit 或 onSubmit。'],
    examples: [{ title: '同步摘要字段', code: "ctx.setValue('summary', `${ctx.getValue('customerName') || ''} / ${ctx.getValue('region') || ''}`);" }],
    relatedEvents: ['onValueChange', 'onFieldBlur', 'onValidate'],
  }),
  createEventDoc({
    id: 'script:onFieldBlur',
    eventName: 'onFieldBlur',
    slug: 'field-blur',
    title: '字段失焦',
    category: '行为脚本事件',
    scope: 'script',
    summary: '字段失去焦点时触发，适合做轻量校验和格式化。',
    triggerWhen: '输入焦点离开字段后触发。',
    detailFields: [],
    suggestions: ['不要在这里做耗时请求；如果需要远程校验，建议先提示加载状态。'],
    examples: [{ title: '自动去空格', code: "const value = String(ctx.getValue('customerName') || '').trim(); ctx.setValue('customerName', value);" }],
    relatedEvents: ['onFieldFocus', 'onFieldChange'],
  }),
  createEventDoc({
    id: 'script:onFieldFocus',
    eventName: 'onFieldFocus',
    slug: 'field-focus',
    title: '字段聚焦',
    category: '行为脚本事件',
    scope: 'script',
    summary: '字段获得焦点时触发，适合做辅助提示和预加载。',
    triggerWhen: '输入焦点进入某个字段时触发。',
    detailFields: [],
    suggestions: ['适合展示帮助文案，不适合在这里强改用户输入。'],
    examples: [{ title: '展示帮助', code: "ctx.showMessage('请输入完整客户名称', 'info');" }],
    relatedEvents: ['onFieldBlur'],
  }),
  createEventDoc({
    id: 'script:onButtonClick',
    eventName: 'onButtonClick',
    slug: 'button-click',
    title: '按钮点击',
    category: '行为脚本事件',
    scope: 'script',
    summary: '用户点击行为按钮时触发。',
    triggerWhen: '按钮类组件点击后触发。',
    detailFields: [],
    suggestions: ['适合执行提交前检查、切换页签或显式调用流程。', '如果只是同一表单内的轻量联动，优先直接使用 ctx.controls.<控件名>。'],
    examples: [
      { title: '点击后提示', code: "ctx.showMessage('按钮事件已触发', 'success');" },
      { title: '点击后把结果写进表格', code: "const rows = (await ctx.runConfiguredWorkflow()).nodeResults.get('filter')?.outputs.result || [];\nctx.controls.resultTable.value = rows;" },
    ],
    relatedEvents: ['onSubmit', 'onBeforeSubmit'],
  }),
  createEventDoc({
    id: 'script:onValidate',
    eventName: 'onValidate',
    slug: 'validate',
    title: '校验',
    category: '行为脚本事件',
    scope: 'script',
    summary: '进入表单校验阶段时触发。',
    triggerWhen: '提交前或显式调用校验时触发。',
    detailFields: [],
    suggestions: ['在这里收口跨字段校验逻辑，并用 showMessage 明确给出失败原因。'],
    examples: [{ title: '校验开始日期', code: "if (!ctx.getValue('startDate')) ctx.showMessage('请选择开始日期', 'warning');" }],
    relatedEvents: ['onBeforeSubmit', 'onSubmit', 'onSubmitError'],
  }),
  createEventDoc({
    id: 'script:onSubmit',
    eventName: 'onSubmit',
    slug: 'submit',
    title: '提交',
    category: '行为脚本事件',
    scope: 'script',
    summary: '用户触发提交动作时执行，适合做最终校验和收口动作。',
    triggerWhen: '点击提交或调用 ctx.submit() 后触发。',
    detailFields: [],
    suggestions: ['把不可逆的副作用集中放在这里，避免字段级事件重复触发。'],
    examples: [{ title: '提交前补全时间', code: "ctx.setValue('submittedAt', new Date().toISOString());" }],
    relatedEvents: ['onBeforeSubmit', 'onSubmitSuccess', 'onSubmitError'],
  }),
  createEventDoc({
    id: 'script:onSubmitSuccess',
    eventName: 'onSubmitSuccess',
    slug: 'submit-success',
    title: '提交成功',
    category: '行为脚本事件',
    scope: 'script',
    summary: '提交成功后触发，适合清理状态和反馈提示。',
    triggerWhen: '提交流程成功完成后触发。',
    detailFields: [],
    suggestions: ['适合做跳转、清空临时字段和成功提示。'],
    examples: [{ title: '成功提示', code: "ctx.showMessage('提交成功', 'success');" }],
    relatedEvents: ['onSubmit', 'onSubmitError'],
  }),
  createEventDoc({
    id: 'script:onSubmitError',
    eventName: 'onSubmitError',
    slug: 'submit-error',
    title: '提交失败',
    category: '行为脚本事件',
    scope: 'script',
    summary: '提交失败后触发，适合记录错误和指导用户修正。',
    triggerWhen: '提交流程抛错或返回失败状态后触发。',
    detailFields: [],
    suggestions: ['这里更适合兜底提示，不要再尝试自动重复提交。'],
    examples: [{ title: '失败提示', code: "ctx.showMessage('提交失败，请检查必填项', 'error');" }],
    relatedEvents: ['onSubmit', 'onValidate'],
  }),
  createEventDoc({
    id: 'script:onFormReady',
    eventName: 'onFormReady',
    slug: 'form-ready',
    title: '表单就绪',
    category: '行为脚本事件',
    scope: 'script',
    summary: '表单和依赖数据全部准备完成后触发。',
    triggerWhen: '首屏数据与组件都可交互时触发。',
    detailFields: [],
    suggestions: ['适合做依赖异步数据的初始化，而不是 onFormLoad 里的同步准备。'],
    examples: [{ title: '就绪提示', code: "ctx.showMessage('表单已准备就绪', 'info');" }],
    relatedEvents: ['onFormLoad', 'onDataImport'],
  }),
  createEventDoc({
    id: 'script:onFormReset',
    eventName: 'onFormReset',
    slug: 'form-reset',
    title: '表单重置',
    category: '行为脚本事件',
    scope: 'script',
    summary: '表单被重置时触发。',
    triggerWhen: '用户执行重置动作或宿主恢复初始值时触发。',
    detailFields: [],
    suggestions: ['适合恢复依赖值和提示用户，不要在这里再写回大量默认值。'],
    examples: [{ title: '重置提示', code: "ctx.showMessage('表单已恢复初始值', 'info');" }],
    relatedEvents: ['onFormLoad', 'onValueChange'],
  }),
  createEventDoc({
    id: 'script:onBeforeSubmit',
    eventName: 'onBeforeSubmit',
    slug: 'before-submit',
    title: '提交前',
    category: '行为脚本事件',
    scope: 'script',
    summary: '真正提交前的最后一道钩子，适合做最后检查和参数整理。',
    triggerWhen: '进入提交动作，但尚未发出最终提交请求前触发。',
    detailFields: [],
    suggestions: ['这里适合整理提交 payload，而不是做大量 UI 联动。'],
    examples: [{ title: '补全审批人', code: "if (!ctx.getValue('reviewer')) ctx.setValue('reviewer', '系统默认审批人');" }],
    relatedEvents: ['onValidate', 'onSubmit'],
  }),
  createEventDoc({
    id: 'script:onFieldKeyDown',
    eventName: 'onFieldKeyDown',
    slug: 'field-key-down',
    title: '字段按键',
    category: '行为脚本事件',
    scope: 'script',
    summary: '字段按键时触发，适合快捷键响应。',
    triggerWhen: '输入控件收到键盘按下事件时触发。',
    detailFields: [],
    suggestions: ['只放轻量逻辑，避免每次按键都触发昂贵计算。'],
    examples: [{ title: '回车提示', code: "ctx.showMessage('按键事件已触发', 'info');" }],
    relatedEvents: ['onFieldPaste', 'onFieldClear'],
  }),
  createEventDoc({
    id: 'script:onFieldPaste',
    eventName: 'onFieldPaste',
    slug: 'field-paste',
    title: '字段粘贴',
    category: '行为脚本事件',
    scope: 'script',
    summary: '用户向字段中粘贴内容时触发。',
    triggerWhen: '输入控件收到粘贴动作时触发。',
    detailFields: [],
    suggestions: ['适合做批量清洗和格式校正。'],
    examples: [{ title: '去空白字符', code: "ctx.setValue('customerCode', String(ctx.getValue('customerCode') || '').replace(/\\s+/g, ''));" }],
    relatedEvents: ['onFieldChange'],
  }),
  createEventDoc({
    id: 'script:onFieldClear',
    eventName: 'onFieldClear',
    slug: 'field-clear',
    title: '字段清空',
    category: '行为脚本事件',
    scope: 'script',
    summary: '字段被显式清空时触发。',
    triggerWhen: '用户清除字段值或脚本重置该字段时触发。',
    detailFields: [],
    suggestions: ['适合联动清空依赖字段或隐藏下游组件。'],
    examples: [{ title: '联动清空备注', code: "ctx.setValue('comment', '');" }],
    relatedEvents: ['onFieldChange', 'onFormReset'],
  }),
  createEventDoc({
    id: 'script:onRowAdd',
    eventName: 'onRowAdd',
    slug: 'row-add',
    title: '新增行',
    category: '行为脚本事件',
    scope: 'script',
    summary: '新增一条记录或表格行时触发。',
    triggerWhen: '宿主向当前表单上下文增加新数据行时触发。',
    detailFields: [],
    suggestions: ['适合补默认字段值或标记新行状态。'],
    examples: [{ title: '默认新增状态', code: "ctx.setValue('status', '新建');" }],
    relatedEvents: ['onRowDelete', 'onRowSelect'],
  }),
  createEventDoc({
    id: 'script:onRowDelete',
    eventName: 'onRowDelete',
    slug: 'row-delete',
    title: '删除行',
    category: '行为脚本事件',
    scope: 'script',
    summary: '删除当前行或某条记录时触发。',
    triggerWhen: '宿主执行删除数据行操作后触发。',
    detailFields: [],
    suggestions: ['适合记录日志和补充确认提示。'],
    examples: [{ title: '删除提示', code: "ctx.showMessage('记录已删除', 'warning');" }],
    relatedEvents: ['onRowAdd', 'onRowSelect'],
  }),
  createEventDoc({
    id: 'script:onRowSelect',
    eventName: 'onRowSelect',
    slug: 'row-select',
    title: '选择行',
    category: '行为脚本事件',
    scope: 'script',
    summary: '用户选择某条记录或某一行时触发。',
    triggerWhen: '切换当前选中行时触发。',
    detailFields: [],
    suggestions: ['适合切换详情区域、加载附加说明或控制按钮可用性。'],
    examples: [{ title: '选中提示', code: "ctx.showMessage('已切换到新记录', 'info');" }],
    relatedEvents: ['onRowLoad'],
  }),
  createEventDoc({
    id: 'script:onDataImport',
    eventName: 'onDataImport',
    slug: 'data-import',
    title: '导入数据',
    category: '行为脚本事件',
    scope: 'script',
    summary: '导入外部数据后触发，适合做归一化处理。',
    triggerWhen: '批量导入表格或外部数据完成后触发。',
    detailFields: [],
    suggestions: ['适合做批量字段修正和缺省值补齐。'],
    examples: [{ title: '导入后提示', code: "ctx.showMessage('数据导入完成，请复核后提交', 'success');" }],
    relatedEvents: ['onDataExport', 'onFormReady'],
  }),
  createEventDoc({
    id: 'script:onDataExport',
    eventName: 'onDataExport',
    slug: 'data-export',
    title: '导出数据',
    category: '行为脚本事件',
    scope: 'script',
    summary: '导出动作开始或完成时触发。',
    triggerWhen: '宿主执行导出文件、导出记录动作时触发。',
    detailFields: [],
    suggestions: ['适合记录导出日志、补充审计信息。'],
    examples: [{ title: '导出提示', code: "ctx.showMessage('导出任务已开始', 'info');" }],
    relatedEvents: ['onDataImport', 'onSubmitSuccess'],
  }),
  createEventDoc({
    id: 'script:onValueChange',
    eventName: 'onValueChange',
    slug: 'value-change',
    title: '值变化',
    category: '行为脚本事件',
    scope: 'script',
    summary: '更偏向全局的值变化事件，用于监听表单任意值变动。',
    triggerWhen: '任意关键值变化并被宿主上报时触发。',
    detailFields: [],
    suggestions: ['适合做全局脏状态提示或保存草稿标记。'],
    examples: [{ title: '标记脏状态', code: "ctx.showMessage('表单内容已变化', 'info');" }],
    relatedEvents: ['onFieldChange', 'onFormReset'],
  }),
  createEventDoc({
    id: 'control:onChange',
    eventName: 'onChange',
    slug: 'change',
    title: '控件值变更',
    category: '控件运行时事件',
    scope: 'control',
    summary: '控件值发生变化时触发，是表单联动最常见的入口。',
    triggerWhen: '字段值写入运行时上下文后立即触发。',
    detailType: '{ previousValue: CurrentEventValue; value: CurrentEventValue; source?: string }',
    detailFields: [
      { name: 'detail.previousValue', type: 'CurrentEventValue', description: '变更前的旧值。' },
      { name: 'detail.value', type: 'CurrentEventValue', description: '当前写入的新值。' },
      { name: 'detail.source', type: 'string | undefined', description: '值来源，例如用户输入、代码更新。' },
    ],
    referenceShortcuts: [
      { path: 'ctx.detail.previousValue', description: '事件明细中的旧值。' },
      { path: 'ctx.detail.value', description: '事件明细中的新值。' },
      { path: 'ctx.detail.source', description: '本次变更来源。' },
    ],
    suggestions: ['需要差异判断时优先用 ctx.previousValue 或 ctx.detail.previousValue，而不是重新自己缓存旧值。'],
    examples: [{ title: '变化后同步摘要', code: "await ctx.setValue('summary', `${ctx.detail.previousValue || ''} → ${ctx.value || ''}`);" }],
    relatedEvents: ['onBlur', 'onReset', 'onSubmit'],
  }),
  createEventDoc({
    id: 'control:onBlur',
    eventName: 'onBlur',
    slug: 'blur',
    title: '控件失焦',
    category: '控件运行时事件',
    scope: 'control',
    summary: '控件失去焦点时触发，常用于输入完成后的轻量校验。',
    triggerWhen: '控件从聚焦状态切换到失焦状态后触发。',
    detailType: '{ relatedTarget?: string; touched: boolean }',
    detailFields: [
      { name: 'detail.relatedTarget', type: 'string | undefined', description: '下一个聚焦目标的标识。' },
      { name: 'detail.touched', type: 'boolean', description: '当前字段是否已被操作。' },
    ],
    referenceShortcuts: [
      { path: 'ctx.detail.touched', description: '字段是否已被操作。' },
      { path: 'ctx.detail.relatedTarget', description: '下一个聚焦控件。' },
    ],
    suggestions: ['适合 trim、格式标准化和单字段校验，不适合触发大规模流程。'],
    examples: [{ title: '失焦自动 trim', code: "await ctx.setValue(ctx.field, String(ctx.value || '').trim());" }],
    relatedEvents: ['onFocus', 'onChange'],
  }),
  createEventDoc({
    id: 'control:onFocus',
    eventName: 'onFocus',
    slug: 'focus',
    title: '控件聚焦',
    category: '控件运行时事件',
    scope: 'control',
    summary: '控件获得焦点时触发，适合展示帮助信息或做懒加载。',
    triggerWhen: '控件进入聚焦状态时触发。',
    detailType: '{ relatedTarget?: string }',
    detailFields: [
      { name: 'detail.relatedTarget', type: 'string | undefined', description: '上一个聚焦目标的标识。' },
    ],
    referenceShortcuts: [
      { path: 'ctx.detail.relatedTarget', description: '上一个聚焦控件。' },
    ],
    suggestions: ['更适合做提示和预加载，不建议在焦点进入时直接修改当前字段值。'],
    examples: [{ title: '聚焦时打印日志', code: "ctx.console.log('focus field', ctx.field, ctx.detail.relatedTarget);" }],
    relatedEvents: ['onBlur'],
  }),
  createEventDoc({
    id: 'control:onClick',
    eventName: 'onClick',
    slug: 'click',
    title: '控件点击',
    category: '控件运行时事件',
    scope: 'control',
    summary: '按钮、图片、标签等可点击控件的点击事件。',
    triggerWhen: '控件收到点击交互时触发。',
    detailType: '{ x?: number; y?: number; button?: number; source?: string }',
    detailFields: [
      { name: 'detail.x', type: 'number | undefined', description: '点击横坐标。' },
      { name: 'detail.y', type: 'number | undefined', description: '点击纵坐标。' },
      { name: 'detail.button', type: 'number | undefined', description: '鼠标按键编号。' },
      { name: 'detail.source', type: 'string | undefined', description: '点击来源说明。' },
    ],
    referenceShortcuts: [
      { path: 'ctx.detail.x', description: '点击横坐标。' },
      { path: 'ctx.detail.y', description: '点击纵坐标。' },
      { path: 'ctx.detail.button', description: '鼠标按键编号。' },
    ],
    suggestions: ['按钮点击里优先显式调用 runConfiguredWorkflow 或 runWorkflow，行为更可控。', '如果只是把结果回填到同一表单控件，优先用 ctx.controls 直接赋值。'],
    examples: [
      { title: '点击后执行已绑定流程', code: 'await ctx.runConfiguredWorkflow({ value: ctx.value });' },
      { title: '把流程结果写到表格控件', code: "const result = await ctx.runConfiguredWorkflow();\nctx.controls.resultTable.value = result.nodeResults.get('filter')?.outputs.result || [];" },
    ],
    relatedEvents: ['onSubmit', 'onTabChange'],
  }),
  createEventDoc({
    id: 'control:onSubmit',
    eventName: 'onSubmit',
    slug: 'control-submit',
    title: '表单提交',
    category: '控件运行时事件',
    scope: 'control',
    summary: '表单提交动作触发时的控件运行时事件。',
    triggerWhen: '用户触发提交、运行时进入提交流程时触发。',
    detailType: '{ valid?: boolean; errors?: Record<string, string>; submitter?: string }',
    detailFields: [
      { name: 'detail.valid', type: 'boolean | undefined', description: '当前表单校验是否通过。' },
      { name: 'detail.errors', type: 'Record<string, string> | undefined', description: '字段级错误集合。' },
      { name: 'detail.submitter', type: 'string | undefined', description: '触发提交的按钮或组件标识。' },
    ],
    referenceShortcuts: [
      { path: 'ctx.detail.valid', description: '表单是否校验通过。' },
      { path: 'ctx.detail.errors', description: '字段校验错误对象。' },
      { path: 'ctx.changedFields', description: '本次提交涉及的变更字段。' },
    ],
    suggestions: ['提交事件里优先读取 changedFields 与 detail.errors，避免重复计算差异和错误集合。'],
    examples: [{ title: '提交前打印变化字段', code: "ctx.console.log('changed fields', ctx.changedFields, ctx.detail.errors);" }],
    relatedEvents: ['onChange', 'onReset'],
  }),
  createEventDoc({
    id: 'control:onReset',
    eventName: 'onReset',
    slug: 'reset',
    title: '表单重置',
    category: '控件运行时事件',
    scope: 'control',
    summary: '表单恢复到初始值时触发。',
    triggerWhen: '用户或宿主触发重置动作后触发。',
    detailType: '{ previousValues: EventFieldMap & Record<string, unknown> }',
    detailFields: [
      { name: 'detail.previousValues', type: 'EventFieldMap & Record<string, unknown>', description: '重置前的整份表单值快照。' },
    ],
    referenceShortcuts: [
      { path: 'ctx.detail.previousValues', description: '重置前的表单值。' },
    ],
    suggestions: ['如果需要恢复某些额外状态，优先比对 detail.previousValues 与 ctx.values。'],
    examples: [{ title: '重置后记录日志', code: "ctx.console.log('reset from', ctx.detail.previousValues, 'to', ctx.values);" }],
    relatedEvents: ['onSubmit', 'onChange'],
  }),
  createEventDoc({
    id: 'control:onTabChange',
    eventName: 'onTabChange',
    slug: 'tab-change',
    title: '标签切换',
    category: '控件运行时事件',
    scope: 'control',
    summary: 'Tab 或多页容器切换时触发。',
    triggerWhen: '标签页索引发生变化时触发。',
    detailType: '{ index: number; previousIndex?: number; label: string }',
    detailFields: [
      { name: 'detail.index', type: 'number', description: '当前标签索引。' },
      { name: 'detail.previousIndex', type: 'number | undefined', description: '上一个标签索引。' },
      { name: 'detail.label', type: 'string', description: '当前标签名称。' },
    ],
    referenceShortcuts: [
      { path: 'ctx.detail.index', description: '当前标签索引。' },
      { path: 'ctx.detail.previousIndex', description: '上一个标签索引。' },
      { path: 'ctx.detail.label', description: '当前标签名称。' },
    ],
    suggestions: ['跨标签加载逻辑放这里最合适，避免每个标签内部自己再监听一次。'],
    examples: [{ title: '切换页签时记录', code: "ctx.console.log('tab changed', ctx.detail.previousIndex, '->', ctx.detail.index, ctx.detail.label);" }],
    relatedEvents: ['onClick'],
  }),
  createEventDoc({
    id: 'control:onRowClick',
    eventName: 'onRowClick',
    slug: 'row-click',
    title: '表格行点击',
    category: '控件运行时事件',
    scope: 'control',
    summary: '点击表格某一行时触发，适合联动详情面板或子表单。',
    triggerWhen: '表格行被点击并完成命中计算后触发。',
    detailType: '{ rowIndex: number; row?: Record<string, unknown>; columnKey?: string }',
    detailFields: [
      { name: 'detail.rowIndex', type: 'number', description: '点击行索引。' },
      { name: 'detail.row', type: 'Record<string, unknown> | undefined', description: '点击行的完整数据。' },
      { name: 'detail.columnKey', type: 'string | undefined', description: '命中的列键。' },
    ],
    referenceShortcuts: [
      { path: 'ctx.detail.rowIndex', description: '点击的行索引。' },
      { path: 'ctx.detail.row', description: '点击行数据。' },
      { path: 'ctx.detail.columnKey', description: '点击的列键。' },
    ],
    suggestions: ['如果要把表格行同步到表单字段，优先从 detail.row 读取原始值。'],
    examples: [{ title: '点击行后写入当前客户', code: "if (ctx.detail.row?.customerName) await ctx.setValue('customerName', ctx.detail.row.customerName);" }],
    relatedEvents: ['onChange', 'onTabChange'],
  }),
  createEventDoc({
    id: 'control:onDrop',
    eventName: 'onDrop',
    slug: 'drop',
    title: '拖放',
    category: '控件运行时事件',
    scope: 'control',
    summary: '文件或文本拖放到控件时触发。',
    triggerWhen: '拖放动作落到支持接收的控件上后触发。',
    detailType: '{ files: File[]; types: string[]; text?: string }',
    detailFields: [
      { name: 'detail.files', type: 'File[]', description: '拖入的文件列表。' },
      { name: 'detail.types', type: 'string[]', description: '拖放数据类型列表。' },
      { name: 'detail.text', type: 'string | undefined', description: '拖入的纯文本内容。' },
    ],
    referenceShortcuts: [
      { path: 'ctx.detail.files', description: '拖入的文件列表。' },
      { path: 'ctx.detail.types', description: '拖放数据类型。' },
      { path: 'ctx.detail.text', description: '拖放文本内容。' },
    ],
    suggestions: ['拖放事件里优先先判断 files 与 text，再决定走上传流程还是文本解析流程。'],
    examples: [{ title: '拖入文本后写入字段', code: "if (ctx.detail.text) await ctx.setValue(ctx.field, ctx.detail.text);" }],
    relatedEvents: ['onChange', 'onClick'],
  }),
];

export const behaviorTopicDocs: BehaviorTopicDocEntry[] = [
  {
    id: 'topic:context-reference',
    slug: 'context-reference',
    title: '上下文 Reference',
    summary: '通用上下文字段总览，帮助你在脚本和控件事件里快速定位可用数据。',
    sections: [
      {
        title: '通用上下文',
        body: '这些字段会贯穿文档页和编辑器提示，是查值、对比、联动的基础。',
        fields: [...sharedContextFields, ...controlOnlyContextFields, ...scriptOnlyContextFields],
      },
      {
        title: '常用快捷读取',
        shortcuts: [
          { path: 'ctx.value', description: '当前事件值。' },
          { path: 'ctx.values.customerName', description: '读取指定字段当前值。' },
          { path: 'ctx.controls.customerName.value', description: '直接读取名为 customerName 的控件值。' },
          { path: 'ctx.controls.resultTable.visible = true', description: '直接切换目标控件显示状态。' },
          { path: 'ctx.previousValue', description: '当前字段旧值。' },
          { path: 'ctx.changedFields', description: '全部变化字段。' },
        ],
      },
    ],
  },
  {
    id: 'topic:control-handles-reference',
    slug: 'control-handles-reference',
    title: 'ctx.controls Reference',
    summary: '控件事件脚本里的控件句柄能力。适合做字段间赋值、表格回填、显隐和禁用联动。',
    sections: [
      {
        title: '控件句柄结构',
        body: '每个控件会按 name 和 componentId 同时挂到 ctx.controls 上。最常见的访问方式是 ctx.controls.<控件名>。',
        fields: [
          { name: 'ctx.controls.customerName.value', type: 'unknown', description: '当前控件值；支持直接赋值。' },
          { name: 'ctx.controls.resultTable.visible', type: 'boolean', description: '控件显示状态；支持直接赋值。' },
          { name: 'ctx.controls.submitButton.disabled', type: 'boolean', description: '控件禁用状态；支持直接赋值。' },
          { name: 'ctx.controls.amount.required', type: 'boolean', description: '字段是否必填；支持直接赋值。' },
          { name: 'ctx.controls.customerName.component', type: 'FormEventComponent', description: '底层控件定义，可读取 type、props、id。' },
        ],
      },
      {
        title: '推荐场景',
        body: '同表单内的轻量联动优先用 ctx.controls；只有在需要节点编排、复用流程或复杂数据转换时再调用 ctx.runConfiguredWorkflow / ctx.runWorkflow。',
      },
      {
        title: '代码示例',
        shortcuts: [
          { path: "ctx.controls.summaryPreview.value = `${ctx.controls.name.value}：${ctx.controls.note.value}`", description: '空白表单模板：按钮点击后生成摘要。' },
          { path: "ctx.controls.saveLead.disabled = !ctx.controls.customerName.value", description: '数据录入模板：根据名称是否为空启用保存按钮。' },
          { path: "ctx.controls.approvalResults.value = rows", description: '审批模板：把流程结果直接写进右侧表格。' },
        ],
      },
    ],
  },
  {
    id: 'topic:flow-parameter-reference',
    slug: 'flow-parameter-reference',
    title: '流程参数 Reference',
    summary: '控件事件触发流程时可用的 `$...` 参数映射说明；常规映射可直接用 UI 配置，复杂结构可切回代码模式。',
    sections: [
      {
        title: '内置参数变量',
        body: '这些变量可直接写进流程参数映射，运行时会解析成对应上下文值。',
        shortcuts: flowParameterShortcuts,
      },
      {
        title: '使用建议',
        body: '常规变量或端口映射优先用 UI 模式；需要嵌套对象、数组或复杂表达式时再切回代码模式。字段级参数优先用 `$value`、`$previousValue`、`$dirty`；需要整份上下文时再使用 `$context`。',
      },
    ],
  },
];

export function getBehaviorDocBySlug(slug: string | undefined) {
  if (!slug) return undefined;
  return behaviorEventDocs.find((item) => item.slug === slug) || behaviorTopicDocs.find((item) => item.slug === slug);
}

export function getBehaviorEventDoc(eventName: string | undefined, scope?: BehaviorDocScope) {
  if (!eventName) return undefined;
  return behaviorEventDocs.find((item) => item.eventName === eventName && (!scope || item.scope === scope));
}

export function getBehaviorDocsByScope(scope: BehaviorDocScope) {
  return behaviorEventDocs.filter((item) => item.scope === scope);
}

export function getEventDetailType(eventName: string, scope: BehaviorDocScope = 'control') {
  return getBehaviorEventDoc(eventName, scope)?.detailType || 'Record<string, unknown>';
}

export function getEventReferenceShortcuts(eventName: string, scope: BehaviorDocScope = 'control') {
  return getBehaviorEventDoc(eventName, scope)?.referenceShortcuts || [];
}

export function getSharedContextFields() {
  return sharedContextFields;
}

export function getFlowParameterShortcuts() {
  return flowParameterShortcuts;
}

export function getScriptApis() {
  return scriptApis;
}

export function getControlApis() {
  return controlApis;
}
