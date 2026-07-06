import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComponentNode } from '../models';
import type { SrcTableEntry, WorkflowFile } from '../project/types';
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

const tables: SrcTableEntry[] = [{
  id: 'issue_catalog',
  fileName: 'issue_catalog.json',
  fileSize: 0,
  fileType: 'json',
  uploadedAt: '2026-01-01T00:00:00.000Z',
  dataHash: 'issue-catalog',
  sheets: [{
    name: '问题字典',
    rowCount: 2,
    colCount: 3,
    headers: ['问题类型', '默认处理人', 'SLA小时'],
    columns: [],
    preview: [
      { 问题类型: '账号开通', 默认处理人: '李青', SLA小时: 4 },
      { 问题类型: '发票申请', 默认处理人: '王敏', SLA小时: 8 },
    ],
  }],
}];

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

test('runtime enriches generic and event-specific context values', async () => {
  const result = await executeFormControlEvent(context, {
    workflows: [], setValue: () => {},
    code: `return {
      previousValue: ctx.previousValue,
      dirty: ctx.dirty,
      changedFields: ctx.changedFields,
      componentId: ctx.componentId,
      detail: ctx.detail
    };`,
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.callbackResult, {
    previousValue: '旧客户', dirty: true, changedFields: ['customerName'], componentId: 'field-1',
    detail: { previousValue: '旧客户', value: '新客户', source: 'test' },
  });
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

test('controls are exposed on ctx and allow direct value assignment', async () => {
  const writes: Array<[string, unknown]> = [];
  const tableComponent: ComponentNode = {
    id: 'table-1',
    type: 'table',
    name: 'approvalResults',
    label: '审批结果',
    props: { columns: ['单号', '金额'] },
    layout: { row: 1, col: 0, colSpan: 1, rowSpan: 1 },
    ports: [],
    events: [],
  };
  const result = await executeFormControlEvent(context, {
    workflows: [],
    components: [component, tableComponent],
    setValue: (field, value) => { writes.push([field, value]); },
    code: `async (ctx) => {
      ctx.controls.approvalResults.value = [{ 单号: 'AP-1002', 金额: 1800 }];
      return ctx.controls.approvalResults.value;
    }`,
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(writes, [['approvalResults', [{ 单号: 'AP-1002', 金额: 1800 }]]]);
  assert.deepEqual(result.callbackResult, [{ 单号: 'AP-1002', 金额: 1800 }]);
});

test('control handles keep direct visible disabled and required writes readable in the same callback', async () => {
  const visibleCalls: Array<[string, boolean]> = [];
  const disabledCalls: Array<[string, boolean]> = [];
  const requiredCalls: Array<[string, boolean]> = [];
  const result = await executeFormControlEvent(context, {
    workflows: [],
    components: [component],
    setValue: () => {},
    setVisible: (componentId, visible) => { visibleCalls.push([componentId, visible]); },
    setDisabled: (componentId, disabled) => { disabledCalls.push([componentId, disabled]); },
    setRequired: (field, required) => { requiredCalls.push([field, required]); },
    code: `async (ctx) => {
      ctx.controls.customerName.visible = false;
      ctx.controls.customerName.disabled = true;
      ctx.controls.customerName.required = true;
      return {
        visible: ctx.controls.customerName.visible,
        disabled: ctx.controls.customerName.disabled,
        required: ctx.controls.customerName.required,
      };
    }`,
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(visibleCalls, [['field-1', false]]);
  assert.deepEqual(disabledCalls, [['field-1', true]]);
  assert.deepEqual(requiredCalls, [['customerName', true]]);
  assert.deepEqual(result.callbackResult, { visible: false, disabled: true, required: true });
});

test('row click events preserve row detail for table-driven edit flows', async () => {
  const tableComponent: ComponentNode = {
    id: 'table-1',
    type: 'table',
    name: 'employeeList',
    label: '员工列表',
    props: { columns: ['ID', '姓名', '部门', '在职'] },
    layout: { row: 1, col: 0, colSpan: 1, rowSpan: 1 },
    ports: [],
    events: [],
  };
  const result = await executeFormControlEvent({
    eventName: 'onRowClick',
    field: 'employeeList',
    value: 2,
    values: { employeeList: [{ ID: 3, 姓名: '王五', 部门: '技术部', 在职: false }] },
    originalValues: {},
    detail: { rowIndex: 2, row: { ID: 3, 姓名: '王五', 部门: '技术部', 在职: false } },
    component: tableComponent,
  }, {
    workflows: [],
    components: [tableComponent],
    setValue: () => {},
    code: `return { rowIndex: ctx.detail.rowIndex, row: ctx.detail.row };`,
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.callbackResult, {
    rowIndex: 2,
    row: { ID: 3, 姓名: '王五', 部门: '技术部', 在职: false },
  });
});

test('configured linkage rules run before the advanced script and can show traceable effects', async () => {
  const writes: Array<[string, unknown]> = [];
  const messages: string[] = [];
  const result = await executeFormControlEvent(context, {
    workflows: [],
    linkageRules: [{
      id: 'rule-1',
      name: '同步摘要',
      trigger: { eventName: 'onChange', sourceField: 'customerName' },
      enabled: true,
      priority: 10,
      conditionMode: 'all',
      conditions: [{ id: 'cond-1', field: 'customerName', operator: 'isNotEmpty' }],
      actions: [
        { id: 'action-1', type: 'setValue', targetField: 'summary', valueSource: 'event' },
        { id: 'action-2', type: 'showMessage', message: '已触发规则', level: 'success' },
      ],
    }],
    setValue: (field, value) => { writes.push([field, value]); },
    showMessage: (message) => { messages.push(message); },
    code: `return ctx.getValue('summary');`,
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(writes, [['summary', '新客户']]);
  assert.deepEqual(messages, ['已触发规则']);
  assert.equal(result.callbackResult, '新客户');
  assert.equal(result.trace.stages.some((stage) => stage.type === 'rule' && stage.status === 'success'), true);
  assert.equal(result.trace.effects.updatedFields.includes('summary'), true);
  assert.equal(result.trace.effects.messages[0]?.message, '已触发规则');
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

test('event callbacks can query project sheets directly from ctx.querySheet', async () => {
  const typeComponent: ComponentNode = {
    id: 'issue-type',
    type: 'select',
    name: '问题类型',
    label: '问题类型',
    props: {},
    layout: { row: 0, col: 0, colSpan: 1, rowSpan: 1 },
    ports: [],
    events: [],
  };
  const writes: Record<string, unknown> = {};
  const result = await executeFormControlEvent({
    eventName: 'onChange',
    field: '问题类型',
    value: '账号开通',
    values: { 问题类型: '账号开通' },
    originalValues: {},
    component: typeComponent,
  }, {
    workflows: [],
    tables,
    setValue: (field, value) => { writes[field] = value; },
    code: `async (ctx) => {
      const row = ctx.querySheet('issue_catalog').find((item) => item?.问题类型 === ctx.value);
      await ctx.setValue('处理人', row?.默认处理人 || '');
      return row?.默认处理人 || '';
    }`,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.callbackResult, '李青');
  assert.equal(writes['处理人'], '李青');
});
