import assert from 'node:assert/strict';
import test from 'node:test';
import { createFormEntry } from './types';
import { createNewProject, normalizeProjectStructure } from './manager';
import { exportFormFlowPackage, importFormFlowPackage } from './packageManager';

test('new and legacy forms always expose an independent rule code space', () => {
  assert.equal(createFormEntry('新表单').ruleCode, '');
  const project = createNewProject('旧项目');
  const legacyForm = { ...createFormEntry('旧表单') };
  delete (legacyForm as Partial<typeof legacyForm>).ruleCode;
  const normalized = normalizeProjectStructure({ ...project, forms: [legacyForm as typeof legacyForm] });
  assert.equal(normalized.forms[0].ruleCode, '');
});

test('form rule code survives .formflow export and import', async () => {
  const project = createNewProject('规则持久化');
  project.forms = [{ ...createFormEntry('订单表单'), ruleCode: 'compute 合计 = $数量 * $单价 on change (数量, 单价)' }];
  const blob = await exportFormFlowPackage(project);
  const file = new File([await blob.arrayBuffer()], 'rules.formflow', { type: blob.type });
  const restored = await importFormFlowPackage(file);
  assert.equal(restored?.forms[0].ruleCode, project.forms[0].ruleCode);
});

test('project testing assets survive .formflow export and import', async () => {
  const project = createNewProject('回归资产');
  project.testing = {
    profiles: [{ id: 'profile-1', seed: 42 }],
    suites: [{ id: 'suite-1', cases: [{ id: 'normal' }] }],
    fixtures: [{ id: 'fixture-1', scenario: 'duplicate_key' }],
    runs: [{ id: 'run-1', passed: true }],
  };
  const blob = await exportFormFlowPackage(project);
  const restored = await importFormFlowPackage(new File([await blob.arrayBuffer()], 'testing.formflow', { type: blob.type }));
  assert.deepEqual(restored?.testing, project.testing);
});

test('project import rejects legacy .zip filenames', async () => {
  const blob = await exportFormFlowPackage(createNewProject('扩展名校验'));
  await assert.rejects(
    importFormFlowPackage(new File([await blob.arrayBuffer()], 'legacy.zip', { type: 'application/zip' })),
    /仅支持 \.formflow 项目包/,
  );
});
