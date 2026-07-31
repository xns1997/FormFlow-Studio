import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignComponent, SrcTableEntry, WorkflowFile } from '../../project/types';
import { inspectComponent, buildDataFlowGraph } from './componentInspector';

const components: DesignComponent[] = [
  {
    id: 'name-input',
    type: 'input',
    x: 0, y: 0, width: 200, height: 60,
    fieldBinding: '姓名',
    props: {
      name: '姓名',
      label: '员工姓名',
      required: true,
      maxLength: 50,
      dataBinding: { version: 1, source: { kind: 'formField', path: '姓名' }, direction: 'twoWay' },
      linkageRules: {
        onChange: [{
          condition: 'form.姓名 !== ""',
          actions: [{ type: 'setValue', targetField: '拼音', expression: 'pinyin(form.姓名)' }],
        }],
      },
    },
  },
  {
    id: 'pinyin-input',
    type: 'input',
    x: 0, y: 80, width: 200, height: 60,
    fieldBinding: '拼音',
    props: { name: '拼音', label: '拼音', readonly: true },
  },
  {
    id: 'save-btn',
    type: 'button',
    x: 0, y: 160, width: 120, height: 48,
    props: {
      name: 'save',
      label: '保存',
      flowTriggers: {
        onClick: { enabled: true, workflowId: 'save-flow', parameterMap: {} },
      },
    },
  },
];

const tables: SrcTableEntry[] = [{
  id: 'employees',
  fileName: 'employees.xlsx',
  sheets: [{
    name: 'Sheet1',
    rowCount: 10,
    headers: ['姓名', '拼音', '部门'],
    columns: [
      { name: '姓名', dataType: 'string', nullable: false, uniqueCount: 10, sampleValues: ['张三', '李四'] },
      { name: '拼音', dataType: 'string', nullable: true, uniqueCount: 10, sampleValues: ['zhangsan', 'lisi'] },
      { name: '部门', dataType: 'string', nullable: false, uniqueCount: 3, sampleValues: ['技术部', '产品部'] },
    ],
  }],
}];

const workflows: WorkflowFile[] = [{
  id: 'save-flow',
  name: '保存流程',
  description: '保存员工数据',
  nodes: [
    { id: 'node-1', type: 'dataWrite', specId: 'data-write', position: { x: 0, y: 0 }, data: {} },
  ],
  edges: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}];

test('inspectComponent returns correct basic info', () => {
  const state = inspectComponent(components[0], components, tables, workflows);
  assert.equal(state.id, 'name-input');
  assert.equal(state.type, 'input');
  assert.equal(state.label, '员工姓名');
  assert.equal(state.field, '姓名');
});

test('inspectComponent detects active binding', () => {
  const state = inspectComponent(components[0], components, tables, workflows);
  assert.equal(state.bindings.length, 1);
  assert.equal(state.bindings[0].status, 'active');
});

test('inspectComponent detects missing binding', () => {
  const noBinding: DesignComponent = { ...components[1], props: { ...components[1].props, dataBinding: undefined } };
  const state = inspectComponent(noBinding, components, tables, workflows);
  assert.equal(state.bindings.length, 1);
  assert.equal(state.bindings[0].status, 'missing');
});

test('inspectComponent detects validations', () => {
  const state = inspectComponent(components[0], components, tables, workflows);
  assert.ok(state.validations.some((v) => v.type === 'required'));
  assert.ok(state.validations.some((v) => v.type === 'maxLength'));
});

test('inspectComponent detects linkages', () => {
  const state = inspectComponent(components[0], components, tables, workflows);
  assert.equal(state.linkages.length, 1);
  assert.equal(state.linkages[0].targetField, '拼音');
});

test('inspectComponent detects flow triggers', () => {
  const state = inspectComponent(components[2], components, tables, workflows);
  assert.equal(state.flowTriggers.length, 1);
  assert.equal(state.flowTriggers[0].status, 'valid');
  assert.equal(state.flowTriggers[0].workflowName, '保存流程');
});

test('inspectComponent finds source table', () => {
  const state = inspectComponent(components[0], components, tables, workflows);
  assert.equal(state.sourceTable, 'employees.xlsx');
  assert.equal(state.sourceSheet, 'Sheet1');
});

test('buildDataFlowGraph creates nodes for tables, components, and workflows', () => {
  const graph = buildDataFlowGraph(components, tables, workflows);
  const dataSources = graph.filter((n) => n.type === 'data-source');
  const compNodes = graph.filter((n) => n.type === 'component');
  const wfNodes = graph.filter((n) => n.type === 'workflow');
  assert.ok(dataSources.length >= 1);
  assert.ok(compNodes.length >= 2);
  assert.equal(wfNodes.length, 1);
});
