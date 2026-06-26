import type { DesignComponent } from '../project/types';

export interface PropDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'color' | 'json' | 'range' | 'dimMetric';
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

export interface ControlDef {
  type: string;
  label: string;
  category: 'basic' | 'select' | 'container' | 'display';
  icon: string;
  defaultProps: Record<string, any>;
  propSchema: PropDef[];
  eventSchema: EventDef[];
  defaultSize: { w: number; h: number };
  render: React.ComponentType<{ component: DesignComponent; selected?: boolean }>;
}
