import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDirtyTableRows,
  mergeEditableTableRows,
  normalizeEditableTableColumns,
  validateEditableTableRows,
  validateEditableTableValue,
} from './EditableTableGrid';

test('旧字符串列配置保持可用，扩展列配置按类型选择编辑器', () => {
  const legacy = normalizeEditableTableColumns(['姓名', '状态']);
  assert.deepEqual(legacy.map((column) => [column.key, column.editor, column.editable]), [
    ['姓名', 'text', true],
    ['状态', 'text', true],
  ]);

  const columns = normalizeEditableTableColumns([
    { title: '编号', dataIndex: 'id', type: 'text', editable: false, required: true },
    { title: '金额', dataIndex: 'amount', type: 'number', min: 0 },
    { title: '日期', dataIndex: 'date', type: 'date' },
    { title: '启用', dataIndex: 'enabled', type: 'boolean' },
    { title: '状态', dataIndex: 'status', type: 'enum', options: '待处理,完成' },
  ]);
  assert.deepEqual(columns.map((column) => column.editor), ['text', 'number', 'date', 'boolean', 'select']);
  assert.equal(columns[0].editable, false);
  assert.deepEqual(columns[4].options.map((option) => option.value), ['待处理', '完成']);
});

test('dirtyRows 只输出修改行并在恢复原值后清空', () => {
  const columns = normalizeEditableTableColumns(['id', 'name', 'amount']);
  const baseline = [{ id: 'A1', name: '原值', amount: 10 }, { id: 'A2', name: '第二行', amount: 20 }];
  const changed = [{ ...baseline[0], amount: 12 }, baseline[1]];
  assert.deepEqual(collectDirtyTableRows(changed, baseline, columns, 'id'), [{ id: 'A1', name: '原值', amount: 12 }]);
  assert.deepEqual(collectDirtyTableRows(baseline.map((row) => ({ ...row })), baseline, columns, 'id'), []);

  const merged = mergeEditableTableRows(baseline, [{ id: 'A2', name: '已修改', amount: 20 }], columns, 'id', 'dirtyRows');
  assert.equal(merged.displayRows[1].name, '已修改');
  assert.equal(merged.displayRows[0].name, '原值');
});

test('表格单元格校验覆盖必填、数字范围、日期和枚举', () => {
  const columns = normalizeEditableTableColumns([
    { title: '姓名', dataIndex: 'name', required: true },
    { title: '金额', dataIndex: 'amount', editor: 'number', min: 0, max: 100 },
    { title: '日期', dataIndex: 'date', editor: 'date' },
    { title: '状态', dataIndex: 'status', editor: 'select', options: ['待处理', '完成'] },
  ]);
  const errors = validateEditableTableRows([{ name: '', amount: -1, date: 'bad', status: '未知' }], columns);
  assert.equal(Object.keys(errors).length, 4);
  assert.match(validateEditableTableValue({ editable: true, columns, changeTracking: 'fullRows' }, [{ name: '', amount: 1, date: '2026-07-23', status: '完成' }]), /1 个单元格/);
  assert.equal(validateEditableTableValue({ editable: false, columns }, [{ name: '' }]), '');
});
