import { test, expect } from '@playwright/test';

test.describe('AutoCAD 2.18 DOS UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Start drawing to get past Main Menu
    // Wait for CAD kernel to load (input becomes enabled)
    const menuInput = page.locator('#main-menu-input');
    await expect(menuInput).toBeEnabled({ timeout: 60000 }); // Increase timeout for heavy WASM
    
    await menuInput.fill('1');
    await page.press('#main-menu-input', 'Enter');
    // Ensure drawing editor is visible
    await expect(page.locator('#drawing-editor')).toBeVisible();
  });

  test('should display status bar with initial values', async ({ page }) => {
    await expect(page.locator('#layer-info')).toHaveText('Layer 0');
    await expect(page.locator('#coords-info')).toContainText('0.0000, 0.0000');
  });

  test('should navigate side menu DRAW -> LINE:', async ({ page }) => {
    // Click DRAW in the side menu (use #side-menu to scope)
    await page.locator('#side-menu >> text=DRAW').click();
    // Submenu should appear, verify LINE: is visible
    await expect(page.locator('#side-menu >> text=LINE:')).toBeVisible();
    
    // Click LINE:
    await page.locator('#side-menu >> text=LINE:').click();
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
    await page.locator('#side-menu >> text=DRAW').click();
    await page.locator('#side-menu >> text=LINE:').click();
    
    const canvas = page.locator('#c');
    const box = await canvas.boundingBox();
    if (box) {
      // Draw 3 segments (4 points) with slight delays
      await page.mouse.click(box.x + 100, box.y + 100);
      await page.waitForTimeout(50);
      await page.mouse.click(box.x + 200, box.y + 100);
      await page.waitForTimeout(50);
      await page.mouse.click(box.x + 200, box.y + 200);
      await page.waitForTimeout(50);
      await page.mouse.click(box.x + 100, box.y + 200);
      await page.waitForTimeout(50);
      
      // Press 'u' to undo the last segment (L3)
      await page.keyboard.press('u');
      await expect(page.locator('#command-log')).toContainText('Entity L3 removed.');
      
      // Press 'c' to close the sequence
      await page.keyboard.press('c');
      await expect(page.locator('#command-log')).toContainText('Command finished.');
    }
  });

  test('should go back on header click', async ({ page }) => {
    await page.locator('#side-menu >> text=DRAW').click();
    await expect(page.locator('#side-menu >> text=LINE:')).toBeVisible();
    
    await page.click('.menu-header');
    await expect(page.locator('#side-menu >> text=DRAW')).toBeVisible();
    await expect(page.locator('#side-menu >> text=LINE:')).not.toBeVisible();
  });

  test('should reset to root on MENU command', async ({ page }) => {
    await page.locator('#side-menu >> text=EDIT').click();
    await expect(page.locator('#side-menu >> text=ERASE')).toBeVisible();
    
    const cmdInput = page.locator('#cmd');
    await cmdInput.fill('MENU');
    await cmdInput.press('Enter');
    
    await expect(page.locator('#side-menu >> text=DRAW')).toBeVisible();
    await expect(page.locator('#side-menu >> text=ERASE')).not.toBeVisible();
    await expect(page.locator('#command-log')).toContainText('Returned to root menu.');
  });

  test('should return to main menu on QUIT command', async ({ page }) => {
    const cmdInput = page.locator('#cmd');
    await cmdInput.fill('QUIT');
    await cmdInput.press('Enter');
    
    await expect(page.locator('#main-menu-screen')).toBeVisible();
    await expect(page.locator('#drawing-editor')).not.toBeVisible();
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

  test('should support PLINE with Arc mode switching', async ({ page }) => {
    const cmdInput = page.locator('#cmd');
    await cmdInput.fill('PLINE');
    await cmdInput.press('Enter');
    
    const canvas = page.locator('#c');
    const box = await canvas.boundingBox();
    if (box) {
      // P1
      await page.mouse.click(box.x + 100, box.y + 100);
      await expect(page.locator('#command-log')).toContainText('Endpoint of line');

      // P2
      await page.mouse.click(box.x + 200, box.y + 100);
      await expect(page.locator('#command-log')).toContainText('Polyline segment added.');

      // Switch to Arc
      await cmdInput.fill('A');
      await cmdInput.press('Enter');
      await expect(page.locator('#command-log')).toContainText('Endpoint of arc');

      // P3 (Arc)
      await page.mouse.click(box.x + 200, box.y + 200);
      await expect(page.locator('#command-log')).toContainText('Polyline segment added.');
      await expect(page.locator('#command-prompt')).toContainText('Endpoint of arc');

      // Switch back to Line
      await cmdInput.fill('L');
      await cmdInput.press('Enter');
      await expect(page.locator('#command-log')).toContainText('Endpoint of line');

      // Close
      await cmdInput.fill('C');
      await cmdInput.press('Enter');
      await expect(page.locator('#command-log')).toContainText('Command finished.');
    }
  });

  test('should support PLINE shortcut "A" from viewport', async ({ page }) => {
    const cmdInput = page.locator('#cmd');
    await cmdInput.fill('PLINE');
    await cmdInput.press('Enter');
    
    const canvas = page.locator('#c');
    const box = await canvas.boundingBox();
    if (box) {
      // P1
      await page.mouse.click(box.x + 100, box.y + 100);
      
      // Ensure focus is NOT on cmd input (click canvas)
      await canvas.click();
      
      // Press 'a' on keyboard
      await page.keyboard.press('a');
      
      // Should switch to arc mode
      await expect(page.locator('#command-log')).toContainText('Endpoint of arc');
      await expect(page.locator('#command-prompt')).toContainText('Endpoint of arc');

      // P2 (Arc)
      await page.mouse.click(box.x + 200, box.y + 200);
      await expect(page.locator('#command-log')).toContainText('Polyline segment added.');
    }
  });
});
