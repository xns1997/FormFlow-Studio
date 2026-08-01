import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadDocCatalog } from './catalog';
import { buildDocIllustrationPlan, extractInstructionSteps } from './doc-illustration-plan';

test('every document receives an individually customized Playwright illustration', async () => {
  const entries = await loadDocCatalog();
  assert.equal(entries.length, 316);
  const plans = entries.map(buildDocIllustrationPlan);
  assert.equal(new Set(plans.map((plan) => plan.customizationId)).size, entries.length);

  for (const [index, plan] of plans.entries()) {
    const entry = entries[index];
    assert.match(plan.hero.src, /^\/docs\/screenshots\/.+\.png$/);
    assert.match(plan.hero.alt, new RegExp(entry.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(plan.hero.callout.includes(entry.title));
    assert.ok(plan.hero.focus.x >= 0 && plan.hero.focus.x + plan.hero.focus.width <= 100);
    assert.ok(plan.hero.focus.y >= 0 && plan.hero.focus.y + plan.hero.focus.height <= 100);
  }

  const importPlan = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'task:import-model')!);
  const designPlan = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'task:generate-design')!);
  assert.deepEqual(importPlan.hero.focus, { x: 0, y: 9, width: 29, height: 44 });
  assert.deepEqual(designPlan.hero.focus, { x: 0, y: 11, width: 25, height: 77 });
});

test('every instructional step receives a matching screenshot plan', async () => {
  const entries = await loadDocCatalog();
  let stepCount = 0;

  for (const entry of entries) {
    const plan = buildDocIllustrationPlan(entry);
    for (const block of entry.blocks) {
      const steps = extractInstructionSteps(block);
      const illustrations = plan.stepsByBlock[block.id] || [];
      assert.equal(illustrations.length, steps.length, `${entry.id}:${block.id}`);
      for (const [index, step] of steps.entries()) {
        const illustration = illustrations[index];
        assert.equal(illustration.sequence, index + 1);
        assert.equal(illustration.instruction, step);
        assert.ok(illustration.alt.includes(entry.title));
        assert.ok(illustration.alt.includes(step));
        assert.match(illustration.src, /^\/docs\/screenshots\/.+\.png$/);
      }
      stepCount += steps.length;
    }
  }

  assert.equal(stepCount, 376);
});

test('implicit lifecycle instructions are split into their real steps', () => {
  assert.deepEqual(extractInstructionSteps({
    id: 'apply',
    title: '应用步骤',
    body: '在模板中心选择此模板，完成数据表与字段映射，预览生成内容后应用，并运行质量检查。',
  }), [
    '在模板中心选择此模板',
    '选择需要的数据表',
    '完成字段映射',
    '预览生成内容后应用',
    '运行质量检查',
  ]);
  assert.deepEqual(extractInstructionSteps({
    id: 'usage',
    title: '如何使用',
    body: '从本文确认适用范围和前置条件，再按顺序执行；遇到错误时优先遵循页面中的确定性校验与安全门禁。',
  }), [
    '确认适用范围和前置条件',
    '按文档顺序执行',
    '遇到错误时遵循确定性校验与安全门禁',
  ]);
  assert.deepEqual(extractInstructionSteps({
    id: 'create',
    title: '第一步：创建项目',
    body: '点击首页「新建项目」，输入项目名称和描述。',
  }), ['创建项目：点击首页「新建项目」，输入项目名称和描述。']);
  assert.deepEqual(extractInstructionSteps({
    id: 'example',
    title: '快速上手示例',
    examples: [{
      title: '创建员工录入表单',
      code: '1. 创建项目：名称“员工管理”\n2. 导入数据：上传员工信息.xlsx',
    }],
  }), ['创建项目：名称“员工管理”', '导入数据：上传员工信息.xlsx']);
  assert.deepEqual(extractInstructionSteps({
    id: 'usage',
    title: '使用建议',
    body: '在画布中搜索“数据过滤”，连接类型兼容的端口，配置必填参数后再运行测试。',
  }), [
    '在画布中搜索“数据过滤”',
    '连接类型兼容的端口',
    '配置必填参数',
    '运行测试',
  ]);
});

test('quick start and node references expose every explicit step', async () => {
  const entries = await loadDocCatalog();
  const quickStart = entries.find((entry) => entry.id === 'overview:quick-start')!;
  const quickStartPlan = buildDocIllustrationPlan(quickStart);
  assert.equal(Object.values(quickStartPlan.stepsByBlock).flat().length, 10);

  const node = entries.find((entry) => entry.id.startsWith('node:'))!;
  const nodePlan = buildDocIllustrationPlan(node);
  assert.equal(nodePlan.stepsByBlock.usage.length, 4);
});

test('project creation and release steps use dedicated Playwright scenes', async () => {
  const entries = await loadDocCatalog();
  const creation = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'task:understand-create')!);
  const release = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'task:package-release')!);
  assert.equal(creation.stepsByBlock.steps[0].src, '/docs/screenshots/project-create.png');
  assert.equal(creation.stepsByBlock.steps[1].src, '/docs/screenshots/project-details.png');
  assert.equal(creation.stepsByBlock.steps[3].src, '/docs/screenshots/form-designer.png');
  assert.equal(release.stepsByBlock.steps[0].src, '/docs/screenshots/release-check.png');
  assert.equal(release.stepsByBlock.steps[2].src, '/docs/screenshots/release-check.png');
});

test('steps on the same product screen receive semantic focus regions', async () => {
  const entries = await loadDocCatalog();
  const plan = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'task:import-model')!);
  const focuses = plan.stepsByBlock.steps.map((step) => JSON.stringify(step.focus));
  assert.ok(new Set(focuses).size >= 3);
});

test('template configuration and automated test steps use selected-state scenes', async () => {
  const entries = await loadDocCatalog();
  const template = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'template:project:game_analytics')!);
  const quality = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'task:test-quality')!);
  assert.equal(template.stepsByBlock.apply[1].src, '/docs/screenshots/template-config.png');
  assert.equal(template.stepsByBlock.apply[3].src, '/docs/screenshots/template-config.png');
  assert.equal(quality.stepsByBlock.steps[0].src, '/docs/screenshots/test-overview.png');
  assert.equal(quality.stepsByBlock.steps[2].src, '/docs/screenshots/quality-center.png');
});
