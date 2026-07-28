import assert from 'node:assert/strict';
import test from 'node:test';
import type { SrcTableEntry } from '../../project/types';
import { resolveLinkedOptions, resolveOptionSource, syncOptionValue } from './optionSource.ts';

const tables: SrcTableEntry[] = [{
  id: 'parts', fileName: 'parts.json', fileSize: 1, fileType: 'json', uploadedAt: '2026-07-15T00:00:00.000Z', dataHash: 'parts',
  sheets: [{
    name: '零件主数据', rowCount: 4, colCount: 2, headers: ['零件编码', '零件名称'], columns: [],
    preview: [
      { 零件编码: 'P-2', 零件名称: '阀座' },
      { 零件编码: 'P-1', 零件名称: '阀瓣' },
      { 零件编码: 'P-1', 零件名称: '重复阀瓣' },
      { 零件编码: '', 零件名称: '空编码' },
    ],
  }],
}];

test('table option source maps label/value fields, removes blanks and deduplicates values', () => {
  const result = resolveOptionSource([], { mode: 'table', tableId: 'parts', sheetName: '零件主数据', labelField: '零件名称', valueField: '零件编码', unique: true, sortOrder: 'asc' }, tables);
  assert.equal(result.diagnostic, null);
  assert.deepEqual(result.options, [{ label: '阀瓣', value: 'P-1' }, { label: '阀座', value: 'P-2' }]);
});

test('static option source remains backward compatible', () => {
  assert.deepEqual(resolveOptionSource(['启用', { label: '停用', value: 'disabled' }], { mode: 'static' }, tables).options, [
    { label: '启用', value: '启用' }, { label: '停用', value: 'disabled' },
  ]);
});

test('stale option source reports a diagnostic instead of silently using another table', () => {
  const result = resolveOptionSource([], { mode: 'table', tableId: 'missing', sheetName: 'Sheet1', labelField: '名称' }, tables);
  assert.equal(result.diagnostic, '选项数据源不存在');
  assert.deepEqual(result.options, []);
});

test('linked option updates can filter rows from a table action config', () => {
  const result = resolveLinkedOptions({ table: 'parts', filterField: '零件编码', filterValue: 'P-1', labelField: '零件名称', valueField: '零件编码' }, tables);
  assert.deepEqual(result, [
    { label: '阀瓣', value: 'P-1' },
    { label: '重复阀瓣', value: 'P-1' },
  ]);
});

test('range option source can map label/value columns from a selected range', () => {
  const result = resolveOptionSource([], {
    mode: 'range',
    rangeRef: { tableId: 'parts', sheetName: '零件主数据', startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
    labelColumn: 1,
    valueColumn: 0,
    unique: true,
    sortOrder: 'asc',
  }, tables);
  assert.equal(result.diagnostic, null);
  assert.deepEqual(result.options, [
    { label: '阀瓣', value: 'P-1' },
    { label: '阀座', value: 'P-2' },
  ]);
});

test('option value sync removes invalid values for single and multi select controls', () => {
  const options = [{ label: '阀瓣', value: 'P-1' }, { label: '阀座', value: 'P-2' }];
  assert.deepEqual(syncOptionValue('P-3', options, false), { value: '', changed: true });
  assert.deepEqual(syncOptionValue('P-1', options, false), { value: 'P-1', changed: false });
  assert.deepEqual(syncOptionValue(['P-1', 'P-3'], options, true), { value: ['P-1'], changed: true });
});
