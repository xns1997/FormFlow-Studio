/**
 * Legacy workflow migration logic.
 *
 * Handles the transition from pre-IO workflows (where forms injected values
 * via `generic:value-input` nodes) to the current import/export node model.
 */
import type { WorkflowEdge, WorkflowFile, WorkflowNode } from '../../project/types';
import { parseCustomJsPortDefinitions, type PortDefinitionEntry } from '../config/customJsNode';
import {
  WORKFLOW_IMPORT_SPEC_ID,
  WORKFLOW_EXPORT_SPEC_ID,
  type WorkflowIoField,
} from './workflowIo';

// ─── Legacy field definitions ─────────────────────────────────────────────────

const LEGACY_WORKFLOW_FIXED_FIELDS: Array<{ name: string; type: PortDefinitionEntry['type']; label: string; description: string }> = [
  { name: 'value', type: 'any', label: '值', description: '当前事件值' },
  { name: 'field', type: 'string', label: '字段', description: '当前字段名' },
  { name: 'event', type: 'string', label: '事件', description: '事件名' },
  { name: 'formData', type: 'object', label: '表单数据', description: '当前表单值' },
  { name: 'originalValues', type: 'object', label: '原始数据', description: '原始表单值' },
  { name: 'previousValue', type: 'any', label: '前值', description: '事件前的字段值' },
  { name: 'timestamp', type: 'number', label: '时间戳', description: '事件时间戳' },
  { name: 'dirty', type: 'boolean', label: '已修改', description: '当前字段是否已修改' },
  { name: 'changedFields', type: 'array', label: '变更字段', description: '已变更字段列表' },
  { name: 'detail', type: 'object', label: '详情', description: '事件详情' },
  { name: 'component', type: 'object', label: '组件', description: '当前组件对象' },
  { name: 'componentId', type: 'string', label: '组件 ID', description: '当前组件 ID' },
];

const LEGACY_EVENT_FIELD_MAP = new Map(
  LEGACY_WORKFLOW_FIXED_FIELDS.map((field) => [field.name, field]),
);

// ─── Internal helpers ─────────────────────────────────────────────────────────

function parseProperties(node: WorkflowNode) {
  if (!node) return {};
  const raw = node.data?.propertiesJson;
  if (typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function stringifyProperties(properties: Record<string, unknown>) {
  return JSON.stringify(properties);
}

function hasIncomingEdge(workflow: Pick<WorkflowFile, 'edges'>, nodeId: string, targetHandle: string) {
  return workflow.edges.some((edge) => edge.target === nodeId && edge.targetHandle === targetHandle);
}

function sinkCandidates(workflow: WorkflowFile) {
  return workflow.nodes.filter((node) => {
    if (node.specId === WORKFLOW_IMPORT_SPEC_ID || node.specId === WORKFLOW_EXPORT_SPEC_ID) return false;
    return !workflow.edges.some((edge) => edge.source === node.id);
  });
}

function mergeUniquePortFields(fields: PortDefinitionEntry[]) {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const name = String(field.name || '').trim();
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

function hasPortSchemaProperty(node: WorkflowNode, key: 'inputPorts' | 'outputPorts') {
  const properties = parseProperties(node);
  return Object.prototype.hasOwnProperty.call(properties, key);
}

// ─── Public migration functions ───────────────────────────────────────────────

export function findLegacyResultSource(workflow: WorkflowFile, legacyTargetNodeId?: string) {
  const preferNode = legacyTargetNodeId
    ? workflow.nodes.find((node) => node.id === legacyTargetNodeId)
    : undefined;
  if (preferNode) return { nodeId: preferNode.id, sourceHandle: 'out:value' };

  const displays = workflow.nodes.filter((node) => node.specId === 'generic:output-display');
  if (displays.length === 1) return { nodeId: displays[0].id, sourceHandle: 'out:value' };

  const sinks = sinkCandidates(workflow);
  if (sinks.length === 1) return { nodeId: sinks[0].id, sourceHandle: 'out:result' };
  return null;
}

export function migrateImportFields(
  workflow: WorkflowFile,
  importNode: WorkflowNode,
  options: { nodeWasAdded: boolean },
): { node: WorkflowNode; fields: PortDefinitionEntry[]; changed: boolean } {
  const properties = parseProperties(importNode);
  const raw = parseCustomJsPortDefinitions(properties.outputPorts);
  const currentFields = raw.length > 0 ? raw : [];
  if (currentFields.length > 0) return { node: importNode, fields: currentFields, changed: false };

  const variableFields = workflow.nodes
    .filter((node) => node.specId === 'generic:value-input')
    .map((node) => {
      const props = parseProperties(node);
      const varName = String(props.name || '').trim();
      const existing = LEGACY_EVENT_FIELD_MAP.get(varName);
      return {
        name: varName,
        type: (existing?.type || String(props.valueType || 'any')) as PortDefinitionEntry['type'],
        label: existing?.label || varName,
        description: existing?.description || `迁移自变量 ${varName}`,
      } satisfies PortDefinitionEntry;
    })
    .filter((field) => field.name);

  const shouldMigrateFixed = !options.nodeWasAdded && !hasPortSchemaProperty(importNode, 'outputPorts');
  const shouldMigrateVariables = options.nodeWasAdded && variableFields.length > 0;
  if (!shouldMigrateFixed && !shouldMigrateVariables) {
    return { node: importNode, fields: currentFields, changed: false };
  }

  const migratedFields = mergeUniquePortFields([
    ...(shouldMigrateFixed ? LEGACY_WORKFLOW_FIXED_FIELDS : []),
    ...(shouldMigrateVariables ? variableFields : []),
  ]);

  return {
    node: {
      ...importNode,
      data: {
        ...importNode.data,
        propertiesJson: stringifyProperties({ ...properties, outputPorts: JSON.stringify(migratedFields) }),
      },
    },
    fields: migratedFields,
    changed: true,
  };
}

export function migrateExportFields(
  exportNode: WorkflowNode,
  options: { nodeWasAdded: boolean; hasLegacyResultSource: boolean },
): { node: WorkflowNode; fields: PortDefinitionEntry[]; changed: boolean } {
  const properties = parseProperties(exportNode);
  const raw = parseCustomJsPortDefinitions(properties.inputPorts);
  const currentFields = raw.length > 0 ? raw : [];
  if (currentFields.length > 0) return { node: exportNode, fields: currentFields, changed: false };

  const shouldMigrate = (!options.nodeWasAdded && !hasPortSchemaProperty(exportNode, 'inputPorts')) || (options.nodeWasAdded && options.hasLegacyResultSource);
  if (!shouldMigrate) {
    return { node: exportNode, fields: currentFields, changed: false };
  }

  const migratedFields: PortDefinitionEntry[] = [{ name: 'result', type: 'any', label: '结果', description: '迁移出的默认返回字段' }];
  return {
    node: {
      ...exportNode,
      data: {
        ...exportNode.data,
        propertiesJson: stringifyProperties({ ...properties, inputPorts: JSON.stringify(migratedFields) }),
      },
    },
    fields: migratedFields,
    changed: true,
  };
}

export function persistStableIoFields(node: WorkflowNode, property: 'inputPorts' | 'outputPorts', fields: WorkflowIoField[]) {
  const properties = parseProperties(node);
  const raw = parseCustomJsPortDefinitions(properties[property]);
  const needsUpdate = raw.length !== fields.length || raw.some((field, index) => (
    !field.id
    || field.id !== fields[index].id
    || field.required !== fields[index].required
    || JSON.stringify(field.defaultValue) !== JSON.stringify(fields[index].defaultValue)
  ));
  if (!needsUpdate) return { node, changed: false };
  return {
    node: {
      ...node,
      data: {
        ...node.data,
        propertiesJson: stringifyProperties({ ...properties, [property]: JSON.stringify(fields) }),
      },
    },
    changed: true,
  };
}

export function wireLegacyImportEdges(
  workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
  importNode: WorkflowNode,
  importFields: PortDefinitionEntry[],
): { edges: WorkflowEdge[]; changed: boolean } {
  const edgeIds = new Set(workflow.edges.map((edge) => edge.id));
  const nextEdges = [...workflow.edges];
  let changed = false;

  for (const node of workflow.nodes) {
    if (node.specId !== 'generic:value-input') continue;
    const props = parseProperties(node);
    const varName = String(props.name || '').trim();
    if (!varName || !importFields.some((field) => field.name === varName)) continue;
    if (hasIncomingEdge({ edges: nextEdges }, node.id, 'in:override')) continue;
    const base = `workflow-io:${importNode.id}:${varName}:${node.id}`;
    let edgeId = base;
    let index = 2;
    while (edgeIds.has(edgeId)) edgeId = `${base}:${index++}`;
    edgeIds.add(edgeId);
    nextEdges.push({
      id: edgeId,
      source: importNode.id,
      target: node.id,
      sourceHandle: `out:${varName}`,
      targetHandle: 'in:override',
    });
    changed = true;
  }

  return { edges: nextEdges, changed };
}

export function wireLegacyExportEdge(
  workflow: { edges: WorkflowEdge[] },
  exportNode: WorkflowNode,
  exportFields: PortDefinitionEntry[],
  legacySource: { nodeId: string; sourceHandle: string } | null,
): { edges: WorkflowEdge[]; changed: boolean } {
  if (exportFields.length === 0) return { edges: workflow.edges, changed: false };
  if (exportFields.some((field) => hasIncomingEdge({ edges: workflow.edges }, exportNode.id, `in:${field.name}`))) {
    return { edges: workflow.edges, changed: false };
  }

  const firstField = exportFields[0];
  if (!legacySource || !firstField || hasIncomingEdge({ edges: workflow.edges }, exportNode.id, `in:${firstField.name}`)) {
    return { edges: workflow.edges, changed: false };
  }

  const edgeIds = new Set(workflow.edges.map((edge) => edge.id));
  const nextEdges = [...workflow.edges];
  const base = `workflow-io:${legacySource.nodeId}:${exportNode.id}:${firstField.name}`;
  let edgeId = base;
  let index = 2;
  while (edgeIds.has(edgeId)) edgeId = `${base}:${index++}`;
  edgeIds.add(edgeId);
  nextEdges.push({
    id: edgeId,
    source: legacySource.nodeId,
    target: exportNode.id,
    sourceHandle: legacySource.sourceHandle,
    targetHandle: `in:${firstField.name}`,
  });

  return { edges: nextEdges, changed: true };
}
