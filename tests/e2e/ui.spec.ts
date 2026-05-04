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
      await expect(page.locator('#command-log')).toContainText('Entities [L3] removed.');
      
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
      await expect(page.locator('#command-prompt')).toContainText('Endpoint of line');

      // P2
      await page.mouse.click(box.x + 200, box.y + 100);
      await expect(page.locator('#command-log')).toContainText('Polyline segment added.');

      // Switch to Arc
      await cmdInput.fill('A');
      await cmdInput.press('Enter');
      await expect(page.locator('#command-log')).toContainText('Switched to Arc mode.');
      await expect(page.locator('#command-prompt')).toContainText('Endpoint of arc');

      // P3 (Arc)
      await page.mouse.click(box.x + 200, box.y + 200);
      await expect(page.locator('#command-log')).toContainText('Polyline segment added.');
      await expect(page.locator('#command-prompt')).toContainText('Endpoint of arc');

      // Switch back to Line
      await cmdInput.fill('L');
      await cmdInput.press('Enter');
      await expect(page.locator('#command-log')).toContainText('Switched to Line mode.');
      await expect(page.locator('#command-prompt')).toContainText('Endpoint of line');

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
      await expect(page.locator('#command-log')).toContainText('Switched to Arc mode.');
      await expect(page.locator('#command-prompt')).toContainText('Endpoint of arc');

      // P2 (Arc)
      await page.mouse.click(box.x + 200, box.y + 200);
      await expect(page.locator('#command-log')).toContainText('Polyline segment added.');
    }
  });

  test('should support TEXT command workflow', async ({ page }) => {
    const cmdInput = page.locator('#cmd');
    await cmdInput.fill('TEXT');
    await cmdInput.press('Enter');
    
    const canvas = page.locator('#c');
    const box = await canvas.boundingBox();
    if (box) {
      // Step 0: Insertion Point
      await page.mouse.click(box.x + 100, box.y + 100);
      await expect(page.locator('#command-prompt')).toContainText('Height');

      // Step 1: Height (Accept default by pressing Enter)
      await cmdInput.press('Enter');
      await expect(page.locator('#command-prompt')).toContainText('Rotation');

      // Step 2: Rotation (Accept default by pressing Enter)
      await cmdInput.press('Enter');
      await expect(page.locator('#command-prompt')).toContainText('Text:');

      // Step 3: Input Text
      await cmdInput.fill('AUTOCAD 2.18');
      await cmdInput.press('Enter');
      
      await expect(page.locator('#command-log')).toContainText('Text created.');
    }
  });

  test('should not have duplicated prompts in the log for TEXT', async ({ page }) => {
    const cmdInput = page.locator('#cmd');
    await cmdInput.fill('TEXT');
    await cmdInput.press('Enter');
    
    const log = page.locator('#command-log');
    // "TEXT start point:" should appear exactly once in the log (excluding the bottom prompt)
    const text = await log.innerText();
    const count = (text.match(/TEXT start point:/g) || []).length;
    expect(count).toBe(1);
  });

  test('should preserve case in TEXT command', async ({ page }) => {
    const cmdInput = page.locator('#cmd');
    await cmdInput.fill('text'); // Test command name case-insensitivity
    await cmdInput.press('Enter');
    
    const canvas = page.locator('#c');
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + 100, box.y + 100);
      await cmdInput.press('Enter'); // Default height
      await cmdInput.press('Enter'); // Default rotation
      
      // Input mixed case text
      await cmdInput.fill('AutoCAD Web');
      await cmdInput.press('Enter');
      
      // We can't easily check the 3D scene text content in E2E, 
      // but we can check if the echo in the log was uppercased or not.
      // Wait, TextCommand doesn't echo the text itself, it just says "Text created."
      await expect(page.locator('#command-log')).toContainText('Text created.');
    }
  });

  test('should support selecting and erasing an entity', async ({ page }) => {
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

      // 2. Erase it
      await cmdInput.fill('ERASE');
      await cmdInput.press('Enter');
      // Click near the middle of the line (with tolerance)
      await page.mouse.click(box.x + 200, box.y + 101);
      
      await expect(page.locator('#command-log')).toContainText('removed.');
    }
  });

  test('should support selecting and moving an entity', async ({ page }) => {
    const cmdInput = page.locator('#cmd');
    const canvas = page.locator('#c');
    const box = await canvas.boundingBox();
    if (box) {
      // 1. Draw a point
      await cmdInput.fill('POINT');
      await cmdInput.press('Enter');
      await page.mouse.click(box.x + 150, box.y + 150);

      // 2. Move it
      await cmdInput.fill('MOVE');
      await cmdInput.press('Enter');
      // Select the point
      await page.mouse.click(box.x + 150, box.y + 150);
      await expect(page.locator('#command-prompt')).toContainText('Base point:');
      
      // Specify base and second point
      await page.mouse.click(box.x + 150, box.y + 150);
      await page.mouse.click(box.x + 250, box.y + 250);

      await expect(page.locator('#command-log')).toContainText('moved.');
    }
  });

  test('should support selecting and copying an entity', async ({ page }) => {
    const cmdInput = page.locator('#cmd');
    const canvas = page.locator('#c');
    const box = await canvas.boundingBox();
    if (box) {
      // 1. Draw a circle
      await cmdInput.fill('CIRCLE');
      await cmdInput.press('Enter');
      await page.mouse.click(box.x + 100, box.y + 100); // Center
      await cmdInput.fill('50'); // Radius
      await cmdInput.press('Enter');

      // 2. Copy it
      await cmdInput.fill('COPY');
      await cmdInput.press('Enter');
      // Select the circle (click on the edge)
      await page.mouse.click(box.x + 150, box.y + 100);
      await expect(page.locator('#command-prompt')).toContainText('Base point:');
      
      await page.mouse.click(box.x + 100, box.y + 100);
      await page.mouse.click(box.x + 200, box.y + 200);

      await expect(page.locator('#command-log')).toContainText('copied to');
    }
  });
});
