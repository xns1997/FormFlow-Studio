import { test, expect, type Page } from '@playwright/test';
import { deleteTestProject } from './project-test-cleanup';

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
    await deleteTestProject(request, projectId);
  });

  test('loads project list page', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('h2')).toContainText('所有项目');
    await expect(page.getByRole('button', { name: '新建项目' })).toBeVisible();
    await expect(page.getByRole('button', { name: '导入项目包' })).toBeVisible();
  });

  test('documentation, settings, and command results really scroll in a compact window', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 600 });

    await page.goto('/docs');
    const docsRoot = page.locator('.docs-v2-scroll-root');
    await expect(docsRoot).toBeVisible();
    await expect(page.locator('.docs-v2-task-grid')).toBeVisible();
    const homeGeometry = await docsRoot.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(homeGeometry.scrollHeight).toBeGreaterThan(homeGeometry.clientHeight);
    await docsRoot.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => docsRoot.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await page.goto('/docs/tasks/import-model');
    await expect(page.locator('.docs-v2-article')).toBeVisible();
    await docsRoot.focus();
    await page.keyboard.press('PageDown');
    await expect.poll(() => docsRoot.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await page.keyboard.press('Control+k');
    const commandResults = page.locator('.docs-command-results');
    await expect(commandResults).toBeVisible();
    await page.locator('.docs-command-search input').fill('节点');
    await expect.poll(() => commandResults.evaluate((element) => element.scrollHeight))
      .toBeGreaterThan(await commandResults.evaluate((element) => element.clientHeight));
    await commandResults.hover();
    await page.mouse.wheel(0, 500);
    await expect.poll(() => commandResults.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');

    await page.goto('/settings/general');
    const settingsBody = page.locator('.page-section-body');
    await expect(settingsBody).toBeVisible();
    await settingsBody.hover();
    await page.mouse.wheel(0, 500);
    await expect.poll(() => settingsBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  });

  test('project wizard body remains wheel-scrollable while its header and footer stay visible', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 420 });
    await page.goto('/projects');
    await page.getByRole('button', { name: '新建项目' }).click();

    const modal = page.locator('[data-app-modal="true"]');
    const body = modal.locator('.modal-body');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.modal-header')).toBeVisible();
    await expect(modal.locator('.modal-footer')).toBeVisible();
    const geometry = await body.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));
    expect(geometry.clientHeight).toBeGreaterThan(0);
    expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
    expect(geometry.overflowY).toMatch(/auto|scroll/);
    await body.hover();
    await page.mouse.wheel(0, 500);
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(modal.locator('.modal-header')).toBeVisible();
    await expect(modal.locator('.modal-footer')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('project wizard exposes selection state and explains blocked continuation', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('button', { name: '新建项目' }).click();
    const templateMode = page.locator('.project-wizard-mode-card').filter({ hasText: '内置模板' });
    await expect(templateMode).toHaveAttribute('aria-pressed', 'false');
    await templateMode.click();
    await expect(templateMode).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.project-wizard-next-hint')).toContainText('请选择一个内置模板');
    await expect(page.getByRole('button', { name: '下一步' })).toBeDisabled();
    const templateCard = page.locator('.project-wizard-template-card').first();
    await templateCard.click();
    await expect(templateCard).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '下一步' })).toBeEnabled();
    await page.keyboard.press('Escape');
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
      await page.getByRole('button', { name: '测试运行' }).click();
      await page.getByText(example.entry, { exact: true }).click();
      await expect(page.getByRole('button', { name: '校验并保存' })).toBeVisible();
      await expect(page.locator('.form-runtime-modal')).toBeVisible();
      await expect(page.locator('.designer-preview-viewport.is-runtime')).toBeVisible();
      await expect(page.locator('.designer-preview-viewport.is-runtime .designer-preview-option-meta')).toHaveCount(0);
      await expect(page.locator('.form-runtime-body')).toHaveCSS('overflow', 'hidden');
      await expect(page.locator('.form-window-frame.is-runtime .form-window-frame-content')).toHaveCSS('overflow', 'auto');
      const runtimeDebugDrawer = page.locator('body > .debug-drawer[data-debug-portal="true"]');
      await expect(runtimeDebugDrawer).toBeVisible();
      await expect.poll(async () => Number.parseInt(await runtimeDebugDrawer.evaluate((element) => getComputedStyle(element).zIndex), 10)).toBeGreaterThan(1400);
      await expect(page.getByRole('button', { name: '提交', exact: true })).toHaveCount(0);
      const firstSelect = page.locator('.form-runtime-modal .ant-select').first();
      if (await firstSelect.count()) {
        await firstSelect.click();
        const dropdown = page.locator('.ant-select-dropdown:visible');
        await expect(dropdown).toBeVisible();
        await expect.poll(async () => Number.parseInt(await dropdown.evaluate((element) => getComputedStyle(element).zIndex), 10)).toBeGreaterThan(1400);
        const firstOption = dropdown.locator('.ant-select-item-option').first();
        const selectedLabel = (await firstOption.textContent())?.trim();
        await firstOption.click();
        if (selectedLabel) await expect(firstSelect).toContainText(selectedLabel);
      }
      await page.getByRole('button', { name: '校验并保存' }).click();
      const runtimeStatus = page.locator('.designer-preview-event-status');
      await expect(runtimeStatus).toBeVisible();
      const overlaysDoNotIntersect = await Promise.all([runtimeStatus.boundingBox(), runtimeDebugDrawer.boundingBox()]).then(([statusBox, drawerBox]) => {
        if (!statusBox || !drawerBox) return false;
        return statusBox.x + statusBox.width <= drawerBox.x
          || drawerBox.x + drawerBox.width <= statusBox.x
          || statusBox.y + statusBox.height <= drawerBox.y
          || drawerBox.y + drawerBox.height <= statusBox.y;
      });
      expect(overlaysDoNotIntersect).toBe(true);
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

  test('flow binding uses one editor layer and returns from the workflow contract', async ({ page }) => {
    await createFromTemplate(page, '游戏数据分析', 'Wizard 流程绑定 V2');
    await page.getByRole('button', { name: '表单设计', exact: true }).click();
    const boundButton = page.locator('.designer-canvas [data-shape="design-node"]').filter({ has: page.getByRole('button', { name: '校验并保存' }) });
    await expect(boundButton).toBeVisible();
    await boundButton.click({ force: true });
    await page.getByRole('button', { name: /交互与事件/ }).click();
    await page.locator('.property-event-summary').filter({ hasText: '点击' }).first().click();
    await page.getByRole('tab', { name: '流程绑定' }).click();

    await expect(page.locator('.flow-binding-editor')).toBeVisible();
    await expect(page.locator('.flow-mapping-modal')).toHaveCount(0);
    await expect(page.getByText('配置结果', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: /流程输入/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /流程输出/ })).toBeVisible();

    const editContract = page.getByRole('button', { name: '编辑流程输入' });
    if (await editContract.count()) {
      await editContract.click();
      await expect(page).toHaveURL(/mode=flow/);
      await expect(page.getByRole('button', { name: '← 返回流程绑定' })).toBeVisible();
      await page.getByRole('button', { name: '← 返回流程绑定' }).click();
      await expect(page).toHaveURL(/mode=design/);
      await expect(page.locator('.flow-binding-editor')).toBeVisible();
      await expect(page.getByRole('tab', { name: /流程输入/ })).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('control toolbox scrolls inside its fixed-height panel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 620 });
    await createFromTemplate(page, '游戏数据分析', 'Wizard 控件栏滚动');
    await page.getByRole('button', { name: '表单设计', exact: true }).click();

    const toolboxFrame = page.locator('.unified-toolbox-slot');
    const toolboxBody = page.locator('.toolbox-body');
    await expect(toolboxFrame).toBeVisible();
    await expect(page.getByRole('tab', { name: '控件', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('搜索控件')).toBeVisible();

    const dimensions = await toolboxBody.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(dimensions.clientHeight).toBeGreaterThan(0);
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

    await toolboxBody.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => toolboxBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(page.getByRole('tab', { name: '控件', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('搜索控件')).toBeVisible();
  });

  test('flow canvas reserves space for its toolbar instead of clipping the graph', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 600 });
    await createFromTemplate(page, '游戏数据分析', 'Wizard 流程画布滚动链');
    await page.getByRole('button', { name: '流程编排', exact: true }).click();

    const canvasFlow = page.locator('.canvas-flow');
    const graph = canvasFlow.locator(':scope > .react-flow');
    await expect(graph).toBeVisible();
    const geometry = await canvasFlow.evaluate((element) => {
      const graphElement = element.querySelector<HTMLElement>(':scope > .react-flow');
      const toolbar = element.querySelector<HTMLElement>(':scope > .canvas-toolbar');
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        graphHeight: graphElement?.clientHeight || 0,
        toolbarHeight: toolbar?.offsetHeight || 0,
      };
    });
    expect(geometry.scrollHeight).toBe(geometry.clientHeight);
    expect(geometry.graphHeight).toBeGreaterThan(0);
    expect(Math.abs(geometry.graphHeight + geometry.toolbarHeight - geometry.clientHeight)).toBeLessThanOrEqual(1);
  });

  test('method library modal keeps its custom content as the active scroll region', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 420 });
    await createFromTemplate(page, '游戏数据分析', 'Wizard 方法库滚动链');
    await page.getByRole('button', { name: '行为定义', exact: true }).click();
    await page.locator('.unified-toolbar-overflow > summary[aria-label="更多工作台命令"]').click();
    await page.getByRole('menuitem', { name: '方法库' }).click();

    const modal = page.locator('.method-library-modal');
    const panel = modal.locator('.method-library-panel');
    await expect(panel).toBeVisible();
    const geometry = await panel.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));
    expect(geometry.clientHeight).toBeGreaterThan(0);
    expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
    expect(geometry.overflowY).toMatch(/auto|scroll/);
    await panel.hover();
    await page.mouse.wheel(0, 500);
    await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(modal.locator('.method-library-modal-header')).toBeVisible();
    await expect(modal.locator('.modal-footer')).toBeVisible();
  });

  test('renames a form and persists the new name', async ({ page }) => {
    await createFromTemplate(page, '游戏数据分析', 'Wizard 表单重命名');
    await page.getByRole('button', { name: '表单设计', exact: true }).click();
    await page.getByRole('tab', { name: '表单', exact: true }).click();

    const renameButton = page.getByRole('button', { name: /重命名 游戏事件录入/ });
    await renameButton.click();
    const nameInput = page.getByRole('textbox', { name: /重命名表单 游戏事件录入/ });
    await nameInput.fill('玩家事件录入');
    await nameInput.press('Enter');

    await expect(page.locator('.unified-list-name', { hasText: '玩家事件录入' })).toBeVisible();
    await expect(page.locator('.toolbar-form-select')).toContainText('玩家事件录入');
    await expect(page.locator('.chain-save-state')).toHaveText('已自动保存');

    await page.reload();
    await page.getByRole('tab', { name: '表单', exact: true }).click();
    await expect(page.locator('.unified-list-name', { hasText: '玩家事件录入' })).toBeVisible();
  });

  test('returns from project settings to the form editor', async ({ page }) => {
    await createFromTemplate(page, '止回阀选型', '设置导航测试');

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
    await expect(designTabs.getByRole('tab')).toHaveCount(3);
    await expect(designTabs.getByRole('tab', { name: '控件' })).toBeVisible();
    await expect(designTabs.getByRole('tab', { name: '表单' })).toBeVisible();
    await expect(designTabs.getByRole('tab', { name: '行为' })).toHaveCount(0);
    await expect(designTabs.getByRole('tab', { name: '流程' })).toHaveCount(0);
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
    await page.getByRole('tab', { name: '控件', exact: true }).click();
    await expect(page.locator('.toolbox-item').first()).toBeVisible();

    await expect(page.getByText('属性配置', { exact: true })).toBeVisible();
    await expect(page.getByText('链路检查器', { exact: true })).toHaveCount(0);

    // Navigate to test
    await page.getByRole('button', { name: '测试运行' }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/usage/);
  });

  test('test page shows form with data', async ({ page }) => {
    await createFromTemplate(page, '止回阀选型', '运行页面测试');

    // Navigate to test
    await page.getByRole('button', { name: '测试运行' }).click();
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
    await page.getByRole('tab', { name: '节点库' }).click();
    await expect(page.getByRole('textbox', { name: /搜索节点/ })).toBeVisible();
  });
});
