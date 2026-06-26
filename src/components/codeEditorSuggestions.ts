import type { CodeEditorSuggestion } from './CodeEditor';

export const ctxSuggestions: CodeEditorSuggestion[] = [
  { label: 'ctx.getValue', insertText: 'ctx.getValue(fieldId)', kind: 'Function', detail: '获取字段值', documentation: 'ctx.getValue(fieldId)' },
  { label: 'ctx.setValue', insertText: 'ctx.setValue(fieldId, value)', kind: 'Function', detail: '设置字段值', documentation: 'ctx.setValue(fieldId, val)' },
  { label: 'ctx.setVisible', insertText: 'ctx.setVisible(id, true)', kind: 'Function', detail: '显示或隐藏控件', documentation: 'ctx.setVisible(id, bool)' },
  { label: 'ctx.setDisabled', insertText: 'ctx.setDisabled(id, true)', kind: 'Function', detail: '启用或禁用控件', documentation: 'ctx.setDisabled(id, bool)' },
  { label: 'ctx.setRequired', insertText: 'ctx.setRequired(id, true)', kind: 'Function', detail: '设置字段必填', documentation: 'ctx.setRequired(id, bool)' },
  { label: 'ctx.showMessage', insertText: "ctx.showMessage('提示内容', 'info')", kind: 'Function', detail: '弹出提示', documentation: 'ctx.showMessage(msg, type)' },
  { label: 'ctx.validateField', insertText: 'ctx.validateField(id)', kind: 'Function', detail: '校验字段', documentation: 'ctx.validateField(id)' },
  { label: 'ctx.querySheet', insertText: 'ctx.querySheet(sheetId, filter)', kind: 'Function', detail: '查询数据表', documentation: 'ctx.querySheet(sheetId, f)' },
  { label: 'ctx.updateRow', insertText: 'ctx.updateRow(rowId, patch)', kind: 'Function', detail: '更新数据行', documentation: 'ctx.updateRow(rowId, patch)' },
  { label: 'ctx.submit', insertText: 'ctx.submit()', kind: 'Function', detail: '提交当前表单', documentation: 'ctx.submit()' },
];

export const jsonSuggestions: CodeEditorSuggestion[] = [
  { label: '{}', insertText: '{}', kind: 'Snippet', detail: '对象', documentation: '插入 JSON 对象' },
  { label: '[]', insertText: '[]', kind: 'Snippet', detail: '数组', documentation: '插入 JSON 数组' },
  { label: 'true', kind: 'Keyword', detail: '布尔值' },
  { label: 'false', kind: 'Keyword', detail: '布尔值' },
  { label: 'null', kind: 'Keyword', detail: '空值' },
];
