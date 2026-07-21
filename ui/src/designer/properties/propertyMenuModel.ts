import type { DesignComponent } from '../../project/types';
import { buildPropertyDependencyGraph, findPropertyDependencyCycles } from '../../services/engine/propertyDependencies';
import { evaluatePropertyExpression } from '../../services/engine/propertyExpression';
import { isCompositePropDef, type PropertyDiagnostic, type PropertyGroupDescriptor, type PropertySection, type PropertyStatus, type PropertyTaskId, type PropSchemaEntry } from '../types';
import { getPropertyEditorDescriptor, resolvePropertyEditorKind, type PropertyEditorContext, type PropertyFieldDescriptor } from './propertyEditorRegistry';

const GROUPS: Record<string, PropertyGroupDescriptor> = {
  basic: { id: 'basic', label: '基础', section: 'function', task: 'content', order: 10, defaultOpen: true },
  footer: { id: 'footer', label: '底部', section: 'function', task: 'content', order: 15 },
  validation: { id: 'validation', label: '校验', section: 'function', task: 'validation', order: 20, defaultOpen: true },
  numberRange: { id: 'number-range', label: '数值范围', section: 'function', task: 'validation', order: 25 },
  data: { id: 'data', label: '数据', section: 'function', task: 'data', order: 30 },
  metrics: { id: 'metrics', label: '维度/指标', section: 'function', task: 'data', order: 35 },
  binding: { id: 'binding', label: '数据源', section: 'function', task: 'binding', order: 40 },
  logic: { id: 'logic', label: '表达式', section: 'function', task: 'logic', order: 50 },
  textStyle: { id: 'text-style', label: '文本样式', section: 'style', task: 'appearance', order: 10, defaultOpen: true },
  appearance: { id: 'appearance', label: '样式', section: 'style', task: 'effects', order: 15, defaultOpen: true },
  size: { id: 'size', label: '尺寸', section: 'style', task: 'layout', order: 20 },
  advanced: { id: 'advanced', label: '高级', section: 'style', task: 'layout', order: 25 },
  format: { id: 'format', label: '格式', section: 'style', task: 'format', order: 30 },
  animation: { id: 'animation', label: '动画', section: 'style', task: 'format', order: 35 },
};

const LEGACY_GROUPS: Record<string, keyof typeof GROUPS> = {
  '基础': 'basic', '底部': 'footer', '校验': 'validation', '数值范围': 'numberRange', '数据': 'data', '维度/指标': 'metrics',
  '数据源': 'binding', '表达式': 'logic', '文本样式': 'textStyle', '样式': 'appearance', '尺寸': 'size', '高级': 'advanced', '格式': 'format', '动画': 'animation',
};

export const PROPERTY_TASKS: Record<PropertyTaskId, { label: string; section: PropertySection; order: number }> = {
  content: { label: '内容与字段', section: 'function', order: 10 },
  validation: { label: '校验规则', section: 'function', order: 20 },
  data: { label: '数据与选项', section: 'function', order: 30 },
  binding: { label: '数据绑定', section: 'function', order: 40 },
  logic: { label: '动态逻辑', section: 'function', order: 50 },
  events: { label: '交互与事件', section: 'function', order: 60 },
  appearance: { label: '字体与颜色', section: 'style', order: 10 },
  effects: { label: '外观效果', section: 'style', order: 15 },
  layout: { label: '尺寸与布局', section: 'style', order: 20 },
  format: { label: '格式与动画', section: 'style', order: 30 },
  other: { label: '其他', section: 'function', order: 90 },
};

export function resolvePropertyGroup(def: PropSchemaEntry): PropertyGroupDescriptor {
  const raw = def.group || '基础';
  const known = GROUPS[raw] || GROUPS[LEGACY_GROUPS[raw]];
  if (known) return { ...known, section: def.section || known.section, task: def.task || known.task, order: def.order ?? known.order };
  return { id: `other-${raw}`, label: raw, section: def.section || 'function', task: def.task || 'other', order: def.order ?? 90 };
}

export function deepEqualPropertyValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => deepEqualPropertyValue(item, right[index]));
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left as object).sort(); const rightKeys = Object.keys(right as object).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && deepEqualPropertyValue((left as any)[key], (right as any)[key]));
  }
  return false;
}

export function getPropertyValue(def: PropSchemaEntry, values: Record<string, unknown>, component?: DesignComponent) {
  if (isCompositePropDef(def)) return Object.fromEntries(def.keys.map((key) => [key, values[key]]));
  if (def.target === 'geometry' && component) return component[def.key as 'x' | 'y' | 'width' | 'height'];
  return values[def.key];
}

export function getPropertyDefaultValue(def: PropSchemaEntry, defaults: Record<string, unknown>, component?: DesignComponent, defaultSize?: { w: number; h: number }) {
  if (isCompositePropDef(def)) return Object.fromEntries(def.keys.map((key) => [key, defaults[key]]));
  if (def.target === 'geometry') {
    if (def.key === 'width') return defaultSize?.w;
    if (def.key === 'height') return defaultSize?.h;
    return def.key === 'x' || def.key === 'y' ? 0 : component?.[def.key as 'x'];
  }
  return defaults[def.key] ?? def.default;
}

function schemaDiagnostic(def: PropSchemaEntry, value: unknown): PropertyDiagnostic | null {
  if (isCompositePropDef(def) || !def.validation) return null;
  const rule = def.validation; const text = String(value ?? ''); let message = '';
  if (rule.required && !text) message = rule.message || '此项不能为空';
  else if (rule.minLength !== undefined && text.length < rule.minLength) message = rule.message || `至少 ${rule.minLength} 个字符`;
  else if (rule.maxLength !== undefined && text.length > rule.maxLength) message = rule.message || `最多 ${rule.maxLength} 个字符`;
  else if (rule.min !== undefined && Number(value) < rule.min) message = rule.message || `不能小于 ${rule.min}`;
  else if (rule.max !== undefined && Number(value) > rule.max) message = rule.message || `不能大于 ${rule.max}`;
  else if (rule.pattern && text) { try { if (!new RegExp(rule.pattern).test(text)) message = rule.message || '格式不正确'; } catch { message = '校验表达式无效'; } }
  return message ? { severity: 'error', message, key: def.key } : null;
}

export function getPropertyStatus(args: { def: PropSchemaEntry; values: Record<string, unknown>; defaults: Record<string, unknown>; component: DesignComponent; components: DesignComponent[]; defaultSize: { w: number; h: number }; fields?: string[]; fieldCatalog?: PropertyFieldDescriptor[] }): PropertyStatus {
  const { def, values, defaults, component, components, defaultSize } = args;
  const value = getPropertyValue(def, values, component); const defaultValue = getPropertyDefaultValue(def, defaults, component, defaultSize);
  const diagnostics: PropertyDiagnostic[] = [];
  const schemaError = schemaDiagnostic(def, value); if (schemaError) diagnostics.push(schemaError);
  const context = { def, value, values, defaultValue, defaultValues: defaults, component, components, fields: args.fields || [], fieldCatalog: args.fieldCatalog, onChange: () => {}, onPatch: () => {} } satisfies PropertyEditorContext;
  const empty = value === undefined || value === null || value === '';
  if (!empty) {
    const error = getPropertyEditorDescriptor(resolvePropertyEditorKind(def))?.validate?.(value, context);
    if (error) diagnostics.push({ severity: 'error', message: error, key: def.key });
  }
  if (!isCompositePropDef(def) && def.editor === 'field-path' && value && !(args.fieldCatalog || []).some((field) => field.path === value)) diagnostics.push({ severity: 'warning', message: `字段“${String(value)}”不在当前字段目录中`, key: def.key });
  if (!isCompositePropDef(def) && (def.editor === 'expression' || def.editor === 'template') && typeof value === 'string' && value.trim()) {
    const expression = def.editor === 'template' ? value.replace(/{{\s*([^}]+)\s*}}/g, '$1') : value;
    const result = evaluatePropertyExpression(expression, { form: Object.fromEntries((args.fields || []).map((field) => [field, 1])) });
    if (!result.ok) diagnostics.push({ severity: 'error', message: result.error || '表达式无效', key: def.key });
    const fieldName = String(component.fieldBinding || values.name || '');
    if (fieldName && findPropertyDependencyCycles(buildPropertyDependencyGraph(components)).some((cycle) => cycle.includes(fieldName))) diagnostics.push({ severity: 'error', message: '表达式存在循环依赖', key: def.key });
  }
  return { changed: !deepEqualPropertyValue(value, defaultValue), diagnostics };
}

export function propertyStatusLabel(statuses: PropertyStatus[]) {
  const errors = statuses.flatMap((status) => status.diagnostics).filter((item) => item.severity === 'error').length;
  const warnings = statuses.flatMap((status) => status.diagnostics).filter((item) => item.severity === 'warning').length;
  const changed = statuses.filter((status) => status.changed).length;
  if (errors || warnings) return `${errors ? `错误 ${errors}` : ''}${errors && warnings ? ' / ' : ''}${warnings ? `警告 ${warnings}` : ''}`;
  return changed ? `已修改 ${changed} 项` : '';
}
