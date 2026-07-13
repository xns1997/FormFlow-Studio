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
          { path: 'value', description: '当前事件值。' },
          { path: "getValue('customerName')", description: '读取指定字段当前值。' },
          { path: 'controls.customerName.value', description: '直接读取名为 customerName 的控件值。' },
          { path: 'controls.resultTable.visible = true', description: '直接切换目标控件显示状态。' },
          { path: 'previousValue', description: '当前字段旧值。' },
          { path: 'changedFields', description: '全部变化字段。' },
        ],
      },
      {
        title: '使用示例',
        examples: [
          { title: '读取多个字段', code: "const name = getValue('姓名');\nconst dept = getValue('部门');\nconst salary = getValue('薪资');" },
          { title: '批量设置字段', code: "await setValues({\n  状态: '已审核',\n  审核人: getValue('currentUser'),\n  审核时间: new Date().toISOString()\n});" },
          { title: '判断字段变化', code: "if (changedFields.includes('部门')) {\n  showMessage('部门已变更', 'info');\n}" },
        ],
      },
    ],
  },
  {
    id: 'topic:control-handles-reference',
    slug: 'control-handles-reference',
    title: 'controls Reference',
    summary: '控件事件脚本里的控件句柄能力。适合做字段间赋值、表格回填、显隐和禁用联动。',
    sections: [
      {
        title: '控件句柄结构',
        body: '每个控件会按 name 和 componentId 同时挂到 controls 和 ctx.controls 上。新脚本推荐直接使用 controls.<控件名>。',
        fields: [
          { name: 'controls.customerName.value', type: 'unknown', description: '当前控件值；支持直接赋值。' },
          { name: 'controls.resultTable.visible', type: 'boolean', description: '控件显示状态；支持直接赋值。' },
          { name: 'controls.submitButton.disabled', type: 'boolean', description: '控件禁用状态；支持直接赋值。' },
          { name: 'controls.amount.required', type: 'boolean', description: '字段是否必填；支持直接赋值。' },
          { name: 'controls.customerName.component', type: 'FormEventComponent', description: '底层控件定义，可读取 type、props、id。' },
        ],
      },
      {
        title: '推荐场景',
        body: '同表单内的轻量联动优先用 controls；只有在需要节点编排、复用流程或复杂数据转换时再调用 runConfiguredWorkflow / runWorkflow。',
      },
      {
        title: '代码示例',
        shortcuts: [
          { path: "controls.summaryPreview.value = `${controls.name.value}：${controls.note.value}`", description: '空白表单模板：按钮点击后生成摘要。' },
          { path: "controls.saveLead.disabled = !controls.customerName.value", description: '数据录入模板：根据名称是否为空启用保存按钮。' },
          { path: "controls.approvalResults.value = rows", description: '审批模板：把流程结果直接写进右侧表格。' },
        ],
      },
      {
        title: '完整联动示例',
        examples: [
          { title: '字段联动', code: "// onFieldChange 事件\nif (field === '部门') {\n  controls.技术栈.visible = (value === '技术部');\n  controls.销售区域.visible = (value === '销售部');\n}" },
          { title: '表格回填', code: "// onClick 事件\nconst result = await runConfiguredWorkflow();\ncontrols.resultTable.value = result.outputs.data || [];" },
          { title: '按钮状态控制', code: "// onFieldChange 事件\nconst hasName = !!controls.姓名.value;\nconst hasPhone = !!controls.手机号.value;\ncontrols.submitBtn.disabled = !(hasName && hasPhone);" },
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
      {
        title: '使用示例',
        examples: [
          { title: '简单参数映射', code: '// 在流程参数配置中\n输入字段: $value\n字段名: $field\n表单数据: $formData' },
          { title: '复杂参数映射', code: '// 在代码模式中\n{\n  "userId": $componentId,\n  "formData": $formData,\n  "changedFields": $changedFields\n}' },
        ],
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
          { name: 'findRow(sheetId, criteria, options?)', type: 'Record<string, unknown> | null', description: '按条件取单条记录；默认要求唯一命中。' },
          { name: 'findRows(sheetId, criteria?, options?)', type: 'Record<string, unknown>[]', description: '按条件取多条记录，支持排序、限量和字段裁剪。' },
          { name: 'nextSequence(sheetId, column, options?)', type: 'number', description: '扫描指定列并返回下一个编号。' },
          { name: 'fillForm(record, fieldMap?, options?)', type: 'Promise<FillFormResult>', description: '把记录按映射批量回填到当前表单。' },
          { name: 'requireFields(fields, options?)', type: 'Promise<RequireFieldsResult>', description: '批量校验必填项，并返回首个缺失字段。' },
          { name: 'resetForm(options?)', type: 'Promise<ResetFormResult>', description: '按清空字段、默认值和保留字段规则统一重置表单。' },
        ],
      },
      {
        title: '代码示例',
        shortcuts: [
          { path: "const nextId = nextSequence('employees', '员工ID', { start: 1000 });", description: '生成新增编号。' },
          { path: "const row = findRow('employees', { 员工ID: getValue('员工ID') });", description: '按主键查单条记录。' },
          { path: "await fillForm(row, undefined, { originalFieldMap: { 姓名: '原始姓名' } });", description: '查到记录后批量回填表单和原始值字段。' },
          { path: "const check = await requireFields(['姓名', '手机号']); if (!check.valid) return;", description: '提交前批量校验必填项。' },
          { path: "await resetForm({ clearFields: ['姓名', '手机号'], defaults: { 状态: '草稿' }, focusField: '姓名' });", description: '提交后重置为下一条录入状态。' },
        ],
      },
      {
        title: '完整 CRUD 示例',
        examples: [
          { title: '新增记录流程', code: "// onFormLoad 事件\nconst nextId = nextSequence('orders', '订单号', { start: 10001 });\nawait setValue('订单号', nextId);\nawait setValue('创建日期', new Date().toISOString().slice(0, 10));\nawait setValue('状态', '草稿');\nawait focusField('客户名称');" },
          { title: '查询并回填', code: "// onFieldChange 事件\nif (field === '工号') {\n  const row = findRow('employees', { 工号: value });\n  if (row) {\n    await fillForm(row);\n    showMessage('已自动填充员工信息', 'info');\n  } else {\n    showMessage('未找到该工号', 'warning');\n  }\n}" },
          { title: '提交并重置', code: "// onSubmitSuccess 事件\nshowMessage('提交成功！', 'success');\nconst nextId = nextSequence('orders', '订单号', { start: 10001 });\nawait resetForm({\n  clearFields: ['客户名称', '数量', '备注'],\n  defaults: { 订单号: nextId, 状态: '草稿' },\n  focusField: '客户名称',\n  message: '表单已重置，可继续录入。'\n});" },
        ],
      },
    ],
  },
  {
    id: 'topic:best-practices',
    slug: 'best-practices',
    title: '行为脚本最佳实践',
    summary: '编写高效、可维护的行为脚本的推荐模式和常见陷阱。',
    sections: [
      {
        title: '推荐模式',
        body: '1. 使用 field 变量判断触发源，避免为每个字段单独写事件\n2. 优先使用高级 API（findRow、fillForm、requireFields）\n3. 同表单内轻量联动使用 controls 句柄\n4. 复杂业务逻辑通过流程实现\n5. 批量操作使用 setValues 而非多次 setValue',
      },
      {
        title: '常见陷阱',
        body: '1. 在 onFieldChange 中触发流程会导致频繁调用\n2. 在 onFormLoad 中执行异步操作应使用 onFormReady\n3. 避免在事件中修改触发字段本身，可能导致死循环\n4. 不要在事件中执行耗时操作，会影响用户体验\n5. 使用 return 可以阻止后续逻辑执行',
      },
      {
        title: '性能优化',
        examples: [
          { title: '防抖处理', code: "// onFieldChange 事件\nif (field === '搜索关键词') {\n  clearTimeout(window._searchTimer);\n  window._searchTimer = setTimeout(async () => {\n    await runConfiguredWorkflow();\n  }, 300);\n}" },
          { title: '批量设置', code: "// 推荐：一次性设置多个字段\nawait setValues({\n  状态: '已审核',\n  审核人: getValue('currentUser'),\n  审核时间: new Date().toISOString()\n});\n\n// 避免：多次单独设置\n// await setValue('状态', '已审核');\n// await setValue('审核人', getValue('currentUser'));\n// await setValue('审核时间', new Date().toISOString());" },
        ],
      },
    ],
  },
];
