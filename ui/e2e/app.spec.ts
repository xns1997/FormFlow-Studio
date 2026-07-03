import { test, expect } from '@playwright/test';

test.describe('FormFlow Studio', () => {
  test('loads project list page', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('h2')).toContainText('所有项目');
    await expect(page.getByRole('button', { name: '新建项目' })).toBeVisible();
    await expect(page.getByRole('button', { name: '导入项目' })).toBeVisible();
  });

  test('imports project and navigates to data preview', async ({ page }) => {
    await page.goto('/projects');

    // Import project file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入项目' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('projects/example/project.json');

    // Should navigate to data preview
    await expect(page).toHaveURL(/\/projects\/.*\/workspace\/data/);
    await expect(page.getByText('销售数据.xlsx')).toBeVisible();
  });

  test('navigates between pages', async ({ page }) => {
    await page.goto('/projects');

    // Import project
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入项目' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('projects/example/project.json');

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
    await page.getByRole('button', { name: '导入项目' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('projects/example/project.json');

    // Navigate to test
    await page.getByRole('link', { name: '测试运行' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/workspace\/test/);

    // Should show form fields
    await expect(page.getByText('工号')).toBeVisible();
    await expect(page.getByText('姓名')).toBeVisible();
  });

  test('canvas page has node palette', async ({ page }) => {
    await page.goto('/projects');

    // Import project
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入项目' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('projects/example/project.json');

    // Navigate to canvas
    await page.getByRole('link', { name: '流程编辑' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/workspace\/canvas/);

    // Should show node palette
    await expect(page.getByRole('textbox', { name: '搜索节点' })).toBeVisible();
  });
});
