import { test, expect } from '@playwright/test';
import { CadBridge } from './bridge';

/**
 * The fat edge layer (WEBCAD-174) under its rollout flag.
 *
 * `?edges=fat` opts into the replacement while `?edges=classic` (the default
 * until Task 5) keeps OutlineEffect. These assertions are the semantic half of
 * the visual comparison: the layer exists, carries the right material, and
 * survives a shading round-trip.
 */
test.describe('fat edge layer', () => {
  test('is present on a shaded solid and keeps its material across shading modes', async ({ page }) => {
    const cad = await CadBridge.boot(page, '/?edges=fat');
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    await cad.zoomToFit();

    const solid = await cad.onlySolid();
    const info = await cad.getEdgeOutlineInfo(solid.id);
    expect(info.present, 'a shaded box must carry an edge outline layer').toBe(true);
    expect(info.edgeCount, 'a box exposes at least twelve edge polylines').toBeGreaterThanOrEqual(12);
    expect(info.segmentCount, 'every edge is tessellated into at least one segment').toBeGreaterThanOrEqual(12);
    expect(info.materialType).toBe('LineMaterial');
    expect(info.visible).toBe(true);

    await cad.setShadingMode('PHONG');
    expect((await cad.getEdgeOutlineInfo(solid.id)).visible, 'outlines are hidden in PHONG').toBe(false);

    await cad.setShadingMode('SHADED');
    const after = await cad.getEdgeOutlineInfo(solid.id);
    expect(after.visible).toBe(true);
    expect(
      after.materialType,
      'setShadingMode must not swap the line material for a mesh material',
    ).toBe('LineMaterial');
    expect(after.edgeCount).toBe(info.edgeCount);
  });

  test('tracks the canvas resolution after a viewport resize', async ({ page }) => {
    const cad = await CadBridge.boot(page, '/?edges=fat');
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    const solid = await cad.onlySolid();

    const before = await cad.getEdgeOutlineInfo(solid.id);
    await page.setViewportSize({ width: 1000, height: 700 });
    // The resize event lands after `whenIdle()`, so poll the canvas height.
    await expect
      .poll(async () => (await cad.getEdgeOutlineInfo(solid.id)).resolution[1])
      .toBeLessThan(before.resolution[1]);
    const after = await cad.getEdgeOutlineInfo(solid.id);

    expect(after.resolution[0]).toBeGreaterThan(0);
    expect(after.resolution).not.toEqual(before.resolution);
  });
});
