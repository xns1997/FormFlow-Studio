export type NodeProperties = Record<string, unknown>;

export type NodeExecutor = (args: unknown[], properties: NodeProperties) => unknown;

export interface NodeSchema {
  id: string;
  label: string;
  description: string;
  category: string;
  kind: 'xlsx-method' | 'scenario' | 'input' | 'output';
  namespace: string;
  methodPath: string[];
  inputs: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  outputs: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  properties: Array<{
    name: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'enum' | 'array';
    enum?: string[];
    array?: string[];
    default?: unknown;
    min?: number;
    max?: number;
    description: string;
  }>;
}
