import test from 'node:test';
import assert from 'node:assert/strict';
import type { DesignComponent, SrcTableEntry } from '../../project/types';
import { canBindingRead, canBindingWrite, normalizeDataBinding, resolveBindingWrite, resolveDataBindingValue } from './dataBinding';

const tables = [{ id: 'book', fileName: '数据.xlsx', sheets: [{ name: '名单', rowCount: 2, colCount: 2, headers: ['编号', '姓名'], columns: [{ name: '编号', dataType: 'string', sampleValues: ['1'] }, { name: '姓名', dataType: 'string', sampleValues: ['甲'] }], preview: [{ 编号: '1', 姓名: '甲' }, { 编号: '2', 姓名: '乙' }], keyConfig: { fields: ['编号'] } }] }] as unknown as SrcTableEntry[];
const component = (props: Record<string, unknown>, type = 'input'): DesignComponent => ({ id: 'c', type, x: 0, y: 0, width: 100, height: 50, props });

test('统一绑定优先于 tableBinding 和 rangeRef', () => {
  const current = component({ dataBinding: { version: 1, source: { kind: 'formField', path: 'name' }, direction: 'dataToUi' }, tableBinding: { tableId: 'legacy' }, rangeRef: { tableId: 'legacy' } });
  assert.equal(normalizeDataBinding(current)?.source.kind, 'formField');
  assert.deepEqual(resolveDataBindingValue(current, tables, { name: '当前值' }).value, '当前值');
});

test('旧 tableBinding 归一化为双向绑定，旧 rangeRef 归一化为只读绑定', () => {
  const legacyTable = normalizeDataBinding(component({ tableBinding: { tableId: 'book', sheetName: '名单', keyField: '编号', keyValue: '1', column: '姓名' } }));
  assert.equal(legacyTable?.direction, 'twoWay');
  assert.equal(resolveDataBindingValue(component({ tableBinding: { tableId: 'book', sheetName: '名单', keyField: '编号', keyValue: '1', column: '姓名' } }), tables).value, '甲');
  const legacyRange = normalizeDataBinding(component({ rangeRef: { tableId: 'book', sheetName: '名单', startRow: 0, startCol: 0, endRow: 1, endCol: 0 } }));
  assert.equal(legacyRange?.direction, 'dataToUi');
  assert.equal(canBindingRead(legacyRange), true);
  assert.equal(canBindingWrite(legacyRange), false);
});

test('范围支持五种取值模式并按控件类型自动选择', () => {
  const ref = { tableId: 'book', sheetName: '名单', startRow: 0, startCol: 0, endRow: 1, endCol: 1 };
  const value = (valueMode: string, type = 'input') => resolveDataBindingValue(component({ dataBinding: { version: 1, source: { kind: 'range', ref }, direction: 'dataToUi', valueMode } }, type), tables).value;
  assert.equal(value('firstCell'), '1');
  assert.deepEqual(value('firstRow'), ['1', '甲']);
  assert.deepEqual(value('column'), ['1', '2']);
  assert.deepEqual(value('table'), [['1', '甲'], ['2', '乙']]);
  assert.deepEqual(value('auto', 'table'), [['1', '甲'], ['2', '乙']]);
});

test('写回拒绝只读方向和非唯一键，只接受唯一表格单元格', () => {
  const writable = component({ dataBinding: { version: 1, source: { kind: 'tableCell', tableId: 'book', sheetName: '名单', keyField: '编号', keyValue: '1', column: '姓名' }, direction: 'twoWay' } });
  assert.deepEqual(resolveBindingWrite(writable, tables, '新名称'), { ok: true, write: { tableId: 'book', sheetName: '名单', keyField: '编号', keyValue: '1', column: '姓名', value: '新名称' } });
  assert.equal(resolveBindingWrite(component({ dataBinding: { version: 1, source: { kind: 'tableCell', tableId: 'book', sheetName: '名单', keyField: '编号', keyValue: '1', column: '姓名' }, direction: 'dataToUi' } }), tables, '值').ok, false);
});
