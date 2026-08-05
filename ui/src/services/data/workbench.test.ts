import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyEntryToWorkbench,
  cleanPendingRow,
  initialWorkbenchState,
  mergeLoadedRows,
  orderRowsBy,
  workbenchReducer,
  type WorkbenchPendingState,
} from './workbench';
import type { PreviewRow, UndoEntry } from './dataPreviewClient';

const row = (rowKey: string, index: number, fields: Record<string, unknown> = {}): PreviewRow => ({
  __rowKey: rowKey,
  __rowIndex: index,
  ...fields,
});

function baseState(rows: PreviewRow[] = []): WorkbenchPendingState {
  return { ...initialWorkbenchState, rows };
}

test('orderRowsBy sorts by stable row keys and keeps unknown rows at the end', () => {
  const rows = [row('b', 0), row('a', 1), row('c', 2)];
  assert.deepEqual(orderRowsBy(rows, ['a', 'b', 'c']).map((item) => item.__rowKey), ['a', 'b', 'c']);
  assert.deepEqual(orderRowsBy(rows, ['c', 'missing']).map((item) => item.__rowKey), ['c', 'b', 'a']);
});

test('applyEntryToWorkbench patches rows and merges pending changes', () => {
  const before = baseState([row('k1', 0, { 名称: '甲' })]);
  const entry: UndoEntry = {
    changes: [{ rowKey: 'k1', field: '名称', oldValue: '甲', newValue: '乙' }],
    addedRows: [],
    deletedRows: [],
    committed: false,
  };
  const after = applyEntryToWorkbench(before, entry);
  assert.equal(after.rows[0].名称, '乙');
  assert.deepEqual(Object.values(after.pendingChanges.get('k1')!.名称), ['甲', '乙']);
});

test('applyEntryToWorkbench reverting to the old value clears the pending change', () => {
  const before = baseState([row('k1', 0, { 名称: '甲' })]);
  const forward: UndoEntry = { changes: [{ rowKey: 'k1', field: '名称', oldValue: '甲', newValue: '乙' }], addedRows: [], deletedRows: [], committed: false };
  const mid = applyEntryToWorkbench(before, forward);
  const backward: UndoEntry = { changes: [{ rowKey: 'k1', field: '名称', oldValue: '乙', newValue: '甲' }], addedRows: [], deletedRows: [], committed: false };
  const after = applyEntryToWorkbench(mid, backward);
  assert.equal(after.pendingChanges.has('k1'), false);
  assert.equal(after.rows[0].名称, '甲');
});

test('applyEntryToWorkbench tracks adds, deletes, and row order', () => {
  const before = baseState([row('a', 0, { id: 1 }), row('b', 1, { id: 2 })]);
  const added = row('n1', 2, { id: 3 });
  added.__isNew = true;
  const entry: UndoEntry = {
    changes: [],
    addedRows: [added],
    deletedRows: [before.rows[1]],
    rowOrderBefore: ['a', 'b'],
    rowOrderAfter: ['n1', 'a', 'b'],
    committed: false,
  };
  const after = applyEntryToWorkbench(before, entry);
  assert.equal(after.pendingAdds.some((item) => item.__rowKey === 'n1'), true);
  assert.equal(after.pendingDeletes.has('b'), true);
  // Deleted existing rows stay visible locally until commit; pending add is inserted first.
  assert.deepEqual(after.rows.map((item) => item.__rowKey), ['n1', 'a', 'b']);
});

test('mergeLoadedRows patches server rows and appends pending adds on page one only', () => {
  const changes = new Map([['k1', { 名称: { oldValue: '甲', newValue: '乙' } }]]);
  const adds = [row('n1', 5, { id: 9 })];
  const pageOne = mergeLoadedRows([row('k1', 0, { 名称: '甲' })], adds, changes, 1);
  assert.equal(pageOne[0].名称, '乙');
  assert.equal(pageOne.some((item) => item.__rowKey === 'n1'), true);
  const pageTwo = mergeLoadedRows([row('k1', 0, { 名称: '甲' })], adds, changes, 2);
  assert.equal(pageTwo.some((item) => item.__rowKey === 'n1'), false);
});

test('cleanPendingRow strips internal row metadata', () => {
  const clean = cleanPendingRow(row('k1', 1, { id: 1 }));
  assert.deepEqual(clean, { id: 1 });
});

test('workbenchReducer reset and set-rows keep the pending model intact', () => {
  const reset = workbenchReducer(initialWorkbenchState, { kind: 'reset', rows: [row('x', 0)] });
  assert.equal(reset.rows.length, 1);
  assert.equal(reset.pendingChanges.size, 0);
  const replaced = workbenchReducer(reset, { kind: 'set-rows', value: (prev) => [...prev, row('y', 1)] });
  assert.deepEqual(replaced.rows.map((item) => item.__rowKey), ['x', 'y']);
});
