import type { WorkflowEdge, WorkflowFile, WorkflowNode } from '../../project/types';
import type { LayoutDiagnostics, MeasuredNodeBox, WorkflowLayoutOptions, WorkflowLayoutResult } from './types';

type NodeMetrics = {
  width: number;
  height: number;
};

type PositionedNode = WorkflowNode & {
  metrics: NodeMetrics;
};

type CompactedGraph = {
  groups: string[][];
  nodeToGroup: Map<string, number>;
  edges: Array<{ from: number; to: number }>;
};

const DEFAULT_OPTIONS: Required<WorkflowLayoutOptions> = {
  columnGap: 140,
  rowGap: 72,
  marginX: 48,
  marginY: 120,
};

const IMPORT_SPEC_ID = 'workflow:import';
const EXPORT_SPEC_ID = 'workflow:export';

function getNodeMetrics(node: WorkflowNode, measuredMap: Map<string, MeasuredNodeBox>): NodeMetrics {
  const measured = measuredMap.get(node.id);
  const data = node.data as Record<string, unknown> | undefined;
  const guessedWidth = typeof data?.width === 'number' ? Math.max(180, data.width) : 220;
  const guessedHeight = typeof data?.height === 'number' ? Math.max(72, data.height) : 140;
  return {
    width: Math.max(180, Math.round(measured?.width || guessedWidth)),
    height: Math.max(72, Math.round(measured?.height || guessedHeight)),
  };
}

function rectsOverlap(a: PositionedNode, b: PositionedNode) {
  return !(
    a.position.x + a.metrics.width <= b.position.x ||
    b.position.x + b.metrics.width <= a.position.x ||
    a.position.y + a.metrics.height <= b.position.y ||
    b.position.y + b.metrics.height <= a.position.y
  );
}

function nodeCenter(node: PositionedNode) {
  return {
    x: node.position.x + node.metrics.width / 2,
    y: node.position.y + node.metrics.height / 2,
  };
}

function ccw(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
}

function segmentsCross(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
) {
  return ccw(a1, b1, b2) !== ccw(a2, b1, b2) && ccw(a1, a2, b1) !== ccw(a1, a2, b2);
}

function countNodeOverlaps(nodes: PositionedNode[]) {
  let overlaps = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (rectsOverlap(nodes[i], nodes[j])) overlaps += 1;
    }
  }
  return overlaps;
}

function countEdgeCrossings(nodes: PositionedNode[], edges: WorkflowEdge[]) {
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  let crossings = 0;
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const left = edges[i];
      const right = edges[j];
      if (left.source === right.source || left.source === right.target || left.target === right.source || left.target === right.target) continue;
      const a = byId.get(left.source);
      const b = byId.get(left.target);
      const c = byId.get(right.source);
      const d = byId.get(right.target);
      if (!a || !b || !c || !d) continue;
      if (segmentsCross(nodeCenter(a), nodeCenter(b), nodeCenter(c), nodeCenter(d))) crossings += 1;
    }
  }
  return crossings;
}

function buildCompactedGraph(nodes: WorkflowNode[], edges: WorkflowEdge[]): CompactedGraph {
  const bySource = new Map<string, string[]>();
  const byTarget = new Map<string, string[]>();
  for (const edge of edges) {
    bySource.set(edge.source, [...(bySource.get(edge.source) || []), edge.target]);
    byTarget.set(edge.target, [...(byTarget.get(edge.target) || []), edge.source]);
  }

  let index = 0;
  const stack: string[] = [];
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const inStack = new Set<string>();
  const groups: string[][] = [];

  const strongConnect = (id: string) => {
    indices.set(id, index);
    lowlinks.set(id, index);
    index += 1;
    stack.push(id);
    inStack.add(id);

    for (const neighbor of bySource.get(id) || []) {
      if (!indices.has(neighbor)) {
        strongConnect(neighbor);
        lowlinks.set(id, Math.min(lowlinks.get(id)!, lowlinks.get(neighbor)!));
      } else if (inStack.has(neighbor)) {
        lowlinks.set(id, Math.min(lowlinks.get(id)!, indices.get(neighbor)!));
      }
    }

    if (lowlinks.get(id) === indices.get(id)) {
      const group: string[] = [];
      while (stack.length > 0) {
        const current = stack.pop()!;
        inStack.delete(current);
        group.push(current);
        if (current === id) break;
      }
      groups.push(group);
    }
  };

  for (const node of nodes) {
    if (!indices.has(node.id)) strongConnect(node.id);
  }

  const nodeToGroup = new Map<string, number>();
  groups.forEach((group, groupIndex) => {
    group.forEach((id) => nodeToGroup.set(id, groupIndex));
  });

  const edgeSet = new Set<string>();
  const compactedEdges: Array<{ from: number; to: number }> = [];
  for (const edge of edges) {
    const from = nodeToGroup.get(edge.source);
    const to = nodeToGroup.get(edge.target);
    if (from === undefined || to === undefined || from === to) continue;
    const key = `${from}->${to}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    compactedEdges.push({ from, to });
  }

  return { groups, nodeToGroup, edges: compactedEdges };
}

function longestPathLayers(nodes: WorkflowNode[], compacted: CompactedGraph) {
  const importIds = new Set(nodes.filter((node) => node.specId === IMPORT_SPEC_ID).map((node) => node.id));
  const exportIds = new Set(nodes.filter((node) => node.specId === EXPORT_SPEC_ID).map((node) => node.id));
  const indegree = new Array(compacted.groups.length).fill(0);
  const outgoing = new Map<number, number[]>();
  const incoming = new Map<number, number[]>();

  for (const edge of compacted.edges) {
    indegree[edge.to] += 1;
    outgoing.set(edge.from, [...(outgoing.get(edge.from) || []), edge.to]);
    incoming.set(edge.to, [...(incoming.get(edge.to) || []), edge.from]);
  }

  const queue: number[] = [];
  indegree.forEach((deg, index) => {
    if (deg === 0) queue.push(index);
  });
  const topo: number[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    topo.push(current);
    for (const next of outgoing.get(current) || []) {
      indegree[next] -= 1;
      if (indegree[next] === 0) queue.push(next);
    }
  }
  for (let i = 0; i < compacted.groups.length; i += 1) {
    if (!topo.includes(i)) topo.push(i);
  }

  const layers = new Map<number, number>();
  for (const groupIndex of topo) {
    const isImportGroup = compacted.groups[groupIndex].some((id) => importIds.has(id));
    if (isImportGroup) {
      layers.set(groupIndex, 0);
      continue;
    }
    const parents = incoming.get(groupIndex) || [];
    const parentLayer = parents.length > 0 ? Math.max(...parents.map((parent) => layers.get(parent) ?? 0)) : 0;
    layers.set(groupIndex, parentLayer + (parents.length > 0 ? 1 : 0));
  }

  const maxLayer = Math.max(0, ...layers.values());
  for (let groupIndex = 0; groupIndex < compacted.groups.length; groupIndex += 1) {
    const isExportGroup = compacted.groups[groupIndex].some((id) => exportIds.has(id));
    if (isExportGroup) layers.set(groupIndex, maxLayer + 1);
  }

  return layers;
}

function sortWithinLayers(nodes: WorkflowNode[], edges: WorkflowEdge[], compacted: CompactedGraph, groupLayers: Map<number, number>) {
  const layers = new Map<number, number[]>();
  groupLayers.forEach((layer, groupIndex) => {
    layers.set(layer, [...(layers.get(layer) || []), groupIndex]);
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const incomingGroups = new Map<number, number[]>();
  const outgoingGroups = new Map<number, number[]>();
  for (const edge of compacted.edges) {
    incomingGroups.set(edge.to, [...(incomingGroups.get(edge.to) || []), edge.from]);
    outgoingGroups.set(edge.from, [...(outgoingGroups.get(edge.from) || []), edge.to]);
  }

  const priorityForGroup = (groupIndex: number) => {
    const group = compacted.groups[groupIndex].map((id) => nodeById.get(id)).filter(Boolean) as WorkflowNode[];
    if (group.some((node) => node.specId === IMPORT_SPEC_ID)) return -100;
    if (group.some((node) => node.specId === EXPORT_SPEC_ID)) return 100;
    if (group.some((node) => node.specId === 'generic:value-input')) return -20;
    if (group.some((node) => node.specId === 'generic:output-display')) return 20;
    return 0;
  };

  const layerIndexes = [...layers.keys()].sort((a, b) => a - b);
  const orderMap = new Map<number, number>();
  layerIndexes.forEach((layer) => {
    (layers.get(layer) || []).forEach((groupIndex, index) => {
      orderMap.set(groupIndex, index);
    });
  });

  for (let pass = 0; pass < 4; pass += 1) {
    for (const layer of layerIndexes) {
      const groups = layers.get(layer) || [];
      groups.sort((left, right) => {
        const leftParents = incomingGroups.get(left) || [];
        const rightParents = incomingGroups.get(right) || [];
        const leftMedian = leftParents.length > 0 ? leftParents.reduce((sum, id) => sum + (orderMap.get(id) ?? 0), 0) / leftParents.length : orderMap.get(left) ?? 0;
        const rightMedian = rightParents.length > 0 ? rightParents.reduce((sum, id) => sum + (orderMap.get(id) ?? 0), 0) / rightParents.length : orderMap.get(right) ?? 0;
        return leftMedian - rightMedian || priorityForGroup(left) - priorityForGroup(right);
      });
      groups.forEach((groupIndex, index) => orderMap.set(groupIndex, index));
    }
    for (const layer of [...layerIndexes].reverse()) {
      const groups = layers.get(layer) || [];
      groups.sort((left, right) => {
        const leftChildren = outgoingGroups.get(left) || [];
        const rightChildren = outgoingGroups.get(right) || [];
        const leftMedian = leftChildren.length > 0 ? leftChildren.reduce((sum, id) => sum + (orderMap.get(id) ?? 0), 0) / leftChildren.length : orderMap.get(left) ?? 0;
        const rightMedian = rightChildren.length > 0 ? rightChildren.reduce((sum, id) => sum + (orderMap.get(id) ?? 0), 0) / rightChildren.length : orderMap.get(right) ?? 0;
        return leftMedian - rightMedian || priorityForGroup(left) - priorityForGroup(right);
      });
      groups.forEach((groupIndex, index) => orderMap.set(groupIndex, index));
    }
  }

  return { layers, orderMap };
}

function placeNodes(
  nodes: WorkflowNode[],
  measuredMap: Map<string, MeasuredNodeBox>,
  groupLayers: Map<number, number>,
  compacted: CompactedGraph,
  options: Required<WorkflowLayoutOptions>,
) {
  const { layers, orderMap } = sortWithinLayers(nodes, [], compacted, groupLayers);
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const groupedNodes = new Map<number, PositionedNode[]>();

  compacted.groups.forEach((group, groupIndex) => {
    const positioned = group
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((node) => ({ ...node!, metrics: getNodeMetrics(node!, measuredMap) }));
    groupedNodes.set(groupIndex, positioned);
  });

  const layerKeys = [...layers.keys()].sort((a, b) => a - b);
  const xByLayer = new Map<number, number>();
  let currentX = options.marginX;
  for (const layer of layerKeys) {
    const groupIds = layers.get(layer) || [];
    const widest = Math.max(0, ...groupIds.map((groupId) => Math.max(...(groupedNodes.get(groupId) || []).map((node) => node.metrics.width), 220)));
    xByLayer.set(layer, currentX);
    currentX += widest + options.columnGap;
  }

  const positioned: PositionedNode[] = [];
  for (const layer of layerKeys) {
    const groupIds = (layers.get(layer) || []).slice().sort((left, right) => (orderMap.get(left) ?? 0) - (orderMap.get(right) ?? 0));
    let currentY = options.marginY;
    for (const groupId of groupIds) {
      const groupNodes = (groupedNodes.get(groupId) || []).slice().sort((left, right) => {
        if (left.specId === IMPORT_SPEC_ID) return -1;
        if (right.specId === IMPORT_SPEC_ID) return 1;
        if (left.specId === EXPORT_SPEC_ID) return 1;
        if (right.specId === EXPORT_SPEC_ID) return -1;
        return left.id.localeCompare(right.id);
      });
      const groupX = xByLayer.get(layer) ?? options.marginX;
      const groupWidth = Math.max(...groupNodes.map((node) => node.metrics.width));
      for (let i = 0; i < groupNodes.length; i += 1) {
        const node = groupNodes[i];
        positioned.push({
          ...node,
          position: {
            x: Math.round(groupX + (groupWidth - node.metrics.width) / 2 + i * 18),
            y: Math.round(currentY + i * 18),
          },
        });
      }
      const groupHeight = Math.max(...groupNodes.map((node) => node.metrics.height)) + Math.max(0, groupNodes.length - 1) * 18;
      currentY += groupHeight + options.rowGap;
    }
  }

  return positioned;
}

export function layoutWorkflow(
  workflow: Pick<WorkflowFile, 'nodes' | 'edges'>,
  measuredNodes: MeasuredNodeBox[] = [],
  options: WorkflowLayoutOptions = {},
): WorkflowLayoutResult {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const measuredMap = new Map(measuredNodes.map((item) => [item.id, item] as const));
  const beforeNodes: PositionedNode[] = workflow.nodes.map((node) => ({
    ...node,
    metrics: getNodeMetrics(node, measuredMap),
  }));
  const compacted = buildCompactedGraph(workflow.nodes, workflow.edges);
  const layers = longestPathLayers(workflow.nodes, compacted);
  const positioned = placeNodes(workflow.nodes, measuredMap, layers, compacted, resolved);

  const diagnostics: LayoutDiagnostics = {
    overlapCountBefore: countNodeOverlaps(beforeNodes),
    overlapCountAfter: countNodeOverlaps(positioned),
    edgeCrossingsBefore: countEdgeCrossings(beforeNodes, workflow.edges),
    edgeCrossingsAfter: countEdgeCrossings(positioned, workflow.edges),
    warnings: [],
  };

  if (compacted.groups.some((group) => group.length > 1)) {
    diagnostics.warnings.push('流程包含回环，已按强连通分量压缩后布局。');
  }
  if (diagnostics.edgeCrossingsAfter > 0) {
    diagnostics.warnings.push('已最小化交叉，无法保证绝对零交叉。');
  }

  return {
    nodes: positioned.map(({ metrics: _metrics, ...node }) => node),
    diagnostics,
    edgeType: 'smoothstep',
  };
}
