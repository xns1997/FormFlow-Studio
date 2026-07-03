import type { DesignComponent } from '../project/types';

export interface PropDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'color' | 'json' | 'json-string' | 'object' | 'array' | 'range' | 'dimMetric' | 'string[]' | 'object[]' | 'unknown[][]';
  default?: any;
  options?: Array<{ label: string; value: any }>;
  group?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
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
  propSchema: PropDef[];
  eventSchema: EventDef[];
  defaultSize: { w: number; h: number };
  render: React.ComponentType<{
    component: DesignComponent;
    selected?: boolean;
    mode?: 'design' | 'preview';
    runtime?: PreviewControlRuntime;
  }>;
}
