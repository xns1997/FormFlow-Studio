import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProjectModel } from './project-authoring';
import { generateProjectTestSuite, inspectProjectQuality, runProjectTests } from './project-quality';

/**
 * 设备巡检负向回归基线（合成 fixture）。
 *
 * 不再依赖 projects/data 下的包文件，而是内联构造一个刻意“坏掉”的 v2 项目，
 * 用于验证冻结 v2 结构校验、质量诊断与回归测试生成器确实会暴露问题：
 * - 表单行为携带未知字段 description（UNKNOWN_FIELD 结构性错误）；
 * - 伪带出、伪查询、控件类型错配、权限规则与无副作用状态流程（语义诊断）；
 * - 业务用例（异常生成工单、查询结果）缺乏可执行证据，回归无法达到 100% 覆盖。
 */
function fixture() {
  const now = '2026-07-21T00:00:00.000Z';
  return {
    config: {
      id: 'equipment-inspection-negative-baseline',
      name: '设备巡检负向回归基线（合成）',
      description: '刻意构造的坏包，仅供负向回归使用，不得作为演示或模板导入。',
      version: '2.0.0',
      createdAt: now,
      updatedAt: now,
      author: 'FormFlow Agent',
      tags: ['regression', 'negative'],
    },
    release: {
      mode: 'design',
      defaultFormId: 'inspection_record_form',
      defaultSheet: '巡检记录',
      allowDesigner: true,
      allowBehaviorEditor: true,
      allowWorkflowEditor: true,
    },
    srcTable: [{
      id: 'inspection_records',
      fileName: 'inspection_records.json',
      fileType: 'json',
      uploadedAt: now,
      dataHash: 'negative-baseline-fixture',
      sheets: [{
        name: '巡检记录',
        rowCount: 1,
        colCount: 10,
        headers: ['巡检编号', '巡检日期', '设备编号', '设备名称', '巡检结论', '工单编号', '处理负责人', '处理结果', '创建时间', '实际完成时间'],
        columns: ['巡检编号', '巡检日期', '设备编号', '设备名称', '巡检结论', '工单编号', '处理负责人', '处理结果', '创建时间', '实际完成时间']
          .map((name, index) => ({ name, index, dataType: index === 1 || index === 8 || index === 9 ? 'date' : 'string', nullable: false, uniqueCount: 1, sampleValues: [] })),
        preview: [{
          巡检编号: 'INSP-20260721-001',
          巡检日期: '2026-07-21',
          设备编号: 'EQ-001',
          设备名称: '传送带A',
          巡检结论: '异常',
          工单编号: '',
          处理负责人: '张三',
          处理结果: '',
          创建时间: '2026-07-21T09:00:00.000Z',
          实际完成时间: '',
        }],
        config: { id: 'inspection_records_巡检记录', tableName: '巡检记录', keyFields: ['巡检编号'], readOnly: false, filterEnabled: true, sortEnabled: true },
      }],
    }],
    sheetBehaviors: [],
    globalBehaviors: [],
    forms: [{
      id: 'inspection_record_form',
      name: '巡检记录表单',
      design: {
        id: 'inspection_record_form_design',
        name: '巡检记录表单',
        formMode: 'edit',
        viewport: { zoom: 1, panX: 0, panY: 0 },
        gridSize: 10,
        coordinateSpace: 'window-content-v1',
        formWindow: { x: 0, y: 0, width: 900, height: 640, props: { title: '巡检记录', showFooter: false } },
        components: [
          { id: 'inspection-id', type: 'input', x: 60, y: 60, width: 260, height: 72, props: { name: '巡检编号', label: '巡检编号' }, fieldBinding: '巡检编号' },
          { id: 'inspection-date', type: 'text', x: 360, y: 60, width: 260, height: 72, props: { name: '巡检日期', label: '巡检日期' }, fieldBinding: '巡检日期' },
          { id: 'device-id', type: 'input', x: 60, y: 160, width: 260, height: 72, props: { name: '设备编号', label: '设备编号' }, fieldBinding: '设备编号' },
          { id: 'device-name', type: 'input', x: 360, y: 160, width: 260, height: 72, props: { name: '设备名称', label: '设备名称' }, fieldBinding: '设备名称' },
          { id: 'inspection-result', type: 'input', x: 60, y: 260, width: 260, height: 72, props: { name: '巡检结论', label: '巡检结论' }, fieldBinding: '巡检结论' },
          { id: 'work-order-id', type: 'input', x: 360, y: 260, width: 260, height: 72, props: { name: '工单编号', label: '工单编号' }, fieldBinding: '工单编号' },
          { id: 'assignee', type: 'input', x: 60, y: 360, width: 260, height: 72, props: { name: '处理负责人', label: '处理负责人' }, fieldBinding: '处理负责人' },
          { id: 'handling-result', type: 'input', x: 360, y: 360, width: 260, height: 72, props: { name: '处理结果', label: '处理结果' }, fieldBinding: '处理结果' },
          { id: 'created-at', type: 'input', x: 60, y: 460, width: 260, height: 72, props: { name: '创建时间', label: '创建时间' }, fieldBinding: '创建时间' },
          { id: 'finished-at', type: 'text', x: 360, y: 460, width: 260, height: 72, props: { name: '实际完成时间', label: '实际完成时间' }, fieldBinding: '实际完成时间' },
          { id: 'result-table', type: 'table', x: 60, y: 560, width: 800, height: 240, props: { name: '查询结果', label: '查询结果' } },
          { id: 'query-btn', type: 'button', x: 60, y: 820, width: 260, height: 48, props: { name: '查询', label: '查询' } },
        ],
        bindings: [],
        createdAt: now,
        updatedAt: now,
      },
      behaviors: [
        {
          id: 'device_auto_fill',
          name: '设备自动带出',
          trigger: { type: 'onChange', fieldName: '设备编号' },
          actions: [
            { type: 'setValue', targetField: '设备名称', expression: 'equipment[编号=1].名称' },
            { type: 'setValue', targetField: '设备名称', expression: '"未知"' },
          ],
          enabled: true,
          description: '占位：伪带出（description 不属于冻结 v2 字段）',
        },
        {
          id: 'device_info_autofill',
          name: '设备信息自动带出',
          event: 'onChange',
          code: 'setValue("设备名称", "未知")',
          enabled: true,
          description: '占位：重复自动带出（description 不属于冻结 v2 字段）',
        },
      ],
      ruleCode: '只有处理负责人可以修改处理结果',
      createdAt: now,
      updatedAt: now,
    }],
    workflows: [{
      id: 'inspection-state-flow',
      name: '巡检状态流转',
      nodes: [
        { id: 'state-1', type: 'custom', specId: 'state', position: { x: 0, y: 0 }, data: { propertiesJson: JSON.stringify({ label: '待处理' }) } },
        { id: 'state-2', type: 'custom', specId: 'state', position: { x: 300, y: 0 }, data: { propertiesJson: JSON.stringify({ label: '处理中' }) } },
        { id: 'state-3', type: 'custom', specId: 'state', position: { x: 600, y: 0 }, data: { propertiesJson: JSON.stringify({ label: '已完成' }) } },
      ],
      edges: [],
      createdAt: now,
      updatedAt: now,
    }],
    outputs: [],
    testing: { profiles: [], suites: [], fixtures: [], runs: [] },
  };
}

test('设备巡检负向基线不能被冻结 v2 校验误报为通过', () => {
  const report = validateProjectModel(fixture());
  assert.equal(report.valid, false);
  assert.equal(report.structural.valid, false);
  assert.ok(report.errors.some((item) => item.code === 'UNKNOWN_FIELD' && item.path === 'forms.inspection_record_form.behaviors.device_auto_fill.description'));
  assert.ok(report.errors.some((item) => item.code === 'UNKNOWN_FIELD' && item.path === 'forms.inspection_record_form.behaviors.device_info_autofill.description'));
});

test('设备巡检负向基线必须暴露伪带出、伪查询、控件和权限问题', () => {
  const quality = inspectProjectQuality(fixture());
  const codes = new Set(quality.diagnostics.map((item: any) => item.code));
  for (const code of ['BEHAVIOR_WRITE_CONFLICT', 'PLACEHOLDER_BEHAVIOR_VALUE', 'UNSUPPORTED_BEHAVIOR_EXPRESSION', 'QUERY_BUTTON_WITHOUT_QUERY', 'RESULT_TABLE_UNBOUND', 'CONTROL_TYPE_MISMATCH', 'RULE_PERMISSION_NOT_ENFORCED', 'WORKFLOW_NO_SIDE_EFFECT']) assert.ok(codes.has(code), `缺少诊断 ${code}`);
  assert.equal(quality.ready, false);
  assert.match(quality.tasks.find((item: any) => item.id === 'behaviors')?.summary || '', /全局\/Sheet\/表单/);
});

test('设备巡检负向基线不再用简单必填用例产生伪 100% 覆盖', () => {
  const project = fixture();
  const suite = generateProjectTestSuite(project, 20260721);
  const run = runProjectTests(project, suite);
  assert.ok(suite.cases.some((item: any) => item.category === 'business' && item.assertion === 'abnormal_creates_work_order'));
  assert.ok(suite.cases.some((item: any) => item.category === 'business' && item.assertion === 'query_results'));
  assert.equal(run.passed, false);
  assert.ok(run.results.some((item: any) => item.category === 'business' && item.passed === false));
  assert.ok(run.coverage < 100);
});
