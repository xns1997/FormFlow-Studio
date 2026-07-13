import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutWorkflow } from './workflowLayout';
import type { WorkflowEdge, WorkflowNode } from '../../project/types';

function node(id: string, specId: string, x = 0, y = 0): WorkflowNode {
  return { id, type: 'flow-node', specId, position: { x, y }, data: {} };
}

function edge(id: string, source: string, target: string): WorkflowEdge {
  return { id, source, target };
}

test('workflow layout keeps import on the left and export on the right', () => {
  const result = layoutWorkflow({
    nodes: [
      node('import', 'workflow:import'),
      node('middle', 'generic:compare'),
      node('export', 'workflow:export'),
    ],
    edges: [edge('a', 'import', 'middle'), edge('b', 'middle', 'export')],
  });

  const byId = new Map(result.nodes.map((item) => [item.id, item] as const));
  assert.ok((byId.get('import')?.position.x || 0) < (byId.get('middle')?.position.x || 0));
  assert.ok((byId.get('middle')?.position.x || 0) < (byId.get('export')?.position.x || 0));
  assert.equal(result.edgeType, 'smoothstep');
});

test('workflow layout removes overlaps in a simple branch graph', () => {
  const result = layoutWorkflow({
    nodes: [
      node('import', 'workflow:import', 0, 0),
      node('branchA', 'generic:compare', 0, 0),
      node('branchB', 'generic:compare', 0, 0),
      node('merge', 'generic:merge', 0, 0),
      node('export', 'workflow:export', 0, 0),
    ],
    edges: [
      edge('a', 'import', 'branchA'),
      edge('b', 'import', 'branchB'),
      edge('c', 'branchA', 'merge'),
      edge('d', 'branchB', 'merge'),
      edge('e', 'merge', 'export'),
    ],
  });

  assert.equal(result.diagnostics.overlapCountAfter, 0);
});

test('workflow layout reports SCC warning for cyclic graph', () => {
  const result = layoutWorkflow({
    nodes: [
      node('import', 'workflow:import'),
      node('a', 'generic:compare'),
      node('b', 'generic:compare'),
      node('export', 'workflow:export'),
    ],
    edges: [
      edge('1', 'import', 'a'),
      edge('2', 'a', 'b'),
      edge('3', 'b', 'a'),
      edge('4', 'b', 'export'),
    ],
  });

  assert.ok(result.diagnostics.warnings.some((warning) => warning.includes('回环')));
});
