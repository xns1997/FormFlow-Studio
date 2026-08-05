/**
 * Component generation for form scaffold.
 *
 * Generates field components, sections, tabs, and action buttons.
 */
import type { InferredFormField } from '../fieldInference';
import type { DesignComponent, DataBindingConfig } from '../formScaffold';
import { SINGLE_LINE_FIELD_HEIGHT, fieldPosition } from './layoutPlanner';

function safeId(value: string) {
  const normalized = value.trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  let hash = 2166136261;
  for (const character of value) { hash ^= character.codePointAt(0) || 0; hash = Math.imul(hash, 16777619); }
  const suffix = (hash >>> 0).toString(36);
  return normalized && normalized === value.trim() ? normalized : `${normalized || 'field'}_${suffix}`;
}

function fieldBinding(path: string): DataBindingConfig {
  return { version: 1, source: { kind: 'formField', path }, direction: 'twoWay', valueMode: 'firstCell' };
}

/** 生成字段控件组件（含数据绑定与选项/默认值属性）。 */
export function fieldComponent(
  field: InferredFormField,
  index: number,
  columns: number,
  prefix: string,
  options: { readonly?: boolean; pageIndex?: number } = {},
): DesignComponent {
  const { x, y, width } = fieldPosition(index, columns);
  const height = field.controlType === 'textarea' ? 116 : SINGLE_LINE_FIELD_HEIGHT;
  const props: Record<string, unknown> = {
    name: field.name,
    label: field.label,
    required: field.required,
    readonly: options.readonly || field.readonly,
    placeholder: field.placeholder,
    dataBinding: fieldBinding(field.name),
  };
  if (field.options?.length) props.options = field.options;
  if (field.defaultValue !== undefined) props.defaultValue = field.defaultValue;
  if (options.pageIndex !== undefined) props.generatedPage = options.pageIndex;
  return {
    id: `${prefix}_field_${safeId(field.name)}`,
    type: field.controlType,
    x,
    y,
    width,
    height,
    zIndex: 2,
    fieldBinding: field.name,
    props,
  };
}

/** 生成分区标题组件（按分区数）。 */
export function sectionComponents(
  prefix: string,
  sectionCount: number,
  columns: number,
): DesignComponent[] {
  return Array.from({ length: sectionCount }, (_, index) => ({
    id: `${prefix}_section_${index + 1}`,
    type: 'text',
    x: 72,
    y: 104 + Math.floor((index * 8) / columns) * 92,
    width: 720,
    height: 24,
    zIndex: 1,
    props: {
      name: `${prefix}_section_${index + 1}`,
      content: `字段组 ${index + 1}`,
      fontSize: 14,
      fontWeight: 650,
      color: '#334155',
      generatedSection: true,
    },
  }));
}

/** 生成分页控件（页数 ≤1 时返回 null）。 */
export function tabsComponent(
  prefix: string,
  pageCount: number,
): DesignComponent | null {
  if (pageCount <= 1) return null;
  return {
    id: `${prefix}_pages`,
    type: 'tabs',
    x: 72,
    y: 76,
    width: 720,
    height: 48,
    zIndex: 2,
    props: {
      name: `${prefix}_pages`,
      tabs: Array.from({ length: pageCount }, (_, index) => `第 ${index + 1} 页`),
      defaultTab: 0,
      generatedPagination: true,
    },
  };
}

/** 生成状态文本组件（位于操作区上方）。 */
export function statusComponent(
  prefix: string,
  actionY: number,
): DesignComponent {
  return {
    id: `${prefix}_status`,
    type: 'text',
    x: 72,
    y: actionY - 8,
    width: 520,
    height: 28,
    zIndex: 2,
    fieldBinding: '_生成状态',
    props: {
      name: '_生成状态',
      content: '填写完成后保存',
      fontSize: 13,
      color: '#475569',
    },
  };
}

/** 生成保存按钮组件。 */
export function saveButtonComponent(
  prefix: string,
  actionY: number,
  purpose?: string,
): DesignComponent {
  return {
    id: `${prefix}_save`,
    type: 'button',
    x: 72,
    y: actionY + 32,
    width: 180,
    height: 48,
    zIndex: 3,
    props: {
      name: `${prefix}_save`,
      label: purpose === 'approval' ? '提交审批' : '校验并保存',
      variant: 'primary',
    },
  };
}

/** 生成重置按钮组件。 */
export function resetButtonComponent(
  prefix: string,
  actionY: number,
): DesignComponent {
  return {
    id: `${prefix}_reset`,
    type: 'button',
    x: 272,
    y: actionY + 32,
    width: 150,
    height: 48,
    zIndex: 3,
    props: {
      name: `${prefix}_reset`,
      label: '重置',
      variant: 'outline',
    },
  };
}

/** 生成查询/查找按钮组件。 */
export function lookupButtonComponent(
  prefix: string,
  actionY: number,
): DesignComponent {
  return {
    id: `${prefix}_lookup`,
    type: 'button',
    x: 442,
    y: actionY + 32,
    width: 150,
    height: 48,
    zIndex: 3,
    props: {
      name: `${prefix}_lookup`,
      label: '按主键查询',
      variant: 'outline',
    },
  };
}
