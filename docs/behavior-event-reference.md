# 行为事件与上下文 Reference

这份文档对应项目内的行为文档页，覆盖两类事件：

- 行为脚本事件：`onFormLoad`、`onFieldChange`、`onSubmit`、`onSubmitSuccess` 等
- 控件运行时事件：`onChange`、`onBlur`、`onClick`、`onSubmit`、`onDrop` 等

项目内入口：

- 文档首页：`/docs`
- 上下文总览：`/docs/context-reference`
- 流程参数 reference：`/docs/flow-parameter-reference`
- 控件句柄 reference：`/docs/control-handles-reference`
- 如果从项目工作区进入，会自动带上 `fromProject / fromPage / fromTab` 参数，便于返回原页面

## 通用上下文

常见字段包括：

- `ctx.field`：当前字段名
- `ctx.value`：当前事件值
- `ctx.values` / `ctx.formData`：当前表单值快照
- `ctx.originalValues`：原始表单值
- `ctx.detail`：事件专属附加数据

控件运行时事件还会补充：

- `ctx.previousValue`
- `ctx.timestamp`
- `ctx.dirty`
- `ctx.changedFields`
- `ctx.component`
- `ctx.componentId`
- `ctx.componentType`
- `ctx.controls`

## ctx.controls

`ctx.controls` 会按控件 `name` 和 `componentId` 暴露运行时句柄，适合做同表单内的直接联动。

常见属性：

- `ctx.controls.customerName.value`
- `ctx.controls.resultTable.visible`
- `ctx.controls.submitButton.disabled`
- `ctx.controls.amount.required`

示例：

```ts
ctx.controls.summaryPreview.value = `${ctx.controls.name.value}：${ctx.controls.note.value}`
ctx.controls.saveLead.disabled = !ctx.controls.customerName.value
ctx.controls.approvalResults.value = rows
```

建议：

- 同表单内的轻量联动优先用 `ctx.controls`
- 需要复杂计算、节点编排或跨流程复用时，再用 `ctx.runConfiguredWorkflow()` / `ctx.runWorkflow()`

## 批量方法与链式 API

当前事件上下文提供以下常用方法，统一编辑器中的「方法库」可以生成代码、显示自然语言预览并运行样例：

- `ctx.getValues(fields)` / `ctx.setValues(patch)`：批量读取或写入字段
- `ctx.clearValues(fields)`：批量清空字段
- `ctx.setFieldState(field, { value, visible, disabled, required })`：一次更新字段值和运行时状态
- `ctx.requireFields(fields)`：批量必填校验，并默认定位首个缺失字段
- `ctx.findRows(sheet, criteria)` / `ctx.findRow(sheet, criteria)`：查询项目数据表
- `ctx.fillForm(record, fieldMap?)`：把记录按映射回填到当前表单
- `ctx.nextSequence(sheet, column, options?)`：基于表格列生成下一编号
- `ctx.resetForm(options?)`：清空、保留或重设字段并准备下一条录入
- `ctx.evaluate(expression)`：执行受限表达式，不开放任意 JavaScript 全局对象

链式写法适合表达完整业务意图：

```ts
await ctx.table('employees').find({ 员工ID: ctx.value }).fillForm()

const check = await ctx.form.require(['姓名', '手机号']).focusFirstInvalid()
if (check.valid) {
  await ctx.flow('save_employee').run(ctx.form.values()).writeBack()
}
```

规则较简单时，可以点击「行为定义」中对应表单的“规则代码”实例，使用受控行为 DSL 或中文业务语句生成联动。编译器只接受已定义的条件、计算、校验和动作语法；无法识别的行会返回诊断，而不会作为任意脚本执行。

## 规则语法编辑器

每个表单的行为列表默认包含一个“规则代码”实例。点击该实例后，当前表单会成为编辑上下文，右侧打开 Monaco 规则编辑器：

每个实例都拥有独立的规则源码空间，初始内容为空。源码会随表单行为文件保存，空白表单不需要先创建脚本行为。

- 关键字、动作、字段引用和字符串会显示语法高亮
- 语法错误会直接标记到对应行，并在右侧显示编译诊断
- 按 `Ctrl+Space` 查看完整 Suggestion
- Suggestion 包含规则骨架、条件动作、当前表单字段、控件 ID、数据表和流程
- 编辑器上方提供常用模板；右侧的字段、控件、数据表和流程清单可快速插入
- “业务语言辅助输入”可把受支持的中文描述转换成结构化规则

应用规则后会写入当前表单控件的 `linkageRules`，可回到表单设计器的事件属性继续可视化编辑。

完整 grammar、运算符反向语义、动作参数和 lint 编号见 [FormFlow 规则语法 Reference](./behavior-rule-syntax.md)。

### 规则结构

```text
# 条件与否则分支
when $部门 == "技术部" -> show(@tech-stack); require($技术栈)
else -> hide(@tech-stack); clear($技术栈)

# 计算字段；括号中列出监听字段
compute $合计 = $数量 * $单价 watch($数量, $单价)

# 字段变化
on change($省份) -> options($城市, "city_table", "省份", $省份)

# 生命周期
on load -> set($状态, "草稿")
before submit -> require($姓名, $手机号)
on submit -> message("提交完成", success)
```

### 条件与引用

- 比较运算：`==`、`!=`、`>`、`<`、`>=`、`<=`、`contains`、`not contains`、`starts with`、`not starts with`、`ends with`、`not ends with`
- 空值判断：`is empty`、`is not empty`
- 字段表达式：`$数量` 或 `$form.数量`
- 字符串使用单引号或双引号；数字和布尔值可直接书写
- `#` 后的内容为行注释

### 动作

- 控件状态：`show(@控件)`、`hide(@控件)`、`enable(@控件)`、`disable(@控件)`
- 字段状态：`require($字段)`、`optional($字段)`、`clear($字段)`
- 赋值：`set($字段, 值或表达式)`
- 消息：`message("内容", info|success|warning|error)`
- 流程：`run("流程ID")`；`run()` 运行当前配置流程
- 级联选项：`options($目标字段, "数据表ID", "筛选字段", 筛选值)`

一行用分号组合多个动作，逗号只分隔函数参数。`else` 必须紧跟在要反转的 `when` 规则之后。

## 流程参数变量

控件事件触发流程时，可在参数映射中使用：

- `$value`
- `$field`
- `$event`
- `$values`
- `$formData`
- `$originalValues`
- `$component`
- `$componentId`
- `$detail`
- `$previousValue`
- `$timestamp`
- `$dirty`
- `$changedFields`
- `$context`

## 事件索引

行为脚本事件包括：

- `onFormLoad`
- `onRowLoad`
- `onFieldChange`
- `onFieldBlur`
- `onFieldFocus`
- `onButtonClick`
- `onValidate`
- `onSubmit`
- `onSubmitSuccess`
- `onSubmitError`
- `onFormReady`
- `onFormReset`
- `onBeforeSubmit`
- `onFieldKeyDown`
- `onFieldPaste`
- `onFieldClear`
- `onRowAdd`
- `onRowDelete`
- `onRowSelect`
- `onDataImport`
- `onDataExport`
- `onValueChange`

控件运行时事件包括：

- `onChange`
- `onBlur`
- `onFocus`
- `onClick`
- `onSubmit`
- `onReset`
- `onTabChange`
- `onRowClick`
- `onDrop`

## 使用建议

- 边写脚本边查字段时，优先看行为页右侧 `Reference`
- 简单显隐、必填、清空、计算和级联优先使用「规则语法」；需要异步逻辑、复杂分支或自定义 API 时使用「脚本代码」
- 需要完整 detail 结构、示例代码和相关事件时，跳到项目内文档页
- 事件说明、编辑器提示、文档页都共用一份元数据；如果要扩展新事件，优先补统一元数据源
