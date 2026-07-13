import type { WorkflowEdge, WorkflowFile, WorkflowNode } from '../../project/types';
import { parseCustomJsPortDefinitions, type PortDefinitionEntry } from '../config/customJsNode';

export const WORKFLOW_IMPORT_SPEC_ID = 'workflow:import';
export const WORKFLOW_EXPORT_SPEC_ID = 'workflow:export';

const WORKFLOW_IMPORT_NODE_ID = 'workflow:import';
const WORKFLOW_EXPORT_NODE_ID = 'workflow:export';

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

function nextNodeId(base: string, existingIds: Set<string>) {
  if (!existingIds.has(base)) return base;
  let index = 2;
  while (existingIds.has(`${base}:${index}`)) index += 1;
  return `${base}:${index}`;
}

function nextEdgeId(base: string, existingIds: Set<string>) {
  if (!existingIds.has(base)) return base;
  let index = 2;
  while (existingIds.has(`${base}:${index}`)) index += 1;
  return `${base}:${index}`;
}

function createNode(id: string, specId: string, x: number, y: number, properties: Record<string, unknown>): WorkflowNode {
  return {
    id,
    type: 'flow-node',
    specId,
    position: { x, y },
    data: { propertiesJson: stringifyProperties(properties), connectedPortsJson: '[]' },
  };
}

function defaultWorkflowImportProperties() {
  return { outputPorts: '[]' };
}

function defaultWorkflowExportProperties() {
  return { inputPorts: '[]' };
}

export function getWorkflowImportFields(nodeOrWorkflow: WorkflowNode | Pick<WorkflowFile, 'nodes'> | undefined) {
  const node = nodeOrWorkflow && 'nodes' in nodeOrWorkflow ? getWorkflowImportNode(nodeOrWorkflow) : nodeOrWorkflow;
  if (!node) return [];
  return parseCustomJsPortDefinitions(parseProperties(node as WorkflowNode).outputPorts);
}

export function getWorkflowExportFields(nodeOrWorkflow: WorkflowNode | Pick<WorkflowFile, 'nodes'> | undefined) {
  const node = nodeOrWorkflow && 'nodes' in nodeOrWorkflow ? getWorkflowExportNode(nodeOrWorkflow) : nodeOrWorkflow;
  if (!node) return [];
  return parseCustomJsPortDefinitions(parseProperties(node as WorkflowNode).inputPorts);
}

export function createWorkflowImportNode(existingIds: Set<string>, position = { x: 80, y: 140 }): WorkflowNode {
  return createNode(nextNodeId(WORKFLOW_IMPORT_NODE_ID, existingIds), WORKFLOW_IMPORT_SPEC_ID, position.x, position.y, defaultWorkflowImportProperties());
}

export function createWorkflowExportNode(existingIds: Set<string>, position = { x: 760, y: 140 }): WorkflowNode {
  return createNode(nextNodeId(WORKFLOW_EXPORT_NODE_ID, existingIds), WORKFLOW_EXPORT_SPEC_ID, position.x, position.y, defaultWorkflowExportProperties());
}

export function createWorkflowIoScaffold() {
  const importNode = createNode(WORKFLOW_IMPORT_NODE_ID, WORKFLOW_IMPORT_SPEC_ID, 80, 140, defaultWorkflowImportProperties());
  const exportNode = createNode(WORKFLOW_EXPORT_NODE_ID, WORKFLOW_EXPORT_SPEC_ID, 760, 140, defaultWorkflowExportProperties());
  return { nodes: [importNode, exportNode], edges: [] as WorkflowEdge[] };
}

export function getWorkflowImportNodes(workflow: Pick<WorkflowFile, 'nodes'>) {
  return workflow.nodes.filter((node) => node.specId === WORKFLOW_IMPORT_SPEC_ID);
}

export function getWorkflowExportNodes(workflow: Pick<WorkflowFile, 'nodes'>) {
  return workflow.nodes.filter((node) => node.specId === WORKFLOW_EXPORT_SPEC_ID);
}

export function getWorkflowImportNode(workflow: Pick<WorkflowFile, 'nodes'>) {
  const matches = getWorkflowImportNodes(workflow);
  return matches.length === 1 ? matches[0] : null;
}

export function getWorkflowExportNode(workflow: Pick<WorkflowFile, 'nodes'>) {
  const matches = getWorkflowExportNodes(workflow);
  return matches.length === 1 ? matches[0] : null;
}

export function validateWorkflowIo(workflow: Pick<WorkflowFile, 'nodes'>) {
  const errors: string[] = [];
  const imports = getWorkflowImportNodes(workflow);
  const exports = getWorkflowExportNodes(workflow);
  if (imports.length !== 1) errors.push(imports.length === 0 ? '流程缺少导入节点' : '流程存在多个导入节点');
  if (exports.length !== 1) errors.push(exports.length === 0 ? '流程缺少导出节点' : '流程存在多个导出节点');
  if (imports.length === 1 && getWorkflowImportFields(imports[0]).length === 0) errors.push('流程导入节点还没有定义字段');
  if (exports.length === 1 && getWorkflowExportFields(exports[0]).length === 0) errors.push('流程导出节点还没有定义字段');
  return errors;
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

function findLegacyResultSource(workflow: WorkflowFile, legacyTargetNodeId?: string) {
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

function migrateImportFields(workflow: WorkflowFile, importNode: WorkflowNode, options: { nodeWasAdded: boolean }) {
  const properties = parseProperties(importNode);
  const currentFields = getWorkflowImportFields(importNode);
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

function migrateExportFields(exportNode: WorkflowNode, options: { nodeWasAdded: boolean; hasLegacyResultSource: boolean }) {
  const properties = parseProperties(exportNode);
  const currentFields = getWorkflowExportFields(exportNode);
  if (currentFields.length > 0) return { node: exportNode, fields: currentFields, changed: false };
  const shouldMigrate = (!options.nodeWasAdded && !hasPortSchemaProperty(exportNode, 'inputPorts')) || (options.nodeWasAdded && options.hasLegacyResultSource);
  if (!shouldMigrate) {
    return { node: exportNode, fields: currentFields, changed: false };
  }
  const migratedFields = [{ name: 'result', type: 'any' as const, label: '结果', description: '迁移出的默认返回字段' }];
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

export function ensureWorkflowIo(workflow: WorkflowFile, options: { legacyTargetNodeId?: string } = {}) {
  const existingIds = new Set(workflow.nodes.map((node) => node.id));
  const edgeIds = new Set(workflow.edges.map((edge) => edge.id));
  const nextNodes = [...workflow.nodes];
  const nextEdges = [...workflow.edges];
  let changed = false;

  let importNode = getWorkflowImportNode(workflow);
  const importNodeExisted = !!importNode;
  if (!importNode) {
    const minX = workflow.nodes.length > 0 ? Math.min(...workflow.nodes.map((node) => node.position.x)) : 320;
    importNode = createWorkflowImportNode(existingIds, { x: minX - 320, y: 140 });
    existingIds.add(importNode.id);
    nextNodes.push(importNode);
    changed = true;
  }

  let exportNode = getWorkflowExportNode({ nodes: nextNodes });
  const exportNodeExisted = !!exportNode;
  if (!exportNode) {
    const maxX = workflow.nodes.length > 0 ? Math.max(...workflow.nodes.map((node) => node.position.x)) : 520;
    exportNode = createWorkflowExportNode(existingIds, { x: maxX + 320, y: 140 });
    existingIds.add(exportNode.id);
    nextNodes.push(exportNode);
    changed = true;
  }

  const legacySource = findLegacyResultSource({ ...workflow, nodes: nextNodes, edges: nextEdges }, options.legacyTargetNodeId);
  const importMigration = migrateImportFields({ ...workflow, nodes: nextNodes, edges: nextEdges }, importNode, { nodeWasAdded: !importNodeExisted });
  if (importMigration.changed) {
    const index = nextNodes.findIndex((node) => node.id === importNode!.id);
    if (index >= 0) nextNodes[index] = importMigration.node;
    importNode = importMigration.node;
    changed = true;
  }
  const importFields = importMigration.fields;

  const exportMigration = migrateExportFields(exportNode, { nodeWasAdded: !exportNodeExisted, hasLegacyResultSource: !!legacySource });
  if (exportMigration.changed) {
    const index = nextNodes.findIndex((node) => node.id === exportNode!.id);
    if (index >= 0) nextNodes[index] = exportMigration.node;
    exportNode = exportMigration.node;
    changed = true;
  }
  const exportFields = exportMigration.fields;

  for (const node of nextNodes) {
    if (node.specId !== 'generic:value-input') continue;
    const props = parseProperties(node);
    const varName = String(props.name || '').trim();
    if (!varName || !importFields.some((field) => field.name === varName)) continue;
    if (hasIncomingEdge({ edges: nextEdges }, node.id, 'in:override')) continue;
    const edgeId = nextEdgeId(`workflow-io:${importNode.id}:${varName}:${node.id}`, edgeIds);
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

  if (exportFields.length > 0 && !exportFields.some((field) => hasIncomingEdge({ edges: nextEdges }, exportNode.id, `in:${field.name}`))) {
    const firstField = exportFields[0];
    if (legacySource && firstField && !hasIncomingEdge({ edges: nextEdges }, exportNode.id, `in:${firstField.name}`)) {
      const edgeId = nextEdgeId(`workflow-io:${legacySource.nodeId}:${exportNode.id}:${firstField.name}`, edgeIds);
      edgeIds.add(edgeId);
      nextEdges.push({
        id: edgeId,
        source: legacySource.nodeId,
        target: exportNode.id,
        sourceHandle: legacySource.sourceHandle,
        targetHandle: `in:${firstField.name}`,
      });
      changed = true;
    }
  }

  return {
    workflow: changed ? { ...workflow, nodes: nextNodes, edges: nextEdges } : workflow,
    changed,
    errors: validateWorkflowIo({ nodes: nextNodes }),
    importNodeId: importNode.id,
    exportNodeId: exportNode.id,
  };
}
