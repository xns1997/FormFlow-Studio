import assert from 'node:assert/strict';
import test from 'node:test';
import { applyBatchChanges, buildRowKeys, dataVersion, queryRows, validateConfiguredKeys } from './data-preview';

test('row keys prefer unique configured business keys and fall back for duplicates', () => {
  assert.deepEqual(buildRowKeys([{ id: 'A' }, { id: 'B' }], ['id']), ['key:A', 'key:B']);
  assert.deepEqual(buildRowKeys([{ id: 'A' }, { id: 'A' }], ['id']), ['idx:0', 'idx:1']);
});

test('query filters and sorts globally before pagination while preserving source identity', () => {
  const result = queryRows({
    rows: [{ id: '1', name: '上海', score: 2 }, { id: '2', name: '北京', score: 8 }, { id: '3', name: '上海仓', score: 5 }],
    headers: ['id', 'name', 'score'], keyFields: ['id'], search: '上海',
    sortModel: [{ colId: 'score', sort: 'desc' }], page: 1, pageSize: 1,
  });
  assert.equal(result.queryTotal, 2);
  assert.equal(result.rows[0].id, '3');
  assert.equal(result.rows[0].__rowKey, 'key:3');
  assert.equal(result.rows[0].__rowIndex, 2);
});

test('batch changes update and delete by stable keys then append rows', () => {
  const rows = [{ id: 'A', value: 1 }, { id: 'B', value: 2 }];
  const next = applyBatchChanges(rows, ['id'], {
    updates: [{ rowKey: 'key:B', changes: { value: 9 } }],
    deletes: ['key:A'], adds: [{ id: 'C', value: 3 }],
  });
  assert.deepEqual(next, [{ id: 'B', value: 9 }, { id: 'C', value: 3 }]);
  assert.notEqual(dataVersion(rows), dataVersion(next));
});

test('batch rejects stale row keys instead of editing the wrong record', () => {
  assert.throws(() => applyBatchChanges([{ id: 'A' }], ['id'], { deletes: ['key:missing'] }), /记录已不存在/);
});

test('configured composite keys reject blanks and duplicates', () => {
  assert.throws(() => validateConfiguredKeys([{ a: 'x', b: '' }], ['a', 'b']), /不能为空/);
  assert.throws(() => validateConfiguredKeys([{ a: 'x' }, { a: 'x' }], ['a']), /重复/);
  assert.doesNotThrow(() => validateConfiguredKeys([{ a: 'x', b: 1 }, { a: 'x', b: 2 }], ['a', 'b']));
});
