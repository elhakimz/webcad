import { test, expect } from '@playwright/test';
import { CadBridge } from './bridge';

/**
 * Camera control through the test bridge (WEBCAD-148).
 *
 * None of this clicks the view cube: the view is set by name and read back as
 * numbers, so a failure names the camera rather than a widget.
 */
test.describe('camera', () => {
  test('view presets orient the camera without touching the view cube', async ({ page }) => {
    const cad = await CadBridge.boot(page);

    await cad.setView('top');
    const top = await cad.getCameraState();
    expect(top.viewPreset).toBe('TOP');
    expect(top.position[2], 'TOP looks down the +Z axis').toBeGreaterThan(0);
    expect(Math.abs(top.position[0]) + Math.abs(top.position[1])).toBeCloseTo(0, 6);
    expect(top.canOrbit, 'plain views lock the camera angle').toBe(false);

    await cad.setView('front');
    const front = await cad.getCameraState();
    expect(front.viewPreset).toBe('FRONT');
    expect(front.position[1], 'FRONT looks along +Y from the front').toBeLessThan(0);
    expect(front.up).toEqual([0, 0, 1]);

    await cad.setView('orthogonal');
    const iso = await cad.getCameraState();
    expect(iso.viewPreset).toBe('ORTHOGONAL');
    expect(iso.canOrbit, 'angled views allow orbiting').toBe(true);
  });

  test('orbit moves the camera and is refused in locked views', async ({ page }) => {
    const cad = await CadBridge.boot(page);

    await cad.setView('orthogonal');
    const before = await cad.getCameraState();
    await cad.orbit(30, 0);
    const after = await cad.getCameraState();

    expect(after.position, 'orbiting should move the camera').not.toEqual(before.position);
    const radius = (p: number[]) => Math.hypot(p[0] - after.target[0], p[1] - after.target[1], p[2] - after.target[2]);
    expect(radius(after.position), 'orbit keeps the distance to the target').toBeCloseTo(radius(before.position), 3);

    await cad.setView('top');
    const err = await cad.expectRejection('orbit', 30, 0);
    expect(err.code).toBe('unsupported');
  });

  test('zoom scales, and zoomToFit frames the model', async ({ page }) => {
    const cad = await CadBridge.boot(page);

    const start = (await cad.getCameraState()).zoom;
    await cad.zoom(2);
    expect((await cad.getCameraState()).zoom).toBeCloseTo(start * 2, 6);

    await cad.runOk('LINE', '0,0', '400,300');
    await cad.pressEnter();
    await cad.zoomToFit();

    // Both ends of the line must land inside the canvas once it has been framed.
    for (const point of [[0, 0, 0], [400, 300, 0]] as [number, number, number][]) {
      const p = await cad.worldToScreen(point);
      expect(p.onScreen, `[${point}] should be visible after zoomToFit`).toBe(true);
    }
  });

  test('world and screen coordinates round-trip, including in the angled view', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    const world: [number, number, number] = [37, -12, 0];

    for (const view of ['top', 'orthogonal'] as const) {
      await cad.setView(view);
      const screen = await cad.worldToScreen(world);
      const back = await cad.screenToWorld(screen.x, screen.y, 0);
      expect(back[0], `x round-trip in ${view}`).toBeCloseTo(world[0], 6);
      expect(back[1], `y round-trip in ${view}`).toBeCloseTo(world[1], 6);
      expect(back[2], `z round-trip in ${view}`).toBeCloseTo(world[2], 6);
    }
  });

  test('an edge-on view refuses to unproject onto the plane it is looking along', async ({ page }) => {
    const cad = await CadBridge.boot(page);

    // FRONT looks straight down +Y, so every pixel maps to a whole line of the
    // z = 0 plane. Answering with one arbitrary point on that line would be worse
    // than failing.
    await cad.setView('front');
    const err = await cad.expectRejection('screenToWorld', 100, 100, 0);
    expect(err.code).toBe('unsupported');
    expect(err.message).toContain('FRONT');
  });

  test('perspective is refused rather than silently ignored', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    expect((await cad.getCameraState()).projection).toBe('ortho');

    const err = await cad.expectRejection('setProjection', 'perspective');
    expect(err.code).toBe('unsupported');
    expect(err.message).toContain('OrthographicCamera');
  });
});
