import { test, expect } from '@playwright/test';
import { CadBridge } from './bridge';

test.describe('zebra shading', () => {
  test('round-trips every shading mode without losing edges', async ({ page }) => {
    const cad = await CadBridge.boot(page, '/');
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    const box = await cad.onlySolid();

    expect(await cad.setShadingMode('ZEBRA')).toBe('ZEBRA');
    await cad.whenIdle();

    const outline = await cad.getEdgeOutlineInfo(box.id);
    expect(outline.present).toBe(true);
    expect(outline.visible).toBe(true);
    expect((await cad.getSolidMaterialInfo(box.id)).materialType).toBe(
      'MeshBasicNodeMaterial',
    );

    for (const mode of ['WIREFRAME', 'PHONG', 'BLINN', 'SHADED', 'ZEBRA'] as const) {
      expect(await cad.setShadingMode(mode)).toBe(mode);
      await cad.whenIdle();
    }

    await cad.setShadingMode('SHADED');
    await cad.whenIdle();
    expect(await cad.getSolidMaterialInfo(box.id)).toEqual({
      materialType: 'MeshPhongMaterial',
      color: 0xebf2ff,
    });
  });

  test('selection and resize do not disturb zebra mode', async ({ page }) => {
    const cad = await CadBridge.boot(page, '/');
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    const box = await cad.onlySolid();
    await cad.setShadingMode('ZEBRA');
    await cad.zoomToFit();
    await cad.whenIdle();

    const selection = await cad.selectObject(box.id);
    expect(selection.objects).toContain(box.id);
    await cad.whenIdle();
    expect(await cad.getShadingMode()).toBe('ZEBRA');

    await page.setViewportSize({ width: 1200, height: 760 });
    await cad.whenIdle();
    expect(await cad.getShadingMode()).toBe('ZEBRA');
    expect((await cad.getEdgeOutlineInfo(box.id)).visible).toBe(true);

    await cad.clearSelection();
    await cad.whenIdle();
    expect(await cad.getShadingMode()).toBe('ZEBRA');
  });

  test('zebra mode is safe with no solids', async ({ page }) => {
    const cad = await CadBridge.boot(page, '/');
    expect(await cad.setShadingMode('ZEBRA')).toBe('ZEBRA');
    await cad.whenIdle();
    expect(await cad.setShadingMode('SHADED')).toBe('SHADED');
  });
});
