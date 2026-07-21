import assert from 'node:assert/strict';
import test from 'node:test';
import { countCellChanges, serializeUpdates, validateChanges, type RowChanges } from './dataPreviewClient';

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
