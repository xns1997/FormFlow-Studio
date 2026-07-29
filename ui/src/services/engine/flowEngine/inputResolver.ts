/**
 * Input resolution for the flow engine.
 *
 * Handles collecting inputs from edges and building scope maps.
 */
import type { FlowEdgeDef } from './types';

export function extractPortName(handle: string | undefined, direction: 'in' | 'out'): string {
  if (!handle) return direction === 'in' ? '_args' : 'result';
  return handle.replace(/^(in:|out:)/, '');
}

export function buildScopeMap(
  nodeId: string,
  edges: FlowEdgeDef[],
  nodeOutputs: Map<string, Record<string, unknown>>,
): Map<string, Record<string, unknown>> {
  const scope = new Map<string, Record<string, unknown>>();
  const sourceIds = new Set(
    edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source),
  );
  for (const sourceId of sourceIds) {
    const output = nodeOutputs.get(sourceId);
    if (output) scope.set(sourceId, output);
  }
  return scope;
}

export function collectInputs(
  nodeId: string,
  edges: FlowEdgeDef[],
  nodeOutputs: Map<string, Record<string, unknown>>,
  selectedEdgeIdsByPort: Record<string, string> = {},
  scopeMap?: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  const targetEdges = edges.filter((edge) => edge.target === nodeId);
  const grouped = new Map<string, FlowEdgeDef[]>();
  for (const edge of targetEdges) {
    const portName = extractPortName(edge.targetHandle, 'in');
    const list = grouped.get(portName) || [];
    list.push(edge);
    grouped.set(portName, list);
  }

  for (const [portName, portEdges] of grouped) {
    const selected = selectedEdgeIdsByPort[portName];
    const edge = portEdges.find((item) => item.id === selected) || portEdges[portEdges.length - 1];
    if (!edge) continue;
    const srcOutput = scopeMap ? scopeMap.get(edge.source) : nodeOutputs.get(edge.source);
    if (!srcOutput) throw new Error(`上游节点 ${edge.source} 尚未执行`);
    const srcPortName = extractPortName(edge.sourceHandle, 'out');
    if (edge.sourceHandle) {
      if (!Object.prototype.hasOwnProperty.call(srcOutput, srcPortName)) {
        throw new Error(`上游节点 ${edge.source} 没有输出端口 "${srcPortName}"`);
      }
      inputs[portName] = srcOutput[srcPortName];
    } else {
      const keys = Object.keys(srcOutput).filter((key) => !key.startsWith('__'));
      const fallbackKey = keys.length === 1 ? keys[0] : (Object.prototype.hasOwnProperty.call(srcOutput, 'result') ? 'result' : 'value');
      inputs[portName] = srcOutput[fallbackKey];
    }
  }
  return inputs;
}

export function resolveInputSelections(properties: Record<string, unknown>) {
  const raw = properties.__inputSelections;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, string>;
}
