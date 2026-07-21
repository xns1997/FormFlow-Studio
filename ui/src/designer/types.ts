import type { DesignComponent } from '../project/types';

export type PropValueType =
  | 'string' | 'number' | 'boolean' | 'select' | 'color' | 'date' | 'datetime' | 'time'
  | 'json' | 'json-string' | 'object' | 'array' | 'range' | 'dimMetric'
  | 'string[]' | 'object[]' | 'unknown[][]';

export type PropertyEditorKind =
  | 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'color' | 'date' | 'datetime' | 'time'
  | 'json' | 'regex' | 'validation-rules' | 'number-range' | 'date-range' | 'selection-range'
  | 'options' | 'string-list' | 'table-columns' | 'field-path' | 'key-value' | 'mapping'
  | 'filters' | 'sorting' | 'expression' | 'template' | 'typography' | 'spacing' | 'border'
  | 'radius' | 'shadow' | 'opacity' | 'dimension' | 'icon' | 'url' | 'upload-constraints'
  | 'tabs' | 'steps' | 'dimension-metric' | 'data-binding' | 'option-source' | 'range';

export type PropertySection = 'function' | 'style';
export type PropertyTaskId = 'content' | 'validation' | 'data' | 'binding' | 'logic' | 'events' | 'appearance' | 'effects' | 'layout' | 'format' | 'other';

export interface PropertyGroupDescriptor {
  id: string;
  label: string;
  section: PropertySection;
  task: PropertyTaskId;
  order: number;
  defaultOpen?: boolean;
}

export interface PropertyDiagnostic {
  severity: 'error' | 'warning';
  message: string;
  key?: string;
}

export interface PropertyStatus {
  changed: boolean;
  diagnostics: PropertyDiagnostic[];
}

export interface PropCondition {
  key: string;
  operator?: 'equals' | 'notEquals' | 'in' | 'notIn' | 'truthy' | 'falsy';
  value?: unknown;
  values?: unknown[];
}

export interface PropValidation {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  message?: string;
}

export interface PropertyAssistantCapability {
  capability: string;
  contextKeys?: string[];
  resultType?: 'value' | 'patch';
}

export interface PropDef {
  key: string;
  label: string;
  type: PropValueType;
  editor?: PropertyEditorKind;
  editorOptions?: Record<string, unknown>;
  help?: string;
  visibleWhen?: PropCondition | PropCondition[];
  disabledWhen?: PropCondition | PropCondition[];
  validation?: PropValidation;
  /** Reserved metadata. The property panel intentionally exposes no AI entry point. */
  assistantCapability?: PropertyAssistantCapability;
  default?: any;
  options?: Array<{ label: string; value: any }>;
  group?: string;
  section?: PropertySection;
  task?: PropertyTaskId;
  order?: number;
  level?: 'common' | 'advanced';
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  target?: 'props' | 'geometry';
}

export interface CompositePropDef {
  kind: 'composite';
  key: string;
  keys: string[];
  label: string;
  editor: PropertyEditorKind;
  editorOptions?: Record<string, unknown>;
  help?: string;
  visibleWhen?: PropCondition | PropCondition[];
  disabledWhen?: PropCondition | PropCondition[];
  validation?: PropValidation;
  assistantCapability?: PropertyAssistantCapability;
  group?: string;
  section?: PropertySection;
  task?: PropertyTaskId;
  order?: number;
  level?: 'common' | 'advanced';
}

export type PropSchemaEntry = PropDef | CompositePropDef;

export function isCompositePropDef(def: PropSchemaEntry): def is CompositePropDef {
  return 'kind' in def && def.kind === 'composite';
}

export interface EventDef {
  key: string;
  label: string;
  description: string;
}

export interface PreviewControlRuntime {
  value: unknown;
  values: Record<string, unknown>;
  emit: (eventName: string, value?: unknown, detail?: unknown) => void;
  setValue: (value: unknown) => void;
}

export interface ControlDef {
  type: string;
  label: string;
  category: 'basic' | 'select' | 'container' | 'display';
  icon: string;
  defaultProps: Record<string, any>;
  propSchema: PropSchemaEntry[];
  eventSchema: EventDef[];
  defaultSize: { w: number; h: number };
  propertyContract?: Record<string, 'render' | 'validation' | 'binding' | 'expression' | 'geometry' | 'metadata'>;
  render: React.ComponentType<{
    component: DesignComponent;
    selected?: boolean;
    mode?: 'design' | 'preview';
    runtime?: PreviewControlRuntime;
  }>;
}
