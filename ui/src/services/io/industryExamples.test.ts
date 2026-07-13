import assert from 'node:assert/strict';
import test from 'node:test';
import { readProjectPackage } from '../../../../server/src/services/project-package-store';
import { exportToComponentNodes } from '../../designer/export';
import { executeFormControlEvent } from '../engine/formEventExecutor';
import { collectFlowSideEffects } from '../engine/flowSideEffects';
import { applyPreviewFlowSideEffects } from './projectWriteBack';
import type { ProjectStructure } from '../../project/types';

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

async function clickButtonWithSideEffects(
  project: ProjectStructure,
  formIndex: number,
  componentId: string,
  values: Record<string, unknown>,
) {
  const response = await clickButton(project, formIndex, componentId, values);
  const sideEffects = response.result.flowResults.flatMap((flowResult) => collectFlowSideEffects(flowResult));
  const effectResult = applyPreviewFlowSideEffects(project, sideEffects);
  return {
    ...response,
    project: effectResult.project,
    patches: effectResult.formValuePatches,
    messages: effectResult.messages,
  };
}

async function triggerControlWithSideEffects(
  project: ProjectStructure,
  formIndex: number,
  componentId: string,
  eventName: 'onBlur' | 'onChange',
  value: unknown,
  values: Record<string, unknown>,
) {
  const components = exportToComponentNodes(project.forms[formIndex].design.components);
  const component = components.find((item) => item.id === componentId);
  assert.ok(component, `missing component ${componentId}`);
  const result = await executeFormControlEvent({
    eventName,
    field: component.name,
    value,
    values,
    originalValues: {},
    component,
  }, {
    workflows: project.workflows,
    tables: project.srcTable,
    components,
    setValue: () => {},
    setVisible: () => {},
    setDisabled: () => {},
    setRequired: () => {},
    showMessage: () => {},
    code: (component.props.events as Record<string, string> | undefined)?.[eventName],
    trigger: (component.props.flowTriggers as Record<string, unknown> | undefined)?.[eventName],
  });
  const sideEffects = result.flowResults.flatMap((flowResult) => collectFlowSideEffects(flowResult));
  const effectResult = applyPreviewFlowSideEffects(project, sideEffects);
  return {
    result,
    project: effectResult.project,
    patches: effectResult.formValuePatches,
    messages: effectResult.messages,
  };
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

test('valve selection v2 example supports multi-table rule-based recommendation without button scripts', async () => {
  const project = loadProject('example_valve_selection_v2');
  assert.equal(project.forms.length, 3);
  assert.equal(project.srcTable.length, 4);
  const analysisWorkflow = project.workflows.find((workflow) => workflow.id === 'example_valve_selection_v2_wf_analyze');
  assert.ok(analysisWorkflow);
  assert.equal(analysisWorkflow.nodes.length <= 10, true);
  assert.deepEqual(analysisWorkflow.nodes.map((node) => node.specId), [
    'workflow:import',
    'behavior-data-query',
    'generic:criteria-filter',
    'behavior-data-query',
    'generic:merge',
    'behavior-data-query',
    'generic:merge',
    'generic:pick-record',
    'behavior-set-values',
    'workflow:export',
  ]);

  const create = await clickButton(project, 0, 'example_valve_selection_v2_create_submit', {
    需求单号: 7010,
    项目名称: '新建循环水支线',
    介质: '清水',
    DN: 80,
    PN: 16,
    设计温度: 45,
    目标流量: 110,
    连接方式: '法兰',
    阀体材质偏好: '碳钢',
    预算等级: '经济型',
    交期要求: '常规',
    防腐要求: '标准',
  });
  assert.equal(create.result.flowExecuted, true);
  assert.equal(create.result.flowResult?.nodeResults.get('submit')?.outputs.writeBack?.keyValue, 7010);

  const water = await clickButtonWithSideEffects(project, 1, 'example_valve_selection_v2_analysis_run', {
    需求单号: 7010,
    项目名称: '新建循环水支线',
    介质: '清水',
    DN: 80,
    PN: 16,
    设计温度: 45,
    目标流量: 110,
    连接方式: '法兰',
    阀体材质偏好: '碳钢',
    预算等级: '经济型',
    交期要求: '常规',
    防腐要求: '标准',
  });
  assert.equal(water.result.flowExecuted, true);
  assert.equal(water.patches['推荐主型号'], 'CV100-80C');
  assert.equal(water.patches['匹配数量'], 2);
  assert.equal((water.patches['候选清单'] as Array<Record<string, unknown>>).length, 2);

  const steam = await clickButtonWithSideEffects(project, 1, 'example_valve_selection_v2_analysis_run', {
    需求单号: 7011,
    项目名称: '高温蒸汽支线',
    介质: '蒸汽',
    DN: 100,
    PN: 25,
    设计温度: 300,
    目标流量: 150,
    连接方式: '法兰',
    阀体材质偏好: '不锈钢',
    预算等级: '高配型',
    交期要求: '常规',
    防腐要求: '标准',
  });
  assert.equal(steam.patches['推荐主型号'], 'CV200-100S');
  assert.deepEqual((steam.patches['候选清单'] as Array<Record<string, unknown>>).map((row) => row.型号), ['CV200-100S']);

  const corrosive = await clickButtonWithSideEffects(project, 1, 'example_valve_selection_v2_analysis_run', {
    需求单号: 7012,
    项目名称: '防腐酸洗线',
    介质: '腐蚀液',
    DN: 50,
    PN: 16,
    设计温度: 90,
    目标流量: 52,
    连接方式: '对夹',
    阀体材质偏好: '衬氟',
    预算等级: '标准型',
    交期要求: '快交',
    防腐要求: '防腐',
  });
  assert.equal(corrosive.patches['推荐附件型号'], 'ACC-WAF-50-FEP-QD');
  assert.match(String(corrosive.patches['推荐说明'] || ''), /防腐|衬氟/);

  const noMatch = await clickButtonWithSideEffects(project, 1, 'example_valve_selection_v2_analysis_run', {
    需求单号: 7013,
    项目名称: '极端高压工况',
    介质: '蒸汽',
    DN: 100,
    PN: 40,
    设计温度: 360,
    目标流量: 180,
    连接方式: '法兰',
    阀体材质偏好: '不锈钢',
    预算等级: '高配型',
    交期要求: '快交',
    防腐要求: '标准',
  });
  assert.equal(noMatch.patches['匹配数量'], 0);
  assert.match(String(noMatch.patches['无结果提示'] || ''), /无可用型号/);

  const updated = await clickButtonWithSideEffects(project, 2, 'example_valve_selection_v2_update_btn', {
    需求单号: 7002,
    项目名称: '蒸汽母管扩容',
    介质: '蒸汽',
    DN: 100,
    PN: 25,
    设计温度: 260,
    目标流量: 150,
    连接方式: '法兰',
    阀体材质偏好: '不锈钢',
    预算等级: '高配型',
    交期要求: '快交',
    防腐要求: '标准',
    原始需求单号: 7002,
    原始项目名称: '蒸汽母管扩容',
    原始介质: '蒸汽',
    原始DN: 100,
    原始PN: 25,
    原始设计温度: 260,
    原始目标流量: 150,
    原始连接方式: '法兰',
    原始阀体材质偏好: '不锈钢',
    原始预算等级: '高配型',
    原始交期要求: '常规',
    原始防腐要求: '标准',
  });
  assert.equal(updated.result.flowExecuted, true);
  assert.ok(updated.result.flowResult?.nodeResults.get('submit')?.outputs.changeLog);

  const rerun = await clickButtonWithSideEffects(updated.project, 2, 'example_valve_selection_v2_edit_run', {
    需求单号: 7002,
    项目名称: '蒸汽母管扩容',
    介质: '蒸汽',
    DN: 100,
    PN: 25,
    设计温度: 260,
    目标流量: 150,
    连接方式: '法兰',
    阀体材质偏好: '不锈钢',
    预算等级: '高配型',
    交期要求: '快交',
    防腐要求: '标准',
  });
  assert.equal(rerun.patches['匹配数量'], 0);
  assert.match(String(rerun.patches['无结果提示'] || ''), /无可用型号/);
});

test('valve selection v3 example supports staged intake, normalization, candidate generation, scoring, proposal, confirm and archive', async () => {
  const project = loadProject('example_valve_selection_v3');
  assert.equal(project.forms.length, 5);
  assert.equal(project.srcTable.length, 6);
  assert.equal(project.workflows.length, 10);

  const candidateWorkflow = project.workflows.find((workflow) => workflow.id === 'example_valve_selection_v3_wf_generate_candidates');
  assert.ok(candidateWorkflow);
  assert.deepEqual(candidateWorkflow.nodes.map((node) => node.specId), [
    'workflow:import',
    'behavior-data-query',
    'behavior-data-query',
    'generic:criteria-filter',
    'generic:criteria-filter',
    'generic:criteria-filter',
    'generic:array-enrich',
    'generic:record-transform',
    'behavior-set-values',
    'behavior-compose-message',
    'workflow:export',
  ]);
  const coreWorkflowIds = [
    'example_valve_selection_v3_wf_normalize_profile',
    'example_valve_selection_v3_wf_complete_profile',
    'example_valve_selection_v3_wf_generate_candidates',
    'example_valve_selection_v3_wf_score_candidates',
    'example_valve_selection_v3_wf_build_proposal',
    'example_valve_selection_v3_wf_quick_recommend',
  ];
  const coreJsNodeCount = project.workflows
    .filter((workflow) => coreWorkflowIds.includes(workflow.id))
    .flatMap((workflow) => workflow.nodes)
    .filter((node) => node.specId === 'behavior-js-script')
    .length;
  assert.equal(coreJsNodeCount, 0);

  const intakeValues = {
    需求编号: 9901,
    项目名称: '三代循环水试验线',
    客户名称: '示例客户A',
    介质: '清水',
    阀门品类: '止回阀',
    公称通径DN: 80,
    压力等级PN: 16,
    设计温度: 45,
    目标流量: 110,
    连接方式: '法兰',
    驱动方式: '手动',
    泄漏等级: '标准',
    预算等级: '经济型',
    交期要求: '常规',
    安装位号: 'CW-9901',
  };

  const accepted = await clickButtonWithSideEffects(project, 0, 'example_valve_selection_v3_accept_btn', intakeValues);
  assert.equal(accepted.result.flowExecuted, true);
  assert.equal(accepted.project.srcTable.find((table) => table.id === 'request_intake')?.sheets[0].preview.some((row) => row.需求编号 === 9901), true);
  assert.equal(accepted.patches['受理状态'], '待澄清');

  const normalized = await clickButtonWithSideEffects(accepted.project, 2, 'example_valve_selection_v3_normalize_btn', intakeValues);
  assert.equal(normalized.result.flowExecuted, true);
  assert.equal(normalized.patches['标准介质组'], '水系统');
  assert.equal(normalized.patches['受理状态'], '待筛选');
  assert.equal(Array.isArray(normalized.result.flowResults.flatMap((item) => collectFlowSideEffects(item))), true);

  const profileValues = {
    ...intakeValues,
    技术画像ID: normalized.patches['技术画像ID'],
    标准介质组: normalized.patches['标准介质组'],
    温度分段: normalized.patches['温度分段'],
    压力分段: normalized.patches['压力分段'],
    技术完整度: normalized.patches['技术完整度'],
    风险标签: normalized.patches['风险标签'],
    缺失项: normalized.patches['缺失项'],
    受理状态: normalized.patches['受理状态'],
  };

  const completed = await clickButtonWithSideEffects(normalized.project, 2, 'example_valve_selection_v3_complete_btn', profileValues);
  assert.equal(completed.patches['技术完整度'], '高');
  assert.equal(completed.patches['受理状态'], '待筛选');

  const decisionBaseValues = {
    技术画像ID: normalized.patches['技术画像ID'],
    需求编号: 9901,
    阀门品类: '止回阀',
    标准介质组: '水系统',
    公称通径DN: 80,
    压力等级PN: 16,
    设计温度: 45,
    连接方式: '法兰',
    驱动方式: '手动',
    泄漏等级: '标准',
    预算等级: '经济型',
    交期要求: '常规',
    风险标签: normalized.patches['风险标签'],
    受理状态: completed.patches['受理状态'],
    最终确认人: '张工',
  };

  const candidates = await clickButtonWithSideEffects(completed.project, 3, 'example_valve_selection_v3_generate_btn', decisionBaseValues);
  assert.equal(candidates.result.flowExecuted, true);
  assert.equal(candidates.patches['候选数量'], 2);
  assert.equal((candidates.patches['候选方案清单'] as Array<Record<string, unknown>>).length, 2);

  const scored = await clickButtonWithSideEffects(candidates.project, 3, 'example_valve_selection_v3_score_btn', {
    ...decisionBaseValues,
    候选方案清单: candidates.patches['候选方案清单'],
  });
  assert.equal((scored.patches['评分结果'] as Array<Record<string, unknown>>).length >= 2, true);
  assert.match(String(scored.patches['评分摘要'] || ''), /评分/);

  const proposed = await clickButtonWithSideEffects(scored.project, 3, 'example_valve_selection_v3_proposal_btn', {
    ...decisionBaseValues,
    评分结果: scored.patches['评分结果'],
  });
  assert.equal(proposed.patches['推荐方案号'], 'CASE-9901');
  assert.equal(proposed.patches['推荐型号'], 'CHK-W80-16C');
  assert.match(String(proposed.patches['推荐理由'] || ''), /总评分|推荐/);

  const confirmed = await clickButtonWithSideEffects(proposed.project, 3, 'example_valve_selection_v3_confirm_btn', {
    ...decisionBaseValues,
    推荐方案号: proposed.patches['推荐方案号'],
    推荐型号: proposed.patches['推荐型号'],
    推荐附件: proposed.patches['推荐附件'],
    推荐报价: proposed.patches['推荐报价'],
    预计交期天数: proposed.patches['预计交期天数'],
    最终确认人: '张工',
  });
  assert.equal(confirmed.patches['受理状态'], '已确认');
  assert.equal(confirmed.project.srcTable.find((table) => table.id === 'request_intake')?.sheets[0].preview.find((row) => row.需求编号 === 9901)?.推荐方案号, 'CASE-9901');

  const archived = await clickButtonWithSideEffects(confirmed.project, 3, 'example_valve_selection_v3_archive_btn', {
    ...decisionBaseValues,
    推荐方案号: proposed.patches['推荐方案号'],
    推荐型号: proposed.patches['推荐型号'],
    推荐附件: proposed.patches['推荐附件'],
    推荐报价: proposed.patches['推荐报价'],
    预计交期天数: proposed.patches['预计交期天数'],
    候选数量: candidates.patches['候选数量'],
    评分结果: scored.patches['评分结果'],
    最终确认人: '张工',
  });
  assert.match(String(archived.patches['案例摘要'] || ''), /CASE-9901/);
  assert.equal(archived.project.srcTable.find((table) => table.id === 'selection_cases')?.sheets[0].preview.some((row) => row.案例ID === 'CASE-9901'), true);
  assert.equal(archived.project.srcTable.find((table) => table.id === 'selection_audit_log')?.sheets[0].preview.some((row) => row.审计ID === 'AUD-9901-FINAL'), true);

  const noMatchCandidates = await clickButtonWithSideEffects(project, 3, 'example_valve_selection_v3_generate_btn', {
    技术画像ID: 3999,
    需求编号: 9999,
    阀门品类: '闸阀',
    标准介质组: '蒸汽系统',
    公称通径DN: 200,
    压力等级PN: 40,
    设计温度: 420,
    连接方式: '焊接',
    驱动方式: '气动',
    泄漏等级: 'VI级',
    预算等级: '高配型',
    交期要求: '加急',
    风险标签: '高温、高压',
    受理状态: '待筛选',
    最终确认人: '王工',
  });
  assert.equal(noMatchCandidates.patches['候选数量'], 0);
  assert.match(String(noMatchCandidates.patches['候选过滤摘要'] || ''), /未找到满足/);

  const quickRecommend = await clickButtonWithSideEffects(project, 1, 'example_valve_selection_v3_quick_run', {
    需求编号: 9950,
    介质: '蒸汽',
    阀门品类: '球阀',
    公称通径DN: 100,
    压力等级PN: 25,
    设计温度: 320,
    目标流量: 140,
    连接方式: '法兰',
    驱动方式: '电动',
    泄漏等级: 'VI级',
    预算等级: '高配型',
    交期要求: '加急',
  });
  assert.equal(quickRecommend.result.flowExecuted, true);
  assert.equal(quickRecommend.patches['标准介质组'], '蒸汽系统');
  assert.equal(quickRecommend.patches['推荐型号'], 'BAL-S100-25E');
  assert.equal((quickRecommend.patches['候选方案清单'] as Array<Record<string, unknown>>).length >= 1, true);

  const quickFilled = await triggerControlWithSideEffects(project, 1, 'example_valve_selection_v3_quick_0', 'onBlur', 9102, {
    需求编号: 9102,
  });
  assert.equal(quickFilled.result.flowExecuted, true);
  assert.equal(quickFilled.patches['介质'], '蒸汽');
  assert.equal(quickFilled.patches['阀门品类'], '球阀');
  assert.equal(quickFilled.patches['驱动方式'], '电动');
});
