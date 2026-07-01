import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComponentNode } from '../models';
import type { WorkflowFile } from '../project/types';
import { executeFormControlEvent } from './formEventExecutor';

const component: ComponentNode = {
  id: 'field-1',
  type: 'input',
  name: 'customerName',
  label: '客户名称',
  props: {},
  layout: { row: 0, col: 0, colSpan: 1, rowSpan: 1 },
  ports: [],
  events: [],
};

const workflow: WorkflowFile = {
  id: 'flow-1',
  name: '客户流程',
  description: '',
  nodes: [
    {
      id: 'input', type: 'flow-node', specId: 'generic:variable-input', position: { x: 0, y: 0 },
      data: { propertiesJson: JSON.stringify({ varName: 'customerName', varValue: '默认值' }) },
    },
    {
      id: 'display', type: 'flow-node', specId: 'generic:output-display', position: { x: 200, y: 0 },
      data: { propertiesJson: '{}' },
    },
  ],
  edges: [{ id: 'edge', source: 'input', target: 'display', sourceHandle: 'out:value', targetHandle: 'in:value' }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const context = {
  eventName: 'onChange',
  field: 'customerName',
  value: '新客户',
  values: { customerName: '新客户' },
  originalValues: { customerName: '旧客户' },
  detail: { source: 'test' },
  component,
};

test('function-style async callbacks can set values and return a result', async () => {
  const writes: Record<string, unknown> = {};
  const result = await executeFormControlEvent(context, {
    workflows: [],
    setValue: async (field, value) => { writes[field] = value; },
    code: `async (ctx) => {
      await ctx.setValue('summary', ctx.value + ':' + ctx.detail.source);
      return { field: ctx.field, value: ctx.getValue(ctx.field), summary: ctx.getValue('summary') };
    }`,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.callbackExecuted, true);
  assert.deepEqual(result.callbackResult, { field: 'customerName', value: '新客户', summary: '新客户:test' });
  assert.equal(writes.summary, '新客户:test');
});

test('callbacks can directly control preview visibility, disabled and required state', async () => {
  const visibleCalls: Array<[string, boolean]> = [];
  const disabledCalls: Array<[string, boolean]> = [];
  const requiredCalls: Array<[string, boolean]> = [];
  const result = await executeFormControlEvent(context, {
    workflows: [],
    setValue: () => {},
    setVisible: (componentId, visible) => { visibleCalls.push([componentId, visible]); },
    setDisabled: (componentId, disabled) => { disabledCalls.push([componentId, disabled]); },
    setRequired: (field, required) => { requiredCalls.push([field, required]); },
    code: `async (ctx) => {
      await ctx.setVisible('field-1', false);
      await ctx.setDisabled('field-1', true);
      await ctx.setRequired('customerName', true);
      return 'ok';
    }`,
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(visibleCalls, [['field-1', false]]);
  assert.deepEqual(disabledCalls, [['field-1', true]]);
  assert.deepEqual(requiredCalls, [['customerName', true]]);
});

test('callbacks can call host-registered functions by name', async () => {
  const result = await executeFormControlEvent(context, {
    workflows: [],
    setValue: () => {},
    callbacks: {
      normalize: (_ctx, value) => String(value).toUpperCase(),
    },
    code: `return await ctx.call('normalize', ctx.value);`,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.callbackResult, '新客户');
});

test('a callback can run its configured workflow with direct parameters without an automatic duplicate run', async () => {
  const result = await executeFormControlEvent(context, {
    workflows: [workflow],
    setValue: () => {},
    trigger: { enabled: true, workflowId: workflow.id, parameterMap: { customerName: '$value' } },
    code: `async (ctx) => {
      const flow = await ctx.runConfiguredWorkflow({ customerName: '回调参数' });
      return flow.nodeResults.get('display').outputs.value;
    }`,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.callbackResult, '回调参数');
  assert.equal(result.flowExecuted, true);
  assert.equal(result.flowResults.length, 1);
});
