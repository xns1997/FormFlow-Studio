import { test, expect } from '@playwright/test';
import { deleteTestProject } from './project-test-cleanup';

async function focusJsonEditorEnd(page: import('@playwright/test').Page) {
  await page.locator('.json-mode-editor .monaco-editor .view-lines').first().click({ position: { x: 60, y: 40 } });
  await page.keyboard.press('Control+End');
}

test('四类实体 schema JSON 模式：切换、结构门禁与可视化回写', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.addInitScript(() => {
    try { localStorage.setItem('formflow-onboarding-completed', 'true'); } catch { /* ignore */ }
  });

  await page.goto('/projects');
  await page.getByRole('button', { name: '新建项目' }).click();
  await page.locator('.project-wizard-mode-card').filter({ hasText: '内置模板' }).click();
  await page.locator('.project-wizard-template-card').filter({ hasText: '游戏数据分析' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('项目名称').fill(`SchemaJSON-${Date.now()}`);
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '创建并进入项目' }).click();

  // ── 表单设计 JSON 模式 ──
  await page.locator('.project-workspace-link').filter({ hasText: '表单' }).click();
  await page.locator('.unified-left-tab').filter({ hasText: '表单' }).click();
  await expect(page.locator('.unified-list-item').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.unified-list-item').first().hover();
  await page.locator('.unified-list-json').first().click();
  await expect(page.locator('.json-mode-editor .monaco-editor').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.json-mode-title')).toContainText('表单设计 JSON');

  // 结构门禁：末尾输入非法字符 → 应用禁用并提示结构错误
  await focusJsonEditorEnd(page);
  await page.keyboard.type('x');
  await expect.poll(async () => {
    const text = await page.locator('.json-mode-editor .monaco-editor .view-lines').first().textContent();
    return text || '';
  }, { timeout: 5000 }).toContain('x');
  await expect(page.locator('.json-mode-status.invalid')).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('button', { name: '应用' })).toBeDisabled();
  await page.keyboard.press('Backspace');
  await expect(page.getByRole('button', { name: '应用' })).toBeEnabled({ timeout: 8000 });

  // 应用并返回可视化画布
  await page.getByRole('button', { name: '应用' }).click();
  await page.locator('.design-json-mode-switch').getByRole('tab', { name: '可视化' }).click();
  await expect(page.locator('.designer-canvas-shell')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.json-mode-editor')).toHaveCount(0);

  // ── 流程 JSON 模式 ──
  await page.locator('.project-workspace-link').filter({ hasText: '流程' }).click();
  await expect(page.locator('.workflow-instance-item').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.workflow-instance-item').first().hover();
  await page.locator('.workflow-instance-json').first().click();
  await expect(page.locator('.json-mode-editor .monaco-editor').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.json-mode-title')).toContainText('流程 JSON');
  await focusJsonEditorEnd(page);
  await page.keyboard.type('x');
  await expect(page.locator('.json-mode-status.invalid')).toBeVisible({ timeout: 8000 });
  await page.keyboard.press('Backspace');
  await expect(page.getByRole('button', { name: '应用' })).toBeEnabled({ timeout: 8000 });
  await page.getByRole('button', { name: '应用' }).click();
  await page.locator('.design-json-mode-switch').getByRole('tab', { name: '可视化' }).click();
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 8000 });

  // ── 数据表配置 JSON 模式 ──
  await page.locator('.project-workspace-link').filter({ hasText: '数据' }).click();
  await expect(page.locator('#data-preview-tab-json')).toBeVisible({ timeout: 15000 });
  await page.locator('#data-preview-tab-json').click();
  await expect(page.locator('.json-mode-editor .monaco-editor').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.json-mode-title')).toContainText('表配置 JSON');
  await page.locator('.design-json-mode-switch, .json-mode-toolbar').first().getByRole('button', { name: '返回可视化' }).click();

  // ── 项目设置 JSON 模式 ──
  await page.locator('.project-workspace-link').filter({ hasText: '设置' }).click();
  await expect(page.locator('.settings-json-entry')).toBeVisible({ timeout: 15000 });
  await page.locator('.settings-json-entry').click();
  await expect(page.locator('.json-mode-editor .monaco-editor').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.json-mode-title')).toContainText('项目设置 JSON');
  await page.getByRole('button', { name: '应用' }).click();
  await page.locator('.json-mode-toolbar').getByRole('button', { name: '返回可视化' }).click();
  await expect(page.locator('.project-settings-body')).toBeVisible({ timeout: 8000 });

  // Monaco 空模型回归
  const monacoErrors = errors.filter((e) => /getFullModelRange|Cannot read properties of null/.test(e));
  expect(monacoErrors).toEqual([]);

  const projectId = new URL(page.url()).pathname.match(/^\/projects\/([^/]+)/)?.[1];
  if (projectId) await deleteTestProject(page.request, projectId);
});
