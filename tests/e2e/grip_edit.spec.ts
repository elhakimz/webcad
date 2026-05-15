import { test, expect } from '@playwright/test';

test.describe('Grip Editing', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    const menuInput = page.locator('#main-menu-input');
    await expect(menuInput).toBeEnabled({ timeout: 60000 });
    
    await menuInput.fill('1');
    await page.press('#main-menu-input', 'Enter');
    await expect(page.locator('#drawing-editor')).toBeVisible();
  });

  test('should support dragging line endpoint grips', async ({ page }) => {
    const cmdInput = page.locator('#cmd');
    const canvas = page.locator('#c');
    const box = await canvas.boundingBox();
    if (box) {
      // 1. Draw a line
      await cmdInput.fill('LINE');
      await cmdInput.press('Enter');
      await page.mouse.click(box.x + 100, box.y + 100);
      await page.mouse.click(box.x + 300, box.y + 100);
      await page.keyboard.press('Escape');

      // 2. Select the line to show grips
      await page.mouse.click(box.x + 200, box.y + 100);
      
      // 3. Click on the start grip (at 100, 100)
      // We need to wait for grips to be rendered, but we can't easily check for them in DOM
      // So we just click at the position
      await page.mouse.click(box.x + 100, box.y + 100);
      
      // 4. Move to new position and click again (click-move-click)
      await page.mouse.move(box.x + 100, box.y + 200);
      await page.mouse.click(box.x + 100, box.y + 200);

      await expect(page.locator('#command-log')).toContainText('Grip edit completed.');
    }
  });

  test('should cancel grip edit on Escape', async ({ page }) => {
    const cmdInput = page.locator('#cmd');
    const canvas = page.locator('#c');
    const box = await canvas.boundingBox();
    if (box) {
      // 1. Draw a line
      await cmdInput.fill('LINE');
      await cmdInput.press('Enter');
      await page.mouse.click(box.x + 100, box.y + 100);
      await page.mouse.click(box.x + 300, box.y + 100);
      await page.keyboard.press('Escape');

      // 2. Select the line
      await page.mouse.click(box.x + 200, box.y + 100);
      
      // 3. Click on the start grip
      await page.mouse.click(box.x + 100, box.y + 100);
      
      // 4. Press Escape to cancel
      await page.keyboard.press('Escape');

      await expect(page.locator('#command-log')).toContainText('*Cancel Grip Edit*');
    }
  });
});
