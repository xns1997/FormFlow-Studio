import type { Edge } from '@xyflow/react';
import type { FlowNodeSpec, NodeRegistry, SchemaPort } from '../../flowRegistry';
import type { SrcTableEntry } from '../../project/types';
import { createRemovedWorkflowNodeSpec, isRemovedWorkflowNode } from './removedWorkflowNodes';

/**
 * 流程画布核心纯逻辑。
 *
 * 从 CanvasPage 提取的图操作（节点创建、边去重、输入覆盖、字面量解析、
 * 端口解析、Sheet 输入构造），页面只保留渲染与交互。
 */

export const INPUT_OVERRIDE_KEY = '__inputOverrides';

export type FlowNodeData = {
  specId: string;
  label: string;
  kind: string;
  category: string;
  description: string;
  propertiesJson: string;
  connectedPortsJson: string;
  outputPreview?: string;
  outputs?: Record<string, unknown>;
  error?: string;
  debugActive?: boolean;
};

export function nodeDataFromSpec(spec: FlowNodeSpec): FlowNodeData {
  return { specId: spec.id, label: spec.label, kind: spec.kind, category: spec.category, description: spec.description, propertiesJson: '{}', connectedPortsJson: '[]' };
}

export function getInputOverrides(properties: Record<string, unknown>) {
  const raw = properties[INPUT_OVERRIDE_KEY];
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

export function getInputSelections(properties: Record<string, unknown>) {
  const raw = properties.__inputSelections;
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, string>
    : {};
}

export function setInputOverride(properties: Record<string, unknown>, portName: string, value: unknown) {
  const current = getInputOverrides(properties);
  const next = { ...current };
  if (value === undefined) delete next[portName];
  else next[portName] = value;
  if (Object.keys(next).length === 0) {
    return Object.fromEntries(Object.entries(properties).filter(([key]) => key !== INPUT_OVERRIDE_KEY));
  }
  return { ...properties, [INPUT_OVERRIDE_KEY]: next };
}

export function setInputSelection(properties: Record<string, unknown>, portName: string, edgeId: string | undefined) {
  const current = getInputSelections(properties);
  const next = { ...current };
  if (!edgeId) delete next[portName];
  else next[portName] = edgeId;
  const withoutSelections = Object.fromEntries(Object.entries(properties).filter(([key]) => key !== '__inputSelections'));
  if (Object.keys(next).length === 0) return withoutSelections;
  return { ...withoutSelections, __inputSelections: next };
}

export function normalizeSheetKey(tableId: string, sheetName: string) {
  return `${tableId}::${sheetName}`;
}

export function getLogicalEdgeKey(edge: Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>) {
  return `${edge.source}::${edge.sourceHandle || ''}=>${edge.target}::${edge.targetHandle || ''}`;
}

export function dedupeEdges<T extends Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>>(edgeList: T[]) {
  const seen = new Set<string>();
  return edgeList.filter((edge) => {
    const key = getLogicalEdgeKey(edge);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isStructuredInputType(type: string) {
  return ['any', 'json', 'object', 'array', 'json-rows', 'filter', 'sort-config', 'validation-rule', 'style'].includes(type);
}

export function supportsProjectSheetInput(port: SchemaPort) {
  if (port.type === 'worksheet' || port.type === 'workbook' || port.type === 'json-rows') return true;
  if (port.type === 'array') {
    return /data|rows|records|items|list/i.test(port.name);
  }
  if (port.type === 'any') {
    return /data|rows|records|items|list|source|table|sheet/i.test(port.name);
  }
  return false;
}

export function buildProjectSheetValue(port: SchemaPort, table: SrcTableEntry, sheet: SrcTableEntry['sheets'][number]) {
  const worksheet = {
    __fromProject: true,
    tableId: table.id,
    sheetName: sheet.name,
    headers: sheet.headers,
    preview: sheet.preview,
    rowCount: sheet.rowCount,
    colCount: sheet.colCount,
  };
  if (port.type === 'worksheet' || port.type === 'workbook' || port.type === 'json-rows') return worksheet;
  if (port.type === 'array' || port.type === 'any') return sheet.preview;
  return undefined;
}

export function createNode(spec: FlowNodeSpec, index: number, position?: { x: number; y: number }) {
  return {
    id: `${spec.id}:${Date.now()}:${index}`,
    type: 'formflow' as const,
    position: position || { x: 120 + (index % 4) * 280, y: 120 + Math.floor(index / 4) * 180 },
    data: nodeDataFromSpec(spec),
  };
}

export function resolveCanvasNodeSpec(registry: NodeRegistry | null | undefined, specId: string): FlowNodeSpec | undefined {
  return registry?.byId.get(specId) || (isRemovedWorkflowNode(specId) ? createRemovedWorkflowNodeSpec(specId) : undefined);
}

export function parseLiteralValue(value: string) {
  if (value === '') return undefined;
  try { return JSON.parse(value); } catch { return value; }
}
