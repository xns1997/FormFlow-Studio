import assert from 'node:assert/strict';
import test from 'node:test';
import { readProjectPackage } from './project-package-store';
import { validateProjectModel } from './project-authoring';
import { generateProjectTestSuite, inspectProjectQuality, runProjectTests } from './project-quality';

const PROJECT_ID = 'equipment-inspection-fault-closed-loop-management';

function fixture() {
  const project = readProjectPackage(PROJECT_ID);
  assert.ok(project, `回归基线项目 ${PROJECT_ID} 必须存在`);
  return project;
}

test('设备巡检回归基线不能被冻结 v2 校验误报为通过', () => {
  const report = validateProjectModel(fixture());
  assert.equal(report.valid, false);
  assert.equal(report.structural.valid, false);
  assert.ok(report.errors.some((item) => item.code === 'UNKNOWN_FIELD' && item.path === 'forms.inspection_record_form.behaviors.device_auto_fill.description'));
  assert.ok(report.errors.some((item) => item.code === 'UNKNOWN_FIELD' && item.path === 'forms.inspection_record_form.behaviors.device_info_autofill.description'));
});

test('设备巡检回归基线必须暴露伪带出、伪查询、控件和权限问题', () => {
  const quality = inspectProjectQuality(fixture());
  const codes = new Set(quality.diagnostics.map((item: any) => item.code));
  for (const code of ['BEHAVIOR_WRITE_CONFLICT', 'PLACEHOLDER_BEHAVIOR_VALUE', 'UNSUPPORTED_BEHAVIOR_EXPRESSION', 'QUERY_BUTTON_WITHOUT_QUERY', 'RESULT_TABLE_UNBOUND', 'CONTROL_TYPE_MISMATCH', 'RULE_PERMISSION_NOT_ENFORCED', 'WORKFLOW_NO_SIDE_EFFECT']) assert.ok(codes.has(code), `缺少诊断 ${code}`);
  assert.equal(quality.ready, false);
  assert.match(quality.tasks.find((item: any) => item.id === 'behaviors')?.summary || '', /全局\/Sheet\/表单/);
});

test('设备巡检回归不再用简单必填用例产生伪 100% 覆盖', () => {
  const project = fixture(); const suite = generateProjectTestSuite(project, 20260721); const run = runProjectTests(project, suite);
  assert.ok(suite.cases.some((item: any) => item.category === 'business' && item.assertion === 'abnormal_creates_work_order'));
  assert.ok(suite.cases.some((item: any) => item.category === 'business' && item.assertion === 'query_results'));
  assert.equal(run.passed, false);
  assert.ok(run.results.some((item: any) => item.category === 'business' && item.passed === false));
  assert.ok(run.coverage < 100);
});
