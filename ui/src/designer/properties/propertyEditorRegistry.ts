import type { ComponentType, LazyExoticComponent } from 'react';
import type { CompositePropDef, PropCondition, PropDef, PropSchemaEntry, PropertyEditorKind, PropertyStatus } from '../types';
import type { DesignComponent } from '../../project/types';

export interface PropertyFieldDescriptor {
  path: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'unknown';
  source: 'component' | 'table' | 'context';
  sourceId?: string;
  sourceLabel?: string;
  sample?: unknown;
  writable?: boolean;
}

export interface PropertyEditorContext {
  def: PropSchemaEntry;
  value: unknown;
  values: Record<string, unknown>;
  defaultValue?: unknown;
  defaultValues?: Record<string, unknown>;
  status?: PropertyStatus;
  fields: string[];
  fieldCatalog?: PropertyFieldDescriptor[];
  component?: DesignComponent;
  components?: DesignComponent[];
  disabled?: boolean;
  onChange: (value: unknown) => void;
  onPatch: (patch: Record<string, unknown>) => void;
}

export type PropertyEditorComponent = ComponentType<PropertyEditorContext>;

export interface PropertyEditorDescriptor {
  kind: PropertyEditorKind | string;
  component?: PropertyEditorComponent;
  load?: () => Promise<{ default: PropertyEditorComponent }>;
  normalize?: (value: unknown, context: PropertyEditorContext) => unknown;
  validate?: (value: unknown, context: PropertyEditorContext) => string | null;
  summarize?: (value: unknown, context: PropertyEditorContext) => string;
  supportsSource?: boolean;
  contextNeeds?: Array<'fields' | 'tables' | 'samples' | 'dependencies' | 'component'>;
  /** Cached by the renderer after the first lazy resolution. */
  lazyComponent?: LazyExoticComponent<PropertyEditorComponent>;
}

const editors = new Map<string, PropertyEditorDescriptor>();

export function registerPropertyEditor(kind: PropertyEditorKind | string, component: PropertyEditorComponent): void;
export function registerPropertyEditor(descriptor: PropertyEditorDescriptor): void;
export function registerPropertyEditor(
  kindOrDescriptor: PropertyEditorKind | string | PropertyEditorDescriptor,
  component?: PropertyEditorComponent,
) {
  const descriptor = typeof kindOrDescriptor === 'object'
    ? kindOrDescriptor
    : { kind: kindOrDescriptor, component };
  if (!descriptor.component && !descriptor.load) throw new Error(`属性编辑器 ${descriptor.kind} 缺少 component 或 load`);
  editors.set(descriptor.kind, descriptor);
}

export function getPropertyEditorDescriptor(kind: PropertyEditorKind | string): PropertyEditorDescriptor | undefined {
  return editors.get(kind);
}

export function getPropertyEditor(kind: PropertyEditorKind | string): PropertyEditorComponent | undefined {
  return editors.get(kind)?.component;
}

export function resolvePropertyEditorKind(def: PropSchemaEntry): PropertyEditorKind {
  if (def.editor) return def.editor;
  if ('kind' in def) return 'json';
  switch (def.type) {
    case 'boolean': return 'switch';
    case 'select': return 'select';
    case 'number': return 'number';
    case 'color': return 'color';
    case 'date': return 'date';
    case 'datetime': return 'datetime';
    case 'time': return 'time';
    case 'range': return 'range';
    case 'dimMetric': return 'dimension-metric';
    case 'json':
    case 'json-string':
    case 'object':
    case 'array':
    case 'string[]':
    case 'object[]':
    case 'unknown[][]': return 'json';
    default: return 'text';
  }
}

function matchesCondition(condition: PropCondition, values: Record<string, unknown>) {
  const current = values[condition.key];
  switch (condition.operator || 'equals') {
    case 'equals': return current === condition.value;
    case 'notEquals': return current !== condition.value;
    case 'in': return (condition.values || []).includes(current);
    case 'notIn': return !(condition.values || []).includes(current);
    case 'truthy': return !!current;
    case 'falsy': return !current;
    default: return true;
  }
}

export function evaluatePropCondition(
  condition: PropDef['visibleWhen'] | CompositePropDef['visibleWhen'],
  values: Record<string, unknown>,
): boolean {
  if (!condition) return true;
  const conditions = Array.isArray(condition) ? condition : [condition];
  return conditions.every((item) => matchesCondition(item, values));
}

export function mergeCompositePatch(keys: string[], value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(keys.filter((key) => key in record).map((key) => [key, record[key]]));
  }
  return {};
}

export function clearPropertyEditorsForTest() {
  editors.clear();
}
