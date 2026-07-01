import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import type { PortType } from '../../nodes/port-types';
import {
  formatOutputPreviewText,
  filterPreviewRows,
  getOutputPreviewMode,
  outputToPreviewTable,
  parseCsvRows,
} from './outputPreview';

test('CSV preview parses quotes, commas and embedded newlines', () => {
  assert.deepEqual(parseCsvRows('name,note\nAda,"one,two"\nLin,"line 1\nline 2"'), [
    ['name', 'note'],
    ['Ada', 'one,two'],
    ['Lin', 'line 1\nline 2'],
  ]);
});

test('sheet preview search keeps original row numbers', () => {
  const rows = [['Ada', 98], ['Lin', 95], ['Grace', 99]];
  assert.deepEqual(filterPreviewRows(rows, '9'), [
    { sourceIndex: 0, row: ['Ada', 98] },
    { sourceIndex: 1, row: ['Lin', 95] },
    { sourceIndex: 2, row: ['Grace', 99] },
  ]);
  assert.deepEqual(filterPreviewRows(rows, 'lin'), [{ sourceIndex: 1, row: ['Lin', 95] }]);
  assert.equal(filterPreviewRows(rows, 'missing').length, 0);
});

test('table preview adapts project worksheets, real worksheets and workbook sheets', () => {
  const projectSheet = { __fromProject: true, headers: ['name', 'score'], preview: [{ name: 'Ada', score: 98 }] };
  assert.deepEqual(outputToPreviewTable('worksheet', projectSheet), { headers: ['name', 'score'], rows: [['Ada', 98]] });

  const worksheet = XLSX.utils.aoa_to_sheet([['A', 'B'], [1, 2]]);
  assert.deepEqual(outputToPreviewTable('worksheet', worksheet), { headers: ['A', 'B'], rows: [['A', 'B'], [1, 2]] });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  assert.deepEqual(outputToPreviewTable('workbook', workbook, 'Data')?.rows, [['A', 'B'], [1, 2]]);
});

test('table preview preserves all JSON fields and complex range areas', () => {
  assert.deepEqual(outputToPreviewTable('json-rows', [{ a: 1 }, { b: 2 }]), {
    headers: ['a', 'b'], rows: [[1, undefined], [undefined, 2]],
  });
  const range = { kind: 'complex-range', areas: [
    { s: { r: 0, c: 0 }, e: { r: 1, c: 1 } },
    { s: { r: 3, c: 3 }, e: { r: 3, c: 4 } },
  ] };
  assert.deepEqual(outputToPreviewTable('range', range)?.rows, [
    [1, 1, 'A', 2, 'B', 4],
    [2, 4, 'D', 4, 'E', 2],
  ]);
});

test('every declared port type has a usable modal preview mode', () => {
  const worksheet = XLSX.utils.aoa_to_sheet([[1, 2]]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  const samples: Record<PortType, unknown> = {
    string: 'hello', number: 42, boolean: true, enum: 'mode', color: '#2563eb', any: { nested: { ok: true } },
    workbook, worksheet, cell: { r: 1, c: 2 }, range: { s: { r: 0, c: 0 }, e: { r: 1, c: 1 } }, address: 'A1:B2', 'cell-ref': 'A1',
    'json-rows': [{ a: 1 }], aoa: [[1, 2]], headers: ['a', 'b'], options: [{ label: 'A', value: 'a' }], 'file-data': new Uint8Array([1, 2]),
    'csv-string': 'a,b\n1,2', 'html-string': '<b>ok</b>', 'json-string': '{"ok":true}',
    filter: { field: 'a', operator: '==', value: 1 }, 'sort-config': { field: 'a', order: 'asc' }, style: { color: 'red' }, 'validation-rule': { type: 'required' },
    trigger: { event: 'run' },
  };
  for (const [type, value] of Object.entries(samples)) {
    const mode = getOutputPreviewMode(type, value);
    assert.ok(['table', 'html', 'binary', 'text'].includes(mode), `${type}: ${mode}`);
    if (mode === 'text') assert.ok(formatOutputPreviewText(type, value).length > 0, `${type} text is empty`);
  }
  assert.equal(getOutputPreviewMode('workbook', workbook), 'table');
  assert.equal(getOutputPreviewMode('html-string', '<p>x</p>'), 'html');
  assert.equal(getOutputPreviewMode('file-data', new Uint8Array([1])), 'binary');
  assert.equal(formatOutputPreviewText('json-string', '{"ok":true}'), '{\n  "ok": true\n}');
});
