# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui.spec.ts >> AutoCAD 2.18 DOS UI >> should support keyboard shortcuts (C/U) during LINE command
- Location: tests\e2e\ui.spec.ts:35:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#command-log')
Expected substring: "Command finished."
Received string:    "Command: LINELINE command started: pick first pointTo point:Entity L3 removed."
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('#command-log')
    9 × locator resolved to <div id="command-log">…</div>
      - unexpected value "Command: LINELINE command started: pick first pointTo point:Entity L3 removed."

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - generic [ref=e4]: Layer 0
    - generic [ref=e5]: 100.0000, 390.0000
  - generic [ref=e9]:
    - generic [ref=e10] [cursor=pointer]: DRAW
    - generic [ref=e11]:
      - generic [ref=e12] [cursor=pointer]: ARC
      - generic [ref=e13] [cursor=pointer]: CIRCLE
      - generic [ref=e14] [cursor=pointer]: "LINE:"
      - generic [ref=e15] [cursor=pointer]: POINT
      - generic [ref=e16] [cursor=pointer]: TEXT
  - generic [ref=e17]:
    - generic [ref=e18]:
      - generic [ref=e19]: "Command: LINE"
      - generic [ref=e20]: "LINE command started: pick first point"
      - generic [ref=e21]: "To point:"
      - generic [ref=e22]: Entity L3 removed.
    - generic [ref=e23]:
      - generic [ref=e24]: "Command:"
      - textbox [ref=e25]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('AutoCAD 2.18 DOS UI', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |   });
  7  | 
  8  |   test('should display status bar with initial values', async ({ page }) => {
  9  |     await expect(page.locator('#layer-info')).toHaveText('Layer 0');
  10 |     await expect(page.locator('#coords-info')).toContainText('0.0000, 0.0000');
  11 |   });
  12 | 
  13 |   test('should navigate side menu DRAW -> LINE:', async ({ page }) => {
  14 |     // Click DRAW
  15 |     await page.click('text=DRAW');
  16 |     // Submenu should appear, verify LINE: is visible
  17 |     await expect(page.locator('text=LINE:')).toBeVisible();
  18 |     
  19 |     // Click LINE:
  20 |     await page.click('text=LINE:');
  21 |     // Command log should reflect the command start
  22 |     await expect(page.locator('#command-log')).toContainText('Command: LINE');
  23 |     await expect(page.locator('#command-log')).toContainText('LINE command started');
  24 |   });
  25 | 
  26 |   test('should support manual command entry', async ({ page }) => {
  27 |     const cmdInput = page.locator('#cmd');
  28 |     await cmdInput.fill('CIRCLE');
  29 |     await cmdInput.press('Enter');
  30 |     
  31 |     await expect(page.locator('#command-log')).toContainText('Command: CIRCLE');
  32 |     await expect(page.locator('#command-log')).toContainText('CIRCLE command started');
  33 |   });
  34 | 
  35 |   test('should support keyboard shortcuts (C/U) during LINE command', async ({ page }) => {
  36 |     await page.click('text=DRAW');
  37 |     await page.click('text=LINE:');
  38 |     
  39 |     const canvas = page.locator('#c');
  40 |     const box = await canvas.boundingBox();
  41 |     if (box) {
  42 |       // Draw 3 segments (4 points)
  43 |       await page.mouse.click(box.x + 100, box.y + 100);
  44 |       await page.mouse.click(box.x + 200, box.y + 100);
  45 |       await page.mouse.click(box.x + 200, box.y + 200);
  46 |       await page.mouse.click(box.x + 100, box.y + 200);
  47 |       
  48 |       // Press 'u' to undo the last segment (L3)
  49 |       await page.keyboard.press('u');
  50 |       await expect(page.locator('#command-log')).toContainText('Entity L3 removed.');
  51 |       
  52 |       // Press 'c' to close the sequence (requires at least 3 points, which we have: 4 - 1 = 3)
  53 |       await page.keyboard.press('c');
> 54 |       await expect(page.locator('#command-log')).toContainText('Command finished.');
     |                                                  ^ Error: expect(locator).toContainText(expected) failed
  55 |     }
  56 |   });
  57 | 
  58 |   test('should go back on header click', async ({ page }) => {
  59 |     await page.click('text=DRAW');
  60 |     await expect(page.locator('text=LINE:')).toBeVisible();
  61 |     
  62 |     await page.click('.menu-header');
  63 |     await expect(page.locator('text=DRAW')).toBeVisible();
  64 |     await expect(page.locator('text=LINE:')).not.toBeVisible();
  65 |   });
  66 | 
  67 |   test('should reset to root on MENU command', async ({ page }) => {
  68 |     await page.click('text=EDIT');
  69 |     await expect(page.locator('text=ERASE')).toBeVisible();
  70 |     
  71 |     const cmdInput = page.locator('#cmd');
  72 |     await cmdInput.fill('MENU');
  73 |     await cmdInput.press('Enter');
  74 |     
  75 |     await expect(page.locator('text=DRAW')).toBeVisible();
  76 |     await expect(page.locator('text=ERASE')).not.toBeVisible();
  77 |     await expect(page.locator('#command-log')).toContainText('Returned to root menu.');
  78 |   });
  79 | 
  80 |   test('should update coordinates on mouse move', async ({ page }) => {
  81 |     const canvas = page.locator('#c');
  82 |     const box = await canvas.boundingBox();
  83 |     if (box) {
  84 |       // Move mouse to some point on canvas
  85 |       await page.mouse.move(box.x + 100, box.y + 100);
  86 |       // Coordinate display should change from 0,0
  87 |       await expect(page.locator('#coords-info')).not.toHaveText('0.0000, 0.0000');
  88 |     }
  89 |   });
  90 | });
  91 | 
```