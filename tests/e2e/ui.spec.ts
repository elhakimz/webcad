import { test, expect } from '@playwright/test';

test.describe('AutoCAD 2.18 DOS UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display status bar with initial values', async ({ page }) => {
    await expect(page.locator('#layer-info')).toHaveText('Layer 0');
    await expect(page.locator('#coords-info')).toContainText('0.0000, 0.0000');
  });

  test('should navigate side menu DRAW -> LINE:', async ({ page }) => {
    // Click DRAW
    await page.click('text=DRAW');
    // Submenu should appear, verify LINE: is visible
    await expect(page.locator('text=LINE:')).toBeVisible();
    
    // Click LINE:
    await page.click('text=LINE:');
    // Command log should reflect the command start
    await expect(page.locator('#command-log')).toContainText('Command: LINE');
    await expect(page.locator('#command-log')).toContainText('LINE command started');
  });

  test('should support manual command entry', async ({ page }) => {
    const cmdInput = page.locator('#cmd');
    await cmdInput.fill('CIRCLE');
    await cmdInput.press('Enter');
    
    await expect(page.locator('#command-log')).toContainText('Command: CIRCLE');
    await expect(page.locator('#command-log')).toContainText('CIRCLE command started');
  });

  test('should support keyboard shortcuts (C/U) during LINE command', async ({ page }) => {
    await page.click('text=DRAW');
    await page.click('text=LINE:');
    
    const canvas = page.locator('#c');
    const box = await canvas.boundingBox();
    if (box) {
      // Draw 3 segments (4 points)
      await page.mouse.click(box.x + 100, box.y + 100);
      await page.mouse.click(box.x + 200, box.y + 100);
      await page.mouse.click(box.x + 200, box.y + 200);
      await page.mouse.click(box.x + 100, box.y + 200);
      
      // Press 'u' to undo the last segment (L3)
      await page.keyboard.press('u');
      await expect(page.locator('#command-log')).toContainText('Entity L3 removed.');
      
      // Press 'c' to close the sequence (requires at least 3 points, which we have: 4 - 1 = 3)
      await page.keyboard.press('c');
      await expect(page.locator('#command-log')).toContainText('Command finished.');
    }
  });

  test('should go back on header click', async ({ page }) => {
    await page.click('text=DRAW');
    await expect(page.locator('text=LINE:')).toBeVisible();
    
    await page.click('.menu-header');
    await expect(page.locator('text=DRAW')).toBeVisible();
    await expect(page.locator('text=LINE:')).not.toBeVisible();
  });

  test('should reset to root on MENU command', async ({ page }) => {
    await page.click('text=EDIT');
    await expect(page.locator('text=ERASE')).toBeVisible();
    
    const cmdInput = page.locator('#cmd');
    await cmdInput.fill('MENU');
    await cmdInput.press('Enter');
    
    await expect(page.locator('text=DRAW')).toBeVisible();
    await expect(page.locator('text=ERASE')).not.toBeVisible();
    await expect(page.locator('#command-log')).toContainText('Returned to root menu.');
  });

  test('should update coordinates on mouse move', async ({ page }) => {
    const canvas = page.locator('#c');
    const box = await canvas.boundingBox();
    if (box) {
      // Move mouse to some point on canvas
      await page.mouse.move(box.x + 100, box.y + 100);
      // Coordinate display should change from 0,0
      await expect(page.locator('#coords-info')).not.toHaveText('0.0000, 0.0000');
    }
  });
});
