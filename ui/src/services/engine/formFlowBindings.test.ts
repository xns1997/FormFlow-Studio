import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComponentNode } from '../../models';
import type { DesignComponent, WorkflowFile } from '../../project/types';
import {
  normalizeFlowBindings,
  prepareV2FlowOutputWrites,
  resolveV2FlowInputs,
  type FlowBindingsV2,
} from './formFlowBindings';
import { ensureWorkflowIo, getWorkflowExportFields, getWorkflowImportFields } from './workflowIo';

const designComponent = (id: string, field: string, type = 'input'): DesignComponent => ({
  id,
  type,
  x: 0,
  y: 0,
  width: 120,
  height: 32,
  fieldBinding: field,
  props: { name: field, label: field },
});

const runtimeComponent: ComponentNode = {
  id: 'customer-control',
  type: 'input',
  name: 'customerName',
  label: '客户',
  fieldBinding: 'customerName',
  props: {},
  layout: { row: 0, col: 0, colSpan: 1, rowSpan: 1 },
  ports: [],
  events: [],
};

function workflow(): WorkflowFile {
  return {
    id: 'flow-v2',
    name: 'V2 流程',
    description: '',
    nodes: [
      {
        id: 'workflow:import',
        type: 'flow-node',
        specId: 'workflow:import',
        position: { x: 0, y: 0 },
        data: {
          propertiesJson: JSON.stringify({
            outputPorts: JSON.stringify([
              { name: 'customerName', type: 'string', required: true },
              { name: 'limit', type: 'number', required: true, defaultValue: 10 },
            ]),
          }),
        },
      },
      {
        id: 'workflow:export',
        type: 'flow-node',
        specId: 'workflow:export',
        position: { x: 400, y: 0 },
        data: {
          propertiesJson: JSON.stringify({
            inputPorts: JSON.stringify([
              { name: 'customerName', type: 'string' },
              { name: 'count', type: 'number' },
            ]),
          }),
        },
      },
    ],
    edges: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const context = {
  eventName: 'onChange',
  field: 'customerName',
  value: '新客户',
  values: { customerName: '新客户', count: 2 },
  originalValues: { customerName: '旧客户' },
  component: runtimeComponent,
};

test('legacy parameter and same-name output mappings normalize to explicit V2 bindings', () => {
  const target = workflow();
  const components = [designComponent('customer-control', 'customerName'), designComponent('count-control', 'count', 'numberInput')];
  const result = normalizeFlowBindings({
    parameterMap: { 'workflow:import.customerName': '$form.customerName' },
  }, target, components);
  const imports = getWorkflowImportFields(target);
  const exports = getWorkflowExportFields(target);
  assert.equal(result.bindings.version, 2);
  assert.deepEqual(result.bindings.inputs[imports[0].id], {
    source: { kind: 'formField', componentId: 'customer-control', field: 'customerName' },
  });
  assert.equal(result.bindings.inputs[imports[1].id], undefined);
  assert.deepEqual(result.bindings.outputs[exports[0].id], {
    target: { componentId: 'customer-control', field: 'customerName' },
    transform: { kind: 'direct' },
  });
  assert.equal(result.migratedLegacy, true);
});

test('workflow IO IDs are deterministic on read and persisted only when requested', () => {
  const target = workflow();
  const first = getWorkflowImportFields(target);
  const second = getWorkflowImportFields(target);
  assert.equal(first[0].id, second[0].id);
  assert.equal(ensureWorkflowIo(target).changed, false);
  const persisted = ensureWorkflowIo(target, { persistFieldIds: true });
  assert.equal(persisted.changed, true);
  const node = persisted.workflow.nodes.find((item) => item.specId === 'workflow:import');
  assert.match(String(node?.data.propertiesJson), new RegExp(first[0].id));
});

test('V2 inputs apply defaults before required validation', () => {
  const target = workflow();
  const imports = getWorkflowImportFields(target);
  const bindings: FlowBindingsV2 = {
    version: 2,
    inputs: {
      [imports[0].id]: { source: { kind: 'formField', componentId: 'customer-control', field: 'customerName' } },
    },
    outputs: {},
  };
  assert.deepEqual(resolveV2FlowInputs(bindings, target, context), {
    customerName: '新客户',
    limit: 10,
  });
  assert.throws(
    () => resolveV2FlowInputs({ ...bindings, inputs: {} }, target, context),
    /流程必填输入缺失：customerName/,
  );
});

test('output preparation is atomic, type checked, and skips undefined only', () => {
  const target = workflow();
  const exports = getWorkflowExportFields(target);
  const components = [designComponent('customer-control', 'customerName'), designComponent('count-control', 'count', 'numberInput')];
  const bindings: FlowBindingsV2 = {
    version: 2,
    inputs: {},
    outputs: {
      [exports[0].id]: {
        target: { componentId: 'customer-control', field: 'customerName' },
        transform: { kind: 'direct' },
      },
      [exports[1].id]: {
        target: { componentId: 'count-control', field: 'count' },
        transform: { kind: 'preset', steps: [{ op: 'toNumber' }] },
      },
    },
  };
  assert.deepEqual(
    prepareV2FlowOutputWrites(bindings, target, { customerName: '', count: '4' }, context, components),
    {
      writes: [
        { componentId: 'customer-control', field: 'customerName', value: '', output: 'customerName' },
        { componentId: 'count-control', field: 'count', value: 4, output: 'count' },
      ],
      skipped: [],
    },
  );
  const skipped = prepareV2FlowOutputWrites(bindings, target, { customerName: undefined, count: '4' }, context, components);
  assert.deepEqual(skipped.skipped, ['customerName']);
  assert.throws(
    () => prepareV2FlowOutputWrites(bindings, target, { customerName: 'ok', count: 'not-a-number' }, context, components),
    /无法转换为数字/,
  );
  assert.throws(
    () => prepareV2FlowOutputWrites({
      ...bindings,
      outputs: {
        ...bindings.outputs,
        [exports[1].id]: {
          target: { componentId: 'missing', field: 'count' },
          transform: { kind: 'direct' },
        },
      },
    }, target, { customerName: 'ok', count: 2 }, context, components),
    /目标控件不存在/,
  );
});
