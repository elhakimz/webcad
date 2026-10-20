import { test, expect, type Page } from '@playwright/test';
import { CadBridge } from './bridge';

/**
 * Zebra shading golden master (WEBCAD-166).
 *
 * These baselines were recorded on the pre-TSL GLSL build. The TSL port must
 * match them at 1% or better; a changed stripe pattern means the normal or
 * reflection vector was translated wrong.
 *
 *   $env:WEBCAD_VISUAL=1; npx playwright test zebra.visual --update-snapshots
 *   $env:WEBCAD_VISUAL=1; npx playwright test zebra.visual
 *
 * One test per shape: the viewport screenshot includes the command-log overlay,
 * so sharing a page would make each baseline depend on the previous command.
 * Toasts are hidden because they fade on their own clock.
 */
const boot = async (page: Page) => {
  const cad = await CadBridge.boot(page, '/');
  await page.addStyleTag({
    content: '#notification-container { display: none !important; }',
  });
  return cad;
};

test.describe('zebra shading', () => {
  test.skip(!process.env.WEBCAD_VISUAL, 'set WEBCAD_VISUAL=1 to run canvas screenshot tests');

  test('zebra stripes on a box', async ({ page }) => {
    const cad = await boot(page);
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    expect(await cad.setShadingMode('ZEBRA')).toBe('ZEBRA');
    await cad.zoomToFit();
    await cad.whenIdle();

    await expect(page.getByTestId('viewport')).toHaveScreenshot('zebra-box.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('zebra stripes stay continuous across a fillet', async ({ page }) => {
    const cad = await boot(page);
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    const box = await cad.onlySolid();
    await cad.runOk('SFILLET', '8', `EDGE:${box.id}:0`);
    await cad.pressEnter();
    expect(await cad.setShadingMode('ZEBRA')).toBe('ZEBRA');
    await cad.zoomToFit();
    await cad.whenIdle();

    await expect(page.getByTestId('viewport')).toHaveScreenshot('zebra-fillet.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('zebra stripes on a cylinder', async ({ page }) => {
    const cad = await boot(page);
    await cad.setView('orthogonal');
    await cad.runOk('CYLINDER', '0,0', '30', '80');
    expect(await cad.setShadingMode('ZEBRA')).toBe('ZEBRA');
    await cad.zoomToFit();
    await cad.whenIdle();

    await expect(page.getByTestId('viewport')).toHaveScreenshot('zebra-cylinder.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('leaving zebra restores the solid colour', async ({ page }) => {
    const cad = await boot(page);
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    await cad.setShadingMode('ZEBRA');
    await cad.zoomToFit();
    await cad.whenIdle();
    expect(await cad.setShadingMode('SHADED')).toBe('SHADED');
    await cad.whenIdle();

    await expect(page.getByTestId('viewport')).toHaveScreenshot('zebra-restore-shaded.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('selection does not replace the zebra material', async ({ page }) => {
    const cad = await boot(page);
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    const box = await cad.onlySolid();
    await cad.setShadingMode('ZEBRA');
    const selection = await cad.selectObject(box.id);
    expect(selection.objects).toContain(box.id);
    await cad.zoomToFit();
    await cad.whenIdle();

    await expect(page.getByTestId('viewport')).toHaveScreenshot('zebra-selected.png', {
      maxDiffPixelRatio: 0.01,
    });
  });
});
