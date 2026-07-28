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
    await expect(page.locator('.data-preview-feedback')).toContainText('数据修改已保存');
    await expect(page.locator('.data-preview-save-state')).toContainText('已保存');
    await expect(page.locator('.data-preview-summary')).toContainText('4 行');
  });

  test('可按选中字段推荐模板、交互预览并创建表单', async ({ page }) => {
    await createDataProject(page);
    await page.getByLabel('选择字段 参数ID').check();
    await page.getByLabel('选择字段 情景').check();
    await expect(page.locator('.data-preview-template-selection')).toContainText('已选 2 个字段');
    await page.locator('.data-preview-template-selection').getByRole('button', { name: '选择模板生成表单' }).click();
    await expect(page.getByRole('heading', { name: '选择模板生成表单' })).toBeVisible();
    await expect(page.getByText('正在匹配全部模板…')).toBeHidden();
    await expect(page.locator('.data-template-card').first()).toContainText('最适合');
    await expect(page.locator('[data-testid="designer-preview"]')).toBeVisible();
    await page.locator('.data-template-parameters summary').click();
    const fieldSelector = page.locator('.data-template-parameters label').filter({ hasText: '表单字段' }).getByRole('combobox');
    await fieldSelector.click();
    const fieldDropdown = page.locator('.data-template-modal .ant-select-dropdown');
    await expect(fieldDropdown).toBeVisible();
    await expect(fieldDropdown.locator('.ant-select-item-option-content').filter({ hasText: '参数ID' })).toBeVisible();
    await fieldSelector.click();
    await page.getByRole('button', { name: '创建并打开' }).click();
    await expect(page).toHaveURL(/mode=design&form=/);
  });

  test('分析与预测模板展示报告预览而不是空白录入表单', async ({ page }) => {
    await createDataProject(page);
    await page.getByText('population_forecast.json', { exact: true }).click();
    await expect(page.locator('.data-preview-summary')).toContainText('75 行');
    await page.getByLabel('选择字段 年份').click();
    await page.getByLabel('选择字段 总人口万人').click();
    await expect(page.locator('.data-preview-template-selection')).toContainText('已选 2 个字段');
    await page.locator('.data-preview-template-selection').getByRole('button', { name: '选择模板生成表单' }).click();
    await expect(page.getByText('正在匹配全部模板…')).toBeHidden();
    await page.getByRole('button', { name: /查看全部/ }).click();
    await expect(page.locator('.data-template-card')).toHaveCount(19);
    await page.locator('.data-template-card').filter({ hasText: '数值回归预测' }).click();

    const targetSelector = page.locator('.data-template-parameters label').filter({ hasText: '目标字段' }).getByRole('combobox');
    await targetSelector.click();
    await page.locator('.data-template-modal .ant-select-dropdown .ant-select-item-option-content').filter({ hasText: '总人口万人' }).click();
    const featureSelector = page.locator('.data-template-parameters label').filter({ hasText: '特征字段' }).getByRole('combobox');
    await featureSelector.click();
    await page.locator('.data-template-modal .ant-select-dropdown:visible .ant-select-item-option-content').filter({ hasText: '年份' }).last().click();
    await page.locator('.data-template-preview-header strong').click();

    await expect(page.getByText('输入样本预览（非模型结果）')).toBeVisible();
    await expect(page.getByText(/创建后会基于当前保存的数据自动运行/)).toBeVisible();
    await expect(page.locator('.data-template-preview-details')).not.toHaveAttribute('open', '');
    await expect(page.locator('[data-testid="designer-preview"] input')).toHaveCount(0);
    await expect(page.locator('[data-testid="designer-preview"] table').first()).toBeVisible();
    await page.getByRole('button', { name: '创建并打开' }).click();
    await expect(page.getByRole('heading', { name: '分析与预测结果' })).toBeVisible();
    await expect(page.locator('.analysis-result-card').first()).toContainText('数值回归预测');
  });

  test('批量更新模板在预览和正式运行态只提交被修改的行', async ({ page, request }) => {
    await createDataProject(page);
    await page.getByLabel('选择字段 参数ID').check();
    await page.getByLabel('选择字段 情景').check();
    await page.getByLabel('选择字段 出生率').check();
    await page.locator('.data-preview-template-selection').getByRole('button', { name: '选择模板生成表单' }).click();
    await expect(page.getByText('正在匹配全部模板…')).toBeHidden();
    await page.getByRole('button', { name: /查看全部/ }).click();
    await page.locator('.data-template-card').filter({ hasText: '表格批量更新' }).click();
    await expect(page.getByRole('button', { name: /新增一行/ })).toHaveCount(0);
    await expect(page.getByLabel('参数ID，第 1 行')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '预检并提交变更' })).toBeDisabled();
    const birthRate = page.getByLabel('出生率，第 1 行');
    await expect(birthRate).toBeVisible();
    const original = await birthRate.inputValue();
    await birthRate.fill(String(Number(original) + 0.1));
    await expect(page.getByText('已修改 1 行')).toBeVisible();
    await expect(page.getByRole('button', { name: '预检并提交变更' })).toBeEnabled();
    await page.getByRole('button', { name: '预检并提交变更' }).click();
    await expect(page.getByText('预览模式，不会写入数据')).toBeVisible();
    await expect(page.locator('.data-preview-summary')).toContainText('3 行');

    await page.getByRole('button', { name: '创建并打开' }).click();
    await expect(page).toHaveURL(/mode=design&form=/);
    const projectId = new URL(page.url()).pathname.match(/^\/projects\/([^/]+)/)?.[1];
    expect(projectId).toBeTruthy();
    const beforeResponse = await request.get(`http://localhost:3103/api/projects/${projectId}/runtime-data`);
    const before = await beforeResponse.json();
    const beforeRows = before.tables.find((table: any) => table.id === 'forecast_assumptions').sheets[0].rows;
    const beforeBirthRate = Number(beforeRows[0].出生率);

    await page.goto(`/projects/${projectId}/usage`);
    await expect(page).toHaveURL(/\/projects\/.*\/usage/);
    await page.getByText('表格批量更新', { exact: true }).click();
    const runtimeBirthRate = page.getByLabel('出生率，第 1 行');
    await expect(page.getByRole('button', { name: '预检并提交变更' })).toBeDisabled();
    await runtimeBirthRate.fill(String(beforeBirthRate + 0.2));
    await expect(page.getByText('已修改 1 行')).toBeVisible();
    await page.getByRole('button', { name: '预检并提交变更' }).click();
    await expect(page.locator('.designer-preview-event-status')).toContainText('已保存');
    await expect(page.getByRole('button', { name: '预检并提交变更' })).toBeDisabled();
    await expect(runtimeBirthRate).toHaveValue(String(beforeBirthRate + 0.2));

    const afterResponse = await request.get(`http://localhost:3103/api/projects/${projectId}/runtime-data`);
    const after = await afterResponse.json();
    const afterRows = after.tables.find((table: any) => table.id === 'forecast_assumptions').sheets[0].rows;
    expect(Number(afterRows[0].出生率)).toBeCloseTo(beforeBirthRate + 0.2);
    expect(afterRows.slice(1)).toEqual(beforeRows.slice(1));
  });
});
