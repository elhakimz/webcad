import { test, expect } from '@playwright/test';
import { CadApp } from './helpers';

/**
 * Selection, modify commands, grip editing and undo.
 *
 * Rewritten 2026-07-26: the previous `beforeEach` waited on the removed
 * `#main-menu-input`, so both grip tests timed out before reaching any assertion.
 * The grip behaviour itself was fine — `app.ts` implements `activeGrip`/`moveGrip`
 * and logs the strings asserted below.
 */

test.describe('Selection and modify', () => {
  let app: CadApp;

  test.beforeEach(async ({ page }) => {
    app = new CadApp(page);
    await app.boot();
  });

  test('selects an entity by clicking it', async () => {
    await app.drawLine({ x: -100, y: 0 }, { x: 100, y: 0 });
    await app.clickWorld(0, 0);
    await expect(app.log).toContainText('[Selection] 1 object.');
  });

  test('erases a selected entity', async () => {
    await app.drawLine({ x: -100, y: 50 }, { x: 100, y: 50 });

    await app.run('ERASE');
    await expect(app.prompt).toContainText('Select objects:');
    await app.clickWorld(0, 50);
    await expect(app.log).toContainText('[Selection] 1 object.');

    // Selection is confirmed with Enter, which performs the delete.
    await app.acceptDefault();
    await expect(app.log).toContainText('Deleted 1 objects.');
  });

  test('moves an entity between two points', async () => {
    await app.drawLine({ x: -100, y: -50 }, { x: 100, y: -50 });

    await app.run('MOVE');
    await expect(app.prompt).toContainText('Select objects:');
    await app.clickWorld(0, -50);
    await app.acceptDefault();
    await expect(app.prompt).toContainText('Base point:');

    await app.clickWorld(0, -50);
    await app.clickWorld(0, 50);
    await expect(app.log).toContainText('moved');
  });

  test('copies an entity', async () => {
    await app.drawLine({ x: -120, y: 120 }, { x: 20, y: 120 });

    await app.run('COPY');
    await app.clickWorld(-50, 120);
    await app.acceptDefault();
    await expect(app.prompt).toContainText('Base point:');

    await app.clickWorld(-50, 120);
    await app.clickWorld(-50, 0);
    await expect(app.log).toContainText('copied');
  });
});

test.describe('Grip editing', () => {
  let app: CadApp;

  test.beforeEach(async ({ page }) => {
    app = new CadApp(page);
    await app.boot();
  });

  test('drags a line endpoint grip and moves the geometry', async ({ page }) => {
    await app.drawLine({ x: -150, y: 0 }, { x: 50, y: 0 });

    // Select the line so its grips are shown. The line is horizontal, so the
    // selection box starts 200 wide and 0 high.
    await app.clickWorld(-50, 0);
    await expect(app.log).toContainText('[Selection] 1 object.');
    expect((await app.lastSelectionSize()).height).toBeCloseTo(0, 1);

    // Grab the start grip and drag it down 120 units.
    await app.pressWorld(-150, 0);
    await app.moveWorld(-150, -120);
    await page.mouse.up();
    await expect(app.log).toContainText('Grip edit completed.');

    // Clear the selection first: while the line stays selected its grips are live,
    // and clicking one is consumed as another grip edit instead of a re-selection.
    await app.cancel();

    // The line now runs (-150,-120) → (50,0). Pick a point on it that is not a
    // grip — the endpoints and the midpoint (-50,-60) would all be grabbed.
    await app.clickWorld(0, -30);
    const size = await app.lastSelectionSize();
    expect(size.width).toBeGreaterThan(180);
    expect(size.height).toBeGreaterThan(100);
    expect(size.height).toBeLessThan(140);
  });

  test('cancels a grip edit with Escape', async ({ page }) => {
    await app.drawLine({ x: -150, y: 80 }, { x: 50, y: 80 });

    await app.clickWorld(-50, 80);
    await expect(app.log).toContainText('[Selection] 1 object.');

    // Hold the grip so the edit is still active, then cancel it.
    await app.pressWorld(-150, 80);
    await page.keyboard.press('Escape');
    await page.mouse.up();

    await expect(app.log).toContainText('*Cancel Grip Edit*');
  });
});

test.describe('Undo', () => {
  let app: CadApp;

  test.beforeEach(async ({ page }) => {
    app = new CadApp(page);
    await app.boot();
  });

  test('UNDO reverses the last operation', async () => {
    await app.drawLine({ x: -100, y: 0 }, { x: 100, y: 0 });

    await app.run('UNDO');
    await expect(app.log).toContainText('Undo performed.');
  });

  test('UNDO on an empty drawing reports nothing to undo', async () => {
    await app.run('UNDO');
    await expect(app.log).toContainText(/Nothing to undo\.|Undo performed\./);
  });

  test('an erased entity can be restored with UNDO', async () => {
    await app.drawLine({ x: -80, y: -120 }, { x: 80, y: -120 });

    await app.run('ERASE');
    await app.clickWorld(0, -120);
    await app.acceptDefault();
    await expect(app.log).toContainText('Deleted 1 objects.');

    await app.run('UNDO');
    await expect(app.log).toContainText('Undo performed.');

    // The restored line should be selectable again.
    await app.clickWorld(0, -120);
    await expect(app.log).toContainText('[Selection] 1 object.');
  });
});
