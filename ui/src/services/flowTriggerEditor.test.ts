import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkflowFile } from '../project/types';
import {
  buildParameterMapFromDraftRows,
  createDefaultDraftRows,
  getWorkflowPortTargets,
  parseParameterMapToDraftRows,
  remapDraftRowsForWorkflow,
  type FlowParameterDraftRow,
} from './flowTriggerEditor';

const workflow = (nodes: WorkflowFile['nodes'], edges: WorkflowFile['edges'] = []): WorkflowFile => ({
  id: 'flow-1',
  name: '流程',
  description: '',
  nodes,
  edges,
  createdAt: '',
  updatedAt: '',
});

const node = (id: string, specId: string, properties: Record<string, unknown> = {}): WorkflowFile['nodes'][number] => ({
  id,
  type: 'flow-node',
  specId,
  position: { x: 0, y: 0 },
  data: { propertiesJson: JSON.stringify(properties) },
});

test('parameter map can be parsed into draft rows and rebuilt', () => {
  const target = workflow(
    [
      node('value', 'generic:variable-input', { varName: 'customerName' }),
      node('display', 'generic:output-display'),
    ],
    [{ id: 'e1', source: 'value', target: 'display', sourceHandle: 'out:value', targetHandle: 'in:value' }],
  );
  const parsed = parseParameterMapToDraftRows({
    customerName: '$value',
    'display.value': '$form.address',
    meta: { source: 'manual' },
  }, target);
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows.find((row) => row.targetKey === 'customerName')?.valueMode, 'eventValue');
  assert.equal(parsed.rows.find((row) => row.targetKey === 'display.value')?.targetType, 'nodePort');
  assert.equal(parsed.rows.find((row) => row.targetKey === 'display.value')?.valueMode, 'fieldValue');
  assert.equal(parsed.rows.find((row) => row.targetKey === 'meta')?.valueMode, 'staticJson');

  const rebuilt = buildParameterMapFromDraftRows(parsed.rows);
  assert.deepEqual(rebuilt, {
    customerName: '$value',
    'display.value': '$form.address',
    meta: { source: 'manual' },
  });
});

test('workflow port targets can be inferred from workflow edges', () => {
  const target = workflow(
    [
      node('input', 'generic:variable-input', { varName: 'customerName' }),
      node('display', 'generic:output-display'),
    ],
    [{ id: 'edge', source: 'input', target: 'display', sourceHandle: 'out:value', targetHandle: 'in:value' }],
  );
  assert.deepEqual(getWorkflowPortTargets(target).map((item) => item.key), ['display.value']);
});

test('workflow remap keeps same-name variables and removes stale rows', () => {
  const first = workflow([
    node('value', 'generic:variable-input', { varName: 'value' }),
    node('city', 'generic:variable-input', { varName: 'city' }),
  ]);
  const second = workflow([
    node('value', 'generic:variable-input', { varName: 'value' }),
    node('status', 'generic:variable-input', { varName: 'status' }),
  ]);
  const rows: FlowParameterDraftRow[] = [
    { id: '1', targetType: 'variable', targetKey: 'value', valueMode: 'expression', value: '$detail.current', enabled: true },
    { id: '2', targetType: 'variable', targetKey: 'city', valueMode: 'fieldValue', value: 'city', enabled: true },
  ];
  const remapped = remapDraftRowsForWorkflow(rows, second, 'customerName');
  assert.equal(remapped.some((row) => row.targetKey === 'value' && row.value === '$detail.current'), true);
  assert.equal(remapped.some((row) => row.targetKey === 'city'), false);
  assert.equal(remapped.some((row) => row.targetKey === 'status'), true);
});

test('default draft rows follow variable defaults from workflow', () => {
  const target = workflow([
    node('value', 'generic:variable-input', { varName: 'value' }),
    node('form', 'generic:variable-input', { varName: 'formData' }),
  ]);
  const rows = createDefaultDraftRows(target, 'customerName');
  assert.equal(rows.some((row) => row.targetKey === 'value' && row.valueMode === 'eventValue'), true);
  assert.equal(rows.some((row) => row.targetKey === 'formData' && row.valueMode === 'formData'), true);
});
