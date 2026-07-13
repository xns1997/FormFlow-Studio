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

    await expect(page).toHaveURL(/\/projects\/.*\/editor\?mode=data/);
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

    await expect(page).toHaveURL(/\/projects\/.*\/editor\?mode=data/);
    await page.getByRole('link', { name: '测试运行' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/usage/);
    await page.getByText('审批表单', { exact: true }).click();

    await page.getByRole('spinbutton').fill('1500');
    await page.getByRole('button', { name: '筛选审批单' }).click();

    await expect(page.getByRole('status')).toContainText('已筛选出 2 条记录');
    await expect(page.getByText('AP-1002')).toBeVisible();
    await expect(page.getByText('AP-1004')).toBeVisible();
  });

  test('imports project and navigates to data preview', async ({ page }) => {
    await page.goto('/projects');

    // Import project file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入项目包' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('projects/example_sales_approval.zip');

    // Should navigate to data preview
    await expect(page).toHaveURL(/\/projects\/.*\/editor\?mode=data/);
    await expect(page.getByText('销售订单.json')).toBeVisible();
  });

  test('navigates between pages', async ({ page }) => {
    await page.goto('/projects');

    // Import project
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入项目包' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('projects/example_sales_approval.zip');

    await expect(page).toHaveURL(/\/projects\/.*\/editor\?mode=data/);

    // Navigate to canvas
    await page.getByRole('button', { name: '流程编排' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/editor\?mode=flow/);

    // Navigate to designer
    await page.getByRole('button', { name: '表单设计' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/editor\?mode=design/);
    await expect(page.getByRole('button', { name: 'AI', exact: true })).toHaveCount(0);
    await expect(page.locator('.designer-canvas [data-cell-id]').first()).toBeVisible();
    const leftPanelBox = await page.locator('.unified-left').boundingBox();
    const toolboxBox = await page.locator('.designer-toolbox').boundingBox();
    expect(Math.abs((leftPanelBox?.width || 0) - (toolboxBox?.width || 0))).toBeLessThan(2);
    await page.locator('.designer-canvas [data-cell-id]').nth(2).click();
    await expect(page.getByText('属性配置', { exact: true })).toBeVisible();
    await expect(page.getByText('链路检查器', { exact: true })).toHaveCount(0);

    // Complex property editors stay lazy and use draft/apply semantics.
    await page.locator('.designer-canvas [data-cell-id="orders_table"]').click();
    await expect(page.getByPlaceholder('搜索属性、帮助或分组')).toBeVisible();
    await expect(page.getByRole('tab', { name: '常用' })).toHaveAttribute('aria-selected', 'true');
    await page.getByPlaceholder('搜索属性、帮助或分组').fill('表格列');
    await expect(page.getByText('表格列', { exact: true })).toBeVisible();
    await expect(page.locator('details.properties-group details.properties-group')).toHaveCount(0);
    await expect(page.locator('.property-editor-modal')).toHaveCount(0);
    await page.getByRole('button', { name: '配置表格列' }).click();
    await expect(page.getByRole('heading', { name: '表格列配置' })).toBeVisible();
    await expect(page.locator('.monaco-editor')).toHaveCount(0);
    await page.getByRole('button', { name: '源码' }).click();
    await expect(page.locator('.property-editor-modal .monaco-editor')).toBeVisible();
    await page.getByRole('button', { name: '取消' }).click();
    await expect(page.locator('.property-editor-modal')).toHaveCount(0);
    await page.getByPlaceholder('搜索属性、帮助或分组').fill('');
    const propertySwitchBox = await page.locator('.property-toggle-field .ant-switch').first().boundingBox();
    expect(propertySwitchBox?.width || 0).toBeLessThanOrEqual(42);
    const propertyColorBox = await page.locator('.property-compact-field .ant-color-picker-trigger').first().boundingBox();
    expect(propertyColorBox?.width || 0).toBeLessThanOrEqual(124);
    await expect(page.locator('.property-color-presets')).toHaveCount(0);
    await page.getByRole('tab', { name: '全部' }).click();
    await expect(page.getByRole('tab', { name: '全部' })).toHaveAttribute('aria-selected', 'true');

    // Navigate to test
    await page.getByRole('link', { name: '测试运行' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/usage/);
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
    await expect(page).toHaveURL(/\/projects\/.*\/usage/);
    await page.getByText('销售审批表单', { exact: true }).click();

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
    await page.getByRole('button', { name: '流程编排' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/editor\?mode=flow/);

    // Should show node palette
    await expect(page.getByRole('textbox', { name: '搜索节点' })).toBeVisible();
  });
});
