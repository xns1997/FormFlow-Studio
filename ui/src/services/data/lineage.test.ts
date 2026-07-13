import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLineage, impactAnalysis } from './lineage';
test('lineage builds field and workflow DAG with downstream impact', () => {
  const graph = buildLineage({ srcTable: [{ id: 't', fileName: 'a.csv', sheets: [{ name: 'S', headers: ['id'] }] }], workflows: [{ id: 'w', nodes: [{ id: 'a', specId: 'generic:value-input' }, { id: 'b', specId: 'generic:output-display' }], edges: [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'value', targetHandle: 'value' }] }] });
  assert.ok(graph.nodes.some((node) => node.kind === 'field'));
  assert.deepEqual(impactAnalysis(graph, 'flow:w:a'), ['flow:w:b']);
});
