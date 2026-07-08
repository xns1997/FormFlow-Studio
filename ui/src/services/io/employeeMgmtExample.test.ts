import assert from 'node:assert/strict';
import test from 'node:test';
import { readProjectPackage } from '../../../../server/src/services/project-package-store';
import { exportToComponentNodes } from '../../designer/export';
import { executeFormControlEvent } from '../engine/formEventExecutor';
import type { ProjectStructure } from '../../project/types';

function loadEmployeeMgmt(): ProjectStructure {
  const project = readProjectPackage('example_employee_mgmt');
  assert.ok(project);
  return project as ProjectStructure;
}

function findButton(project: ProjectStructure, formIndex: number, componentId: string) {
  return exportToComponentNodes(project.forms[formIndex].design.components).find((component) => component.id === componentId);
}

async function clickButton(project: ProjectStructure, formIndex: number, componentId: string, values: Record<string, unknown>) {
  const component = findButton(project, formIndex, componentId);
  assert.ok(component);
  const writes: Record<string, unknown> = {};
  const result = await executeFormControlEvent({
    eventName: 'onClick',
    field: component.name,
    value: undefined,
    values,
    originalValues: {},
    component,
  }, {
    workflows: project.workflows,
    tables: project.srcTable,
    components: exportToComponentNodes(project.forms[formIndex].design.components),
    setValue: (field, value) => { writes[field] = value; },
    setVisible: () => {},
    setDisabled: () => {},
    setRequired: () => {},
    showMessage: () => {},
    code: component.props.events?.onClick,
    trigger: component.props.flowTriggers?.onClick,
  });
  return { component, result, writes };
}

test('employee management example exposes entry/edit/analysis forms with the five required actions', () => {
  const project = loadEmployeeMgmt();
  assert.equal(project.release?.mode, 'use');
  assert.equal(project.forms.length, 3);
  assert.equal(project.forms[0].name, '数据录入');
  assert.equal(project.forms[1].name, '数据修改');
  assert.equal(project.forms[2].name, '统计分析');

  const addButton = project.forms[0].design.components.find((component) => component.id === 'example_employee_mgmt_create_submit');
  const searchTable = project.forms[1].design.components.find((component) => component.id === 'example_employee_mgmt_result_table');
  const updateButton = project.forms[1].design.components.find((component) => component.id === 'example_employee_mgmt_update_btn');
  const statsButton = project.forms[2].design.components.find((component) => component.id === 'example_employee_mgmt_stats_btn');
  const batchButton = project.forms[2].design.components.find((component) => component.id === 'example_employee_mgmt_batch_btn');
  const predictButton = project.forms[2].design.components.find((component) => component.id === 'example_employee_mgmt_predict_btn');
  assert.ok(addButton?.props?.flowTriggers?.onClick);
  assert.ok(addButton?.props?.events?.onClick);
  assert.ok(searchTable?.props?.events?.onRowClick);
  assert.ok(updateButton?.props?.flowTriggers?.onClick);
  assert.ok(statsButton?.props?.flowTriggers?.onClick);
  assert.ok(batchButton?.props?.flowTriggers?.onClick);
  assert.ok(predictButton?.props?.flowTriggers?.onClick);
});

test('employee management create action writes a new employee row back to the table', async () => {
  const project = loadEmployeeMgmt();
  const { result } = await clickButton(project, 0, 'example_employee_mgmt_create_submit', {
    员工ID: 1006,
    姓名: '周八',
    部门: '技术部',
    岗位: '数据工程师',
    入职日期: '2026-07-06',
    在职: true,
    月薪: 19000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.flowExecuted, true);
  assert.deepEqual(result.flowResult?.nodeResults.get('submit')?.outputs.writeBack, {
    kind: 'upsert-table-row',
    tableId: 'employees',
    sheetName: '员工信息',
    keyField: '员工ID',
    keyValue: 1006,
    row: {
      员工ID: 1006,
      姓名: '周八',
      部门: '技术部',
      岗位: '数据工程师',
      入职日期: '2026-07-06',
      在职: true,
      月薪: 19000,
    },
  });
});

test('employee management update action carries original data and produces a change log', async () => {
  const project = loadEmployeeMgmt();
  const { result } = await clickButton(project, 1, 'example_employee_mgmt_update_btn', {
    员工ID: 1003,
    姓名: '王晨（返聘）',
    部门: '技术部',
    岗位: '测试工程师',
    入职日期: '2022-11-20',
    在职: true,
    月薪: 15500,
    原始员工ID: 1003,
    原始姓名: '王晨',
    原始部门: '技术部',
    原始岗位: '测试工程师',
    原始入职日期: '2022-11-20',
    原始在职: false,
    原始月薪: 13500,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.flowExecuted, true);
  assert.deepEqual(result.flowResult?.nodeResults.get('submit')?.outputs.changeLog, {
    姓名: { oldValue: '王晨', newValue: '王晨（返聘）' },
    在职: { oldValue: false, newValue: true },
    月薪: { oldValue: 13500, newValue: 15500 },
  });
  assert.deepEqual(result.flowResult?.nodeResults.get('submit')?.outputs.writeBack, {
    kind: 'upsert-table-row',
    tableId: 'employees',
    sheetName: '员工信息',
    keyField: '员工ID',
    keyValue: 1003,
    row: {
      员工ID: 1003,
      姓名: '王晨（返聘）',
      部门: '技术部',
      岗位: '测试工程师',
      入职日期: '2022-11-20',
      在职: true,
      月薪: 15500,
    },
  });
});

test('employee management analysis form can run stats, batch processing and forecast', async () => {
  const project = loadEmployeeMgmt();

  const stats = await clickButton(project, 2, 'example_employee_mgmt_stats_btn', {
    统计部门: '技术部',
  });
  assert.equal(stats.result.error, undefined);
  assert.equal(stats.result.flowExecuted, true);
  assert.equal(typeof stats.writes['统计摘要'], 'string');
  assert.ok(Array.isArray(stats.writes['统计结果']));
  assert.ok((stats.writes['统计结果'] as unknown[]).length > 0);

  const batch = await clickButton(project, 2, 'example_employee_mgmt_batch_btn', {
    统计部门: '技术部',
    调薪百分比: 8,
  });
  assert.equal(batch.result.error, undefined);
  assert.equal(batch.result.flowExecuted, true);
  assert.match(String(batch.writes['批量摘要'] || ''), /调薪/);
  assert.ok(Array.isArray(batch.writes['批量结果']));

  const predict = await clickButton(project, 2, 'example_employee_mgmt_predict_btn', {
    统计部门: '全部',
    预测月数: 4,
  });
  assert.equal(predict.result.error, undefined);
  assert.equal(predict.result.flowExecuted, true);
  assert.match(String(predict.writes['预测摘要'] || ''), /未来 4 个月|未来 4个月|4 个月/);
  assert.equal((predict.writes['预测结果'] as Array<Record<string, unknown>>).length, 4);
});
