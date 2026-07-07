import type { WorkflowFile } from '../../project/types';
import { getRegistrySync } from '../../flowRegistry';
import { createDefaultParameterMap, getWorkflowVariableNames } from './formFlowTrigger';

export type FlowTriggerEditorMode = 'ui' | 'code';

export type FlowParameterTargetType = 'variable' | 'nodePort';
export type FlowParameterValueMode =
  | 'eventValue'
  | 'fieldName'
  | 'eventName'
  | 'formData'
  | 'originalValues'
  | 'previousValue'
  | 'detail'
  | 'timestamp'
  | 'dirty'
  | 'changedFields'
  | 'component'
  | 'fieldValue'
  | 'formPath'
  | 'originalPath'
  | 'detailPath'
  | 'contextPath'
  | 'staticJson'
  | 'expression';

export interface FlowParameterDraftRow {
  id: string;
  targetType: FlowParameterTargetType;
  targetKey: string;
  valueMode: FlowParameterValueMode;
  value: string;
  enabled: boolean;
}

export interface FlowParameterParseResult {
  rows: FlowParameterDraftRow[];
  unsupportedEntries: string[];
  errors: string[];
}

export interface WorkflowPortTarget {
  nodeId: string;
  nodeLabel: string;
  portName: string;
  portLabel: string;
  key: string;
}

function createDraftId(prefix = 'param') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stableJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseExactExpression(expression: string): { valueMode: FlowParameterValueMode; value: string } | null {
  const exactModes: Record<string, FlowParameterValueMode> = {
    '$value': 'eventValue',
    '$field': 'fieldName',
    '$event': 'eventName',
    '$values': 'formData',
    '$formData': 'formData',
    '$originalValues': 'originalValues',
    '$previousValue': 'previousValue',
    '$detail': 'detail',
    '$timestamp': 'timestamp',
    '$dirty': 'dirty',
    '$changedFields': 'changedFields',
    '$component': 'component',
  };
  if (exactModes[expression]) return { valueMode: exactModes[expression], value: '' };
  if (expression.startsWith('$form.')) {
    const path = expression.slice(6);
    return { valueMode: path.includes('.') ? 'formPath' : 'fieldValue', value: path };
  }
  if (expression.startsWith('$original.')) return { valueMode: 'originalPath', value: expression.slice(10) };
  if (expression.startsWith('$detail.')) return { valueMode: 'detailPath', value: expression.slice(8) };
  if (expression.startsWith('$context.')) return { valueMode: 'contextPath', value: expression.slice(9) };
  return null;
}

function stringifyStaticValue(value: unknown) {
  if (typeof value === 'string') return stableJson(value);
  return stableJson(value);
}

function buildExpressionFromRow(row: Pick<FlowParameterDraftRow, 'valueMode' | 'value'>): unknown {
  switch (row.valueMode) {
    case 'eventValue': return '$value';
    case 'fieldName': return '$field';
    case 'eventName': return '$event';
    case 'formData': return '$values';
    case 'originalValues': return '$originalValues';
    case 'previousValue': return '$previousValue';
    case 'detail': return '$detail';
    case 'timestamp': return '$timestamp';
    case 'dirty': return '$dirty';
    case 'changedFields': return '$changedFields';
    case 'component': return '$component';
    case 'fieldValue': return `$form.${row.value}`;
    case 'formPath': return `$form.${row.value}`;
    case 'originalPath': return `$original.${row.value}`;
    case 'detailPath': return `$detail.${row.value}`;
    case 'contextPath': return `$context.${row.value}`;
    case 'expression': return row.value;
    case 'staticJson':
      try {
        return JSON.parse(row.value);
      } catch {
        return row.value;
      }
    default:
      return row.value;
  }
}

export function getWorkflowPortTargets(workflow: WorkflowFile | undefined): WorkflowPortTarget[] {
  if (!workflow) return [];
  const registry = getRegistrySync();
  const fromSpecs = workflow.nodes.flatMap((node) => {
    const spec = registry?.byId.get(node.specId);
    const ports = (spec?.ports || [])
      .filter((port) => port.direction === 'input' || port.direction === 'both')
      .map((port) => ({
        nodeId: node.id,
        nodeLabel: String((node.data?.label as string) || spec?.label || node.id),
        portName: port.name,
        portLabel: String(port.label || port.name),
        key: `${node.id}.${port.name}`,
      }));
    return ports;
  });
  const fromEdges = workflow.edges.flatMap((edge) => {
    const target = workflow.nodes.find((node) => node.id === edge.target);
    if (!target || !edge.targetHandle) return [];
    const portName = edge.targetHandle.includes(':') ? edge.targetHandle.split(':').pop() || '' : edge.targetHandle;
    if (!portName) return [];
    return [{
      nodeId: target.id,
      nodeLabel: String((target.data?.label as string) || target.id),
      portName,
      portLabel: portName,
      key: `${target.id}.${portName}`,
    }];
  });
  return [...new Map([...fromSpecs, ...fromEdges].map((item) => [item.key, item])).values()];
}

export function parseParameterMapToDraftRows(
  parameterMap: Record<string, unknown> | undefined,
  workflow: WorkflowFile | undefined,
): FlowParameterParseResult {
  const supportedNodePorts = new Set(getWorkflowPortTargets(workflow).map((item) => item.key));
  const nodeIds = new Set((workflow?.nodes || []).map((node) => node.id));
  const rows: FlowParameterDraftRow[] = [];
  const unsupportedEntries: string[] = [];
  const errors: string[] = [];

  for (const [key, rawValue] of Object.entries(parameterMap || {})) {
    let targetType: FlowParameterTargetType = 'variable';
    if (supportedNodePorts.has(key)) targetType = 'nodePort';
    else if (key.includes('.')) {
      const [nodeId] = key.split('.', 1);
      if (nodeIds.has(nodeId)) targetType = 'nodePort';
    }
    if (!key.trim()) {
      errors.push('存在空参数名');
      continue;
    }

    if (typeof rawValue === 'string') {
      const parsed = parseExactExpression(rawValue);
      rows.push({
        id: createDraftId(),
        targetType,
        targetKey: key,
        valueMode: parsed?.valueMode || 'expression',
        value: parsed?.value ?? (parsed ? '' : rawValue),
        enabled: true,
      });
      continue;
    }

    if (
      rawValue == null
      || typeof rawValue === 'number'
      || typeof rawValue === 'boolean'
      || Array.isArray(rawValue)
      || isPlainObject(rawValue)
    ) {
      rows.push({
        id: createDraftId(),
        targetType,
        targetKey: key,
        valueMode: 'staticJson',
        value: stringifyStaticValue(rawValue),
        enabled: true,
      });
      continue;
    }

    unsupportedEntries.push(key);
  }

  return { rows, unsupportedEntries, errors };
}

export function buildParameterMapFromDraftRows(rows: FlowParameterDraftRow[]): Record<string, unknown> {
  const parameterMap: Record<string, unknown> = {};
  for (const row of rows) {
    if (!row.enabled) continue;
    const key = String(row.targetKey || '').trim();
    if (!key) continue;
    parameterMap[key] = buildExpressionFromRow(row);
  }
  return parameterMap;
}

export function createDefaultDraftRows(
  workflow: WorkflowFile | undefined,
  componentName: string,
): FlowParameterDraftRow[] {
  const parameterMap = createDefaultParameterMap(workflow, componentName);
  return parseParameterMapToDraftRows(parameterMap, workflow).rows;
}

export function remapDraftRowsForWorkflow(
  rows: FlowParameterDraftRow[],
  workflow: WorkflowFile | undefined,
  componentName: string,
): FlowParameterDraftRow[] {
  const defaultRows = createDefaultDraftRows(workflow, componentName);
  const variableNames = new Set(getWorkflowVariableNames(workflow));
  const portTargets = new Set(getWorkflowPortTargets(workflow).map((item) => item.key));
  const currentRows = rows.filter((row) => {
    if (!row.enabled) return true;
    if (row.targetType === 'variable') return variableNames.has(row.targetKey);
    return portTargets.has(row.targetKey);
  });

  const byKey = new Map(currentRows.map((row) => [row.targetKey, row]));
  const merged = defaultRows.map((row) => byKey.get(row.targetKey) || row);
  const extraPorts = currentRows.filter((row) => row.targetType === 'nodePort' && portTargets.has(row.targetKey) && !merged.some((item) => item.targetKey === row.targetKey));
  return [...merged, ...extraPorts];
}
