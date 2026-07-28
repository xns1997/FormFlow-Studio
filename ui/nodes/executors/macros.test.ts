import assert from 'node:assert/strict';
import test from 'node:test';
import type { SrcTableEntry } from '../../src/project/types';
import { getExecutor, type NodeExecContext } from '../executor-registry';
import './behavior';
import './macros';

const tables: SrcTableEntry[] = [{
  id: 'employees', fileName: 'employees.json', fileSize: 1, fileType: 'json', uploadedAt: '', dataHash: 'x',
  sheets: [{ name: '员工', rowCount: 2, colCount: 3, headers: ['员工ID', '姓名', '部门'], columns: [], preview: [{ 员工ID: 'E1', 姓名: '张三', 部门: '技术部' }, { 员工ID: 'E2', 姓名: '李四', 部门: '销售部' }] }],
}, {
  id: 'departments', fileName: 'departments.json', fileSize: 1, fileType: 'json', uploadedAt: '', dataHash: 'y',
  sheets: [{ name: '部门', rowCount: 1, colCount: 2, headers: ['部门ID', '名称'], columns: [], preview: [{ 部门ID: 1, 名称: '技术部' }] }],
}];

async function run(id: string, inputs: Record<string, unknown> = {}, properties: Record<string, unknown> = {}) {
  const executor = getExecutor(id);
  assert.ok(executor, `missing executor ${id}`);
  return executor({ inputs, properties, tables, getNodeOutput: () => ({}), checkType: () => ({ valid: true }), assertType: (_type, value) => value } as NodeExecContext);
}

test('macro nodes execute their intent-level behavior and expose debuggable outputs', async () => {
  const saved = await run('form:save', { formData: { 员工ID: 'E3', 姓名: '王五' } }, { tableId: 'employees', sheetName: '员工', keyField: '员工ID', requiredFields: ['姓名'] });
  assert.equal(saved.saved, true); assert.ok(saved.writeBack);
  assert.equal((saved.writeBack as any).kind, 'upsert-table-row');
  const insertOnly = await run('behavior:submit', { formData: { 员工ID: 'E3', 姓名: '王五' }, originalData: {} }, { writeBackMode: 'insert', writeBackTableId: 'employees', writeBackSheetName: '员工', writeBackKeyField: '员工ID', writeBackKeyFormField: '员工ID', writeBackFieldMap: { 员工ID: '员工ID', 姓名: '姓名' } });
  assert.equal((insertOnly.writeBack as any).kind, 'insert-table-row');
  const updateOnly = await run('behavior:submit', { formData: { 员工ID: 'E1', 姓名: '张三（新）' }, originalData: { 员工ID: 'E1', 姓名: '张三' } }, { writeBackMode: 'update', writeBackTableId: 'employees', writeBackSheetName: '员工', writeBackKeyField: '员工ID', writeBackKeyFormField: '员工ID', writeBackFieldMap: { 员工ID: '员工ID', 姓名: '姓名' } });
  assert.equal((updateOnly.writeBack as any).kind, 'update-table-row');
  assert.deepEqual((updateOnly.writeBack as any).row, { 员工ID: 'E1', 姓名: '张三（新）' });
  const updateDirtySubset = await run('behavior:submit', { formData: { 员工ID: 'E1', 姓名: '张三', 部门: '财务部' }, originalData: { 员工ID: 'E1', 姓名: '张三', 部门: '技术部' } }, { writeBackMode: 'update', dirtyOnly: true, writeBackTableId: 'employees', writeBackSheetName: '员工', writeBackKeyField: '员工ID', writeBackKeyFormField: '员工ID', writeBackFieldMap: { 员工ID: '员工ID', 姓名: '姓名', 部门: '部门' } });
  assert.deepEqual((updateDirtySubset.writeBack as any).row, { 员工ID: 'E1', 部门: '财务部' });
  const updateFullRow = await run('behavior:submit', { formData: { 员工ID: 'E1', 姓名: '张三', 部门: '财务部' }, originalData: { 员工ID: 'E1', 姓名: '张三', 部门: '技术部' } }, { writeBackMode: 'update', dirtyOnly: false, writeBackTableId: 'employees', writeBackSheetName: '员工', writeBackKeyField: '员工ID', writeBackKeyFormField: '员工ID', writeBackFieldMap: { 员工ID: '员工ID', 姓名: '姓名', 部门: '部门' } });
  assert.deepEqual((updateFullRow.writeBack as any).row, { 员工ID: 'E1', 姓名: '张三', 部门: '财务部' });
  const updateConflict = await run('behavior:submit', { formData: { 员工ID: 'E1', 姓名: '张三', 部门: '财务部' }, originalData: { 员工ID: 'E1', 姓名: '张三', 部门: '市场部' } }, { writeBackMode: 'update', dirtyOnly: true, conflictPolicy: 'error', writeBackTableId: 'employees', writeBackSheetName: '员工', writeBackKeyField: '员工ID', writeBackKeyFormField: '员工ID', writeBackFieldMap: { 员工ID: '员工ID', 姓名: '姓名', 部门: '部门' }, conflictCheckFields: ['部门'] });
  assert.equal((updateConflict as any).conflict, true);
  assert.deepEqual((updateConflict as any).staleFields, ['部门']);
  assert.ok(((updateConflict as any).sideEffects || []).some((effect: any) => effect.kind === 'show-message' && String(effect.message).includes('并发修改')));
  const refreshAndRetry = await run('behavior:submit', { formData: { 员工ID: 'E1', 姓名: '张三', 部门: '财务部' }, originalData: { 员工ID: 'E1', 姓名: '张三', 部门: '市场部' } }, { writeBackMode: 'update', dirtyOnly: true, conflictPolicy: 'refresh-and-retry', refetchAfterSave: true, refreshOriginalFieldMap: { 员工ID: '_original_员工ID', 姓名: '_original_姓名', 部门: '_original_部门' }, writeBackTableId: 'employees', writeBackSheetName: '员工', writeBackKeyField: '员工ID', writeBackKeyFormField: '员工ID', writeBackFieldMap: { 员工ID: '员工ID', 姓名: '姓名', 部门: '部门' }, conflictCheckFields: ['部门'] });
  assert.equal((refreshAndRetry as any).conflict, true);
  assert.equal((refreshAndRetry as any).latestRecord.部门, '技术部');
  assert.ok(((refreshAndRetry as any).sideEffects || []).some((effect: any) => effect.kind === 'set-form-value' && effect.field === '部门' && effect.value === '技术部'));
  assert.ok(((refreshAndRetry as any).sideEffects || []).some((effect: any) => effect.kind === 'set-form-value' && effect.field === '_original_部门' && effect.value === '技术部'));
  const lookup = await run('form:lookup-fill', { criteria: { 员工ID: 'E1' } }, { tableId: 'employees', sheetName: '员工', fieldMap: { 姓名: '姓名' }, originalFieldMap: { 姓名: '_original_姓名' }, enableComponentIds: ['save_button'], matchedField: '_lookupMatched', uniqueField: '_lookupUnique', matchCountField: '_lookupMatchCount' });
  assert.equal(lookup.matched, true); assert.deepEqual(lookup.patch, { 姓名: '张三' });
  assert.equal(lookup.unique, true);
  assert.equal(lookup.matchCount, 1);
  assert.deepEqual((lookup as any).originalPatch, { _original_姓名: '张三' });
  assert.ok((lookup.sideEffects as any[]).some((effect) => effect.kind === 'set-component-disabled' && effect.componentId === 'save_button' && effect.disabled === false));
  assert.ok((lookup.sideEffects as any[]).some((effect) => effect.kind === 'set-form-value' && effect.field === '_lookupMatched' && effect.value === true));
  const notFoundLookup = await run('form:lookup-fill', { criteria: { 员工ID: 'EX' } }, { tableId: 'employees', sheetName: '员工', fieldMap: { 姓名: '姓名' }, notFoundMessage: '没找到' });
  assert.equal(notFoundLookup.matched, false);
  assert.equal(notFoundLookup.matchCount, 0);
  assert.ok((notFoundLookup.sideEffects as any[]).some((effect) => effect.kind === 'show-message' && effect.message === '没找到'));
  assert.ok((notFoundLookup.sideEffects as any[]).some((effect) => effect.kind === 'set-form-value' && effect.field === '_lookupMatched' && effect.value === false));
  const anyModeLookup = await run('form:lookup-fill', { criteria: { 员工ID: 'EX', 部门: '销售部' } }, { tableId: 'employees', sheetName: '员工', queryFields: ['员工ID', '部门'], queryMode: 'any', fieldMap: { 姓名: '姓名', 部门: '部门' } });
  assert.equal(anyModeLookup.matched, true);
  assert.equal(anyModeLookup.matchCount, 1);
  assert.deepEqual((anyModeLookup as any).patch, { 姓名: '李四', 部门: '销售部' });
  const duplicateLookup = await run('form:lookup-fill', { criteria: { 部门: '销售部' } }, { tableId: 'employees', sheetName: '员工', fieldMap: { 姓名: '姓名' }, multipleMatchMessage: '结果过多' });
  assert.equal(duplicateLookup.matched, true);
  const duplicateTables: SrcTableEntry[] = [{
    id: 'dup', fileName: 'dup.json', fileSize: 1, fileType: 'json', uploadedAt: '', dataHash: 'z',
    sheets: [{ name: '名单', rowCount: 2, colCount: 2, headers: ['编号', '部门'], columns: [], preview: [{ 编号: '1', 部门: 'A' }, { 编号: '2', 部门: 'A' }] }],
  }];
  const duplicateExecutor = getExecutor('form:lookup-fill')!;
  const duplicateResult = await duplicateExecutor({ inputs: { criteria: { 部门: 'A' } }, properties: { tableId: 'dup', sheetName: '名单', fieldMap: { 编号: '编号' }, multipleMatchMessage: '结果过多' }, tables: duplicateTables, getNodeOutput: () => ({}), checkType: () => ({ valid: true }), assertType: (_type, value) => value } as NodeExecContext);
  assert.equal((duplicateResult as any).matched, false);
  assert.equal((duplicateResult as any).unique, false);
  assert.equal((duplicateResult as any).matchCount, 2);
  assert.ok(((duplicateResult as any).sideEffects || []).some((effect: any) => effect.kind === 'show-message' && effect.message === '结果过多'));
  const state = await run('form:conditional-state', { formData: { 部门: '技术部' } }, { field: '部门', operator: '==', compareValue: '技术部', target: 'tech', state: 'required' });
  assert.equal(state.active, true);
  const cascade = await run('form:cascade-options', { parentValue: '浙江', rows: [{ parent: '浙江', label: '杭州' }, { parent: '江苏', label: '南京' }] });
  assert.deepEqual(cascade.values, ['杭州']);
  const computed = await run('form:computed-field', { formData: { 数量: 2, 单价: 3 }, expression: '$数量 * $单价' }, { targetField: '总价' });
  assert.equal(computed.value, 6);
  const validated = await run('form:validate-all', { formData: { 姓名: '' } }, { requiredFields: ['姓名'] });
  assert.equal(validated.valid, false);
  const joined = await run('data:lookup-join', { left: [{ id: 1, dept: 'T', 姓名: '张三' }], right: [{ code: 'T', name: '技术部' }] }, { leftKey: 'dept', rightKey: 'code', leftPrefix: 'employees.', rightPrefix: 'departments.', resultField: '联合结果', messageField: '查询状态', sourceKeyFields: { left: ['id'], right: ['code'] } });
  assert.equal((joined.rows as any[])[0]['departments.name'], '技术部');
  assert.equal((joined.rows as any[])[0]['_original_employees.姓名'], '张三');
  assert.deepEqual((joined.rows as any[])[0].__sources.employees, { id: 1 });
  assert.ok((joined.sideEffects as any[]).some((effect) => effect.field === '联合结果' && effect.value[0]['departments.name'] === '技术部'));
  const masterDetail = await run('data:master-detail', { masters: [{ id: 'D1', name: '技术部' }], details: [{ employeeId: 'E1', departmentId: 'D1' }, { employeeId: 'E2', departmentId: 'D1' }] }, { masterKey: 'id', detailKey: 'departmentId', resultField: '主从结果' });
  assert.equal((masterDetail.rows as any[])[0].明细数量, 2);
  assert.equal((masterDetail.sideEffects as any[])[0].value[0].明细.length, 2);
  const masterDetailInner = await run('data:master-detail', { masters: [{ id: 'D1', name: '技术部' }, { id: 'D2', name: '销售部' }], details: [{ employeeId: 'E1', departmentId: 'D1' }] }, { masterKey: 'id', detailKey: 'departmentId', joinType: 'inner', resultField: '主从结果' });
  assert.deepEqual((masterDetailInner.rows as any[]).map((row) => row.id), ['D1']);
  const transaction = await run('data:transaction-write', { formData: { 部门ID: 2, 部门名称: '财务部', 员工ID: 'E3', 姓名: '王五' } }, { targets: [
    { id: 'department', tableId: 'departments', sheetName: '部门', keyField: '部门ID', mode: 'insert', fieldMap: { 部门ID: '部门ID', 名称: '部门名称' } },
    { id: 'employee', tableId: 'employees', sheetName: '员工', keyField: '员工ID', mode: 'insert', fieldMap: { 员工ID: '员工ID', 姓名: '姓名', 部门: '部门名称' } },
  ] });
  assert.equal(transaction.committed, true); assert.equal((transaction.diff as any[]).length, 2); assert.equal((transaction.sideEffects as any[]).filter((effect) => effect.kind === 'insert-table-row').length, 2);
  const masterDetailWrite = await run('data:transaction-write', { formData: { 科目ID: '', 科目名: '体育', _明细: [{ 教师ID: '', 姓名: '王老师', 科目ID: '', 工资: 120, 绩效: 95, 入职日期: '2026-07-01' }] } }, { targets: [
    { id: 'master_1', tableId: 'departments', sheetName: '部门', keyField: '部门ID', mode: 'insert', fieldMap: { 部门ID: '科目ID', 名称: '科目名' } },
    { id: 'detail_2', tableId: 'employees', sheetName: '员工', keyField: '员工ID', mode: 'insert', sourceField: '_明细', fieldMap: { 员工ID: '教师ID', 姓名: '姓名', 部门: '科目ID' }, foreignKey: { field: '部门', fromTarget: 'master_1', fromField: '部门ID' } },
  ] });
  assert.equal(masterDetailWrite.committed, true);
  assert.equal((masterDetailWrite.sideEffects as any[]).filter((effect) => effect.kind === 'insert-table-row').length, 2);
  const propagatedDetail = (masterDetailWrite.sideEffects as any[]).find((effect) => effect.kind === 'insert-table-row' && effect.tableId === 'employees');
  const propagatedMaster = (masterDetailWrite.sideEffects as any[]).find((effect) => effect.kind === 'insert-table-row' && effect.tableId === 'departments');
  assert.equal(propagatedDetail.row.部门, propagatedMaster.row.部门ID);
  const skipExisting = await run('data:transaction-write', { formData: { 部门ID: 1, 部门名称: '技术部（忽略）' } }, { targets: [
    { id: 'department_skip', tableId: 'departments', sheetName: '部门', keyField: '部门ID', mode: 'upsert', existingPolicy: 'skip', fieldMap: { 部门ID: '部门ID', 名称: '部门名称' } },
  ], resultField: '_事务结果' });
  assert.equal(skipExisting.committed, false);
  assert.equal(skipExisting.message, '暂无需要提交的修改');
  assert.deepEqual(skipExisting.diff, []);
  assert.ok((skipExisting.sideEffects as any[]).some((effect) => effect.kind === 'set-form-value' && effect.field === '_事务结果' && Array.isArray(effect.value) && effect.value.length === 0));
  assert.equal((skipExisting.sideEffects as any[]).some((effect) => String(effect.kind || '').endsWith('table-row')), false);
  const updateExisting = await run('data:transaction-write', { formData: { 部门ID: 1, 部门名称: '技术平台主管部' } }, { targets: [
    { id: 'department_update', tableId: 'departments', sheetName: '部门', keyField: '部门ID', mode: 'upsert', existingPolicy: 'update', fieldMap: { 部门ID: '部门ID', 名称: '部门名称' } },
  ], resultField: '_事务结果' });
  assert.equal(updateExisting.committed, true);
  assert.equal((updateExisting.diff as any[])[0].mode, 'update');
  assert.ok((updateExisting.sideEffects as any[]).some((effect) => effect.kind === 'set-form-value' && effect.field === '_事务结果' && Array.isArray(effect.value) && effect.value[0]?.mode === 'update'));
  assert.ok((updateExisting.sideEffects as any[]).some((effect) => effect.kind === 'update-table-row' && effect.row?.名称 === '技术平台主管部'));
  const conflict = await run('data:transaction-write', { formData: { 部门ID: 1, 部门名称: '重复' } }, { targets: [{ id: 'department', tableId: 'departments', sheetName: '部门', keyField: '部门ID', mode: 'insert', fieldMap: { 部门ID: '部门ID', 名称: '部门名称' } }] });
  assert.equal(conflict.committed, false); assert.equal((conflict.sideEffects as any[]).some((effect) => effect.kind?.endsWith('table-row')), false);
  const parallelConflict = await run('data:transaction-write', { formData: { 部门ID: 1, 部门名称: '技术部', 员工ID: 'E3', 姓名: '王五' } }, { targets: [
    { id: 'department_parallel', tableId: 'departments', sheetName: '部门', keyField: '部门ID', mode: 'insert', fieldMap: { 部门ID: '部门ID', 名称: '部门名称' } },
    { id: 'employee_parallel', tableId: 'employees', sheetName: '员工', keyField: '员工ID', mode: 'insert', fieldMap: { 员工ID: '员工ID', 姓名: '姓名', 部门: '部门名称' } },
  ], resultField: '_并列结果' });
  assert.equal(parallelConflict.committed, false);
  assert.ok((parallelConflict.conflicts as any[]).some((item) => item.code === 'ROW_ALREADY_EXISTS' && item.target === 'department_parallel'));
  assert.equal((parallelConflict.sideEffects as any[]).some((effect) => String(effect.kind || '').endsWith('table-row')), false);
  const parallelSkip = await run('data:transaction-write', { formData: { 部门ID: 1, 部门名称: '技术部', 员工ID: 'E3', 姓名: '王五' } }, { targets: [
    { id: 'department_parallel_skip', tableId: 'departments', sheetName: '部门', keyField: '部门ID', mode: 'upsert', existingPolicy: 'skip', fieldMap: { 部门ID: '部门ID', 名称: '部门名称' } },
    { id: 'employee_parallel_skip', tableId: 'employees', sheetName: '员工', keyField: '员工ID', mode: 'upsert', existingPolicy: 'skip', fieldMap: { 员工ID: '员工ID', 姓名: '姓名', 部门: '部门名称' } },
  ], resultField: '_并列结果' });
  assert.equal(parallelSkip.committed, true);
  assert.ok((parallelSkip.diff as any[]).some((item) => item.target === 'department_parallel_skip' && item.mode === 'skip'));
  assert.ok((parallelSkip.sideEffects as any[]).some((effect) => effect.kind === 'insert-table-row' && effect.tableId === 'employees' && effect.row?.员工ID === 'E3'));
  assert.equal((parallelSkip.sideEffects as any[]).some((effect) => effect.kind === 'update-table-row' && effect.tableId === 'departments'), false);
  const parallelUpdate = await run('data:transaction-write', { formData: { 部门ID: 1, 部门名称: '技术平台主管部', 员工ID: 'E4', 姓名: '赵六' } }, { targets: [
    { id: 'department_parallel_update', tableId: 'departments', sheetName: '部门', keyField: '部门ID', mode: 'upsert', existingPolicy: 'update', fieldMap: { 部门ID: '部门ID', 名称: '部门名称' } },
    { id: 'employee_parallel_update', tableId: 'employees', sheetName: '员工', keyField: '员工ID', mode: 'upsert', existingPolicy: 'update', fieldMap: { 员工ID: '员工ID', 姓名: '姓名', 部门: '部门名称' } },
  ], resultField: '_并列结果' });
  assert.equal(parallelUpdate.committed, true);
  assert.ok((parallelUpdate.diff as any[]).some((item) => item.target === 'department_parallel_update' && item.mode === 'update'));
  assert.ok((parallelUpdate.sideEffects as any[]).some((effect) => effect.kind === 'update-table-row' && effect.tableId === 'departments' && effect.row?.名称 === '技术平台主管部'));
  assert.ok((parallelUpdate.sideEffects as any[]).some((effect) => effect.kind === 'insert-table-row' && effect.tableId === 'employees' && effect.row?.员工ID === 'E4'));
  const parallelRollback = await run('data:transaction-write', { formData: { 部门ID: 9, 部门名称: '新部门', 员工ID: 'missing', 姓名: '错误员工' } }, { targets: [
    { id: 'department_parallel_insert', tableId: 'departments', sheetName: '部门', keyField: '部门ID', mode: 'insert', fieldMap: { 部门ID: '部门ID', 名称: '部门名称' } },
    { id: 'employee_parallel_missing', tableId: 'employees', sheetName: '员工', keyField: '员工ID', mode: 'update', fieldMap: { 员工ID: '员工ID', 姓名: '姓名', 部门: '部门名称' } },
  ], resultField: '_并列结果' });
  assert.equal(parallelRollback.committed, false);
  assert.ok((parallelRollback.conflicts as any[]).some((item) => item.code === 'ROW_NOT_FOUND' && item.target === 'employee_parallel_missing'));
  assert.equal((parallelRollback.sideEffects as any[]).some((effect) => effect.kind === 'insert-table-row' && effect.tableId === 'departments' && effect.row?.部门ID === 9), false);
  const batch = await run('data:transaction-write', { formData: { _批量变更: [{ 员工ID: 'E2', 姓名: '李四', 部门: '财务部' }] } }, { targets: [
    { id: 'employee_batch', tableId: 'employees', sheetName: '员工', keyField: '员工ID', mode: 'update', sourceField: '_批量变更', fieldMap: { 员工ID: '员工ID', 姓名: '姓名', 部门: '部门' } },
  ], clearSourceFieldsOnSuccess: true });
  assert.equal(batch.committed, true);
  assert.deepEqual((batch.diff as any[])[0].fields, ['部门']);
  assert.equal((batch.sideEffects as any[]).filter((effect) => effect.kind === 'update-table-row').length, 1);
  assert.ok((batch.sideEffects as any[]).some((effect) => effect.kind === 'set-form-value' && effect.field === '_批量变更' && Array.isArray(effect.value) && effect.value.length === 0));
  const noChanges = await run('data:transaction-write', { formData: { _批量变更: [] } }, { targets: [
    { id: 'employee_batch', tableId: 'employees', sheetName: '员工', keyField: '员工ID', mode: 'update', sourceField: '_批量变更' },
  ] });
  assert.equal(noChanges.committed, false);
  assert.equal(noChanges.message, '暂无需要提交的修改');
  const exactLimit = await run('data:transaction-write', { formData: { _批量变更_employees: [{ 员工ID: 'E1', 姓名: '张三', 部门: '技术中台' }], _批量变更_departments: [{ 部门ID: 1, 名称: '技术平台主管部' }] } }, { targets: [
    { id: 'employee_batch', tableId: 'employees', sheetName: '员工', keyField: '员工ID', mode: 'update', sourceField: '_批量变更_employees', fieldMap: { 员工ID: '员工ID', 姓名: '姓名', 部门: '部门' } },
    { id: 'department_batch', tableId: 'departments', sheetName: '部门', keyField: '部门ID', mode: 'update', sourceField: '_批量变更_departments', fieldMap: { 部门ID: '部门ID', 名称: '名称' } },
  ], maxChanges: 2, resultField: '_批量结果' });
  assert.equal(exactLimit.committed, true);
  assert.equal((exactLimit.diff as any[]).length, 2);
  assert.ok((exactLimit.sideEffects as any[]).some((effect) => effect.kind === 'set-form-value' && effect.field === '_批量结果' && Array.isArray(effect.value) && effect.value.length === 2));
  const exceededLimit = await run('data:transaction-write', { formData: { _批量变更_employees: [{ 员工ID: 'E1', 姓名: '张三', 部门: '技术中台' }, { 员工ID: 'E2', 姓名: '李四', 部门: '销售中台' }], _批量变更_departments: [{ 部门ID: 1, 名称: '技术平台主管部' }] } }, { targets: [
    { id: 'employee_batch', tableId: 'employees', sheetName: '员工', keyField: '员工ID', mode: 'update', sourceField: '_批量变更_employees', fieldMap: { 员工ID: '员工ID', 姓名: '姓名', 部门: '部门' } },
    { id: 'department_batch', tableId: 'departments', sheetName: '部门', keyField: '部门ID', mode: 'update', sourceField: '_批量变更_departments', fieldMap: { 部门ID: '部门ID', 名称: '名称' } },
  ], maxChanges: 2, resultField: '_批量结果' });
  assert.equal(exceededLimit.committed, false);
  assert.ok((exceededLimit.conflicts as any[]).some((item) => item.code === 'BATCH_LIMIT_EXCEEDED'));
  assert.ok((exceededLimit.sideEffects as any[]).some((effect) => effect.kind === 'set-form-value' && effect.field === '_批量结果' && Array.isArray(effect.value) && effect.value.length === 3));
  const joinedConflict = await run('data:transaction-write', { formData: { _联合查询结果: [{ 'employees.员工ID': 'E1', 'employees.姓名': '张三', 'employees.部门': '财务部', '_original_employees.员工ID': 'E1', '_original_employees.姓名': '张三', '_original_employees.部门': '市场部' }] } }, { targets: [
    { id: 'joined_employees', tableId: 'employees', sheetName: '员工', keyField: '员工ID', mode: 'update', sourceField: '_联合查询结果', fieldMap: { 员工ID: 'employees.员工ID', 姓名: 'employees.姓名', 部门: 'employees.部门' }, originalFieldMap: { 员工ID: '_original_employees.员工ID', 姓名: '_original_employees.姓名', 部门: '_original_employees.部门' }, conflictCheckFields: ['部门'] },
  ] });
  assert.equal(joinedConflict.committed, false);
  assert.ok((joinedConflict.conflicts as any[]).some((item) => item.code === 'WRITE_CONFLICT' && item.target === 'joined_employees'));
  const multiBatchConflict = await run('data:transaction-write', { formData: { _批量变更_employees: [{ 员工ID: 'E2', 姓名: '李四', 部门: '财务部' }], _批量变更_departments: [{ 部门ID: 9, 名称: '不存在的部门' }] } }, { targets: [
    { id: 'employee_batch', tableId: 'employees', sheetName: '员工', keyField: '员工ID', mode: 'update', sourceField: '_批量变更_employees', fieldMap: { 员工ID: '员工ID', 姓名: '姓名', 部门: '部门' } },
    { id: 'department_batch', tableId: 'departments', sheetName: '部门', keyField: '部门ID', mode: 'update', sourceField: '_批量变更_departments', fieldMap: { 部门ID: '部门ID', 名称: '名称' } },
  ], clearSourceFieldsOnSuccess: true });
  assert.equal(multiBatchConflict.committed, false);
  assert.ok((multiBatchConflict.conflicts as any[]).some((item) => item.code === 'ROW_NOT_FOUND' && item.target === 'department_batch'));
  assert.equal((multiBatchConflict.sideEffects as any[]).some((effect) => effect.kind === 'update-table-row'), false);
  assert.equal((multiBatchConflict.sideEffects as any[]).some((effect) => effect.kind === 'set-form-value' && effect.field === '_批量变更_employees' && Array.isArray(effect.value) && effect.value.length === 0), false);
  const masterDetailConflict = await run('data:transaction-write', { formData: { 科目ID: '', 科目名: '体育', _明细: [{ 教师ID: 'E1', 姓名: '重复主键教师', 科目ID: '', 工资: 120 }] } }, { targets: [
    { id: 'master_1', tableId: 'departments', sheetName: '部门', keyField: '部门ID', mode: 'insert', fieldMap: { 部门ID: '科目ID', 名称: '科目名' } },
    { id: 'detail_2', tableId: 'employees', sheetName: '员工', keyField: '员工ID', mode: 'insert', sourceField: '_明细', fieldMap: { 员工ID: '教师ID', 姓名: '姓名', 部门: '科目ID' }, foreignKey: { field: '部门', fromTarget: 'master_1', fromField: '部门ID' } },
  ] });
  assert.equal(masterDetailConflict.committed, false);
  assert.ok((masterDetailConflict.conflicts as any[]).some((item) => item.code === 'ROW_ALREADY_EXISTS' && item.target === 'detail_2'));
  assert.equal((masterDetailConflict.sideEffects as any[]).some((effect) => String(effect.kind || '').endsWith('table-row')), false);
  const saveWithSnapshotRefresh = await run('behavior:submit', { formData: { 员工ID: 'E1', 姓名: '张三', 部门: '财务部' }, originalData: { 员工ID: 'E1', 姓名: '张三', 部门: '技术部' } }, { writeBackMode: 'update', dirtyOnly: true, refetchAfterSave: true, refreshOriginalFieldMap: { 员工ID: '_original_员工ID', 姓名: '_original_姓名', 部门: '_original_部门' }, writeBackTableId: 'employees', writeBackSheetName: '员工', writeBackKeyField: '员工ID', writeBackKeyFormField: '员工ID', writeBackFieldMap: { 员工ID: '员工ID', 姓名: '姓名', 部门: '部门' } });
  assert.ok(((saveWithSnapshotRefresh as any).sideEffects || []).some((effect: any) => effect.kind === 'set-form-value' && effect.field === '_original_部门' && effect.value === '财务部'));
  const matched = await run('logic:match', { value: 'approved' }, { cases: [{ value: 'approved', result: '归档' }], defaultValue: '等待' });
  assert.equal(matched.result, '归档');
  const recovered = await run('flow:try-catch', { error: 'timeout', fallback: '缓存值' });
  assert.equal(recovered.result, '缓存值'); assert.equal(recovered.failed, true);
  const mapped = await run('data:map-fields', { record: { old: 1 } }, { fieldMap: { next: '$old' }, keepSource: false });
  assert.deepEqual(mapped.record, { next: 1 });
  const profiled = await run('data:profile-overview', { rows: [{ 标签: 'A', 空列: '', 数值: 10 }, { 标签: 'B', 空列: null, 数值: 20 }, { 标签: 'B', 空列: undefined, 数值: null }], fields: ['标签', '空列', '数值'] }, { resultField: '分析结果', summaryField: '概览摘要', chartField: '概览图', messageField: '概览状态', chartMetric: '缺失数', chartLimit: 2, distributionLimit: 2, sampleValueLimit: 2 });
  assert.deepEqual((profiled.profile as any[]), [
    { 字段: '标签', 缺失数: 0, 唯一值: 2, 非空率: 1, 常量列: false, 样本值: 'A，B', 分布摘要: 'B×2，A×1' },
    { 字段: '空列', 缺失数: 3, 唯一值: 0, 非空率: 0, 常量列: false, 样本值: '', 分布摘要: '' },
    { 字段: '数值', 缺失数: 1, 唯一值: 2, 非空率: 2 / 3, 常量列: false, 样本值: '10，20', 分布摘要: '10×1，20×1', 均值: 15 },
  ]);
  assert.deepEqual((profiled.summary as any).constantFields, []);
  assert.deepEqual((profiled.chart as any).labels, ['标签', '空列']);
  assert.deepEqual((profiled.chart as any).datasets[0], { label: '缺失数', data: [0, 3] });
  assert.ok((profiled.sideEffects as any[]).some((effect) => effect.field === '分析结果'));
  const kpi = await run('data:kpi-dashboard', { rows: [{ 部门: 'A', 工资: 10, 绩效: 5 }, { 部门: 'A', 工资: 20, 绩效: 8 }, { 部门: 'B', 工资: 5, 绩效: 9 }], metrics: ['工资', '绩效'], dimensions: ['部门'] }, { aggregation: 'sum', chartLimit: 2, resultField: 'KPI结果' });
  assert.deepEqual((kpi.groupedRows as any[]), [
    { 分组: 'A', 工资: 30, 绩效: 13, 记录数: 2 },
    { 分组: 'B', 工资: 5, 绩效: 9, 记录数: 1 },
  ]);
  assert.deepEqual((kpi.chart as any).labels, ['A', 'B']);
  assert.ok((kpi.sideEffects as any[]).some((effect) => effect.field === 'KPI结果'));
  const grouped = await run('data:group-aggregate', { rows: [{ 部门: 'A', 工资: 10 }, { 部门: 'A', 工资: 20 }, { 部门: 'B', 工资: 5 }], dimensions: ['部门'], metrics: ['工资'] }, { aggregation: 'average', resultField: '分组结果' });
  assert.deepEqual((grouped.result as any[]), [
    { 分组: 'A', 指标: '工资', 聚合值: 15, 记录数: 2, 维度: '部门' },
    { 分组: 'B', 指标: '工资', 聚合值: 5, 记录数: 1, 维度: '部门' },
  ]);
  const pivot = await run('data:pivot-matrix', { rows: [{ 姓名: '甲', 科目: 'S1', 工资: 10 }, { 姓名: '甲', 科目: 'S2', 工资: 20 }, { 姓名: '乙', 科目: 'S1', 工资: 5 }], rowDimension: '姓名', columnDimension: '科目', metric: '工资' }, { aggregation: 'sum', chartLimit: 2, resultField: '透视结果' });
  assert.deepEqual((pivot.result as any[]), [
    { 姓名: '甲', S1: 10, S2: 20 },
    { 姓名: '乙', S1: 5, S2: 0 },
  ]);
  assert.deepEqual((pivot.chart as any).datasets[0].data, [10, 5]);
  const corr = await run('data:correlation-matrix', { rows: [{ 工资: 10, 绩效: 1, 工龄: 5 }, { 工资: 20, 绩效: 2, 工龄: 4 }, { 工资: 30, 绩效: 3, 工龄: 3 }], fields: ['工资', '绩效', '工龄'] }, { resultField: '相关结果' });
  assert.deepEqual((corr.result as any[]), [
    { '字段 A': '工资', '字段 B': '绩效', 相关系数: 1, 样本数: 3, 不可计算: false },
    { '字段 A': '工资', '字段 B': '工龄', 相关系数: -1, 样本数: 3, 不可计算: false },
    { '字段 A': '绩效', '字段 B': '工龄', 相关系数: -1, 样本数: 3, 不可计算: false },
  ]);
  const corrAligned = await run('data:correlation-matrix', { rows: [{ 工资: 10, 绩效: '', 工龄: 1 }, { 工资: 20, 绩效: 2, 工龄: '' }, { 工资: 30, 绩效: 3, 工龄: 3 }], fields: ['工资', '绩效', '工龄'] }, { resultField: '相关结果', summaryField: '相关摘要' });
  assert.deepEqual((corrAligned.result as any[]), [
    { '字段 A': '工资', '字段 B': '绩效', 相关系数: 1, 样本数: 2, 不可计算: false },
    { '字段 A': '工资', '字段 B': '工龄', 相关系数: 1, 样本数: 2, 不可计算: false },
    { '字段 A': '绩效', '字段 B': '工龄', 相关系数: 0, 样本数: 1, 不可计算: true },
  ]);
  assert.deepEqual((corrAligned.summary as any).insufficientPairs, ['绩效 × 工龄']);
  const anomaly = await run('data:anomaly-score', { rows: [{ 工资: 10 }, { 工资: 11 }, { 工资: 12 }, { 工资: 40 }], fields: ['工资'] }, { contamination: 0.25, resultField: '异常结果' });
  assert.equal((anomaly.result as any[])[0].记录, 4);
  assert.equal((anomaly.result as any[])[0].判定, '异常');
  const anomalyHalf = await run('data:anomaly-score', { rows: [{ 工资: 10 }, { 工资: 10 }, { 工资: 11 }, { 工资: 12 }], fields: ['工资'] }, { contamination: 0.5, resultField: '异常结果', summaryField: '异常摘要' });
  assert.equal((anomalyHalf.summary as any).flaggedCount, 2);
  assert.deepEqual((anomalyHalf.result as any[]).slice(0, 2).map((row) => row.判定), ['异常', '异常']);
  const cross = await run('data:qualified-join-group', { left: [{ id: 'S1', 工资: 10 }, { id: 'S1', 工资: 20 }, { id: 'S2', 工资: 5 }], right: [{ code: 'S1', 名称: '数学' }, { code: 'S2', 名称: '英语' }] }, { leftKey: 'id', rightKey: 'code', leftPrefix: 'teachers.', rightPrefix: 'subjects.', dimensions: ['subjects.名称'], metrics: ['teachers.工资'], aggregation: 'sum', resultField: '跨表结果' });
  assert.deepEqual((cross.result as any[]), [
    { 分组: '数学', 指标: 'teachers.工资', 聚合值: 30, 来源记录: 2 },
    { 分组: '英语', 指标: 'teachers.工资', 聚合值: 5, 来源记录: 1 },
  ]);
  const crossLeft = await run('data:qualified-join-group', { left: [{ id: 'S1', 工资: 10 }, { id: 'S9', 工资: 7 }], right: [{ code: 'S1', 名称: '数学' }] }, { leftKey: 'id', rightKey: 'code', leftPrefix: 'teachers.', rightPrefix: 'subjects.', dimensions: ['subjects.名称'], metrics: ['teachers.工资'], aggregation: 'sum', joinType: 'left', resultField: '跨表结果' });
  assert.deepEqual((crossLeft.result as any[]), [
    { 分组: '数学', 指标: 'teachers.工资', 聚合值: 10, 来源记录: 1 },
    { 分组: '空值', 指标: 'teachers.工资', 聚合值: 7, 来源记录: 1 },
  ]);
  const crossInner = await run('data:qualified-join-group', { left: [{ id: 'S1', 工资: 10 }, { id: 'S9', 工资: 7 }], right: [{ code: 'S1', 名称: '数学' }] }, { leftKey: 'id', rightKey: 'code', leftPrefix: 'teachers.', rightPrefix: 'subjects.', dimensions: ['subjects.名称'], metrics: ['teachers.工资'], aggregation: 'sum', joinType: 'inner', resultField: '跨表结果' });
  assert.deepEqual((crossInner.result as any[]), [
    { 分组: '数学', 指标: 'teachers.工资', 聚合值: 10, 来源记录: 1 },
  ]);
  const crossDuplicateMatches = await run('data:qualified-join-group', { left: [{ id: 'S1', 工资: 10 }], right: [{ code: 'S1', 名称: '数学' }, { code: 'S1', 名称: '理综' }] }, { leftKey: 'id', rightKey: 'code', leftPrefix: 'teachers.', rightPrefix: 'subjects.', dimensions: ['subjects.名称'], metrics: ['teachers.工资'], aggregation: 'sum', resultField: '跨表结果' });
  assert.deepEqual((crossDuplicateMatches.result as any[]), [
    { 分组: '数学', 指标: 'teachers.工资', 聚合值: 10, 来源记录: 1 },
    { 分组: '理综', 指标: 'teachers.工资', 聚合值: 10, 来源记录: 1 },
  ]);
  const regression = await run('ml:regression-evaluate', { rows: [{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }, { x: 4, y: 8 }, { x: 5, y: 10 }], target: 'y', features: ['x'] }, { validationRatio: 0.2, resultField: '回归结果' });
  assert.equal((regression.summary as any).usable, true);
  assert.equal((regression.result as any[])[0].指标, 'MAE');
  const regressionUnusable = await run('ml:regression-evaluate', { rows: [{ x: 1, y: 0 }, { x: 2, y: 10 }, { x: 3, y: 0 }, { x: 4, y: 10 }, { x: 5, y: 0 }, { x: 6, y: 10 }], target: 'y', features: ['x'] }, { validationRatio: 0.33, resultField: '回归结果', summaryField: '回归摘要' });
  assert.equal((regressionUnusable.summary as any).usable, false);
  assert.equal((regressionUnusable.result as any[])[0].结论, '未优于基线');
  const classification = await run('ml:classification-evaluate', { rows: [{ f: 1, 类别: 'A' }, { f: 2, 类别: 'A' }, { f: 9, 类别: 'B' }, { f: 10, 类别: 'B' }, { f: 11, 类别: 'B' }], target: '类别', features: ['f'] }, { validationRatio: 0.2, resultField: '分类结果' });
  assert.ok((classification.summary as any).accuracy >= (classification.summary as any).baselineAccuracy);
  assert.ok((classification.result as any[]).every((row) => row.类别));
  const classificationUnusable = await run('ml:classification-evaluate', { rows: [
    { f: 100, 类别: 'A' },
    { f: 101, 类别: 'A' },
    { f: 102, 类别: 'A' },
    { f: 103, 类别: 'A' },
    { f: 104, 类别: 'A' },
    { f: 0, 类别: 'B' },
    { f: 1, 类别: 'B' },
    { f: 2, 类别: 'B' },
    { f: 0, 类别: 'A' },
    { f: 1, 类别: 'A' },
  ], target: '类别', features: ['f'] }, { validationRatio: 0.2, resultField: '分类结果', summaryField: '分类摘要' });
  assert.equal((classificationUnusable.summary as any).usable, false);
  assert.ok((classificationUnusable.summary as any).accuracy < (classificationUnusable.summary as any).baselineAccuracy);
  const timeSeries = await run('ml:time-series-backtest', { rows: [
    { 日期: '2026-01-01', 值: 10 },
    { 日期: '2026-02-01', 值: 12 },
    { 日期: '2026-03-01', 值: 14 },
    { 日期: '2026-04-01', 值: 16 },
    { 日期: '2026-05-01', 值: 18 },
    { 日期: '2026-06-01', 值: 20 },
  ], timeField: '日期', target: '值' }, { horizon: 2, resultField: '时序结果' });
  assert.equal((timeSeries.result as any[]).slice(-1)[0].时间, '预测+2');
  assert.ok(typeof (timeSeries.summary as any).baselineMae === 'number');
  const timeSeriesUnusable = await run('ml:time-series-backtest', { rows: [
    { 日期: '2026-01-01', 值: 10 },
    { 日期: '2026-02-01', 值: 20 },
    { 日期: '2026-03-01', 值: 30 },
    { 日期: '2026-04-01', 值: 40 },
    { 日期: '2026-05-01', 值: 50 },
    { 日期: '2026-06-01', 值: 60 },
  ], timeField: '日期', target: '值' }, { horizon: 2, resultField: '时序结果', summaryField: '时序摘要' });
  assert.equal((timeSeriesUnusable.summary as any).usable, false);
  assert.ok((timeSeriesUnusable.summary as any).modelMae > (timeSeriesUnusable.summary as any).baselineMae);
});
