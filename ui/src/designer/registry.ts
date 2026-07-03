import type { ControlDef } from './types';

const controls = new Map<string, ControlDef>();
const categories = ['basic', 'select', 'container', 'display'] as const;

export function registerControl(def: ControlDef) {
  controls.set(def.type, def);
}

export function getControl(type: string): ControlDef | undefined {
  return controls.get(type);
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
