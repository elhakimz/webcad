import { test, expect } from '@playwright/test';
import { CadApp, READY_MESSAGE, collectErrors } from './helpers';

/**
 * App shell + command-line behaviour.
 *
 * Rewritten 2026-07-26: the previous version of this file gated every test on a
 * `#main-menu-input` screen that no longer exists in index.html, so all 19 tests
 * failed in `beforeEach`. The app now boots straight into the drawing editor.
 */

test.describe('App shell', () => {
  let app: CadApp;

  test.beforeEach(async ({ page }) => {
    app = new CadApp(page);
    await app.boot();
  });

  test('boots straight into the drawing editor with no main-menu gate', async ({ page }) => {
    await expect(page.locator('#drawing-editor')).toBeVisible();
    await expect(app.canvas).toBeVisible();
    await expect(app.cmd).toBeEnabled();
    await expect(app.log).toContainText(READY_MESSAGE);
    await expect(app.prompt).toHaveText('Command:');

    // The removed main-menu markup must not come back without updating these tests.
    await expect(page.locator('#main-menu-screen')).toHaveCount(0);
    await expect(page.locator('#main-menu-input')).toHaveCount(0);
  });

  test('shows the status ribbon with layer, coords and drafting toggles', async () => {
    await expect(app.layerName).toHaveText('0');
    await expect(app.coords).toContainText('X:');
    await expect(app.coords).toContainText('Y:');
    await expect(app.ribbonToggle('ortho')).toBeVisible();
    await expect(app.ribbonToggle('otrack')).toBeVisible();
  });

  test('has Modelling and Scripting tabs, Modelling active on boot', async () => {
    await expect(app.tab('Modelling')).toHaveClass(/active/);
    await expect(app.tab('Scripting')).not.toHaveClass(/active/);
  });

  test('boots without page errors', async ({ page }) => {
    // Fresh listener on a fresh load so we only capture this navigation.
    const errors = collectErrors(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await app.cmd.waitFor({ state: 'visible', timeout: 60000 });
    await expect(app.log).toContainText(READY_MESSAGE, { timeout: 60000 });

    const fatal = errors.filter((e) => e.startsWith('pageerror:'));
    expect(fatal, `unexpected page errors:\n${fatal.join('\n')}`).toHaveLength(0);
  });
});

test.describe('Command line', () => {
  let app: CadApp;

  test.beforeEach(async ({ page }) => {
    app = new CadApp(page);
    await app.boot();
  });

  test('echoes a typed command and shows its prompt', async () => {
    await app.run('CIRCLE');
    await expect(app.log).toContainText('Command: CIRCLE');
    await expect(app.prompt).toContainText('CIRCLE specify center point:');
  });

  test('accepts lower-case command names', async () => {
    await app.run('circle');
    await expect(app.prompt).toContainText('CIRCLE specify center point:');
  });

  test('Escape cancels the active command', async () => {
    await app.run('LINE');
    await expect(app.prompt).toContainText('specify first point');
    await app.cancel();
    await expect(app.log).toContainText('*Cancel*');
  });

  test('reports an unknown command without breaking the prompt', async () => {
    await app.run('DEFINITELYNOTACOMMAND');
    await expect(app.log).toContainText('DEFINITELYNOTACOMMAND');
    // The command line must stay usable afterwards.
    await app.run('CIRCLE');
    await expect(app.prompt).toContainText('CIRCLE specify center point:');
  });
});

test.describe('Drawing primitives', () => {
  let app: CadApp;

  test.beforeEach(async ({ page }) => {
    app = new CadApp(page);
    await app.boot();
  });

  test('canvas centre maps to world origin', async () => {
    await app.run('CIRCLE');
    await app.clickOrigin();
    await expect(app.log).toContainText('Center[X:0.0000, Y:0.0000, Z:0.0000]');
  });

  test('draws a circle from centre and typed radius', async () => {
    await app.run('CIRCLE');
    await app.clickOrigin();
    await expect(app.prompt).toContainText('Radius');
    await app.input('50');
    await expect(app.log).toContainText('[R:50.0000]');
  });

  test('draws a line and reports its length', async () => {
    await app.run('LINE');
    await app.clickWorld(-100, 0);
    await app.clickWorld(100, 0);
    // 200 units apart on screen at the default 1:1 view.
    await expect(app.log).toContainText('Line created. Distance: 200.0000');
  });

  test('chains line segments, undoes one with U and closes with C', async () => {
    await app.run('LINE');
    await app.clickWorld(-150, 100);
    await app.clickWorld(150, 100);
    await app.clickWorld(150, -100);
    await app.clickWorld(-150, -100);
    await expect(app.log).toContainText('Line created.');

    // Single-key shortcuts only reach the app when focus is off the command input.
    await app.focusViewport();
    await app.page.keyboard.press('u');
    await expect(app.log).toContainText('Undo performed.');

    await app.page.keyboard.press('c');
    await expect(app.log).toContainText('Command finished.');
  });

  test('updates the coordinate readout as the pointer moves', async () => {
    const before = await app.coords.innerText();
    await app.moveWorld(120, 80);
    await expect(app.coords).not.toHaveText(before);

    // The canvas width is fractional, so the centre lands on a half pixel and the
    // mapping is accurate to about a unit rather than exact.
    const { x, y } = await app.readCoords();
    expect(x).toBeGreaterThan(118);
    expect(x).toBeLessThan(122);
    expect(y).toBeGreaterThan(78);
    expect(y).toBeLessThan(82);
  });

  test('ORTHO toggle flips its active state', async () => {
    const ortho = app.ribbonToggle('ortho');
    await expect(ortho).not.toHaveClass(/active/);
    await ortho.click();
    await expect(ortho).toHaveClass(/active/);
    await ortho.click();
    await expect(ortho).not.toHaveClass(/active/);
  });
});
