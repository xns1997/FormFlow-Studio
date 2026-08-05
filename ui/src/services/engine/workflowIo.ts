/**
 * Workflow IO field management.
 *
 * Manages import/export node creation, field definitions, and validation.
 * Legacy migration logic lives in workflowIoMigration.ts.
 */
import type { WorkflowEdge, WorkflowFile, WorkflowNode } from '../../project/types';
import { parseCustomJsPortDefinitions, type PortDefinitionEntry } from '../config/customJsNode';
import {
  findLegacyResultSource,
  migrateImportFields,
  migrateExportFields,
  persistStableIoFields,
  wireLegacyImportEdges,
  wireLegacyExportEdge,
} from './workflowIoMigration';

/** 导入节点 spec ID。 */
export const WORKFLOW_IMPORT_SPEC_ID = 'workflow:import';
/** 导出节点 spec ID。 */
export const WORKFLOW_EXPORT_SPEC_ID = 'workflow:export';

const WORKFLOW_IMPORT_NODE_ID = 'workflow:import';
const WORKFLOW_EXPORT_NODE_ID = 'workflow:export';

export interface WorkflowIoField extends PortDefinitionEntry {
  id: string;
}

function stableFieldId(nodeId: string, direction: 'input' | 'output', name: string) {
  let hash = 2166136261;
  const source = `${nodeId}:${direction}:${name}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `io_${direction}_${(hash >>> 0).toString(36)}`;
}

/** 归一化端口字段定义（去重、补默认方向）。 */
export function normalizeIoFields(node: WorkflowNode, direction: 'input' | 'output', fields: PortDefinitionEntry[]): WorkflowIoField[] {
  return fields.map((field) => ({
    ...field,
    id: String(field.id || '').trim() || stableFieldId(node.id, direction, field.name),
    ...(direction === 'output' ? { required: false } : {}),
  }));
}

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

// ─── Field access ─────────────────────────────────────────────────────────────

/** 获取导入端口字段（节点或工作流均可）。 */
export function getWorkflowImportFields(nodeOrWorkflow: WorkflowNode | Pick<WorkflowFile, 'nodes'> | undefined) {
  const node = nodeOrWorkflow && 'nodes' in nodeOrWorkflow ? getWorkflowImportNode(nodeOrWorkflow) : nodeOrWorkflow;
  if (!node) return [];
  return normalizeIoFields(node as WorkflowNode, 'input', parseCustomJsPortDefinitions(parseProperties(node as WorkflowNode).outputPorts));
}

/** 获取导出端口字段（节点或工作流均可）。 */
export function getWorkflowExportFields(nodeOrWorkflow: WorkflowNode | Pick<WorkflowFile, 'nodes'> | undefined) {
  const node = nodeOrWorkflow && 'nodes' in nodeOrWorkflow ? getWorkflowExportNode(nodeOrWorkflow) : nodeOrWorkflow;
  if (!node) return [];
  return normalizeIoFields(node as WorkflowNode, 'output', parseCustomJsPortDefinitions(parseProperties(node as WorkflowNode).inputPorts));
}

// ─── Node creation ────────────────────────────────────────────────────────────

/** 创建导入节点（ID 避开已有集合）。 */
export function createWorkflowImportNode(existingIds: Set<string>, position = { x: 80, y: 140 }): WorkflowNode {
  return createNode(nextNodeId(WORKFLOW_IMPORT_NODE_ID, existingIds), WORKFLOW_IMPORT_SPEC_ID, position.x, position.y, defaultWorkflowImportProperties());
}

/** 创建导出节点（ID 避开已有集合）。 */
export function createWorkflowExportNode(existingIds: Set<string>, position = { x: 760, y: 140 }): WorkflowNode {
  return createNode(nextNodeId(WORKFLOW_EXPORT_NODE_ID, existingIds), WORKFLOW_EXPORT_SPEC_ID, position.x, position.y, defaultWorkflowExportProperties());
}

/** 创建默认导入/导出节点骨架。 */
export function createWorkflowIoScaffold() {
  const importNode = createNode(WORKFLOW_IMPORT_NODE_ID, WORKFLOW_IMPORT_SPEC_ID, 80, 140, defaultWorkflowImportProperties());
  const exportNode = createNode(WORKFLOW_EXPORT_NODE_ID, WORKFLOW_EXPORT_SPEC_ID, 760, 140, defaultWorkflowExportProperties());
  return { nodes: [importNode, exportNode], edges: [] as WorkflowEdge[] };
}

// ─── Node lookup ──────────────────────────────────────────────────────────────

/** 工作流中的全部导入节点。 */
export function getWorkflowImportNodes(workflow: Pick<WorkflowFile, 'nodes'>) {
  return workflow.nodes.filter((node) => node.specId === WORKFLOW_IMPORT_SPEC_ID);
}

/** 工作流中的全部导出节点。 */
export function getWorkflowExportNodes(workflow: Pick<WorkflowFile, 'nodes'>) {
  return workflow.nodes.filter((node) => node.specId === WORKFLOW_EXPORT_SPEC_ID);
}

/** 工作流中的首个导入节点。 */
export function getWorkflowImportNode(workflow: Pick<WorkflowFile, 'nodes'>) {
  const matches = getWorkflowImportNodes(workflow);
  return matches.length === 1 ? matches[0] : null;
}

/** 工作流中的首个导出节点。 */
export function getWorkflowExportNode(workflow: Pick<WorkflowFile, 'nodes'>) {
  const matches = getWorkflowExportNodes(workflow);
  return matches.length === 1 ? matches[0] : null;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** 校验工作流 IO 配置（缺少导入/导出时给出提示）。 */
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

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/** 确保工作流包含导入/导出节点（缺失时补齐并返回更新后的工作流）。 */
export function ensureWorkflowIo(workflow: WorkflowFile, options: { legacyTargetNodeId?: string; persistFieldIds?: boolean } = {}) {
  const existingIds = new Set(workflow.nodes.map((node) => node.id));
  let nextNodes = [...workflow.nodes];
  let nextEdges = [...workflow.edges];
  let changed = false;

  // Ensure import node exists
  let importNode = getWorkflowImportNode(workflow);
  const importNodeExisted = !!importNode;
  if (!importNode) {
    const minX = workflow.nodes.length > 0 ? Math.min(...workflow.nodes.map((node) => node.position.x)) : 320;
    importNode = createWorkflowImportNode(existingIds, { x: minX - 320, y: 140 });
    existingIds.add(importNode.id);
    nextNodes.push(importNode);
    changed = true;
  }

  // Ensure export node exists
  let exportNode = getWorkflowExportNode({ nodes: nextNodes });
  const exportNodeExisted = !!exportNode;
  if (!exportNode) {
    const maxX = workflow.nodes.length > 0 ? Math.max(...workflow.nodes.map((node) => node.position.x)) : 520;
    exportNode = createWorkflowExportNode(existingIds, { x: maxX + 320, y: 140 });
    existingIds.add(exportNode.id);
    nextNodes.push(exportNode);
    changed = true;
  }

  // Migrate legacy fields
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

  // Persist stable field IDs if requested
  if (options.persistFieldIds) {
    const stableImports = normalizeIoFields(importNode, 'input', importFields);
    const persistedImport = persistStableIoFields(importNode, 'outputPorts', stableImports);
    if (persistedImport.changed) {
      const index = nextNodes.findIndex((node) => node.id === importNode!.id);
      if (index >= 0) nextNodes[index] = persistedImport.node;
      importNode = persistedImport.node;
      changed = true;
    }
    const stableExports = normalizeIoFields(exportNode, 'output', exportFields);
    const persistedExport = persistStableIoFields(exportNode, 'inputPorts', stableExports);
    if (persistedExport.changed) {
      const index = nextNodes.findIndex((node) => node.id === exportNode!.id);
      if (index >= 0) nextNodes[index] = persistedExport.node;
      exportNode = persistedExport.node;
      changed = true;
    }
  }

  // Wire legacy import edges
  const importWiring = wireLegacyImportEdges({ nodes: nextNodes, edges: nextEdges }, importNode, importFields);
  if (importWiring.changed) {
    nextEdges = importWiring.edges;
    changed = true;
  }

  // Wire legacy export edge
  const exportWiring = wireLegacyExportEdge({ edges: nextEdges }, exportNode, exportFields, legacySource);
  if (exportWiring.changed) {
    nextEdges = exportWiring.edges;
    changed = true;
  }

  return {
    workflow: changed ? { ...workflow, nodes: nextNodes, edges: nextEdges } : workflow,
    changed,
    errors: validateWorkflowIo({ nodes: nextNodes }),
    importNodeId: importNode.id,
    exportNodeId: exportNode.id,
  };
}
