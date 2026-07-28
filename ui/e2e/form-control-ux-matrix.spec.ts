import { test, expect } from '@playwright/test';

test.describe('表单控件 UX 基础矩阵', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 720 }]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      for (const scale of [1, 2]) {
      test(`${viewport.width}x${viewport.height} · ${colorScheme} · ${scale * 100}% · wizard keyboard/focus contract`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme });
        const consoleErrors: string[] = [];
        page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
        await page.goto('/projects');
        if (scale === 2) await page.addStyleTag({ content: 'body { zoom: 2; }' });
        await page.getByRole('button', { name: '新建项目' }).click();
        const templateMode = page.locator('.project-wizard-mode-card').filter({ hasText: '内置模板' });
        await templateMode.focus();
        await expect(templateMode).toHaveAttribute('aria-pressed', 'false');
        await templateMode.press('Enter');
        await expect(templateMode).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByRole('button', { name: '下一步' })).toBeDisabled();
        await expect(page.locator('.project-wizard-next-hint')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('.modal-overlay')).toBeHidden();
        expect(consoleErrors.filter((error) => !/favicon|ResizeObserver/i.test(error))).toEqual([]);
      });
      }
    }
  }
});
