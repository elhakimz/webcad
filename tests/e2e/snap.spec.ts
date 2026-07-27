import { test, expect } from '@playwright/test';
import { CadBridge } from './bridge';

/**
 * Object snap and the drafting aids (WEBCAD-153).
 *
 * The snap glyph is a few pixels drawn on the canvas. Rather than look for it, these
 * tests move the cursor and ask the app what it snapped to.
 */
test.describe('snap', () => {
  test('the cursor near an endpoint snaps to it, and not when OSNAP is off', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    await cad.setView('top');

    await cad.runOk('LINE', '0,0', '100,0');
    await cad.pressEnter();
    await cad.zoomToFit();

    await cad.setDrafting('osnap', true);
    const snapped = await cad.moveCursorToWorld([100, 0, 0]);
    expect(snapped.active, 'OSNAP should capture the line endpoint').toBe(true);
    expect(snapped.mode?.toLowerCase()).toContain('endpoint');
    expect(snapped.snappedPoint![0]).toBeCloseTo(100, 6);
    expect(snapped.snappedPoint![1]).toBeCloseTo(0, 6);

    // Off the line but still inside the framed view — zoomToFit crops tightly here.
    const away = await cad.moveCursorToWorld([50, 5, 0]);
    expect(away.active, 'nothing to snap to out in open space').toBe(false);
    expect(away.snappedPoint).toBeNull();

    await cad.setDrafting('osnap', false);
    const off = await cad.moveCursorToWorld([100, 0, 0]);
    expect(off.active, 'OSNAP off means no capture').toBe(false);
  });

  test('the midpoint of a line is snappable', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    await cad.setView('top');

    await cad.runOk('LINE', '0,0', '200,0');
    await cad.pressEnter();
    await cad.zoomToFit();
    await cad.setDrafting('osnap', true);

    const snapped = await cad.moveCursorToWorld([100, 0, 0]);
    expect(snapped.active).toBe(true);
    expect(snapped.snappedPoint![0]).toBeCloseTo(100, 6);
    expect(snapped.snappedPoint![1]).toBeCloseTo(0, 6);
  });

  test('drafting settings are set to a value, not blindly toggled', async ({ page }) => {
    const cad = await CadBridge.boot(page);

    for (const key of ['ortho', 'osnap', 'otrack', 'snap', 'grid'] as const) {
      expect((await cad.setDrafting(key, true))[key], `${key} on`).toBe(true);
      // Setting the same value again must be a no-op, not a flip.
      expect((await cad.setDrafting(key, true))[key], `${key} still on`).toBe(true);
      expect((await cad.setDrafting(key, false))[key], `${key} off`).toBe(false);
    }

    const settings = await cad.getDraftingSettings();
    expect(settings.snapSpacing).toBeGreaterThan(0);
    expect(settings.gridSpacing).toBeGreaterThan(0);
  });
});
