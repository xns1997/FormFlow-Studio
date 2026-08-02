import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { loadDocCatalog } from './catalog';
import { buildDocIllustrationPlan, extractInstructionSteps } from './doc-illustration-plan';

const STEP_SCREENSHOT_EXEMPTIONS = new Set([
  'topic:behavior-rule-syntax',
  'topic:best-practices',
]);

test('every document receives a stable illustration namespace without a generic hero', async () => {
  const entries = await loadDocCatalog();
  assert.equal(entries.length, 324);
  const plans = entries.map(buildDocIllustrationPlan);
  assert.equal(new Set(plans.map((plan) => plan.customizationId)).size, entries.length);
  for (const plan of plans) assert.equal('hero' in plan, false);
});

test('every instructional step receives a matching screenshot plan', async () => {
  const entries = await loadDocCatalog();
  let stepCount = 0;

  for (const entry of entries) {
    const plan = buildDocIllustrationPlan(entry);
    for (const block of entry.blocks) {
      const steps = extractInstructionSteps(block);
      const illustrations = plan.stepsByBlock[block.id] || [];
      if (STEP_SCREENSHOT_EXEMPTIONS.has(entry.id)) {
        assert.equal(illustrations.length, 0, `${entry.id}:${block.id}`);
        stepCount += steps.length;
        continue;
      }
      assert.equal(illustrations.length, steps.length, `${entry.id}:${block.id}`);
      for (const [index, step] of steps.entries()) {
        const illustration = illustrations[index];
        assert.equal(illustration.sequence, index + 1);
        assert.equal(illustration.instruction, step);
        assert.ok(illustration.alt.includes(entry.title));
        assert.ok(illustration.alt.includes(step));
        assert.match(illustration.src, /^\/docs\/screenshots\/.+\.png$/);
        if (entry.id.startsWith('task:')) {
          assert.ok(illustration.scenarioId.length > 0, `${entry.id}:${block.id}:${index}`);
          assert.ok(illustration.stateCheckpoint.length > 0, `${entry.id}:${block.id}:${index}`);
          assert.ok(illustration.expectedVisibleFacts.length > 0, `${entry.id}:${block.id}:${index}`);
        }
      }
      stepCount += steps.length;
    }
  }

  assert.ok(stepCount > 200);
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
    id: 'search',
    title: '第 1 步：搜索与选择模板',
    body: '在模板中心按场景搜索并筛选模板。',
  }), ['搜索与选择模板：在模板中心按场景搜索并筛选模板。']);
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

test('project creation steps use dedicated Playwright scenes', async () => {
  const entries = await loadDocCatalog();
  const creation = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'task:understand-create')!);
  assert.deepEqual(creation.stepsByBlock.steps.map((step) => step.instruction), [
    '在项目列表点击“新建项目”。',
    '在创建项目向导的“起始方式”中选择空白项目、内置模板或 .formflow 导入。',
    '在“基础信息”步骤填写项目名称、项目描述、作者和标签。',
    '创建后先进入数据页，确认示例项目已经打开并显示 4 张数据表。',
  ]);
  assert.deepEqual(creation.stepsByBlock.steps.map((step) => step.src), [
    '/docs/screenshots/tasks/understand-create-01.png',
    '/docs/screenshots/tasks/understand-create-02.png',
    '/docs/screenshots/tasks/understand-create-03.png',
    '/docs/screenshots/tasks/understand-create-04.png',
  ]);
  assert.equal(new Set(creation.stepsByBlock.steps.map((step) => JSON.stringify(step.focus))).size, 4);
});

test('import-model uses dedicated task screenshots with distinct product states', async () => {
  const entries = await loadDocCatalog();
  const plan = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'task:import-model')!);
  assert.deepEqual(plan.stepsByBlock.steps.map((step) => step.instruction), [
    '在空数据工作区使用“上传”入口准备导入源文件。',
    '导入后切到 work_records.json 数据表，检查表头、样本值和字段数量。',
    '打开“配置”页，为 work_records.json 勾选“工作记录ID”作为 Key。',
    '返回数据表并搜索 JOB-00014，确认筛选结果已经收敛到 1 条目标记录。',
  ]);
  assert.deepEqual(plan.stepsByBlock.steps.map((step) => step.src), [
    '/docs/screenshots/tasks/import-model-01.png',
    '/docs/screenshots/tasks/import-model-02.png',
    '/docs/screenshots/tasks/import-model-03.png',
    '/docs/screenshots/tasks/import-model-04.png',
  ]);
  assert.equal(new Set(plan.stepsByBlock.steps.map((step) => JSON.stringify(step.focus))).size, 4);
});

test('generate-design uses dedicated task screenshots with design and runtime states', async () => {
  const entries = await loadDocCatalog();
  const plan = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'task:generate-design')!);
  assert.deepEqual(plan.stepsByBlock.steps.map((step) => step.instruction), [
    '在 work_records.json 勾选“工作记录ID”和“从业者ID”，点击“选择模板生成表单”。',
    '在模板选择弹窗中确认“单表数据录入”模板预览，并准备“创建并打开”。',
    '在表单设计器中选中文本输入控件，检查标签、必填和校验配置。',
    '在创建并打开后的运行预览中，确认表单骨架已经生成并可继续填写。',
  ]);
  assert.deepEqual(plan.stepsByBlock.steps.map((step) => step.src), [
    '/docs/screenshots/tasks/generate-design-01.png',
    '/docs/screenshots/tasks/generate-design-02.png',
    '/docs/screenshots/tasks/generate-design-03.png',
    '/docs/screenshots/tasks/generate-design-04.png',
  ]);
  assert.equal(new Set(plan.stepsByBlock.steps.map((step) => JSON.stringify(step.focus))).size, 4);
});

test('behavior-workflow uses dedicated task screenshots with rule, flow and test states', async () => {
  const entries = await loadDocCatalog();
  const plan = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'task:behavior-workflow')!);
  assert.deepEqual(plan.stepsByBlock.steps.map((step) => step.instruction), [
    '在规则页选中“规则代码”，检查提交前必填校验和工时提醒语句。',
    '切到流程页，查看“工作记录录入保存”流程的节点与连线。',
    '在流程页选中“表单保存”节点，检查主键字段、必填字段和字段映射配置。',
    '打开自动测试样例面板，查看当前覆盖率与失败/通过用例分布。',
  ]);
  assert.deepEqual(plan.stepsByBlock.steps.map((step) => step.src), [
    '/docs/screenshots/tasks/behavior-workflow-01.png',
    '/docs/screenshots/tasks/behavior-workflow-02.png',
    '/docs/screenshots/tasks/behavior-workflow-03.png',
    '/docs/screenshots/tasks/behavior-workflow-04.png',
  ]);
  assert.equal(new Set(plan.stepsByBlock.steps.map((step) => JSON.stringify(step.focus))).size, 4);
});

test('test-quality uses dedicated task screenshots with test overview and quality states', async () => {
  const entries = await loadDocCatalog();
  const plan = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'task:test-quality')!);
  assert.deepEqual(plan.stepsByBlock.steps.map((step) => step.instruction), [
    '打开自动测试样例面板，查看当前覆盖率、通过数和失败用例。',
    '在同一面板中核对必填为空、枚举校验和边界值等样例结果。',
    '切到数据质量页，确认质量分数、趋势和问题分布。',
  ]);
  assert.deepEqual(plan.stepsByBlock.steps.map((step) => step.src), [
    '/docs/screenshots/tasks/test-quality-01.png',
    '/docs/screenshots/tasks/test-quality-02.png',
    '/docs/screenshots/tasks/test-quality-03.png',
  ]);
  assert.equal(new Set(plan.stepsByBlock.steps.map((step) => JSON.stringify(step.focus))).size, 3);
});

test('task guides carry a continuous scenario and do not reuse the same screenshot within one page', async () => {
  const entries = await loadDocCatalog();
  for (const entry of entries.filter((item) => item.kind === 'task' && item.id !== 'task:apply-templates')) {
    const steps = buildDocIllustrationPlan(entry).stepsByBlock.steps || [];
    assert.ok(steps.length >= 3, entry.id);
    assert.equal(new Set(steps.map((step) => step.scenarioId)).size, 1, entry.id);
    assert.equal(new Set(steps.map((step) => step.src)).size, steps.length, entry.id);
  }
});

test('task guides do not reuse byte-identical screenshot assets within one page', async () => {
  const entries = await loadDocCatalog();
  for (const entry of entries.filter((item) => item.kind === 'task' && item.id !== 'task:apply-templates')) {
    const steps = buildDocIllustrationPlan(entry).stepsByBlock.steps || [];
    const hiDpiHashes = await Promise.all(steps.map(async (step) => {
      const file = resolve('ui/public', step.src.replace(/^\//, ''));
      return createHash('sha256').update(await readFile(file)).digest('hex');
    }));
    const loDpiHashes = await Promise.all(steps.map(async (step) => {
      const file = resolve('ui/public', step.src.replace(/\.png$/, '-1x.png').replace(/^\//, ''));
      return createHash('sha256').update(await readFile(file)).digest('hex');
    }));
    assert.equal(new Set(hiDpiHashes).size, hiDpiHashes.length, `${entry.id}:2x`);
    assert.equal(new Set(loDpiHashes).size, loDpiHashes.length, `${entry.id}:1x`);
  }
});

test('reference and best-practice pages do not render task-style step screenshots by default', async () => {
  const entries = await loadDocCatalog();
  const syntax = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'topic:behavior-rule-syntax')!);
  const pitfalls = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'topic:best-practices')!);
  assert.deepEqual(syntax.stepsByBlock, {});
  assert.deepEqual(pitfalls.stepsByBlock, {});
});

test('use-export uses dedicated task screenshots with runtime, filtered result and export states', async () => {
  const entries = await loadDocCatalog();
  const plan = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'task:use-export')!);
  assert.deepEqual(plan.stepsByBlock.steps.map((step) => step.instruction), [
    '在 worker_profiles.json 中搜索 W-0001，确认筛选结果收敛到 1 条从业者档案。',
    '保持当前筛选结果，核对导出前的表格范围就是这 1 行记录。',
    '点击“导出结果”，从当前筛选结果导出数据。',
    '确认右下角提示“已导出当前结果（1 行）”。',
  ]);
  assert.deepEqual(plan.stepsByBlock.steps.map((step) => step.src), [
    '/docs/screenshots/tasks/use-export-01.png',
    '/docs/screenshots/tasks/use-export-02.png',
    '/docs/screenshots/tasks/use-export-03.png',
    '/docs/screenshots/tasks/use-export-04.png',
  ]);
  assert.equal(new Set(plan.stepsByBlock.steps.map((step) => JSON.stringify(step.focus))).size, 4);
});

test('package-release uses dedicated task screenshots with publish gate, failing tests and saved delivery settings', async () => {
  const entries = await loadDocCatalog();
  const plan = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'task:package-release')!);
  assert.deepEqual(plan.stepsByBlock.steps.map((step) => step.instruction), [
    '打开“发布检查”确认当前有 6 个自动测试阻断项。',
    '切到“自动测试样例”，核对失败列表里已经出现“正常填写”“订单数最小边界”“工时最小/最大边界”等发布阻断项。',
    '打开设置页的“发布”分组，确认默认导出格式、输出文件名和写回策略。',
    '点击“保存”，确认右上角显示“已保存”，且右侧配置摘要保持最新状态。',
  ]);
  assert.deepEqual(plan.stepsByBlock.steps.map((step) => step.src), [
    '/docs/screenshots/tasks/package-release-01.png',
    '/docs/screenshots/tasks/package-release-02.png',
    '/docs/screenshots/tasks/package-release-03.png',
    '/docs/screenshots/tasks/package-release-04.png',
  ]);
  assert.equal(new Set(plan.stepsByBlock.steps.map((step) => JSON.stringify(step.focus))).size, 4);
});

test('template references defer to the shared guide instead of repeating screenshots', async () => {
  const entries = await loadDocCatalog();
  const guide = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'guide:template-usage-logic')!);
  const template = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'template:project:game_analytics')!);
  const task = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'task:apply-templates')!);
  assert.deepEqual(Object.keys(guide.stepsByBlock), ['search', 'mapping', 'apply']);
  assert.deepEqual(guide.stepsByBlock.search.map((step) => step.src), ['/docs/screenshots/template-center.png']);
  assert.deepEqual(guide.stepsByBlock.mapping.map((step) => step.src), ['/docs/screenshots/template-config.png']);
  assert.deepEqual(guide.stepsByBlock.apply.map((step) => step.src), ['/docs/screenshots/quality-center.png']);
  assert.equal(template.stepsByBlock.apply, undefined);
  assert.equal(task.stepsByBlock.guide, undefined);
});
