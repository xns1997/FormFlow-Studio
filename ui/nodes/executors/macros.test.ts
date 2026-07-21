import assert from 'node:assert/strict';
import test from 'node:test';
import type { SrcTableEntry } from '../../src/project/types';
import { getExecutor, type NodeExecContext } from '../executor-registry';
import './macros';

const tables: SrcTableEntry[] = [{
  id: 'employees', fileName: 'employees.json', fileSize: 1, fileType: 'json', uploadedAt: '', dataHash: 'x',
  sheets: [{ name: '员工', rowCount: 2, colCount: 3, headers: ['员工ID', '姓名', '部门'], columns: [], preview: [{ 员工ID: 'E1', 姓名: '张三', 部门: '技术部' }, { 员工ID: 'E2', 姓名: '李四', 部门: '销售部' }] }],
}];

async function run(id: string, inputs: Record<string, unknown> = {}, properties: Record<string, unknown> = {}) {
  const executor = getExecutor(id);
  assert.ok(executor, `missing executor ${id}`);
  return executor({ inputs, properties, tables, getNodeOutput: () => ({}), checkType: () => ({ valid: true }), assertType: (_type, value) => value } as NodeExecContext);
}

test('the ten macro nodes execute their intent-level behavior and expose debuggable outputs', async () => {
  const saved = await run('form:save', { formData: { 员工ID: 'E3', 姓名: '王五' } }, { tableId: 'employees', sheetName: '员工', keyField: '员工ID', requiredFields: ['姓名'] });
  assert.equal(saved.saved, true); assert.ok(saved.writeBack);
  const lookup = await run('form:lookup-fill', { criteria: { 员工ID: 'E1' } }, { tableId: 'employees', sheetName: '员工', fieldMap: { 姓名: '姓名' } });
  assert.equal(lookup.matched, true); assert.deepEqual(lookup.patch, { 姓名: '张三' });
  const state = await run('form:conditional-state', { formData: { 部门: '技术部' } }, { field: '部门', operator: '==', compareValue: '技术部', target: 'tech', state: 'required' });
  assert.equal(state.active, true);
  const cascade = await run('form:cascade-options', { parentValue: '浙江', rows: [{ parent: '浙江', label: '杭州' }, { parent: '江苏', label: '南京' }] });
  assert.deepEqual(cascade.values, ['杭州']);
  const computed = await run('form:computed-field', { formData: { 数量: 2, 单价: 3 }, expression: '$数量 * $单价' }, { targetField: '总价' });
  assert.equal(computed.value, 6);
  const validated = await run('form:validate-all', { formData: { 姓名: '' } }, { requiredFields: ['姓名'] });
  assert.equal(validated.valid, false);
  const joined = await run('data:lookup-join', { left: [{ id: 1, dept: 'T' }], right: [{ code: 'T', name: '技术部' }] }, { leftKey: 'dept', rightKey: 'code' });
  assert.equal((joined.rows as any[])[0].name, '技术部');
  const matched = await run('logic:match', { value: 'approved' }, { cases: [{ value: 'approved', result: '归档' }], defaultValue: '等待' });
  assert.equal(matched.result, '归档');
  const recovered = await run('flow:try-catch', { error: 'timeout', fallback: '缓存值' });
  assert.equal(recovered.result, '缓存值'); assert.equal(recovered.failed, true);
  const mapped = await run('data:map-fields', { record: { old: 1 } }, { fieldMap: { next: '$old' }, keepSource: false });
  assert.deepEqual(mapped.record, { next: 1 });
});
