import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProjectSheetValue, createNode, dedupeEdges, getInputOverrides, getInputSelections, getLogicalEdgeKey,
  isStructuredInputType, nodeDataFromSpec, parseLiteralValue, resolveCanvasNodeSpec, setInputOverride, setInputSelection,
  supportsProjectSheetInput,
} from './flowCanvasCore';
import type { FlowNodeSpec, SchemaPort } from '../../flowRegistry';
import type { SrcTableEntry } from '../../project/types';

function spec(overrides: Partial<FlowNodeSpec> = {}): FlowNodeSpec {
  return {
    id: 'generic:test', label: '测试节点', description: '测试', category: '测试', kind: 'generic',
    properties: [], ports: [], ...overrides,
  };
}

function port(overrides: Partial<SchemaPort>): SchemaPort {
  return { name: 'data', label: 'data', type: 'json-rows', direction: 'input', required: false, description: '', ...overrides };
}

test('nodeDataFromSpec produces empty contracts', () => {
  const data = nodeDataFromSpec(spec());
  assert.equal(data.specId, 'generic:test');
  assert.equal(data.propertiesJson, '{}');
  assert.equal(data.connectedPortsJson, '[]');
});

test('createNode generates unique ids and default grid position', () => {
  const a = createNode(spec(), 0);
  const b = createNode(spec(), 1);
  assert.notEqual(a.id, b.id);
  assert.equal(a.type, 'formflow');
  assert.deepEqual(a.position, { x: 120, y: 120 });
  assert.deepEqual(b.position, { x: 400, y: 120 });
});

test('dedupeEdges collapses logical duplicates', () => {
  const edges = [
    { source: 'a', target: 'b', sourceHandle: 'out:x', targetHandle: 'in:y' },
    { source: 'a', target: 'b', sourceHandle: 'out:x', targetHandle: 'in:y' },
    { source: 'a', target: 'b', sourceHandle: 'out:z', targetHandle: 'in:y' },
  ];
  const result = dedupeEdges(edges);
  assert.equal(result.length, 2);
  assert.equal(getLogicalEdgeKey(edges[0]), 'a::out:x=>b::in:y');
});

test('input overrides and selections round-trip and clean up when empty', () => {
  const withOverride = setInputOverride({ foo: 1 }, 'name', '张三');
  assert.deepEqual(getInputOverrides(withOverride), { name: '张三' });
  const cleaned = setInputOverride(withOverride, 'name', undefined);
  assert.equal('__inputOverrides' in cleaned, false);

  const withSelection = setInputSelection({ foo: 1 }, 'port', 'edge-1');
  assert.deepEqual(getInputSelections(withSelection), { port: 'edge-1' });
  const cleanedSelection = setInputSelection(withSelection, 'port', undefined);
  assert.equal('__inputSelections' in cleanedSelection, false);
});

test('structured input types and project-sheet ports', () => {
  assert.equal(isStructuredInputType('json-rows'), true);
  assert.equal(isStructuredInputType('string'), false);
  assert.equal(supportsProjectSheetInput(port({ type: 'worksheet' })), true);
  assert.equal(supportsProjectSheetInput(port({ type: 'array', name: 'rows' })), true);
  assert.equal(supportsProjectSheetInput(port({ type: 'array', name: 'count' })), false);
});

test('buildProjectSheetValue returns worksheet object or preview rows', () => {
  const table = { id: 't1', sheets: [{ name: 'S1', headers: ['a'], preview: [{ a: 1 }], rowCount: 1, colCount: 1 }] } as unknown as SrcTableEntry;
  const sheet = table.sheets[0];
  const ws = buildProjectSheetValue(port({ type: 'worksheet' }), table, sheet);
  assert.deepEqual((ws as any).__fromProject, true);
  const rows = buildProjectSheetValue(port({ type: 'array', name: 'rows' }), table, sheet);
  assert.deepEqual(rows, sheet.preview);
});

test('parseLiteralValue parses JSON or returns raw string', () => {
  assert.deepEqual(parseLiteralValue('{"a":1}'), { a: 1 });
  assert.equal(parseLiteralValue('abc'), 'abc');
  assert.equal(parseLiteralValue(''), undefined);
});

test('resolveCanvasNodeSpec falls back to removed-node spec', () => {
  assert.equal(resolveCanvasNodeSpec(undefined, 'nope'), undefined);
  const registry = { byId: new Map([['generic:test', spec()]]) } as any;
  assert.equal(resolveCanvasNodeSpec(registry, 'generic:test')?.id, 'generic:test');
});
