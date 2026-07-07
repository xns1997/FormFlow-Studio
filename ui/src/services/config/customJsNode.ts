import type { CodeEditorExtraLib, CodeEditorSuggestion } from '../../components/CodeEditor';
import type { FlowNodeSpec, SchemaPort } from '../../flowRegistry';
import type { PropertyType } from '../../../nodes/excel-api-types';

export const CUSTOM_JS_SPEC_IDS = new Set(['behavior-js-script', 'generic:custom-js']);

const SUPPORTED_PORT_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'object',
  'array',
  'json',
  'any',
  'trigger',
]);

type PortDefinitionEntry = {
  name: string;
  type: PropertyType;
};

function normalizePortType(type: unknown): PropertyType {
  const normalized = String(type || 'any').trim();
  return (SUPPORTED_PORT_TYPES.has(normalized) ? normalized : 'any') as PropertyType;
}

export function parseCustomJsPortDefinitions(raw: unknown): PortDefinitionEntry[] {
  const source = typeof raw === 'string'
    ? raw.trim()
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return {};
          }
        })()
      : {}
    : raw;

  if (!source || typeof source !== 'object' || Array.isArray(source)) return [];

  return Object.entries(source as Record<string, unknown>)
    .filter(([name]) => !!String(name).trim())
    .map(([name, value]) => ({
      name,
      type: normalizePortType(value),
    }));
}

export function toCustomJsPortMap(raw: unknown): Record<string, PropertyType> {
  return Object.fromEntries(parseCustomJsPortDefinitions(raw).map((entry) => [entry.name, entry.type]));
}

export function formatCustomJsPortMap(raw: unknown) {
  return JSON.stringify(toCustomJsPortMap(raw), null, 2);
}

export function isCustomJsNodeSpec(specId: string | undefined) {
  return !!specId && CUSTOM_JS_SPEC_IDS.has(specId);
}

export function resolveNodeProperties(spec: FlowNodeSpec | undefined, propertiesJson: unknown): Record<string, unknown> {
  const defaults = Object.fromEntries(
    (spec?.properties || [])
      .filter((property) => property.default !== undefined)
      .map((property) => [property.name, property.default]),
  );
  try {
    const parsed = typeof propertiesJson === 'string'
      ? (propertiesJson.trim() ? JSON.parse(propertiesJson) : {})
      : (propertiesJson && typeof propertiesJson === 'object' ? propertiesJson : {});
    return { ...defaults, ...(parsed as Record<string, unknown>) };
  } catch {
    return defaults;
  }
}

export function getNodeEffectivePorts(spec: FlowNodeSpec | undefined, properties: Record<string, unknown>): SchemaPort[] {
  const staticPorts = spec?.ports || [];
  const inputPorts = parseCustomJsPortDefinitions(properties.inputPorts).map<SchemaPort>((port) => ({
    name: port.name,
    label: port.name,
    type: port.type,
    direction: 'input',
    description: port.name,
    required: false,
  }));
  const outputPorts = parseCustomJsPortDefinitions(properties.outputPorts).map<SchemaPort>((port) => ({
    name: port.name,
    label: port.name,
    type: port.type,
    direction: 'output',
    description: port.name,
    required: false,
  }));
  return [...staticPorts, ...inputPorts, ...outputPorts];
}

function toTsType(type: PropertyType) {
  switch (type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'unknown[]';
    case 'object':
    case 'json':
      return 'Record<string, unknown>';
    case 'trigger':
    case 'any':
      return 'unknown';
    default:
      return 'string';
  }
}

export function createCustomJsNodeSuggestions(inputDefs: PortDefinitionEntry[], outputDefs: PortDefinitionEntry[]): CodeEditorSuggestion[] {
  const outputKeys = outputDefs.map((entry) => entry.name);
  return [
    {
      label: 'typed custom js node',
      insertText: `return {\n  ${outputKeys[0] || 'result'}: ${inputDefs[0] ? `inputs.${inputDefs[0].name}` : 'null'},\n};`,
      kind: 'Snippet',
      detail: '按当前出参定义返回结果',
      sortText: '001',
      scope: 'top-level',
    },
    {
      label: 'inputs',
      insertText: 'inputs',
      kind: 'Variable',
      detail: '输入端口值对象',
      sortText: '005',
      scope: 'top-level',
    },
    {
      label: 'properties',
      insertText: 'properties',
      kind: 'Variable',
      detail: '节点配置对象',
      sortText: '006',
      scope: 'top-level',
    },
    ...inputDefs.map<CodeEditorSuggestion>((entry, index) => ({
      label: `inputs.${entry.name}`,
      insertText: `inputs.${entry.name}`,
      kind: 'Field',
      detail: `输入 · ${entry.type}`,
      documentation: entry.name,
      sortText: `1${index.toString().padStart(3, '0')}`,
      scope: 'top-level',
    })),
    ...outputDefs.map<CodeEditorSuggestion>((entry, index) => ({
      label: `return ${entry.name}`,
      insertText: `${entry.name}: `,
      kind: 'Property',
      detail: `输出键 · ${entry.type}`,
      documentation: entry.name,
      sortText: `2${index.toString().padStart(3, '0')}`,
      scope: 'top-level',
    })),
  ];
}

export function createCustomJsNodeExtraLib(filePath: string, inputDefs: PortDefinitionEntry[], outputDefs: PortDefinitionEntry[]): CodeEditorExtraLib {
  const inputBody = inputDefs.map((entry) => `  ${JSON.stringify(entry.name)}?: ${toTsType(entry.type)};`).join('\n');
  const outputBody = outputDefs.map((entry) => `  ${JSON.stringify(entry.name)}?: ${toTsType(entry.type)};`).join('\n');
  return {
    filePath,
    content: `type CustomJsInputs = {\n${inputBody || '  [key: string]: unknown;'}\n};\ntype CustomJsOutputs = {\n${outputBody || '  [key: string]: unknown;'}\n};\ninterface CustomJsContext {\n  inputs: CustomJsInputs & Record<string, unknown>;\n  properties: Record<string, unknown>;\n}\ndeclare const inputs: CustomJsInputs & Record<string, unknown>;\ndeclare const properties: Record<string, unknown>;\ndeclare const ctx: CustomJsContext;\n`,
  };
}
