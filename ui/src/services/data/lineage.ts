export type LineageNode = { id: string; label: string; kind: 'source' | 'field' | 'transform' | 'output'; tableId?: string; field?: string };
export type LineageEdge = { id: string; source: string; target: string; mapping?: string };
export type LineageGraph = { nodes: LineageNode[]; edges: LineageEdge[] };
export function buildLineage(project: any): LineageGraph {
  const nodes: LineageNode[] = []; const edges: LineageEdge[] = [];
  for (const table of project?.srcTable || []) for (const sheet of table.sheets || []) {
    const sourceId = `source:${table.id}:${sheet.name}`; nodes.push({ id: sourceId, label: `${table.fileName} / ${sheet.name}`, kind: 'source', tableId: table.id });
    for (const field of sheet.headers || []) { const id = `${sourceId}:${field}`; nodes.push({ id, label: field, kind: 'field', tableId: table.id, field }); edges.push({ id: `edge:${sourceId}:${field}`, source: sourceId, target: id }); }
  }
  for (const workflow of project?.workflows || []) for (const node of workflow.nodes || []) {
    const id = `flow:${workflow.id}:${node.id}`; nodes.push({ id, label: node.label || node.specId || node.id, kind: node.specId?.includes('output') ? 'output' : 'transform' });
  }
  for (const workflow of project?.workflows || []) for (const edge of workflow.edges || []) edges.push({ id: `flow-edge:${workflow.id}:${edge.id}`, source: `flow:${workflow.id}:${edge.source}`, target: `flow:${workflow.id}:${edge.target}`, mapping: `${edge.sourceHandle || ''} → ${edge.targetHandle || ''}` });
  return { nodes, edges };
}
export function impactAnalysis(graph: LineageGraph, nodeId: string) { const impacted = new Set<string>(); const visit = (id: string) => graph.edges.filter((edge) => edge.source === id).forEach((edge) => { if (!impacted.has(edge.target)) { impacted.add(edge.target); visit(edge.target); } }); visit(nodeId); return [...impacted]; }
