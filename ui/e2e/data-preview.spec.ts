import { test, expect } from '@playwright/test';

async function createDataProject(page: import('@playwright/test').Page) {
  await page.goto('/projects');
  await page.getByRole('button', { name: '新建项目' }).click();
  await page.locator('.project-wizard-mode-card').filter({ hasText: '内置模板' }).click();
  await page.locator('.project-wizard-template-card').filter({ hasText: '中国人口预测' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('项目名称').fill(`数据预览测试-${Date.now()}`);
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '创建并进入项目' }).click();
  await expect(page).toHaveURL(/\/editor\?mode=data/);
  await page.getByText('forecast_assumptions.json', { exact: true }).click();
  await expect(page.locator('.data-preview-summary')).toContainText('3 行');
}

test.describe('数据准备工作台', () => {
  test.afterEach(async ({ page, request }) => {
    const projectId = new URL(page.url()).pathname.match(/^\/projects\/([^/]+)/)?.[1];
    if (projectId?.startsWith('proj_')) await request.delete(`http://localhost:3103/api/projects/${projectId}`);
  });

  test('提供服务端搜索分页和分组工具栏', async ({ page }) => {
    await createDataProject(page);
    await expect(page.getByLabel('全表搜索')).toBeVisible();
    await expect(page.getByLabel('每页行数')).toBeVisible();
    await expect(page.getByRole('button', { name: '导出结果' })).toBeVisible();
    await page.getByLabel('全表搜索').fill('基准');
    await expect(page.locator('.data-preview-summary')).toContainText('/');
  });

  test('离开数据预览前保护未保存修改', async ({ page }) => {
    await createDataProject(page);
    await page.getByRole('button', { name: '+ 新增行' }).click();
    await expect(page.locator('.data-preview-save-state')).toContainText('未保存');
    await page.getByRole('button', { name: '表单设计' }).click();
    await expect(page.getByRole('heading', { name: '有未保存的数据修改' })).toBeVisible();
    await page.getByRole('button', { name: '留在当前页' }).click();
    await expect(page.getByRole('button', { name: '数据预览' })).toHaveClass(/active/);
    await page.getByRole('button', { name: '撤销' }).click();
    await expect(page.locator('.data-preview-save-state')).toContainText('已保存');
  });

  test('新增记录通过批量接口保存并刷新总数', async ({ page }) => {
    await createDataProject(page);
    await page.getByRole('button', { name: '+ 新增行' }).click();
    const newRow = page.locator('.ag-pinned-left-cols-container .ag-row').last();
    await newRow.locator('[col-id="参数ID"]').dblclick();
    await page.keyboard.type('A-E2E-NEW');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('数据修改已保存');
    await expect(page.locator('.data-preview-save-state')).toContainText('已保存');
    await expect(page.locator('.data-preview-summary')).toContainText('4 行');
  });
});
