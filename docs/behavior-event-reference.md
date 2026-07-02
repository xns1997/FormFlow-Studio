# 行为事件与上下文 Reference

这份文档对应项目内的行为文档页，覆盖两类事件：

- 行为脚本事件：`onFormLoad`、`onFieldChange`、`onSubmit`、`onSubmitSuccess` 等
- 控件运行时事件：`onChange`、`onBlur`、`onClick`、`onSubmit`、`onDrop` 等

项目内入口：

- 文档首页：`/docs`
- 上下文总览：`/docs/context-reference`
- 流程参数 reference：`/docs/flow-parameter-reference`
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
- 需要完整 detail 结构、示例代码和相关事件时，跳到项目内文档页
- 事件说明、编辑器提示、文档页都共用一份元数据；如果要扩展新事件，优先补统一元数据源
