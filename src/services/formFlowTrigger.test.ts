import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComponentNode } from '../models';
import type { WorkflowFile } from '../project/types';
import {
  createDefaultParameterMap,
  executeFormFlowTrigger,
  resolveFormFlowParameters,
  resolveFormFlowValue,
  splitFlowParameterTargets,
  type FormControlEventContext,
} from './formFlowTrigger';

const component: ComponentNode = {
  id: 'customer-control',
  type: 'input',
  name: 'customerName',
  label: '客户名称',
  props: {},
  layout: { row: 0, col: 0, colSpan: 1, rowSpan: 1 },
  ports: [],
  events: [],
};

const context: FormControlEventContext = {
  eventName: 'onChange',
  field: 'customerName',
  value: '新客户',
  values: { customerName: '新客户', address: { city: '杭州' } },
  originalValues: { customerName: '旧客户' },
  component,
};

const workflow = (nodes: WorkflowFile['nodes'], edges: WorkflowFile['edges'] = []): WorkflowFile => ({
  id: 'flow-1',
  name: '控件触发流程',
  description: '',
  nodes,
  edges,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const flowNode = (id: string, specId: string, properties: Record<string, unknown> = {}): WorkflowFile['nodes'][number] => ({
  id,
  type: 'flow-node',
  specId,
  position: { x: 0, y: 0 },
  data: { propertiesJson: JSON.stringify(properties) },
});

test('form flow expressions resolve current, nested, original and component values', () => {
  assert.equal(resolveFormFlowValue('$value', context), '新客户');
  assert.equal(resolveFormFlowValue('$form.address.city', context), '杭州');
  assert.equal(resolveFormFlowValue('$original.customerName', context), '旧客户');
  assert.equal(resolveFormFlowValue('$component.name', context), 'customerName');
  assert.equal(resolveFormFlowValue('固定文本', context), '固定文本');
  assert.deepEqual(resolveFormFlowValue({
    customer: '$value',
    location: { city: '$form.address.city' },
    history: ['$original.customerName', '$field'],
  }, context), {
    customer: '新客户',
    location: { city: '杭州' },
    history: ['旧客户', 'customerName'],
  });
});

test('parameter resolution includes built-in event context and custom mappings', () => {
  const parameters = resolveFormFlowParameters({
    enabled: true,
    workflowId: 'flow-1',
    parameterMap: { city: '$form.address.city', oldName: '$original.customerName', entireContext: '$context' },
  }, context);
  assert.equal(parameters.value, '新客户');
  assert.equal(parameters.field, 'customerName');
  assert.equal(parameters.event, 'onChange');
  assert.equal(parameters.city, '杭州');
  assert.equal(parameters.oldName, '旧客户');
  assert.deepEqual(parameters.formData, context.values);
  assert.equal((parameters.entireContext as FormControlEventContext).eventName, 'onChange');
});

test('nodeId.port parameters are separated from workflow variables', () => {
  const targetWorkflow = workflow([flowNode('display', 'generic:output-display')]);
  assert.deepEqual(splitFlowParameterTargets(targetWorkflow, {
    'display.value': 42,
    customerName: '新客户',
  }), {
    variables: { customerName: '新客户' },
    nodeInputs: { display: { value: 42 } },
  });
});

test('a form event injects a mapped value and runs the workflow end to end', async () => {
  const targetWorkflow = workflow([
    flowNode('input', 'generic:variable-input', { varName: 'customerName', varType: 'string', varValue: '默认值' }),
    flowNode('display', 'generic:output-display'),
  ], [{ id: 'edge', source: 'input', target: 'display', sourceHandle: 'out:value', targetHandle: 'in:value' }]);
  const result = await executeFormFlowTrigger(targetWorkflow, {
    enabled: true,
    workflowId: targetWorkflow.id,
    parameterMap: { customerName: '$value' },
  }, context);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.equal(result.nodeResults.get('display')?.outputs.value, '新客户');
});

test('default mappings match declared variable names', () => {
  const targetWorkflow = workflow([
    flowNode('value', 'generic:variable-input', { varName: 'value' }),
    flowNode('form', 'generic:variable-input', { varName: 'formData' }),
    flowNode('city', 'generic:variable-input', { varName: 'city' }),
  ]);
  assert.deepEqual(createDefaultParameterMap(targetWorkflow, 'customerName'), {
    value: '$value',
    formData: '$values',
    city: '$form.city',
  });
});

test('default mappings expose enriched event variables by their conventional names', () => {
  const targetWorkflow = workflow([
    flowNode('old', 'generic:variable-input', { varName: 'previousValue' }),
    flowNode('changed', 'generic:variable-input', { varName: 'changedFields' }),
    flowNode('detail', 'generic:variable-input', { varName: 'detail' }),
  ]);
  assert.deepEqual(createDefaultParameterMap(targetWorkflow, 'customerName'), {
    previousValue: '$previousValue', changedFields: '$changedFields', detail: '$detail',
  });
});
