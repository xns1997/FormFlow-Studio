import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadDocCatalog } from './catalog';
import { buildDocIllustrationPlan, extractInstructionSteps } from './doc-illustration-plan';

test('every document receives a stable illustration namespace without a generic hero', async () => {
  const entries = await loadDocCatalog();
  assert.equal(entries.length, 317);
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
    '选择空白项目或与业务接近的内置模板。',
    '填写可识别的项目名称和用途。',
    '创建并进入编辑器，确认项目名称和当前工作模式。',
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
    '在数据工作区确认“上传”入口，准备带稳定 Key 的源文件。',
    '选中目标数据表，核对表头、样本值和字段类型。',
    '在“配置”页勾选用于唯一定位的 Key 字段。',
    '返回数据表，用搜索或分页确认当前结果可继续后续表单生成。',
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
    '在数据表中选择字段并点击“选择模板生成表单”。',
    '在生成弹窗中确认推荐模板和预览内容，再点击“创建并打开”。',
    '在设计器中选中控件，核对标签、必填和数据绑定。',
    '打开运行态表单，确认能进入真实填写。',
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
    '在规则页选中“规则代码”，核对当前表单的提交校验与提醒语句。',
    '切到流程页，确认“工作记录录入保存”流程的节点与连线完整。',
    '在流程页选中“表单保存”节点，检查 work_records / 工作记录 的字段映射与必填字段。',
    '打开顶部“测试 71%”样例面板，核对覆盖率与失败用例。',
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
    '打开顶部“测试 71%”查看自动测试样例和覆盖率。',
    '点击“一键运行全部”，核对正常填写、必填为空和主键重复等场景结果。',
    '打开数据质量页查看质量分数、质量趋势和问题分布。',
    '返回测试面板，确认最近运行时间与当前通过情况。',
  ]);
  assert.deepEqual(plan.stepsByBlock.steps.map((step) => step.src), [
    '/docs/screenshots/tasks/test-quality-01.png',
    '/docs/screenshots/tasks/test-quality-02.png',
    '/docs/screenshots/tasks/test-quality-03.png',
    '/docs/screenshots/tasks/test-quality-04.png',
  ]);
  assert.equal(new Set(plan.stepsByBlock.steps.map((step) => JSON.stringify(step.focus))).size, 3);
});

test('use-export uses dedicated task screenshots with runtime, filtered result and export states', async () => {
  const entries = await loadDocCatalog();
  const plan = buildDocIllustrationPlan(entries.find((entry) => entry.id === 'task:use-export')!);
  assert.deepEqual(plan.stepsByBlock.steps.map((step) => step.instruction), [
    '在使用页打开目标表单，确认进入真实填写界面。',
    '切到数据页，对目标数据表搜索 W-0001，确认当前结果范围已收敛到 1 行。',
    '在当前结果上点击“导出结果”，导出筛选后的数据。',
    '确认“已导出当前结果（1 行）”提示，并复核下载文件为 1 行 XLSX。',
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
    '切到“自动测试样例”，核对失败用例与发布阻断项一一对应。',
    '打开设置页的“发布”分组，确认默认导出格式、输出文件名和写回策略。',
    '点击“保存”，记录当前交付策略已保存，后续只需先清掉自动测试阻断再发布。',
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
