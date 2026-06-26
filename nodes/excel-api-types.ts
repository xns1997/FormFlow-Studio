export type PropertyType = 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object' | 'range' | 'color' | 'any'
  | 'workbook' | 'worksheet' | 'cell' | 'address' | 'cell-ref'
  | 'json-rows' | 'aoa' | 'headers' | 'options' | 'file-data'
  | 'csv-string' | 'html-string' | 'json-string'
  | 'filter' | 'sort-config' | 'style' | 'validation-rule'
  | 'trigger';

export type PortDirection = 'input' | 'output' | 'both';

export interface SchemaPort {
  name: string;
  label: string;
  type: PropertyType;
  direction: PortDirection;
  required?: boolean;
  connected?: boolean;
  defaultValue?: unknown;
  enum?: string[];
  validation?: PortValidation;
  description: string;
}

export interface PortValidation {
  pattern?: string;
  min?: number;
  max?: number;
  enum?: string[];
  custom?: string;
}

export interface SchemaProperty {
  name: string;
  label: string;
  type: PropertyType;
  enum?: string[];
  default?: unknown;
  min?: number;
  max?: number;
  required?: boolean;
  description: string;
  port?: SchemaPort;
}

export interface SchemaInput {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface SchemaOutput {
  name: string;
  type: string;
  description: string;
}

export interface ExcelApiNodeSchema {
  id: string;
  label: string;
  description: string;
  category: string;
  kind: 'excel-class' | 'xlsx-method' | 'scenario' | 'generic';
  methods: string[];
  properties: SchemaProperty[];
  inputs: SchemaInput[];
  outputs: SchemaOutput[];
  ports?: SchemaPort[];
}

export type NodeExecutor = (args: unknown[], properties: Record<string, unknown>) => unknown;
