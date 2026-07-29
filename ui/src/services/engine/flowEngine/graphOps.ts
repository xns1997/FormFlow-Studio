/**
 * Graph operations for the flow engine.
 *
 * Pure functions for topological sorting, upstream selection, and level grouping.
 */
import type { FlowNodeDef, FlowEdgeDef } from './types';

export function topologicalSort(nodes: FlowNodeDef[], edges: FlowEdgeDef[]): FlowNodeDef[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adjacency.set(n.id, []);
  }
  for (const e of edges) {
    adjacency.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    sorted.push(cur);
    for (const next of adjacency.get(cur) || []) {
      const newDeg = (inDegree.get(next) || 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  if (sorted.length !== nodes.length) {
    const sortedIds = new Set(sorted);
    const cycleNodes = nodes.filter((node) => !sortedIds.has(node.id)).map((node) => node.id);
    throw new Error(`流程存在环路，无法确定执行顺序: ${cycleNodes.join(' -> ')}`);
  }
  return sorted.map((id) => nodes.find((n) => n.id === id)!);
}

export function selectUpstreamFlow(
  nodes: FlowNodeDef[],
  edges: FlowEdgeDef[],
  targetNodeId: string,
): { nodes: FlowNodeDef[]; edges: FlowEdgeDef[] } {
  if (!nodes.some((node) => node.id === targetNodeId)) {
    throw new Error(`目标节点不存在: ${targetNodeId}`);
  }
  const selected = new Set<string>([targetNodeId]);
  const stack = [targetNodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const edge of edges) {
      if (edge.target === current && !selected.has(edge.source)) {
        selected.add(edge.source);
        stack.push(edge.source);
      }
    }
  }
  return {
    nodes: nodes.filter((node) => selected.has(node.id)),
    edges: edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target)),
  };
}

export function groupByTopologicalLevel(sorted: FlowNodeDef[], edges: FlowEdgeDef[]): FlowNodeDef[][] {
  const levels: FlowNodeDef[][] = [];
  const inDegree = new Map<string, number>();
  for (const n of sorted) inDegree.set(n.id, 0);
  for (const e of edges) {
    if (inDegree.has(e.target)) inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }
  const visited = new Set<string>();
  let remaining = sorted.length;
  while (remaining > 0) {
    const level: FlowNodeDef[] = [];
    for (const n of sorted) {
      if (visited.has(n.id)) continue;
      const allPredecessorsVisited = edges
        .filter(e => e.target === n.id)
        .every(e => visited.has(e.source));
      if (allPredecessorsVisited) {
        level.push(n);
      }
    }
    if (level.length === 0) break;
    for (const n of level) {
      visited.add(n.id);
      remaining--;
    }
    levels.push(level);
  }
  return levels;
}
