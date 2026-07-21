import assert from 'node:assert/strict';
import test from 'node:test';
import type { SrcSheetInfo, SrcTableEntry } from '../../project/types';
import { inferFormFields, inferLikelyKey } from './fieldInference';
import { generateFormScaffold, generateMissingFieldComponents } from './formScaffold';

const sheet: SrcSheetInfo = {
  name: '员工信息', rowCount: 2, colCount: 6,
  headers: ['员工ID', '姓名', '部门', '入职日期', '在职', '备注'],
  columns: [
    { name: '员工ID', index: 0, dataType: 'number', nullable: false, uniqueCount: 2, sampleValues: [1, 2] },
    { name: '姓名', index: 1, dataType: 'string', nullable: false, uniqueCount: 2, sampleValues: ['张三', '李四'] },
    { name: '部门', index: 2, dataType: 'enum', nullable: false, uniqueCount: 2, sampleValues: ['技术部', '销售部'] },
    { name: '入职日期', index: 3, dataType: 'date', nullable: false, uniqueCount: 2, sampleValues: ['2026-01-01', '2026-02-01'] },
    { name: '在职', index: 4, dataType: 'boolean', nullable: false, uniqueCount: 2, sampleValues: [true, false] },
    { name: '备注', index: 5, dataType: 'string', nullable: true, uniqueCount: 2, sampleValues: ['长期说明文字', '补充说明'] },
  ],
  preview: [{ 员工ID: 1, 姓名: '张三' }, { 员工ID: 2, 姓名: '李四' }],
  config: { id: 'employees:员工信息', tableName: '员工信息', keyFields: ['员工ID'], columnWidths: {}, frozenColumns: 0, frozenRows: 0, defaultSort: null, hiddenColumns: [], lockedColumns: [], columnDescriptions: {}, columnTags: {}, headerHeight: 36, rowHeight: 28, alternateRowColor: true, showGridLines: true, showRowNumbers: true, autoFitColumns: true, filterEnabled: true, sortEnabled: true, groupByColumn: null },
};

const table: SrcTableEntry = { id: 'employees', fileName: 'employees.xlsx', fileSize: 1, fileType: 'xlsx', uploadedAt: '2026-07-14T00:00:00.000Z', sheets: [sheet], dataHash: 'hash' };

test('field inference maps common table types and configured key', () => {
  assert.equal(inferLikelyKey(sheet), '员工ID');
  const fields = inferFormFields(sheet);
  assert.equal(fields.find((field) => field.name === '员工ID')?.readonly, true);
  assert.equal(fields.find((field) => field.name === '部门')?.controlType, 'select');
  assert.equal(fields.find((field) => field.name === '入职日期')?.controlType, 'datePicker');
  assert.equal(fields.find((field) => field.name === '在职')?.defaultValue, true);
  assert.equal(fields.find((field) => field.name === '备注')?.controlType, 'textarea');
});

test('scaffold creates a bound form and executable upsert workflow', () => {
  const result = generateFormScaffold(table, '员工信息', { idPrefix: 'employee_entry', now: '2026-07-14T00:00:00.000Z' });
  assert.equal(result.form.design.id, result.design.id);
  assert.equal(result.fields.length, 6);
  assert.ok(result.design.components.some((component) => component.fieldBinding === '姓名' && component.props.dataBinding?.source.path === '姓名'));
  assert.equal(result.design.components.find((component) => component.fieldBinding === '入职日期')?.height, 76);
  assert.ok(result.design.components.some((component) => component.type === 'button' && component.props.flowTriggers?.onClick?.workflowId === result.workflow?.id));
  assert.equal(result.workflow?.nodes.find((node) => node.id === 'submit')?.specId, 'behavior:submit');
  const submitProps = JSON.parse(String(result.workflow?.nodes.find((node) => node.id === 'submit')?.data.propertiesJson));
  assert.equal(submitProps.writeBackMode, 'upsert');
  assert.equal(submitProps.writeBackKeyField, '员工ID');
  assert.equal(result.behaviors[0]?.event, 'onFormLoad');
});

test('selected fields generate only requested controls', () => {
  const result = generateFormScaffold(table, '员工信息', { idPrefix: 'partial', selectedFields: ['姓名', '部门'], includeSave: false });
  assert.deepEqual(result.fields.map((field) => field.name), ['姓名', '部门']);
  assert.equal(result.workflow, undefined);
});

test('missing field completion preserves existing fields and only returns gaps', () => {
  const generated = generateFormScaffold(table, '员工信息', { idPrefix: 'partial', selectedFields: ['姓名', '部门'], includeSave: false });
  const additions = generateMissingFieldComponents(generated.design.components, table, '员工信息', { prefix: 'completion' });
  assert.deepEqual(additions.map((component) => component.fieldBinding), ['员工ID', '入职日期', '在职', '备注']);
  assert.ok(additions.every((component) => component.parentId === 'partial_root'));
});

test('large and read-only purposes add generated groups, pages and purpose-specific controls', () => {
  const columns = Array.from({ length: 26 }, (_, index) => ({ name: `字段${index + 1}`, index, dataType: 'string' as const, nullable: true, uniqueCount: 2, sampleValues: ['A', 'B'] }));
  const largeSheet: SrcSheetInfo = { ...sheet, name: '大表', colCount: 26, headers: columns.map((item) => item.name), columns, preview: [] };
  const largeTable: SrcTableEntry = { ...table, sheets: [largeSheet] };
  const detail = generateFormScaffold(largeTable, '大表', { idPrefix: 'large_detail', purpose: 'detail' });
  const root = detail.design.components.find((component) => component.type === 'form')!;
  assert.equal(root.props.generatedSections, 4);
  assert.equal(root.props.generatedPages, 3);
  assert.ok(detail.design.components.some((component) => component.type === 'tabs'));
  assert.ok(detail.design.components.filter((component) => component.fieldBinding?.startsWith('字段')).every((component) => component.props.readonly));
  assert.equal(detail.workflow, undefined);
  const lookup = generateFormScaffold(table, '员工信息', { idPrefix: 'lookup', purpose: 'lookup-edit' });
  assert.ok(lookup.design.components.some((component) => component.type === 'button' && component.props.label === '按主键查询'));
});
