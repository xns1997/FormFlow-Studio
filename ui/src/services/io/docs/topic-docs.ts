import type { BehaviorTopicDocEntry } from './types';
import { sharedContextFields, controlOnlyContextFields, scriptOnlyContextFields, flowParameterShortcuts } from './shared';

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
  {
    id: 'topic:crud-quick-patterns',
    slug: 'crud-quick-patterns',
    title: 'CRUD 快速模式',
    summary: '把查单条、查列表、生成编号、回填表单、必填校验和重置表单收敛成更短的脚本模式。',
    sections: [
      {
        title: '推荐 API',
        body: '优先用这些高级 ctx 方法，避免重复手写 querySheet / reduce / setValue 链路。',
        fields: [
          { name: 'ctx.findRow(sheetId, criteria, options?)', type: 'Record<string, unknown> | null', description: '按条件取单条记录；默认要求唯一命中。' },
          { name: 'ctx.findRows(sheetId, criteria?, options?)', type: 'Record<string, unknown>[]', description: '按条件取多条记录，支持排序、限量和字段裁剪。' },
          { name: 'ctx.nextSequence(sheetId, column, options?)', type: 'number', description: '扫描指定列并返回下一个编号。' },
          { name: 'ctx.fillForm(record, fieldMap?, options?)', type: 'Promise<FillFormResult>', description: '把记录按映射批量回填到当前表单。' },
          { name: 'ctx.requireFields(fields, options?)', type: 'Promise<RequireFieldsResult>', description: '批量校验必填项，并返回首个缺失字段。' },
          { name: 'ctx.resetForm(options?)', type: 'Promise<ResetFormResult>', description: '按清空字段、默认值和保留字段规则统一重置表单。' },
        ],
      },
      {
        title: '代码示例',
        shortcuts: [
          { path: "const nextId = ctx.nextSequence('employees', '员工ID', { start: 1000 });", description: '生成新增编号。' },
          { path: "const row = ctx.findRow('employees', { 员工ID: ctx.getValue('员工ID') });", description: '按主键查单条记录。' },
          { path: "await ctx.fillForm(row, undefined, { originalFieldMap: { 姓名: '原始姓名' } });", description: '查到记录后批量回填表单和原始值字段。' },
          { path: "const check = await ctx.requireFields(['姓名', '手机号']); if (!check.valid) return;", description: '提交前批量校验必填项。' },
          { path: "await ctx.resetForm({ clearFields: ['姓名', '手机号'], defaults: { 状态: '草稿' }, focusField: '姓名' });", description: '提交后重置为下一条录入状态。' },
        ],
      },
    ],
  },
];
