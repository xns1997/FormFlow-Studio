import { test, expect } from '@playwright/test';
import { deleteTestProject } from './project-test-cleanup';

test('流程画布代码编辑器使用本地 Monaco，不出现空模型错误', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('/projects');
  await page.getByRole('button', { name: '新建项目' }).click();
  await page.locator('.project-wizard-mode-card').filter({ hasText: '内置模板' }).click();
  await page.locator('.project-wizard-template-card').filter({ hasText: '游戏数据分析' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('项目名称').fill(`流程画布-${Date.now()}`);
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '创建并进入项目' }).click();
  await page.getByRole('button', { name: '流程', exact: true }).click();
  await expect(page.locator('.react-flow, .flow-canvas, canvas').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.react-flow__node').first().click();
  await page.waitForTimeout(1000);
  const jsonTab = page.getByRole('tab', { name: 'JSON' }).first();
  if (await jsonTab.count()) {
    await jsonTab.click();
    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15000 });
    const expand = page.locator('.code-editor-expand-btn').first();
    if (await expand.count()) {
      await expand.click();
      await expect(page.locator('.monaco-editor').last()).toBeVisible({ timeout: 15000 });
      await page.locator('.monaco-editor').last().click();
      await page.keyboard.type('a');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    }
  }
  const monacoErrors = errors.filter((e) => /getFullModelRange|Cannot read properties of null/.test(e));
  expect(monacoErrors).toEqual([]);
  const cdnErrors = errors.filter((e) => /cdn\.jsdelivr\.net|monaco-editor@/.test(e));
  expect(cdnErrors).toEqual([]);

  const projectId = new URL(page.url()).pathname.match(/^\/projects\/([^/]+)/)?.[1];
  if (projectId) await deleteTestProject(page.request, projectId);
});
