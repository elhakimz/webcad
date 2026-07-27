import { test, expect } from '@playwright/test';
import { CadBridge } from './bridge';

/**
 * Canvas visual regression (WEBCAD-154) — the fallback, not the primary check.
 *
 * Screenshots catch shading, lighting and draw-order regressions that no amount of
 * state querying would notice. They also fail for reasons that have nothing to do
 * with the app: GPU vs software rasterisation, driver version, font hinting. So this
 * is opt-in, and every visual assertion is paired with a bridge assertion, so a red
 * screenshot always has a semantic counterpart saying whether the model is actually
 * wrong or only the pixels moved.
 *
 * Record baselines on the machine that will run them:
 *   WEBCAD_VISUAL=1 npx playwright test visual --update-snapshots
 * Then run with:
 *   WEBCAD_VISUAL=1 npx playwright test visual
 */
test.describe('visual regression', () => {
  test.skip(!process.env.WEBCAD_VISUAL, 'set WEBCAD_VISUAL=1 to run canvas screenshot tests');

  test('a shaded box renders consistently', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    await cad.zoomToFit();
    await cad.whenIdle();

    // Functional counterpart: if this fails too, the geometry changed, not the render.
    const solid = await cad.onlySolid();
    expect(solid.vertices).toBe(8);
    expect(solid.faces).toBe(6);

    await expect(page.getByTestId('viewport')).toHaveScreenshot('box-orthogonal.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('the shaded and wireframe modes differ', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    await cad.zoomToFit();

    await cad.runOk('SHADING_WIREFRAME');
    await cad.whenIdle();

    const solid = await cad.onlySolid();
    expect(solid.vertices, 'shading must not touch the model').toBe(8);

    await expect(page.getByTestId('viewport')).toHaveScreenshot('box-wireframe.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});
