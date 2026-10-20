import { test, expect } from '@playwright/test';
import { CadBridge } from './bridge';

/**
 * Phase D1 on a real WebGPU device (WEBCAD-169).
 *
 * Opt-in because most CI hosts have no adapter. Run on a developer machine with:
 *
 *   $env:WEBCAD_WEBGPU=1; npx playwright test tests/e2e/webgpu.spec.ts --workers=1
 *
 * The default suite proves the WebGL default and the fallback path; this file is
 * the only place a WebGPU failure would otherwise be able to hide behind that
 * fallback.
 */
test.skip(
  !process.env.WEBCAD_WEBGPU,
  'set WEBCAD_WEBGPU=1 to run against a real WebGPU device',
);

test.use({
  headless: false,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  launchOptions: { args: ['--enable-unsafe-webgpu'] },
});

test('draws the document scene, resizes, and degrades on device loss', async ({ page }) => {
  test.setTimeout(180_000);

  const cad = await CadBridge.boot(page, '/?renderer=webgpu');
  const info = await cad.expectRenderer('webgpu');
  expect(info.deviceLost).toBe(false);

  await cad.setView('orthogonal');
  await cad.runOk('BOX', '-50,-50', '50,50', '100');
  const solid = await cad.onlySolid();
  expect(solid.vertices).toBe(8);
  await cad.expectValid(solid.id);

  const edge = await cad.getEdgeOutlineInfo(solid.id);
  expect(edge.present, 'the solid must have its fat-line outline').toBe(true);
  expect(edge.materialType, 'the node-material provider, not the WebGL twin').toBe(
    'Line2NodeMaterial',
  );

  await page.screenshot({ path: 'docs/verification/webgpu-d1/viewport.png' });

  const before = await cad.getCanvasRect();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect.poll(async () => (await cad.getCanvasRect()).width).toBeGreaterThan(before.width);
  await cad.whenIdle();
  const after = await cad.getCanvasRect();
  await expect
    .poll(async () => (await page.evaluate(() => {
      const canvas = document.querySelector('#c') as HTMLCanvasElement;
      return canvas.width;
    })), { timeout: 5_000 })
    .toBe(Math.floor(after.width * 2));

  expect(await cad.destroyRendererDevice()).toBe(true);
  await expect
    .poll(async () => (await cad.getRendererInfo()).deviceLost, { timeout: 10_000 })
    .toBe(true);

  const lost = await cad.getRendererInfo();
  expect(lost.reason).toContain('device lost');
  await expect(page.locator('.toast-error', { hasText: 'device lost' })).toBeVisible();

  // A frozen viewport would still accept the request and draw nothing visible;
  // prove the loop actually stopped instead of spinning against a dead device.
  const frozen = await cad.getDrawStats();
  await cad.requestRender();
  await page.waitForTimeout(100);
  expect(await cad.getDrawStats()).toEqual(frozen);

  await page.screenshot({ path: 'docs/verification/webgpu-d1/device-lost.png' });
});
