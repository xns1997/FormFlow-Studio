import type { DesignComponent, SrcTableEntry, WorkflowFile } from '../../project/types';
import { diagnoseForm, findUnrepresentedColumns } from './formDiagnostics';

const FIELD_TYPES = new Set(['input', 'textarea', 'number', 'datePicker', 'dateRange', 'timePicker', 'switch', 'select', 'checkbox', 'radio', 'rating', 'slider', 'tagInput']);

export type GeneratedTestCategory = 'normal' | 'required' | 'boundary' | 'type' | 'enum' | 'key' | 'linkage';

export interface GeneratedFormTest {
  id: string;
  name: string;
  category: GeneratedTestCategory;
  values: Record<string, unknown>;
  expectValid: boolean;
  focusFields: string[];
}

export interface GeneratedTestResult extends GeneratedFormTest {
  passed: boolean;
  actualValid: boolean;
  errors: string[];
}

function fieldOf(component: DesignComponent) {
  return String(component.fieldBinding || component.props?.name || '').trim();
}

function optionsOf(component: DesignComponent) {
  const options = Array.isArray(component.props?.options) ? component.props.options : [];
  return options.map((item: any) => typeof item === 'object' && item ? item.value ?? item.label : item).filter((item: unknown) => item != null);
}

function normalValue(component: DesignComponent): unknown {
  const configured = component.props?.defaultValue;
  if (configured !== undefined && configured !== null && configured !== '') return configured;
  const option = optionsOf(component)[0];
  if (option !== undefined) return component.type === 'checkbox' ? [option] : option;
  if (component.type === 'number' || component.type === 'rating' || component.type === 'slider') return Number(component.props?.min ?? 1);
  if (component.type === 'switch') return true;
  if (component.type === 'datePicker') return '2026-01-15';
  if (component.type === 'dateRange') return ['2026-01-01', '2026-01-15'];
  if (component.type === 'tagInput' || component.type === 'checkbox') return ['示例'];
  return `${fieldOf(component) || '字段'}示例`;
}

function empty(value: unknown) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

export function validateGeneratedValues(components: DesignComponent[], values: Record<string, unknown>) {
  const errors: string[] = [];
  for (const component of components.filter((item) => FIELD_TYPES.has(item.type))) {
    const field = fieldOf(component);
    if (!field) continue;
    const value = values[field];
    if (component.props?.required && empty(value)) { errors.push(`${field} 为必填项`); continue; }
    if (empty(value)) continue;
    if (['number', 'rating', 'slider'].includes(component.type) && (typeof value !== 'number' || !Number.isFinite(value))) errors.push(`${field} 必须是数字`);
    const numeric = typeof value === 'number' ? value : Number(value);
    if (component.props?.min != null && Number.isFinite(numeric) && numeric < Number(component.props.min)) errors.push(`${field} 小于最小值`);
    if (component.props?.max != null && Number.isFinite(numeric) && numeric > Number(component.props.max)) errors.push(`${field} 大于最大值`);
    if (component.props?.minLength != null && String(value).length < Number(component.props.minLength)) errors.push(`${field} 长度不足`);
    if (component.props?.maxLength != null && String(value).length > Number(component.props.maxLength)) errors.push(`${field} 长度超限`);
    if (component.props?.pattern) {
      try { if (!new RegExp(String(component.props.pattern)).test(String(value))) errors.push(`${field} 格式不正确`); } catch { errors.push(`${field} 正则配置无效`); }
    }
    const options = optionsOf(component);
    if (options.length && !Array.isArray(value) && !options.some((item) => String(item) === String(value))) errors.push(`${field} 不在选项中`);
  }
  return { valid: errors.length === 0, errors };
}

export function generateFormTestCases(components: DesignComponent[], tables: SrcTableEntry[] = []): GeneratedFormTest[] {
  const fields = components.filter((item) => FIELD_TYPES.has(item.type) && fieldOf(item));
  const base = Object.fromEntries(fields.map((component) => [fieldOf(component), normalValue(component)]));
  const cases: GeneratedFormTest[] = [{ id: 'normal', name: '正常填写', category: 'normal', values: base, expectValid: true, focusFields: fields.map(fieldOf) }];
  const required = fields.filter((item) => item.props?.required);
  if (required.length) cases.push({ id: 'required-empty', name: '必填字段为空', category: 'required', values: { ...base, ...Object.fromEntries(required.map((item) => [fieldOf(item), ''])) }, expectValid: false, focusFields: required.map(fieldOf) });
  for (const component of fields) {
    const field = fieldOf(component);
    if (component.props?.min != null) {
      cases.push({ id: `boundary-min:${field}`, name: `${field} 最小边界`, category: 'boundary', values: { ...base, [field]: Number(component.props.min) }, expectValid: true, focusFields: [field] });
      cases.push({ id: `below-min:${field}`, name: `${field} 低于下限`, category: 'boundary', values: { ...base, [field]: Number(component.props.min) - 1 }, expectValid: false, focusFields: [field] });
    }
    if (component.props?.max != null) {
      cases.push({ id: `boundary-max:${field}`, name: `${field} 最大边界`, category: 'boundary', values: { ...base, [field]: Number(component.props.max) }, expectValid: true, focusFields: [field] });
      cases.push({ id: `above-max:${field}`, name: `${field} 超过上限`, category: 'boundary', values: { ...base, [field]: Number(component.props.max) + 1 }, expectValid: false, focusFields: [field] });
    }
    if (['number', 'rating', 'slider'].includes(component.type)) cases.push({ id: `wrong-type:${field}`, name: `${field} 错误类型`, category: 'type', values: { ...base, [field]: '不是数字' }, expectValid: false, focusFields: [field] });
    if (optionsOf(component).length) cases.push({ id: `enum-outside:${field}`, name: `${field} 枚举外值`, category: 'enum', values: { ...base, [field]: '__不存在的选项__' }, expectValid: false, focusFields: [field] });
    const linkageRules = component.props?.linkageRules as Record<string, unknown[]> | undefined;
    if (linkageRules && Object.values(linkageRules).some((rules) => Array.isArray(rules) && rules.length)) {
      cases.push({ id: `linkage-true:${field}`, name: `${field} 联动真分支`, category: 'linkage', values: { ...base, [field]: normalValue(component) }, expectValid: true, focusFields: [field] });
      cases.push({ id: `linkage-false:${field}`, name: `${field} 联动假分支`, category: 'linkage', values: { ...base, [field]: '__不匹配__' }, expectValid: true, focusFields: [field] });
    }
  }
  for (const table of tables) for (const sheet of table.sheets) for (const keyField of sheet.config?.keyFields || []) {
    const existing = sheet.preview.find((row) => row[keyField] != null)?.[keyField];
    if (existing != null && keyField in base) cases.push({ id: `duplicate-key:${table.id}:${sheet.name}:${keyField}`, name: `${keyField} 主键重复`, category: 'key', values: { ...base, [keyField]: existing }, expectValid: false, focusFields: [keyField] });
  }
  return cases;
}

export function runGeneratedFormTests(components: DesignComponent[], tests: GeneratedFormTest[], tables: SrcTableEntry[] = []): GeneratedTestResult[] {
  return tests.map((item) => {
    const validation = validateGeneratedValues(components, item.values);
    const duplicate = item.category === 'key' && tables.some((table) => table.sheets.some((sheet) => (sheet.config?.keyFields || []).some((key) => item.focusFields.includes(key) && sheet.preview.some((row) => row[key] === item.values[key]))));
    const actualValid = validation.valid && !duplicate;
    return { ...item, actualValid, passed: actualValid === item.expectValid, errors: duplicate ? [...validation.errors, '主键值已存在'] : validation.errors };
  });
}

export function buildDevelopmentQuality(components: DesignComponent[], tables: SrcTableEntry[], workflows: WorkflowFile[]) {
  const diagnostics = diagnoseForm(components, tables, workflows);
  const tests = generateFormTestCases(components, tables);
  const results = runGeneratedFormTests(components, tests, tables);
  const missing = findUnrepresentedColumns(components, tables);
  const fieldCount = components.filter((item) => FIELD_TYPES.has(item.type)).length;
  const boundCount = components.filter((item) => FIELD_TYPES.has(item.type) && !!fieldOf(item)).length;
  const linkageCount = components.reduce((sum, item) => sum + Object.values((item.props?.linkageRules || {}) as Record<string, unknown[]>).reduce((count, rules) => count + (Array.isArray(rules) ? rules.length : 0), 0), 0);
  const failedTests = results.filter((item) => !item.passed);
  const blockers = [
    ...diagnostics.filter((item) => item.severity === 'error').map((item) => item.title),
    ...(fieldCount === 0 ? ['表单还没有可填写字段'] : []),
    ...failedTests.map((item) => `自动测试失败：${item.name}`),
  ];
  const tasks = [
    { id: 'data', label: '数据', summary: `${tables.reduce((sum, table) => sum + table.sheets.reduce((n, sheet) => n + sheet.headers.length, 0), 0)} 个字段，${tables.reduce((sum, table) => sum + table.sheets.filter((sheet) => (sheet.config?.keyFields || []).length === 0).length, 0)} 张表待确认主键`, ready: tables.length > 0 },
    { id: 'form', label: '表单', summary: `${boundCount}/${fieldCount} 个字段已命名，${missing.length} 个数据字段可补齐`, ready: fieldCount > 0 && boundCount === fieldCount },
    { id: 'rules', label: '规则', summary: `${linkageCount} 条联动，${diagnostics.length} 条诊断`, ready: diagnostics.every((item) => item.severity !== 'error') },
    { id: 'flows', label: '流程', summary: `${workflows.length} 个流程，${workflows.reduce((sum, item) => sum + item.nodes.length, 0)} 个节点`, ready: workflows.length > 0 },
    { id: 'tests', label: '测试', summary: `${results.filter((item) => item.passed).length}/${results.length} 个场景通过`, ready: failedTests.length === 0 && results.length > 0 },
  ];
  return { diagnostics, tests, results, blockers, tasks, readyToPublish: blockers.length === 0, coverage: results.length ? Math.round(results.filter((item) => item.passed).length / results.length * 100) : 0 };
}
