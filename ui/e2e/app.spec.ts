import { test, expect } from '@playwright/test';

test.describe('FormFlow Studio', () => {
  test.afterEach(async ({ page, request }) => {
    const projectId = new URL(page.url()).pathname.match(/^\/projects\/([^/]+)/)?.[1];
    if (projectId?.startsWith('proj_')) await request.delete(`http://localhost:3103/api/projects/${projectId}`);
  });

  test('loads project list page', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('h2')).toContainText('所有项目');
    await expect(page.getByRole('button', { name: '新建项目' })).toBeVisible();
    await expect(page.getByRole('button', { name: '导入项目包' })).toBeVisible();
  });

  test('creates project from wizard template and enters workspace', async ({ page }) => {
    await page.goto('/projects');

    await page.getByRole('button', { name: '新建项目' }).click();
    await expect(page.getByText('创建项目向导')).toBeVisible();

    await page.locator('.project-wizard-mode-card').filter({ hasText: '内置模板' }).click();
    await page.locator('.project-wizard-template-card').filter({ hasText: '数据录入' }).click();
    await page.getByRole('button', { name: '下一步' }).click();

    await page.getByLabel('项目名称').fill('Wizard 数据录入项目');
    await page.getByLabel('项目描述').fill('通过向导创建的数据录入模板');
    await page.getByLabel('作者').fill('Playwright');
    await page.getByLabel('标签').fill('向导, 模板');
    await page.getByRole('button', { name: '下一步' }).click();

    await expect(page.getByText('从模板「数据录入」开始')).toBeVisible();
    await page.getByRole('button', { name: '创建并进入项目' }).click();

    await expect(page).toHaveURL(/\/projects\/.*\/workspace\/data/);
    await expect(page.getByText('客户线索.json')).toBeVisible();
  });

  test('approval template filters rows into the adjacent table through control code linkage', async ({ page }) => {
    await page.goto('/projects');

    await page.getByRole('button', { name: '新建项目' }).click();
    await page.locator('.project-wizard-mode-card').filter({ hasText: '内置模板' }).click();
    await page.locator('.project-wizard-template-card').filter({ hasText: '审批流' }).click();
    await page.getByRole('button', { name: '下一步' }).click();
    await page.getByLabel('项目名称').fill('Wizard 审批流项目');
    await page.getByRole('button', { name: '下一步' }).click();
    await page.getByRole('button', { name: '创建并进入项目' }).click();

    await expect(page).toHaveURL(/\/projects\/.*\/workspace\/data/);
    await page.getByRole('link', { name: '测试运行' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/workspace\/test/);

    await page.locator('.lg-field').filter({ hasText: '申请金额' }).locator('input').fill('1500');
    await page.getByRole('button', { name: '筛选审批单' }).click();

    await expect(page.getByText('AP-1002')).toBeVisible();
    await expect(page.getByText('AP-1004')).toBeVisible();
    await expect(page.locator('.toast')).toContainText('已筛选出 2 条记录');
  });

  test('imports project and navigates to data preview', async ({ page }) => {
    await page.goto('/projects');

    // Import project file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入项目包' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('projects/example_sales_approval.zip');

    // Should navigate to data preview
    await expect(page).toHaveURL(/\/projects\/.*\/workspace\/data/);
    await expect(page.getByText('销售订单.json')).toBeVisible();
  });

  test('navigates between pages', async ({ page }) => {
    await page.goto('/projects');

    // Import project
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入项目包' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('projects/example_sales_approval.zip');

    await expect(page).toHaveURL(/\/projects\/.*\/workspace\/data/);

    // Navigate to canvas
    await page.getByRole('link', { name: '流程编辑' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/workspace\/canvas/);

    // Navigate to designer
    await page.getByRole('link', { name: '表单设计' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/workspace\/designer/);

    // Navigate to test
    await page.getByRole('link', { name: '测试运行' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/workspace\/test/);
  });

  test('test page shows form with data', async ({ page }) => {
    await page.goto('/projects');

    // Import project
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入项目包' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('projects/example_sales_approval.zip');

    // Navigate to test
    await page.getByRole('link', { name: '测试运行' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/workspace\/test/);

    // Should show form fields
    await expect(page.getByText('最低订单金额')).toBeVisible();
    await expect(page.getByRole('button', { name: '筛选待审批订单' })).toBeVisible();
  });

  test('canvas page has node palette', async ({ page }) => {
    await page.goto('/projects');

    // Import project
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入项目包' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('projects/example_sales_approval.zip');

    // Navigate to canvas
    await page.getByRole('link', { name: '流程编辑' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/workspace\/canvas/);

    // Should show node palette
    await expect(page.getByRole('textbox', { name: '搜索节点' })).toBeVisible();
  });
});
