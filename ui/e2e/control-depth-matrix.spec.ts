import { test, expect } from '@playwright/test';

async function createDesigner(page: import('@playwright/test').Page) {
  await page.goto('/projects');
  await page.getByRole('button', { name: '新建项目' }).click();
  await page.locator('.project-wizard-mode-card').filter({ hasText: '内置模板' }).click();
  await page.locator('.project-wizard-template-card').filter({ hasText: '游戏数据分析' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('项目名称').fill(`控件深度矩阵-${Date.now()}`);
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '创建并进入项目' }).click();
  await page.getByRole('button', { name: '表单设计', exact: true }).click();
  await expect(page.locator('.designer-toolbox')).toBeVisible();
}

test('all registered controls are keyboard-addable and expose property configuration', async ({ page, request }) => {
  await createDesigner(page);
  const controlItems = page.locator('.toolbox-item');
  await expect(controlItems).toHaveCount(26);
  const labels = await controlItems.locator('.toolbox-item-label').allTextContents();
  expect(new Set(labels).size).toBe(26);
  const search = page.getByPlaceholder('搜索控件');
  await search.fill('不存在的控件');
  await expect(page.getByText('没有匹配的控件', { exact: true })).toBeVisible();
  await search.fill('');
  await expect(page.locator('.toolbox-item')).toHaveCount(26);
  for (let index = 0; index < labels.length; index += 1) {
    const item = page.locator('.toolbox-item').nth(index);
    await item.focus();
    await item.press('Enter');
    await expect(page.getByText('属性配置', { exact: true })).toBeVisible();
    await expect(page.locator('.designer-properties-shell')).toBeVisible();
  }
  const projectId = new URL(page.url()).pathname.match(/^\/projects\/([^/]+)/)?.[1];
  if (projectId?.startsWith('proj_')) await request.delete(`http://localhost:3103/api/projects/${projectId}`);
});

test('all registered controls remain reachable in preview runtime without viewport overflow', async ({ page, request }) => {
  await createDesigner(page);
  const controlItems = page.locator('.toolbox-item');
  const labels = await controlItems.locator('.toolbox-item-label').allTextContents();
  for (let index = 0; index < labels.length; index += 1) {
    await controlItems.nth(index).focus();
    await controlItems.nth(index).press('Enter');
  }
  await page.getByRole('button', { name: '预览表单' }).click();
  const runtimeControls = page.locator('.designer-preview-control');
  await expect(runtimeControls).toHaveCount(34);
  await expect(page.locator('.designer-canvas-shell.mode-preview')).toBeVisible();
  const viewport = page.locator('.designer-preview-viewport');
  await expect(viewport).toBeVisible();
  const geometry = await viewport.evaluate((element) => ({
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
  }));
  expect(geometry.clientWidth).toBeGreaterThan(0);
  expect(geometry.clientHeight).toBeGreaterThan(0);
  expect(geometry.scrollWidth).toBeGreaterThanOrEqual(geometry.clientWidth);
  expect(geometry.scrollHeight).toBeGreaterThanOrEqual(geometry.clientHeight);
  const runtimeTypes = await runtimeControls.evaluateAll((items) => items.map((item) => item.getAttribute('data-component-type')));
  expect(new Set(runtimeTypes).size).toBeGreaterThanOrEqual(26);
  const projectId = new URL(page.url()).pathname.match(/^\/projects\/([^/]+)/)?.[1];
  if (projectId?.startsWith('proj_')) await request.delete(`http://localhost:3103/api/projects/${projectId}`);
});

test('runtime form modal keeps its primary action reachable', async ({ page, request }) => {
  await createDesigner(page);
  const projectId = new URL(page.url()).pathname.match(/^\/projects\/([^/]+)/)?.[1];
  await page.getByRole('button', { name: '测试运行' }).click();
  await expect(page.locator('.page-sidebar')).toBeVisible();
  const formEntry = page.locator('.page-sidebar .sidebar-item').filter({ has: page.locator('.sidebar-item-icon') }).last();
  await expect(formEntry).toBeVisible();
  await formEntry.click();
  await expect(page.locator('.form-runtime-modal')).toBeVisible();
  const runtimeViewport = page.locator('.form-runtime-modal .designer-preview-viewport');
  await expect(runtimeViewport).toBeVisible();
  await expect(page.locator('.form-runtime-modal button').first()).toBeVisible();
  const bounds = await runtimeViewport.boundingBox();
  expect(bounds?.width || 0).toBeGreaterThan(0);
  expect(bounds?.height || 0).toBeGreaterThan(0);
  const runtimeText = await page.locator('.form-runtime-modal').innerText();
  expect(runtimeText).not.toMatch(/undefined|null/);
  if (projectId?.startsWith('proj_')) await request.delete(`http://localhost:3103/api/projects/${projectId}`);
});
