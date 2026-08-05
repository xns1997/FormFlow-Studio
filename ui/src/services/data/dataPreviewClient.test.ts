import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRowKeyForSnapshot,
  countCellChanges,
  invertUndoEntry,
  normalizeCellForType,
  parseClipboardTable,
  serializeUpdates,
  undoEntryToBatchPayload,
  validateChanges,
  type RowChanges,
  type UndoEntry,
} from './dataPreviewClient';

test('preview changes count cells and serialize by stable row key', () => {
  const changes = new Map<string, RowChanges>([
    ['key:A', { name: { oldValue: '甲', newValue: '乙' }, score: { oldValue: 1, newValue: 2 } }],
    ['idx:9', { active: { oldValue: false, newValue: true } }],
  ]);
  assert.equal(countCellChanges(changes), 3);
  assert.deepEqual(serializeUpdates(changes), [
    { rowKey: 'key:A', changes: { name: '乙', score: 2 } },
    { rowKey: 'idx:9', changes: { active: true } },
  ]);
});

test('preview validation reports typed cells by row key and field', () => {
  const changes = new Map<string, RowChanges>([['key:A', { score: { oldValue: 1, newValue: 'bad' } }]]);
  const errors = validateChanges(changes, [{ __rowKey: 'new:1', __rowIndex: 2, __isNew: true, active: 'maybe' }], [
    { name: 'score', dataType: 'number' }, { name: 'active', dataType: 'boolean' },
  ]);
  assert.equal(errors.size, 2);
  assert.match(errors.get('key:A:score') || '', /数字/);
});

test('clipboard table parses TSV, CSV with quotes and plain text', () => {
  assert.deepEqual(parseClipboardTable('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseClipboardTable('"姓名,全名","备注"\n"张三","含,逗号"'), [['姓名,全名', '备注'], ['张三', '含,逗号']]);
  assert.deepEqual(parseClipboardTable('"引""号"\n'), [['"引""号"']], '无逗号内容按单列纯文本处理并去掉末尾空行');
  assert.deepEqual(parseClipboardTable('只有一列'), [['只有一列']]);
  assert.deepEqual(parseClipboardTable('  \n  '), []);
});

test('clipboard cell normalization respects column type', () => {
  assert.equal(normalizeCellForType(' 42 ', 'number'), 42);
  assert.equal(normalizeCellForType('abc', 'number'), 'abc');
  assert.equal(normalizeCellForType('TRUE', 'boolean'), true);
  assert.equal(normalizeCellForType('0', 'boolean'), false);
  assert.equal(normalizeCellForType('2026-08-05', 'date'), '2026-08-05');
  assert.equal(normalizeCellForType(' 名称 ', 'string'), '名称');
  assert.equal(normalizeCellForType('', 'number'), '');
});

test('undo inversion swaps changes, added/deleted rows and row order', () => {
  const entry: UndoEntry = {
    changes: [{ rowKey: 'key:A', field: 'score', oldValue: 1, newValue: 9 }],
    addedRows: [{ __rowKey: 'new:1', __rowIndex: 0, __isNew: true, id: 'X' }],
    deletedRows: [],
    rowOrderBefore: ['key:B', 'key:A'],
    rowOrderAfter: ['key:A', 'key:B'],
    committed: false,
  };
  const inverted = invertUndoEntry(entry);
  assert.equal(inverted.changes[0].oldValue, 9);
  assert.equal(inverted.changes[0].newValue, 1);
  assert.equal(inverted.addedRows.length, 0);
  assert.equal(inverted.deletedRows[0].id, 'X');
  assert.deepEqual(inverted.rowOrderBefore, ['key:A', 'key:B']);
  assert.deepEqual(inverted.rowOrderAfter, ['key:B', 'key:A']);
});

test('committed undo builds batch payload and maps stable row keys', () => {
  const entry: UndoEntry = {
    changes: [{ rowKey: 'key:A', field: 'name', oldValue: '旧名', newValue: '新名' }],
    addedRows: [
      { __rowKey: 'new:1', __rowIndex: 0, __isNew: true, id: 'B', name: '新增' },
      { __rowKey: 'new:2', __rowIndex: 1, __isNew: true, id: '', name: '缺主键' },
    ],
    deletedRows: [{ __rowKey: 'idx:3', __rowIndex: 3, id: 'C', value: 3 }],
    committed: true,
  };
  const payload = undoEntryToBatchPayload(entry, ['id']);
  assert.deepEqual(payload.updates, [{ rowKey: 'key:A', changes: { name: '旧名' } }]);
  assert.deepEqual(payload.deletes, ['key:B']);
  assert.deepEqual(payload.adds, [{ id: 'C', value: 3 }]);
  assert.deepEqual(payload.unresolved, ['新增行（缺少有效主键）']);
});

test('snapshot row key matches server encoding for composite keys', () => {
  assert.equal(buildRowKeyForSnapshot({ 编号: 'S-001', 月份: '一月' }, ['编号', '月份']), 'key:S-001|%E4%B8%80%E6%9C%88');
  assert.equal(buildRowKeyForSnapshot({ id: '' }, ['id']), null);
  assert.equal(buildRowKeyForSnapshot({ id: 'A' }, []), null);
});
