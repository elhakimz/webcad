import { test, expect } from '@playwright/test';
import { CadBridge } from './bridge';

/**
 * Which backend is actually drawing (WEBCAD-170).
 *
 * `chooseRenderer()` falls back to WebGL on any WebGPU failure, silently and by design.
 * That is the right runtime behaviour and the wrong test behaviour: a suite launched
 * against WebGPU on a machine with no adapter would fall back and still pass. These
 * cases pin the fallback down so it can never be mistaken for success.
 */
test.describe('renderer backend', () => {
  test('the default boot runs on WebGL and reports no fallback', async ({ page }) => {
    const cad = await CadBridge.boot(page);

    const info = await cad.expectRenderer('webgl');
    expect(info.requested).toBe('webgl');
    expect(info.reason, 'the reason is always populated, never an empty string').not.toBe('');
  });

  test('?renderer=webgpu is recorded as a fallback, not quietly honoured', async ({ page }) => {
    // Remove the API so this case is deterministic on every host, including a
    // developer machine with a working WebGPU adapter. The run must not claim it
    // got what it asked for; that is the failure mode this exists to prevent.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    });
    const cad = await CadBridge.boot(page, '/?renderer=webgpu');

    const info = await cad.getRendererInfo();
    expect(info.requested).toBe('webgpu');
    expect(info.kind, 'WebGL is still what draws').toBe('webgl');
    expect(info.fellBack, 'and the run knows it did not get WebGPU').toBe(true);
    expect(info.reason.length, 'with a reason a human can act on').toBeGreaterThan(10);

    // The fallback has to be a working viewport, not just an honest label.
    await cad.setView('orthogonal');
    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    const solid = await cad.onlySolid();
    expect(solid.vertices).toBe(8);
    await cad.expectValid(solid.id);
  });
});

test.describe('viewport sizing', () => {
  test('resize keeps the drawing buffer in step with the CSS rect', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    const before = await cad.getCanvasRect();

    await page.setViewportSize({ width: 1600, height: 1000 });
    await expect.poll(async () => (await cad.getCanvasRect()).width).toBeGreaterThan(before.width);
    await cad.whenIdle();

    const after = await cad.getCanvasRect();
    const buffer = await page.evaluate(() => {
      const canvas = document.querySelector('#c') as HTMLCanvasElement;
      return { width: canvas.width, height: canvas.height, dpr: window.devicePixelRatio };
    });
    expect(buffer.width).toBe(Math.floor(after.width * Math.min(buffer.dpr, 2)));
    expect(buffer.height).toBe(Math.floor(after.height * Math.min(buffer.dpr, 2)));
  });

  test('the idle watcher survives a stopped rAF', async ({ page }) => {
    const cad = await CadBridge.boot(page);

    // A background tab stops rAF. Queue a frame that will never be drawn, then
    // prove the bridge's 250 ms age cap releases `whenIdle` instead of hanging.
    await page.evaluate(() => {
      window.requestAnimationFrame = () => 0;
    });
    await cad.requestRender();
    await cad.whenIdle(2_000);

    expect(await cad.isIdle()).toBe(true);
  });
});

test.describe('device pixel ratio', () => {
  test.use({ deviceScaleFactor: 2 });

  test('sizes the drawing buffer at the capped DPR', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    const rect = await cad.getCanvasRect();
    const size = await page.evaluate(() => {
      const canvas = document.querySelector('#c') as HTMLCanvasElement;
      return { width: canvas.width, height: canvas.height, dpr: window.devicePixelRatio };
    });

    expect(size.dpr).toBe(2);
    expect(size.width).toBe(Math.floor(rect.width * 2));
    expect(size.height).toBe(Math.floor(rect.height * 2));
  });
});
