import { test, expect, type Page } from '@playwright/test';

async function createFromTemplate(page: Page, templateName: string, projectName: string) {
  await page.goto('/projects');
  await page.getByRole('button', { name: '新建项目' }).click();
  await page.locator('.project-wizard-mode-card').filter({ hasText: '内置模板' }).click();
  await page.locator('.project-wizard-template-card').filter({ hasText: templateName }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('项目名称').fill(projectName);
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '创建并进入项目' }).click();
  await expect(page).toHaveURL(/\/projects\/.*\/editor\?mode=data/);
}

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

  for (const example of [
    { template: '游戏数据分析', project: 'Wizard 游戏分析', source: 'game_events.json', entry: '游戏事件录入', dashboard: '游戏运营分析看板' },
    { template: '灵活就业分析', project: 'Wizard 灵活就业', source: 'work_records.json', entry: '工作记录录入', dashboard: '灵活就业综合分析' },
    { template: '中国人口预测', project: 'Wizard 人口预测', source: 'population_history.json', entry: '人口预测参数录入', dashboard: '中国人口历史与情景预测' },
    { template: '止回阀选型', project: 'Wizard 止回阀选型', source: 'selection_requests.json', entry: '止回阀工况录入', dashboard: '止回阀选型分析看板' },
  ]) {
    test(`creates and runs ${example.template} from the wizard`, async ({ page }) => {
      await createFromTemplate(page, example.template, example.project);
      await expect(page.getByText(example.source)).toBeVisible();
      await page.getByRole('link', { name: '测试运行' }).click();
      await page.getByText(example.entry, { exact: true }).click();
      await expect(page.getByRole('button', { name: '校验并保存' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.modal-overlay')).toBeHidden();
      await page.getByText(example.dashboard, { exact: true }).click();
      await expect(page.getByRole('button', { name: '运行分析流程' })).toBeVisible();
      await page.getByRole('button', { name: '运行分析流程' }).click();
    });
  }

  test('form designer keeps controls after switching editor tabs', async ({ page }) => {
    await createFromTemplate(page, '游戏数据分析', 'Wizard 表单切换');
    await page.getByRole('button', { name: '表单设计', exact: true }).click();
    const controlCount = page.locator('.toolbar-info-detail');
    await expect(controlCount).not.toHaveText('0 个控件');
    const initialCount = await controlCount.textContent();

    for (const tab of ['数据预览', '行为定义', '流程编排', '项目设置']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.getByRole('button', { name: '表单设计', exact: true }).click();
      await expect(controlCount).toHaveText(initialCount || '');
    }
  });

  test('control toolbox scrolls inside its fixed-height panel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 620 });
    await createFromTemplate(page, '游戏数据分析', 'Wizard 控件栏滚动');
    await page.getByRole('button', { name: '表单设计', exact: true }).click();

    const toolboxFrame = page.locator('.unified-toolbox-slot');
    const toolboxBody = page.locator('.toolbox-body');
    await expect(toolboxFrame).toBeVisible();
    await expect(page.getByRole('tab', { name: '控件库' })).toBeVisible();
    await expect(page.getByPlaceholder('搜索控件')).toBeVisible();

    const dimensions = await toolboxBody.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(dimensions.clientHeight).toBeGreaterThan(0);
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

    await toolboxBody.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => toolboxBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(page.getByRole('tab', { name: '控件库' })).toBeVisible();
    await expect(page.getByPlaceholder('搜索控件')).toBeVisible();
  });

  test('renames a form and persists the new name', async ({ page }) => {
    await createFromTemplate(page, '游戏数据分析', 'Wizard 表单重命名');
    await page.getByRole('button', { name: '表单设计', exact: true }).click();
    await page.getByRole('button', { name: '表单', exact: true }).click();

    const renameButton = page.getByRole('button', { name: /重命名 游戏事件录入/ });
    await renameButton.click();
    const nameInput = page.getByRole('textbox', { name: /重命名表单 游戏事件录入/ });
    await nameInput.fill('玩家事件录入');
    await nameInput.press('Enter');

    await expect(page.locator('.unified-list-name', { hasText: '玩家事件录入' })).toBeVisible();
    await expect(page.locator('.toolbar-form-select')).toContainText('玩家事件录入');
    await expect(page.locator('.chain-save-state')).toHaveText('已自动保存');

    await page.reload();
    await page.getByRole('button', { name: '表单', exact: true }).click();
    await expect(page.locator('.unified-list-name', { hasText: '玩家事件录入' })).toBeVisible();
  });

  test('returns from project settings to the form editor', async ({ page }) => {
    await createFromTemplate(page, '止回阀选型', '设置导航测试');

    await page.getByRole('link', { name: '项目设置' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/settings\/general/);
    await expect(page.getByText('项目设置 · 常规')).toBeVisible();
    await page.getByRole('link', { name: /返回编辑器/ }).first().click();
    await expect(page).toHaveURL(/\/projects\/.*\/editor\?mode=design/);
    await expect(page.getByRole('button', { name: '表单设计' })).toHaveClass(/active/);

    await page.getByRole('button', { name: '项目设置' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/editor\?.*mode=settings/);
    await page.getByRole('link', { name: /返回编辑器/ }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/editor\?.*mode=design/);
    await expect(page.getByRole('button', { name: '表单设计' })).toHaveClass(/active/);
  });

  test('navigates between pages', async ({ page }) => {
    await createFromTemplate(page, '止回阀选型', '页面导航测试');

    // Navigate to canvas
    await page.getByRole('button', { name: '流程编排' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/editor\?mode=flow/);

    // Navigate to designer
    await page.getByRole('button', { name: '表单设计' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/editor\?mode=design/);
    await expect(page.getByRole('button', { name: 'AI', exact: true })).toHaveCount(0);
    const designTabs = page.locator('.unified-left-tabs');
    await expect(designTabs.getByRole('button')).toHaveCount(2);
    await expect(designTabs.getByRole('button', { name: '控件' })).toBeVisible();
    await expect(designTabs.getByRole('button', { name: '表单' })).toBeVisible();
    await expect(designTabs.getByRole('button', { name: '行为' })).toHaveCount(0);
    await expect(designTabs.getByRole('button', { name: '流程' })).toHaveCount(0);
    await expect(page.locator('.designer-canvas [data-cell-id]').first()).toBeVisible();
    const leftPanelBox = await page.locator('.unified-left').boundingBox();
    const toolboxBox = await page.locator('.designer-toolbox').boundingBox();
    expect(Math.abs((leftPanelBox?.width || 0) - (toolboxBox?.width || 0))).toBeLessThan(2);

    // Data fields are isolated from the control library and grouped by source.
    await page.getByRole('tab', { name: /数据字段/ }).click();
    await expect(page.locator('.toolbox-data-table').filter({ hasText: 'valve_products.json' }).first()).toBeVisible();
    await expect(page.locator('.toolbox-data-sheet').first()).toBeVisible();
    await expect(page.locator('.toolbox-item')).toHaveCount(0);

    // Batch dropping asks for confirmation, applies every field, then clears the selection.
    const fieldRows = page.locator('.toolbox-data-field');
    const droppedFieldNames = await fieldRows.locator('span').evaluateAll((nodes) => nodes.slice(0, 3).map((node) => node.textContent?.trim() || ''));
    for (let index = 0; index < 3; index += 1) await fieldRows.nth(index).getByRole('checkbox').check();
    await fieldRows.first().dragTo(page.locator('.designer-canvas-shell'), { targetPosition: { x: 360, y: 260 } });
    await expect(page.getByRole('heading', { name: '选择字段控件' })).toBeVisible();
    await expect(page.locator('.field-drop-modal select')).toHaveCount(0);
    const recommendedSelect = page.locator('.field-drop-control .ant-select').first();
    await expect(recommendedSelect).toBeVisible();
    await recommendedSelect.click();
    expect(await page.getByRole('option').count()).toBeGreaterThan(1);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /创建并绑定 3 个字段/ }).click();
    await expect(fieldRows.getByRole('checkbox', { checked: true })).toHaveCount(0);
    for (const fieldName of droppedFieldNames) {
      await expect(page.locator('.designer-canvas [data-cell-id]').filter({ hasText: fieldName })).not.toHaveCount(0);
    }
    await page.getByRole('tab', { name: '控件库' }).click();
    await expect(page.locator('.toolbox-item').first()).toBeVisible();

    await expect(page.getByText('属性配置', { exact: true })).toBeVisible();
    await expect(page.getByText('链路检查器', { exact: true })).toHaveCount(0);

    // Navigate to test
    await page.getByRole('link', { name: '测试运行' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/usage/);
  });

  test('test page shows form with data', async ({ page }) => {
    await createFromTemplate(page, '止回阀选型', '运行页面测试');

    // Navigate to test
    await page.getByRole('link', { name: '测试运行' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/usage/);
    await page.getByText('止回阀工况录入', { exact: true }).click();

    // Should show form fields
    await expect(page.getByText('通过规则校验后由产品化保存流程写回数据表。')).toBeVisible();
    await expect(page.getByRole('button', { name: '校验并保存' })).toBeVisible();
  });

  test('canvas page has node palette', async ({ page }) => {
    await createFromTemplate(page, '止回阀选型', '流程画布测试');

    // Navigate to canvas
    await page.getByRole('button', { name: '流程编排' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/editor\?mode=flow/);

    // Should show node palette
    await expect(page.getByRole('textbox', { name: '搜索节点' })).toBeVisible();
  });
});
