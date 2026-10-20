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

  test('selecting an edge marks exactly that edge, and clearing removes the mark', async ({ page }) => {
    const cad = await CadBridge.boot(page, '/?edges=fat');
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    const solid = await cad.onlySolid();
    const edges = await cad.getEdges(solid.id);
    expect(edges.length).toBeGreaterThanOrEqual(12);

    await cad.selectEdge(solid.id, edges[3].id);
    let info = await cad.getEdgeOutlineInfo(solid.id);
    expect(info.selectedEdge, 'the selected edge must reach the outline layer').toBe(3);

    await cad.clearSelection();
    info = await cad.getEdgeOutlineInfo(solid.id);
    expect(info.selectedEdge).toBeNull();
  });

  test('a curved edge keeps its whole polyline selected', async ({ page }) => {
    const cad = await CadBridge.boot(page, '/?edges=fat');
    await cad.setView('orthogonal');
    await cad.runOk('CYLINDER', '0,0', '30', '80');
    const solid = await cad.onlySolid();
    const edges = await cad.getEdges(solid.id);
    const closed = edges.find(
      (e) => Math.hypot(e.start[0] - e.end[0], e.start[1] - e.end[1], e.start[2] - e.end[2]) < 1e-3,
    );
    expect(closed, 'a cylinder has at least one closed circular edge').toBeTruthy();

    await cad.selectEdge(solid.id, closed!.id);

    const info = await cad.getEdgeOutlineInfo(solid.id);
    expect(info.selectedEdge).toBe(Number(closed!.id.slice(1)));
    // A circle is tessellated, so the selection must cover many segments.
    expect(info.selectedSegmentCount).toBeGreaterThan(1);
  });

  test('a new solid after a delete gets its own live layer', async ({ page }) => {
    const cad = await CadBridge.boot(page, '/?edges=fat');
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    const first = await cad.onlySolid();

    await cad.selectObject(first.id);
    await cad.runOk('ERASE', '');
    await cad.runOk('BOX', '10,10', '60,60', '50');
    const second = await cad.onlySolid();

    const info = await cad.getEdgeOutlineInfo(second.id);
    expect(info.present).toBe(true);
    expect(info.edgeCount).toBeGreaterThanOrEqual(12);
  });
});
