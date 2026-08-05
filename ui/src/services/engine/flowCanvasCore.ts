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

/** 节点属性中保存输入覆盖值的内部键。 */
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

/** 由节点 spec 构造默认节点数据。 */
export function nodeDataFromSpec(spec: FlowNodeSpec): FlowNodeData {
  return { specId: spec.id, label: spec.label, kind: spec.kind, category: spec.category, description: spec.description, propertiesJson: '{}', connectedPortsJson: '[]' };
}

/** 读取节点的输入覆盖值（端口名 → 值）。 */
export function getInputOverrides(properties: Record<string, unknown>) {
  const raw = properties[INPUT_OVERRIDE_KEY];
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

/** 读取端口当前的连线选择（端口名 → edgeId）。 */
export function getInputSelections(properties: Record<string, unknown>) {
  const raw = properties.__inputSelections;
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, string>
    : {};
}

/** 写入端口输入覆盖值。 */
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

/** 写入端口的连线选择。 */
export function setInputSelection(properties: Record<string, unknown>, portName: string, edgeId: string | undefined) {
  const current = getInputSelections(properties);
  const next = { ...current };
  if (!edgeId) delete next[portName];
  else next[portName] = edgeId;
  const withoutSelections = Object.fromEntries(Object.entries(properties).filter(([key]) => key !== '__inputSelections'));
  if (Object.keys(next).length === 0) return withoutSelections;
  return { ...withoutSelections, __inputSelections: next };
}

/** 规范化 Sheet 键（去空白、统一分隔符）。 */
export function normalizeSheetKey(tableId: string, sheetName: string) {
  return `${tableId}::${sheetName}`;
}

/** 边的逻辑键（source/target/端口），用于去重。 */
export function getLogicalEdgeKey(edge: Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>) {
  return `${edge.source}::${edge.sourceHandle || ''}=>${edge.target}::${edge.targetHandle || ''}`;
}

/** 按逻辑键去重边（保留首个）。 */
export function dedupeEdges<T extends Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>>(edgeList: T[]) {
  const seen = new Set<string>();
  return edgeList.filter((edge) => {
    const key = getLogicalEdgeKey(edge);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 是否为结构化输入类型（表/数组/对象）。 */
export function isStructuredInputType(type: string) {
  return ['any', 'json', 'object', 'array', 'json-rows', 'filter', 'sort-config', 'validation-rule', 'style'].includes(type);
}

/** 端口是否支持项目 Sheet 输入。 */
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

/** 构造项目 Sheet 输入值（表引用对象）。 */
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

/** 创建画布节点（生成唯一 ID 与默认数据）。 */
export function createNode(spec: FlowNodeSpec, index: number, position?: { x: number; y: number }) {
  return {
    id: `${spec.id}:${Date.now()}:${index}`,
    type: 'formflow' as const,
    position: position || { x: 120 + (index % 4) * 280, y: 120 + Math.floor(index / 4) * 180 },
    data: nodeDataFromSpec(spec),
  };
}

/** 从节点注册表解析 spec（含类别前缀回退）。 */
export function resolveCanvasNodeSpec(registry: NodeRegistry | null | undefined, specId: string): FlowNodeSpec | undefined {
  return registry?.byId.get(specId) || (isRemovedWorkflowNode(specId) ? createRemovedWorkflowNodeSpec(specId) : undefined);
}

/** 解析字面量字符串（数字/布尔/JSON/原样）。 */
export function parseLiteralValue(value: string) {
  if (value === '') return undefined;
  try { return JSON.parse(value); } catch { return value; }
}
