export interface MethodParameter {
  name: string;
  label: string;
  placeholder: string;
  defaultValue: string;
}

export interface MethodLibraryEntry {
  id: string;
  name: string;
  description: string;
  parameters: MethodParameter[];
  preview: (params: Record<string, string>) => string;
  code: (params: Record<string, string>) => string;
  sample: (params: Record<string, string>) => unknown;
}

const list = (value: string) => value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
const quotedList = (value: string) => JSON.stringify(list(value));
const json = (value: string, fallback: unknown = {}) => { try { return JSON.parse(value); } catch { return fallback; } };

export const METHOD_LIBRARY: MethodLibraryEntry[] = [
  { id: 'setValues', name: '批量赋值', description: '一次写入多个表单字段。', parameters: [{ name: 'values', label: '字段和值（JSON）', placeholder: '{"姓名":"张三"}', defaultValue: '{"姓名":"张三"}' }], preview: (p) => `把 ${Object.keys(json(p.values)).join('、') || '指定字段'} 一次写入表单。`, code: (p) => `await ctx.setValues(${p.values || '{}'});`, sample: (p) => json(p.values) },
  { id: 'clearValues', name: '批量清空', description: '清空一组字段。', parameters: [{ name: 'fields', label: '字段', placeholder: '备注, 附件', defaultValue: '备注, 附件' }], preview: (p) => `清空 ${list(p.fields).join('、')}。`, code: (p) => `await ctx.clearValues(${quotedList(p.fields)});`, sample: (p) => Object.fromEntries(list(p.fields).map((field) => [field, ''])) },
  { id: 'setFieldState', name: '字段状态', description: '控制字段的显示、禁用或必填状态。', parameters: [{ name: 'field', label: '字段', placeholder: '技术栈', defaultValue: '技术栈' }, { name: 'state', label: '状态 JSON', placeholder: '{"visible":true,"required":true}', defaultValue: '{"visible":true,"required":true}' }], preview: (p) => `将 ${p.field} 设置为 ${p.state}。`, code: (p) => `await ctx.setFieldState(${JSON.stringify(p.field)}, ${p.state || '{}'});`, sample: (p) => ({ field: p.field, state: json(p.state) }) },
  { id: 'requireFields', name: '批量必填校验', description: '校验一组字段并定位首个错误。', parameters: [{ name: 'fields', label: '字段', placeholder: '姓名, 手机号', defaultValue: '姓名, 手机号' }], preview: (p) => `提交前要求 ${list(p.fields).join('、')} 必填，并定位首个错误。`, code: (p) => `await ctx.form.require(${quotedList(p.fields)}).focusFirstInvalid();`, sample: (p) => ({ required: list(p.fields), valid: false, firstInvalid: list(p.fields)[0] }) },
  { id: 'findRow', name: '查询记录', description: '从数据表查询一条记录。', parameters: [{ name: 'table', label: '数据表', placeholder: 'employees', defaultValue: 'employees' }, { name: 'criteria', label: '条件 JSON', placeholder: '{"员工ID":"E001"}', defaultValue: '{"员工ID":"E001"}' }], preview: (p) => `在 ${p.table} 中按 ${p.criteria} 查询一条记录。`, code: (p) => `const row = await ctx.table(${JSON.stringify(p.table)}).find(${p.criteria || '{}'});`, sample: (p) => ({ table: p.table, criteria: json(p.criteria), matched: true }) },
  { id: 'fillForm', name: '查询并回填', description: '查询数据后直接回填当前表单。', parameters: [{ name: 'table', label: '数据表', placeholder: 'employees', defaultValue: 'employees' }, { name: 'criteria', label: '条件 JSON', placeholder: '{"员工ID":"E001"}', defaultValue: '{"员工ID":"E001"}' }], preview: (p) => `查询 ${p.table} 并把命中记录回填表单。`, code: (p) => `await ctx.table(${JSON.stringify(p.table)}).find(${p.criteria || '{}'}).fillForm();`, sample: (p) => ({ filled: true, from: p.table, criteria: json(p.criteria) }) },
  { id: 'nextSequence', name: '自动编号', description: '按前缀生成下一编号。', parameters: [{ name: 'prefix', label: '前缀', placeholder: 'EMP-', defaultValue: 'EMP-' }, { name: 'width', label: '数字位数', placeholder: '4', defaultValue: '4' }], preview: (p) => `生成 ${p.prefix}${'0'.repeat(Math.max(0, Number(p.width || 4) - 1))}1 格式的下一编号。`, code: (p) => `const nextId = await ctx.nextSequence({ prefix: ${JSON.stringify(p.prefix)}, width: ${Number(p.width || 4)} });`, sample: (p) => `${p.prefix}${String(1).padStart(Number(p.width || 4), '0')}` },
  { id: 'resetForm', name: '重置并准备下一条', description: '清空表单并保留指定字段。', parameters: [{ name: 'keep', label: '保留字段', placeholder: '部门, 日期', defaultValue: '部门' }], preview: (p) => `重置表单，保留 ${list(p.keep).join('、') || '无'}。`, code: (p) => `await ctx.resetForm({ keep: ${quotedList(p.keep)} });`, sample: (p) => ({ reset: true, keep: list(p.keep) }) },
];

export function createMethodDefaults(entry: MethodLibraryEntry) {
  return Object.fromEntries(entry.parameters.map((item) => [item.name, item.defaultValue]));
}
