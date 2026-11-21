import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WasmKernelAdapter } from '../../src/core/harness/wasm-kernel-adapter';
import { chromium, type Browser, type Page } from '@playwright/test';
import { Script } from '../../src/core/harness/kernel-adapter';

vi.mock('@playwright/test', () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

describe('WasmKernelAdapter', () => {
  let mockPage: Page;
  let mockBrowser: Browser;

  beforeEach(() => {
    vi.resetAllMocks();

    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue({ success: true, payload: { volume: 1000, entityId: 'box_1' } }),
    } as unknown as Page;

    mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Browser;

    vi.mocked(chromium.launch).mockResolvedValue(mockBrowser);
  });

  it('creates a box and returns metrics', async () => {
    const adapter = new WasmKernelAdapter();
    await adapter.init();

    const script: Script = {
      name: 'test_box',
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [{ name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 } }],
    };
    const results = await adapter.execute(script);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].metrics.volume).toBe(1000);
    expect(results[0].shapeId).toBe('box_1');
  });

  it('fails gracefully on unknown command', async () => {
    vi.mocked(mockPage.evaluate).mockRejectedValue(new Error('Worker error: unknown command'));

    const adapter = new WasmKernelAdapter();
    await adapter.init();

    const script: Script = {
      name: 'test_bad',
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [{ name: 'nonexistent_op', parameters: {} }],
    };
    const results = await adapter.execute(script);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('Worker error');
  });
});
