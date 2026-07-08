import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkflowFile } from '../../project/types';
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
      node('workflow:import', 'workflow:import', {
        outputPorts: JSON.stringify([
          { name: 'value', type: 'any' },
          { name: 'customerName', type: 'string' },
          { name: 'payload', type: 'object' },
        ]),
      }),
      node('workflow:export', 'workflow:export', { inputPorts: JSON.stringify([{ name: 'result', type: 'any' }]) }),
    ],
  );
  const parsed = parseParameterMapToDraftRows({
    'workflow:import.value': '$value',
    'workflow:import.customerName': '$form.address',
    meta: { source: 'manual' },
  }, target);
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows.find((row) => row.targetKey === 'workflow:import.value')?.valueMode, 'eventValue');
  assert.equal(parsed.rows.find((row) => row.targetKey === 'workflow:import.customerName')?.targetType, 'nodePort');
  assert.equal(parsed.rows.find((row) => row.targetKey === 'workflow:import.customerName')?.valueMode, 'fieldValue');
  assert.equal(parsed.rows.find((row) => row.targetKey === 'meta')?.valueMode, 'staticJson');

  const rebuilt = buildParameterMapFromDraftRows(parsed.rows);
  assert.deepEqual(rebuilt, {
    'workflow:import.value': '$value',
    'workflow:import.customerName': '$form.address',
    meta: { source: 'manual' },
  });
});

test('workflow port targets are inferred from workflow import outputs', () => {
  const target = workflow([
    node('workflow:import', 'workflow:import', { outputPorts: JSON.stringify([{ name: 'customerId', type: 'number' }, { name: 'message', type: 'string' }]) }),
    node('workflow:export', 'workflow:export', { inputPorts: JSON.stringify([{ name: 'result', type: 'any' }]) }),
  ]);
  const keys = getWorkflowPortTargets(target).map((item) => item.key);
  assert.equal(keys.includes('workflow:import.customerId'), true);
  assert.equal(keys.includes('workflow:import.message'), true);
});

test('workflow remap keeps matching import rows and removes stale legacy rows', () => {
  const first = workflow([
    node('workflow:import', 'workflow:import', { outputPorts: JSON.stringify([{ name: 'value', type: 'any' }, { name: 'city', type: 'string' }]) }),
    node('workflow:export', 'workflow:export', { inputPorts: JSON.stringify([{ name: 'result', type: 'any' }]) }),
  ]);
  const second = workflow([
    node('workflow:import', 'workflow:import', { outputPorts: JSON.stringify([{ name: 'value', type: 'any' }, { name: 'status', type: 'string' }]) }),
    node('workflow:export', 'workflow:export', { inputPorts: JSON.stringify([{ name: 'result', type: 'any' }]) }),
  ]);
  const rows: FlowParameterDraftRow[] = [
    { id: '1', targetType: 'nodePort', targetKey: 'workflow:import.value', valueMode: 'expression', value: '$detail.current', enabled: true },
    { id: '2', targetType: 'variable', targetKey: 'city', valueMode: 'fieldValue', value: 'city', enabled: true },
  ];
  const remapped = remapDraftRowsForWorkflow(rows, second, 'customerName');
  assert.equal(remapped.some((row) => row.targetKey === 'workflow:import.value' && row.value === '$detail.current'), true);
  assert.equal(remapped.some((row) => row.targetKey === 'city'), false);
  assert.equal(remapped.some((row) => row.targetKey === 'workflow:import.status'), true);
});

test('default draft rows follow workflow import defaults', () => {
  const target = workflow([
    node('workflow:import', 'workflow:import', { outputPorts: JSON.stringify([{ name: 'value', type: 'any' }, { name: 'status', type: 'string' }]) }),
    node('workflow:export', 'workflow:export', { inputPorts: JSON.stringify([{ name: 'result', type: 'any' }]) }),
  ]);
  const rows = createDefaultDraftRows(target, 'customerName');
  assert.equal(rows.some((row) => row.targetKey === 'workflow:import.value' && row.valueMode === 'eventValue'), true);
  assert.equal(rows.some((row) => row.targetKey === 'workflow:import.status' && row.valueMode === 'fieldValue' && row.value === 'status'), true);
});
