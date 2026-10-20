import { test, expect, type Page } from '@playwright/test';
import { CadBridge } from './bridge';

/**
 * Edge rendering regression for WEBCAD-174.
 *
 * Opt in with WEBCAD_VISUAL=1; record baselines on the machine that will run
 * them. The classic/OutlineEffect half of the original comparison has been
 * removed along with the effect itself.
 *
 *   WEBCAD_VISUAL=1 npx playwright test edges.visual --update-snapshots
 *   WEBCAD_VISUAL=1 npx playwright test edges.visual
 *
 * One test per shape: the viewport screenshot includes the command-log overlay,
 * so sharing a page would make each baseline depend on the previous command.
 */
const boot = (page: Page) => CadBridge.boot(page, '/');

test.describe('edge rendering', () => {
  test.skip(!process.env.WEBCAD_VISUAL, 'set WEBCAD_VISUAL=1 to run canvas screenshot tests');

  test('a shaded box shows twelve crisp edges', async ({ page }) => {
    const cad = await boot(page);
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    await cad.zoomToFit();
    await cad.whenIdle();

    const box = await cad.onlySolid();
    expect(box.vertices, 'edges are a cue, not geometry').toBe(8);
    expect((await cad.getEdgeOutlineInfo(box.id)).edgeCount).toBeGreaterThanOrEqual(12);

    await expect(page.getByTestId('viewport')).toHaveScreenshot('edges-box-fat.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('a filleted box keeps the new edges visible', async ({ page }) => {
    const cad = await boot(page);
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    const box = await cad.onlySolid();
    await cad.runOk('SFILLET', '8', `EDGE:${box.id}:0`);
    await cad.pressEnter();
    await cad.zoomToFit();
    await cad.whenIdle();

    const filleted = await cad.onlySolid();
    expect(filleted.faces, 'the fillet must add a face').toBeGreaterThan(6);

    await expect(page.getByTestId('viewport')).toHaveScreenshot('edges-fillet-fat.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('a cylinder shows its silhouette and circular rims', async ({ page }) => {
    const cad = await boot(page);
    await cad.setView('orthogonal');
    await cad.runOk('CYLINDER', '0,0', '30', '80');
    await cad.zoomToFit();
    await cad.whenIdle();

    const cylinder = await cad.onlySolid();
    expect(cylinder.faces).toBeGreaterThan(0);

    await expect(page.getByTestId('viewport')).toHaveScreenshot('edges-cylinder-fat.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});
