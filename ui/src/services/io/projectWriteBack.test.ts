import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProjectStructure } from '../../project/types';
import type { FlowExecutionResult } from './flowEngine';
import { applyPreviewFlowSideEffects, applyProjectWriteBacks } from './projectWriteBack';
import type { FlowSideEffect } from './flowSideEffects';

const project = {
  config: { id: 'p', name: 'p', description: '', version: '1', createdAt: '', updatedAt: '', author: '', tags: [] },
  workflows: [], behaviors: [], outputs: [], designs: [],
  srcTable: [{
    id: 'meta', fileName: 'meta.json', fileSize: 0, fileType: 'json', uploadedAt: '', dataHash: 'old',
    sheets: [{
      name: '人员', rowCount: 1, colCount: 2, headers: ['编号', '姓名'],
      columns: [
        { name: '编号', index: 0, dataType: 'string', nullable: false, uniqueCount: 1, sampleValues: ['1'] },
        { name: '姓名', index: 1, dataType: 'string', nullable: false, uniqueCount: 1, sampleValues: ['旧名'] },
      ],
      preview: [{ 编号: '1', 姓名: '旧名' }],
    }],
  }],
} satisfies ProjectStructure;

function flow(writeBack: Record<string, unknown>): FlowExecutionResult {
  return {
    success: true, errors: [], finalOutputs: {}, totalDuration: 0, sideEffects: [],
    nodeResults: new Map([['write', { nodeId: 'write', specId: 'behavior:submit', label: '', success: true, duration: 0, outputs: { writeBack }, sideEffects: [] }]]),
  };
}

test('metadata write-back updates an existing row and refreshes column metadata', () => {
  const result = applyProjectWriteBacks(project, flow({
    kind: 'upsert-table-row', tableId: 'meta', sheetName: '人员', keyField: '编号', keyValue: '1', row: { 编号: '1', 姓名: '新名', 部门: '研发' },
  }));
  const sheet = result.project.srcTable[0].sheets[0];
  assert.equal(result.applied, 1);
  assert.deepEqual(sheet.preview, [{ 编号: '1', 姓名: '新名', 部门: '研发' }]);
  assert.deepEqual(sheet.headers, ['编号', '姓名', '部门']);
  assert.equal(sheet.colCount, 3);
});

test('metadata write-back inserts a row when its key does not exist', () => {
  const result = applyProjectWriteBacks(project, flow({
    kind: 'upsert-table-row', tableId: 'meta', sheetName: '人员', keyField: '编号', keyValue: '2', row: { 编号: '2', 姓名: '新增' },
  }));
  assert.equal(result.project.srcTable[0].sheets[0].rowCount, 2);
  assert.equal(result.project.srcTable[0].sheets[0].preview[1].姓名, '新增');
});

test('preview side effects are applied atomically and can patch form values', () => {
  const effects: FlowSideEffect[] = [
    { kind: 'set-form-value', field: 'name', value: '预览姓名' },
    { kind: 'set-component-visible', componentId: 'input_1', visible: false },
    { kind: 'set-component-disabled', componentId: 'input_2', disabled: true },
    { kind: 'set-field-required', field: 'department', required: true },
    { kind: 'update-table-row', tableId: 'meta', sheetName: '人员', keyField: '编号', keyValue: '1', row: { 姓名: '新名' } },
  ];
  const result = applyPreviewFlowSideEffects(project, effects);
  assert.equal(result.applied, 1);
  assert.deepEqual(result.formValuePatches, { name: '预览姓名' });
  assert.deepEqual(result.componentVisibilityPatches, { input_1: false });
  assert.deepEqual(result.componentDisabledPatches, { input_2: true });
  assert.deepEqual(result.fieldRequiredPatches, { department: true });
  assert.equal(result.project.srcTable[0].sheets[0].preview[0].姓名, '新名');
});

test('preview side effects fail atomically when a later effect is invalid', () => {
  assert.throws(() => applyPreviewFlowSideEffects(project, [
    { kind: 'update-table-row', tableId: 'meta', sheetName: '人员', keyField: '编号', keyValue: '1', row: { 姓名: '新名' } },
    { kind: 'delete-table-row', tableId: 'meta', sheetName: '人员', keyField: '编号', keyValue: '404' },
  ]), /删除目标不存在/);
  assert.deepEqual(project.srcTable[0].sheets[0].preview, [{ 编号: '1', 姓名: '旧名' }]);
});
