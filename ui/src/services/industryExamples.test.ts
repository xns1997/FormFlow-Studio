import assert from 'node:assert/strict';
import test from 'node:test';
import { readProjectPackage } from '../../../server/src/services/project-package-store';
import { exportToComponentNodes } from '../designer/export';
import { executeFormControlEvent } from './formEventExecutor';
import type { ProjectStructure } from '../project/types';

function loadProject(id: string): ProjectStructure {
  const project = readProjectPackage(id);
  assert.ok(project, `missing project ${id}`);
  return project as ProjectStructure;
}

async function clickButton(
  project: ProjectStructure,
  formIndex: number,
  componentId: string,
  values: Record<string, unknown>,
) {
  const components = exportToComponentNodes(project.forms[formIndex].design.components);
  const component = components.find((item) => item.id === componentId);
  assert.ok(component, `missing component ${componentId}`);
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
    components,
    setValue: (field, value) => { writes[field] = value; },
    setVisible: () => {},
    setDisabled: () => {},
    setRequired: () => {},
    showMessage: () => {},
    code: component.props.events?.onClick,
    trigger: component.props.flowTriggers?.onClick,
  });
  return { result, writes };
}

test('student example supports entry, update, stats, batch processing and forecast', async () => {
  const project = loadProject('example_student_info');
  assert.equal(project.forms.length, 3);

  const create = await clickButton(project, 0, 'example_student_info_create_submit', {
    学号: 3006,
    姓名: '许安',
    班级: '高一(3)班',
    语文: 84,
    数学: 88,
    英语: 90,
    出勤率: 92,
    风险等级: '中',
  });
  assert.equal(create.result.flowExecuted, true);
  assert.equal(create.result.flowResult?.nodeResults.get('submit')?.outputs.writeBack?.keyValue, 3006);

  const update = await clickButton(project, 1, 'example_student_info_update_btn', {
    学号: 3003,
    姓名: '黄欣',
    班级: '高一(2)班',
    语文: 82,
    数学: 78,
    英语: 80,
    出勤率: 91,
    风险等级: '中',
    原始学号: 3003,
    原始姓名: '黄欣',
    原始班级: '高一(2)班',
    原始语文: 72,
    原始数学: 68,
    原始英语: 75,
    原始出勤率: 89,
    原始风险等级: '高',
  });
  assert.equal(update.result.flowExecuted, true);
  assert.ok(update.result.flowResult?.nodeResults.get('submit')?.outputs.changeLog);

  const stats = await clickButton(project, 2, 'example_student_info_stats_btn', { 统计班级: '高一(2)班' });
  assert.equal(stats.result.flowExecuted, true);
  assert.ok(Array.isArray(stats.writes['统计结果']));

  const batch = await clickButton(project, 2, 'example_student_info_batch_btn', { 统计班级: '全部', 提分目标: 15 });
  assert.equal(batch.result.flowExecuted, true);
  assert.match(String(batch.writes['批量摘要'] || ''), /辅导|提分/);

  const predict = await clickButton(project, 2, 'example_student_info_predict_btn', { 统计班级: '高一(1)班', 预测周数: 5 });
  assert.equal(predict.result.flowExecuted, true);
  assert.ok((predict.writes['预测结果'] as Array<Record<string, unknown>>).length > 0);
});

test('check valve example supports entry, update, stats, batch review and demand forecast', async () => {
  const project = loadProject('example_check_valve_selection');
  assert.equal(project.forms.length, 3);

  const create = await clickButton(project, 0, 'example_check_valve_selection_create_submit', {
    申请单号: 5006,
    项目名称: '沿海化工扩建',
    介质: '腐蚀液',
    公称通径DN: 125,
    压力等级PN: 25,
    设计温度: 180,
    设计流量: 210,
    推荐型号: '',
    选型状态: '待选型',
  });
  assert.equal(create.result.flowExecuted, true);
  assert.equal(create.result.flowResult?.nodeResults.get('submit')?.outputs.writeBack?.row?.推荐型号, 'HC41F-16P-DN125');

  const update = await clickButton(project, 1, 'example_check_valve_selection_update_btn', {
    申请单号: 5004,
    项目名称: '消防支线',
    介质: '清水',
    公称通径DN: 150,
    压力等级PN: 25,
    设计温度: 60,
    设计流量: 280,
    推荐型号: 'H44H-16C-DN150',
    选型状态: '待选型',
    原始申请单号: 5004,
    原始项目名称: '消防支线',
    原始介质: '清水',
    原始公称通径DN: 150,
    原始压力等级PN: 16,
    原始设计温度: 30,
    原始设计流量: 260,
    原始推荐型号: 'H44H-16C-DN150',
    原始选型状态: '待选型',
  });
  assert.equal(update.result.flowExecuted, true);
  assert.ok(update.result.flowResult?.nodeResults.get('submit')?.outputs.changeLog);

  const stats = await clickButton(project, 2, 'example_check_valve_selection_stats_btn', { 统计介质: '清水' });
  assert.equal(stats.result.flowExecuted, true);
  assert.ok(Array.isArray(stats.writes['统计结果']));

  const batch = await clickButton(project, 2, 'example_check_valve_selection_batch_btn', { 统计介质: '全部', 安全裕量: 12 });
  assert.equal(batch.result.flowExecuted, true);
  assert.match(String(batch.writes['批量摘要'] || ''), /复核|裕量/);

  const predict = await clickButton(project, 2, 'example_check_valve_selection_predict_btn', { 统计介质: '全部', 预测月份: 2 });
  assert.equal(predict.result.flowExecuted, true);
  assert.ok((predict.writes['预测结果'] as Array<Record<string, unknown>>).length > 0);
});

test('renewable generation example supports entry, update, stats, batch correction and power forecast', async () => {
  const project = loadProject('example_renewable_generation');
  assert.equal(project.forms.length, 3);

  const create = await clickButton(project, 0, 'example_renewable_generation_create_submit', {
    记录ID: 8006,
    日期: '2026-07-06',
    场站: '青海光伏一站',
    发电类型: '光伏',
    发电量MWh: 133.4,
    资源指标: 7.8,
    限电损失MWh: 2.6,
    设备可用率: 99.2,
  });
  assert.equal(create.result.flowExecuted, true);
  assert.equal(create.result.flowResult?.nodeResults.get('submit')?.outputs.writeBack?.keyValue, 8006);

  const update = await clickButton(project, 1, 'example_renewable_generation_update_btn', {
    记录ID: 8004,
    日期: '2026-07-04',
    场站: '甘肃风电二场',
    发电类型: '风电',
    发电量MWh: 181.6,
    资源指标: 8.1,
    限电损失MWh: 7.2,
    设备可用率: 96.4,
    原始记录ID: 8004,
    原始日期: '2026-07-04',
    原始场站: '甘肃风电二场',
    原始发电类型: '风电',
    原始发电量MWh: 176.2,
    原始资源指标: 7.8,
    原始限电损失MWh: 8.1,
    原始设备可用率: 95.9,
  });
  assert.equal(update.result.flowExecuted, true);
  assert.ok(update.result.flowResult?.nodeResults.get('submit')?.outputs.changeLog);

  const stats = await clickButton(project, 2, 'example_renewable_generation_stats_btn', { 统计场站: '甘肃风电二场' });
  assert.equal(stats.result.flowExecuted, true);
  assert.ok(Array.isArray(stats.writes['统计结果']));

  const batch = await clickButton(project, 2, 'example_renewable_generation_batch_btn', { 统计场站: '全部', 修正系数: 4 });
  assert.equal(batch.result.flowExecuted, true);
  assert.match(String(batch.writes['批量摘要'] || ''), /修正/);

  const predict = await clickButton(project, 2, 'example_renewable_generation_predict_btn', { 统计场站: '青海光伏一站', 预测天数: 4 });
  assert.equal(predict.result.flowExecuted, true);
  assert.equal((predict.writes['预测结果'] as Array<Record<string, unknown>>).length, 4);
});
