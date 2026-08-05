// 行为模板库 — 常见场景预置模板

export interface BehaviorTemplate {
  id: string;
  name: string;
  description: string;
  category: '联动' | '计算' | '校验' | '查询' | '提交' | 'UI';
  event: string;
  code: string;
  fields?: string[]; // 涉及的字段名示例
}

/** 行为模板列表（常用规则场景）。 */
export const BEHAVIOR_TEMPLATES: BehaviorTemplate[] = [
  // ── 联动 ──────────────────────────────────────────
  {
    id: 'tpl_field_visibility',
    name: '字段显隐联动',
    description: '当某个字段值变化时，显示或隐藏另一个字段',
    category: '联动',
    event: 'onFieldChange',
    code: `// 字段显隐联动
// 当「部门」为"技术部"时显示「技术栈」字段
const dept = ctx.getValue('部门');
ctx.setVisible('技术栈', dept === '技术部');`,
    fields: ['部门', '技术栈'],
  },
  {
    id: 'tpl_options_cascade',
    name: '下拉选项联动',
    description: '根据父级选择动态设置子级选项',
    category: '联动',
    event: 'onFieldChange',
    code: `// 下拉选项联动
// 根据「省份」设置「城市」选项
const province = ctx.getValue('省份');
const cityOptions = {
  '广东': ['广州', '深圳', '东莞'],
  '浙江': ['杭州', '宁波', '温州'],
  '江苏': ['南京', '苏州', '无锡'],
};
const options = cityOptions[province] || [];
ctx.setValue('城市', options[0] || '');
// 注意：动态选项需要配合控件事件处理`,
    fields: ['省份', '城市'],
  },
  {
    id: 'tpl_options_table_cascade',
    name: '数据表级联选项',
    description: '根据父字段值，从项目数据表生成子字段选项',
    category: '联动',
    event: 'onFieldChange',
    code: `// 数据表级联选项
// 适合在联动规则里使用 setOptions 图形化配置，这里保留脚本示例
const dept = ctx.getValue('部门');
await ctx.debug('建议使用联动规则 → 刷新选项', { source: 'table', field: '岗位', dept });`,
    fields: ['部门', '岗位'],
  },
  {
    id: 'tpl_options_range_cascade',
    name: '数据范围级联选项',
    description: '根据父字段值，从已选数据范围生成子字段选项',
    category: '联动',
    event: 'onFieldChange',
    code: `// 数据范围级联选项
// 适合在联动规则里使用 setOptions 图形化配置，这里保留脚本示例
const category = ctx.getValue('一级分类');
await ctx.debug('建议使用联动规则 → 刷新选项', { source: 'range', field: '二级分类', category });`,
    fields: ['一级分类', '二级分类'],
  },
  {
    id: 'tpl_options_clear_downstream',
    name: '切换后清空下游字段',
    description: '父字段切换后清空子字段，避免保留无效旧值',
    category: '联动',
    event: 'onFieldChange',
    code: `// 切换后清空下游字段
await ctx.setValue('城市', '');
await ctx.setValue('区县', '');`,
    fields: ['省份', '城市', '区县'],
  },
  {
    id: 'tpl_date_start_end_guard',
    name: '开始结束日期联动',
    description: '开始日期变化后，若结束日期早于开始日期则清空并提示',
    category: '联动',
    event: 'onFieldChange',
    code: `// 开始结束日期联动
const start = ctx.getValue('开始日期');
const end = ctx.getValue('结束日期');
if (start && end && new Date(String(end)).getTime() < new Date(String(start)).getTime()) {
  await ctx.setValue('结束日期', '');
  await ctx.showMessage('结束日期不能早于开始日期，已清空失效值', 'warning');
}`,
    fields: ['开始日期', '结束日期'],
  },
  {
    id: 'tpl_date_deadline_after_today',
    name: '截止日期默认 +7 天',
    description: '表单加载时设置截止日期默认值，并要求不早于今天',
    category: '联动',
    event: 'onFormLoad',
    code: `// 截止日期默认 +7 天
const now = new Date();
const nextWeek = new Date(now.getTime() + 7 * 86400000);
await ctx.setValue('截止日期', ctx.getValue('截止日期') || nextWeek.toISOString().slice(0, 10));`,
    fields: ['截止日期'],
  },
  {
    id: 'tpl_date_week_range',
    name: '本周起止区间',
    description: '表单加载时自动填充本周的开始和结束日期',
    category: '联动',
    event: 'onFormLoad',
    code: `// 本周起止区间
const now = new Date();
const weekday = now.getDay() || 7;
const monday = new Date(now.getTime() - (weekday - 1) * 86400000);
const sunday = new Date(monday.getTime() + 6 * 86400000);
await ctx.setValue('开始日期', ctx.getValue('开始日期') || monday.toISOString().slice(0, 10));
await ctx.setValue('结束日期', ctx.getValue('结束日期') || sunday.toISOString().slice(0, 10));`,
    fields: ['开始日期', '结束日期'],
  },
  {
    id: 'tpl_date_clear_downstream_booking',
    name: '日期切换清空预约时间',
    description: '切换日期后清空原本已经失效的预约时间/时段字段',
    category: '联动',
    event: 'onFieldChange',
    code: `// 日期切换清空预约时间
await ctx.setValue('预约时间', '');
await ctx.showMessage('日期已变更，请重新选择预约时间', 'info');`,
    fields: ['预约日期', '预约时间'],
  },
  {
    id: 'tpl_disable_conditional',
    name: '条件禁用字段',
    description: '满足条件时禁用某些字段',
    category: '联动',
    event: 'onFieldChange',
    code: `// 条件禁用字段
// 当「状态」为"已完成"时禁用编辑
const status = ctx.getValue('状态');
const isDone = status === '已完成';
ctx.setDisabled('备注', isDone);
ctx.setDisabled('评分', !isDone);`,
    fields: ['状态', '备注', '评分'],
  },

  // ── 计算 ──────────────────────────────────────────
  {
    id: 'tpl_auto_multiply',
    name: '自动乘法计算',
    description: '两个字段相乘自动填充结果',
    category: '计算',
    event: 'onFieldChange',
    code: `// 自动乘法计算
// 总价 = 单价 × 数量
const price = Number(ctx.getValue('单价')) || 0;
const qty = Number(ctx.getValue('数量')) || 0;
ctx.setValue('总价', Math.round(price * qty * 100) / 100);`,
    fields: ['单价', '数量', '总价'],
  },
  {
    id: 'tpl_salary_calc',
    name: '薪资计算',
    description: '根据基本工资和绩效自动计算奖金和总薪酬',
    category: '计算',
    event: 'onFieldChange',
    code: `// 薪资计算
const salary = Number(ctx.getValue('薪资')) || 0;
const perf = Number(ctx.getValue('绩效评分')) || 0;
const bonusRate = perf >= 90 ? 0.2 : perf >= 70 ? 0.1 : 0.05;
const bonus = Math.round(salary * bonusRate * 100) / 100;
ctx.setValue('奖金', bonus);
ctx.setValue('总薪酬', salary + bonus);`,
    fields: ['薪资', '绩效评分', '奖金', '总薪酬'],
  },
  {
    id: 'tpl_date_diff',
    name: '日期差值计算',
    description: '计算两个日期之间的天数差',
    category: '计算',
    event: 'onFieldChange',
    code: `// 日期差值计算
const start = ctx.getValue('开始日期');
const end = ctx.getValue('结束日期');
if (start && end) {
  const diff = Math.ceil(
    (new Date(String(end)).getTime() - new Date(String(start)).getTime()) / 86400000
  );
  ctx.setValue('天数', diff);
}`,
    fields: ['开始日期', '结束日期', '天数'],
  },

  // ── 校验 ──────────────────────────────────────────
  {
    id: 'tpl_conditional_validate',
    name: '条件校验',
    description: '满足特定条件时才进行校验',
    category: '校验',
    event: 'onFieldBlur',
    code: `// 条件校验
// 年龄 >= 18 才允许填写「驾照号」
const age = Number(ctx.getValue('年龄')) || 0;
const license = ctx.getValue('驾照号');
if (age < 18 && license) {
  ctx.showMessage('未满18岁不能填写驾照号', 'error');
  ctx.setValue('驾照号', '');
}`,
    fields: ['年龄', '驾照号'],
  },
  {
    id: 'tpl_submit_validate',
    name: '提交前校验',
    description: '提交前检查必填字段和业务规则',
    category: '校验',
    event: 'onSubmit',
    code: `// 提交前校验
const name = ctx.getValue('姓名');
const phone = ctx.getValue('手机号');
if (!name) {
  ctx.showMessage('请填写姓名', 'error');
  return;
}
if (!/^1\\d{10}$/.test(String(phone || ''))) {
  ctx.showMessage('手机号格式不正确', 'error');
  return;
}
ctx.showMessage('校验通过', 'success');`,
    fields: ['姓名', '手机号'],
  },

  // ── 查询 ──────────────────────────────────────────
  {
    id: 'tpl_query_sheet',
    name: '查询数据表',
    description: '根据字段值查询数据表中的其他信息',
    category: '查询',
    event: 'onFieldChange',
    code: `// 查询数据表
// 根据「工号」查询员工信息
const empId = ctx.getValue('工号');
if (empId) {
  const row = ctx.findRow('员工信息', { '工号': empId }, { strictUnique: false });
  if (row) {
    await ctx.fillForm(row, { '姓名': '姓名', '部门': '部门' });
    await ctx.showMessage('已自动填充员工信息', 'info');
  }
}`,
    fields: ['工号', '姓名', '部门'],
  },

  // ── 提交 ──────────────────────────────────────────
  {
    id: 'tpl_format_before_submit',
    name: '提交前格式化',
    description: '提交前自动格式化数据',
    category: '提交',
    event: 'onSubmit',
    code: `// 提交前格式化
const phone = String(ctx.getValue('手机号') || '').replace(/\\D/g, '');
ctx.setValue('手机号', phone);
const name = String(ctx.getValue('姓名') || '').trim();
ctx.setValue('姓名', name);
ctx.showMessage('数据已格式化', 'info');`,
    fields: ['手机号', '姓名'],
  },
  {
    id: 'tpl_default_values',
    name: '表单加载默认值',
    description: '表单加载时自动填充默认值',
    category: '提交',
    event: 'onFormLoad',
    code: `// 表单加载默认值
const today = new Date().toISOString().slice(0, 10);
await ctx.resetForm({
  defaults: {
    创建日期: ctx.getValue('创建日期') || today,
    状态: ctx.getValue('状态') || '待处理',
  },
});`,
    fields: ['创建日期', '状态'],
  },
  {
    id: 'tpl_crud_require_fields',
    name: 'CRUD 必填校验',
    description: '提交前用 requireFields 一次性检查多个字段',
    category: '校验',
    event: 'onSubmit',
    code: `// CRUD 必填校验
const check = await ctx.requireFields(['姓名', '手机号', '状态']);
if (!check.valid) return;`,
    fields: ['姓名', '手机号', '状态'],
  },
  {
    id: 'tpl_crud_next_sequence',
    name: 'CRUD 自动编号',
    description: '生成当前数据表的下一个编号并写回表单',
    category: '提交',
    event: 'onFormLoad',
    code: `// CRUD 自动编号
const nextId = ctx.nextSequence('employees', '员工ID', { start: 1000 });
await ctx.setValue('员工ID', nextId);`,
    fields: ['员工ID'],
  },
  {
    id: 'tpl_crud_reset_form',
    name: 'CRUD 提交后重置',
    description: '提交成功后清空字段、重写默认值并聚焦首字段',
    category: '提交',
    event: 'onSubmitSuccess',
    code: `// CRUD 提交后重置
const nextId = ctx.nextSequence('employees', '员工ID', { start: 1000 });
await ctx.resetForm({
  clearFields: ['姓名', '手机号', '备注'],
  defaults: { 员工ID: nextId, 状态: '草稿' },
  focusField: '姓名',
  message: '表单已重置，可继续录入。',
});`,
    fields: ['员工ID', '姓名', '手机号', '备注', '状态'],
  },

  // ── UI ──────────────────────────────────────────
  {
    id: 'tpl_submit_message',
    name: '提交成功提示',
    description: '提交成功后显示自定义提示',
    category: 'UI',
    event: 'onSubmitSuccess',
    code: `// 提交成功提示
ctx.showMessage('提交成功！数据已保存。', 'success');`,
    fields: [],
  },
  {
    id: 'tpl_row_change_log',
    name: '行切换日志',
    description: '切换数据行时记录日志',
    category: 'UI',
    event: 'onRowLoad',
    code: `// 行切换日志
const name = ctx.getValue('姓名') || '未知';
ctx.showMessage(\`已加载: \${name}\`, 'info');`,
    fields: ['姓名'],
  },
];

/** 按分类分组行为模板。 */
export function getTemplatesByCategory(): Record<string, BehaviorTemplate[]> {
  const grouped: Record<string, BehaviorTemplate[]> = {};
  for (const tpl of BEHAVIOR_TEMPLATES) {
    (grouped[tpl.category] = grouped[tpl.category] || []).push(tpl);
  }
  return grouped;
}
