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
    // Headless Chromium here has no WebGPU adapter, and the WebGPU renderer is not
    // wired up yet in any case. Either way the run must not claim it got what it asked
    // for — that is the failure mode this exists to prevent.
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
