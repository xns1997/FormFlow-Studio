import type { DesignComponent } from '../project/types';
import type { ControlDef } from './types';

export { getPropertyEditor, registerPropertyEditor } from './properties/propertyEditorRegistry';

const controls = new Map<string, ControlDef>();
const categories = ['basic', 'select', 'container', 'display'] as const;

function inferPropertyContract(def: ControlDef) {
  const result = { ...(def.propertyContract || {}) };
  const validationKeys = new Set(['required', 'readonly', 'disabled', 'validator', 'pattern', 'patternMessage', 'customMessage', 'validationRules', 'minLength', 'maxLength', 'minSelect', 'maxSelect', 'integer', 'positive']);
  const metadataKeys = new Set(['name', 'label']);
  for (const schema of def.propSchema) {
    const keys = 'kind' in schema ? schema.keys : [schema.key];
    for (const key of keys) {
      if (result[key]) continue;
      result[key] = !('kind' in schema) && schema.target === 'geometry' ? 'geometry'
        : key === 'dataBinding' || key === 'rangeRef' || key === 'tableBinding' ? 'binding'
          : key.endsWith('Expression') || key === 'contentTemplate' ? 'expression'
            : validationKeys.has(key) ? 'validation'
              : metadataKeys.has(key) ? 'metadata'
                : 'render';
    }
  }
  for (const key of Object.keys(def.defaultProps)) if (!result[key]) result[key] = key === 'rangeRef' || key === 'tableBinding' || key === 'dataBinding' ? 'binding' : metadataKeys.has(key) ? 'metadata' : 'render';
  return result;
}

export function registerControl(def: ControlDef) {
  controls.set(def.type, { ...def, propertyContract: inferPropertyContract(def) });
}

export function getControl(type: string): ControlDef | undefined {
  return controls.get(type);
}

/**
 * 统一补齐新建与历史组件的属性初始值。
 * 已保存值（包括 false、0 和空字符串）始终优先，不改写旧项目的语义。
 */
export function hydrateControlComponent(component: DesignComponent): DesignComponent {
  const control = getControl(component.type);
  if (!control) return component;
  const finite = (value: unknown, fallback: number, positive = false) => { const number = Number(value); return Number.isFinite(number) && (!positive || number > 0) ? number : fallback; };
  return { ...component, x: finite(component.x, 0), y: finite(component.y, 0), width: finite(component.width, control.defaultSize.w, true), height: finite(component.height, control.defaultSize.h, true), zIndex: finite(component.zIndex, 0), props: { ...control.defaultProps, ...(component.props || {}) } };
}

export function getControlsByCategory(cat: string): ControlDef[] {
  return [...controls.values()].filter((c) => c.category === cat);
}

export function getAllControls(): ControlDef[] {
  return [...controls.values()];
}

export function getCategories(): readonly string[] {
  return categories;
}

export const CATEGORY_LABELS: Record<string, string> = {
  basic: '基础输入',
  select: '选择',
  container: '容器',
  display: '展示',
};
