import { test, expect } from '@playwright/test';
import { deleteTestProject } from './project-test-cleanup';

test('行为规则 DSL 编辑器提供补全、悬停文档与格式化', async ({ page }) => {
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
  await page.getByLabel('项目名称').fill(`行为规则Monaco-${Date.now()}`);
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '创建并进入项目' }).click();

  // 进入「规则」工作台，再打开当前表单的「规则代码」DSL 编辑器
  await page.locator('.project-workspace-link').filter({ hasText: '规则' }).click();
  await expect(page.locator('.behavior-rule-code-item').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.behavior-rule-code-item').first().click();
  await expect(page.locator('.behavior-dsl-editor .monaco-editor').first()).toBeVisible({ timeout: 15000 });

  const editor = page.locator('.behavior-dsl-editor .monaco-editor').first();
  await editor.locator('textarea').first().click();

  // 输入 `when $`：上下文补全应自动弹出
  await page.keyboard.type('when $部门==', { delay: 30 });
  await expect(page.locator('.suggest-widget.visible').first()).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');

  // 补全剩余规则文本（刻意保留不规范空格，供格式化断言）
  await page.keyboard.type('="技术部"->show( @技术栈 );require($技术栈)', { delay: 15 });

  // 悬停在首行关键字上应出现文档工具提示
  const viewLines = editor.locator('.view-lines').first();
  const box = await viewLines.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 40, box.y + 14);
    await expect(page.locator('.monaco-hover').first()).toBeVisible({ timeout: 5000 });
    await page.mouse.move(0, 0);
  }

  // 显式触发文档格式化（Monaco 默认 Shift+Alt+F）：箭头两侧应补上空格
  await page.keyboard.press('Shift+Alt+F');
  await expect.poll(async () => {
    const text = await editor.locator('.view-lines').first().textContent();
    return text || '';
  }, { timeout: 8000 }).toContain(' -> show(@技术栈); require($技术栈)');

  const monacoErrors = errors.filter((e) => /getFullModelRange|Cannot read properties of null/.test(e));
  expect(monacoErrors).toEqual([]);

  const projectId = new URL(page.url()).pathname.match(/^\/projects\/([^/]+)/)?.[1];
  if (projectId) await deleteTestProject(page.request, projectId);
});
