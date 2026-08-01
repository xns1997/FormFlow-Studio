import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.FORMFLOW_DOCS_BASE_URL || 'http://localhost:5175';
const apiDocsUrl = process.env.FORMFLOW_DOCS_API_URL || 'http://localhost:3103/api-docs';
const outputDir = resolve('ui/public/docs/screenshots');
const fixture = {
  id: 'proj_1785585600000',
  name: '文档截图示例：灵活就业分析',
  description: '仅供公开文档截图使用的脱敏示例项目',
  author: 'FormFlow 文档团队',
  templateName: '灵活就业分析',
};
const frozenTime = Date.parse('2026-08-01T12:00:00.000Z');

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
});
await context.addInitScript(({ timestamp }) => {
  const NativeDate = Date;
  class FrozenDate extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : [timestamp]));
    }
    static now() { return timestamp; }
  }
  globalThis.Date = FrozenDate;
}, { timestamp: frozenTime });
const page = await context.newPage();
let createdFixtureId;

async function waitForStablePage() {
  await page.waitForLoadState('networkidle');
  await page.locator('html > body').waitFor({ state: 'visible' });
  await page.evaluate(async () => { await document.fonts.ready; });
}

async function capture(name) {
  await waitForStablePage();
  await page.screenshot({
    path: resolve(outputDir, `${name}.png`),
    animations: 'disabled',
    scale: 'device',
  });
  await page.screenshot({
    path: resolve(outputDir, `${name}-1x.png`),
    animations: 'disabled',
    scale: 'css',
  });
}

async function removeOwnedFixture(projectId) {
  const existing = await context.request.get(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}`);
  if (existing.status() === 404) return;
  if (!existing.ok()) throw new Error(`无法检查文档截图 fixture：HTTP ${existing.status()}`);
  const project = await existing.json();
  if (project?.config?.name !== fixture.name || project?.config?.description !== fixture.description) {
    throw new Error(`拒绝删除非文档 fixture 项目：${projectId}`);
  }
  const deleteUrl = `${baseUrl}/api/projects/${encodeURIComponent(projectId)}`;
  const mutationHeaders = {
    'if-match': existing.headers()['x-project-revision'] || existing.headers().etag || '',
    'x-idempotency-key': `docs-screenshot-fixture-delete-${Date.now()}`,
  };
  const challenge = await context.request.delete(deleteUrl, { headers: mutationHeaders });
  if (challenge.status() !== 409) throw new Error(`文档 fixture 删除未返回确认挑战：HTTP ${challenge.status()}`);
  const confirmationToken = (await challenge.json())?.confirmation?.token;
  if (!confirmationToken) throw new Error('文档 fixture 删除确认挑战缺少 token');
  const removed = await context.request.delete(deleteUrl, {
    headers: { ...mutationHeaders, 'x-confirmation-token': confirmationToken },
  });
  if (!removed.ok()) throw new Error(`无法清理文档截图 fixture：HTTP ${removed.status()}`);
}

try {
  await page.goto(`${baseUrl}/projects`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('formflow-onboarding-completed', 'true'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await removeOwnedFixture(fixture.id);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForStablePage();

  await page.getByRole('button', { name: '新建项目' }).click();
  await page.getByRole('button', { name: /内置模板/ }).click();
  await page.locator('.project-wizard-template-card').filter({ hasText: fixture.templateName }).click();
  await capture('project-create');

  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('项目名称').fill(fixture.name);
  await page.getByLabel('项目描述').fill(fixture.description);
  await page.getByLabel('作者').fill(fixture.author);
  await page.getByLabel('标签').fill('文档, 示例, 脱敏');
  await capture('project-details');
  await page.getByRole('button', { name: '下一步' }).click();
  createdFixtureId = fixture.id;
  await page.getByRole('button', { name: '创建并进入项目' }).click();
  await page.waitForURL(/\/projects\/[^/]+\/editor/);
  const navigatedProjectId = new URL(page.url()).pathname.split('/')[2];
  if (navigatedProjectId !== fixture.id) {
    throw new Error(`fixture ID 不确定：期望 ${fixture.id}，实际 ${navigatedProjectId}`);
  }

  const routes = [
    ['data-workspace', 'data'],
    ['form-designer', 'design'],
    ['behavior-editor', 'behavior'],
    ['workflow-canvas', 'flow'],
    ['template-center', 'template'],
  ];
  for (const [name, mode] of routes) {
    await page.goto(`${baseUrl}/projects/${createdFixtureId}/editor?mode=${mode}`, { waitUntil: 'domcontentloaded' });
    if (name === 'template-center') {
      await page.getByRole('button', { name: /配置模板/ }).first().waitFor({ state: 'visible' });
    }
    await capture(name);
  }

  await page.goto(`${baseUrl}/projects/${createdFixtureId}/quality`, { waitUntil: 'domcontentloaded' });
  await capture('quality-center');
  await page.goto(`${baseUrl}/projects/${createdFixtureId}/usage`, { waitUntil: 'domcontentloaded' });
  await capture('delivery-usage');

  await page.goto(`${baseUrl}/projects/${createdFixtureId}/editor?mode=design`, { waitUntil: 'domcontentloaded' });
  const releaseCheck = page.getByRole('button', { name: /发布检查/ }).first();
  await releaseCheck.waitFor({ state: 'visible' });
  await releaseCheck.click();
  await page.getByText(/发布门禁|发布检查/).last().waitFor({ state: 'visible' });
  await capture('release-check');

  await page.goto(`${baseUrl}/projects/${createdFixtureId}/editor?mode=template`, { waitUntil: 'domcontentloaded' });
  const configureTemplate = page.getByRole('button', { name: /配置模板/ }).first();
  await configureTemplate.waitFor({ state: 'visible' });
  await configureTemplate.click();
  await page.getByRole('complementary', { name: '模板配置向导' }).getByText('配置向导').waitFor({ state: 'visible' });
  await capture('template-config');

  await page.goto(`${baseUrl}/projects/${createdFixtureId}/editor?mode=design`, { waitUntil: 'domcontentloaded' });
  const testOverview = page.getByRole('button', { name: /测试\s*\d+%/ }).first();
  await testOverview.waitFor({ state: 'visible' });
  await testOverview.click();
  await page.getByText('自动测试样例').waitFor({ state: 'visible' });
  await capture('test-overview');

  await page.goto(apiDocsUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('FormFlow Studio API').waitFor({ state: 'visible' });
  await capture('api-settings');
} finally {
  try {
    if (createdFixtureId) await removeOwnedFixture(createdFixtureId);
  } finally {
    await browser.close();
  }
}

console.log(`已生成 13 组文档截图（3200×2000 原图 + 1600×1000 响应式图）：${outputDir}`);
