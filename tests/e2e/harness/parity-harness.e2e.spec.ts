import { test, expect } from '@playwright/test';
import { ParityHarness } from '../../../src/core/harness/parity-harness';
import { WasmKernelAdapter } from '../../../src/core/harness/wasm-kernel-adapter';
import { NativeKernelAdapter } from '../../../src/core/harness/native-kernel-adapter';
import * as path from 'node:path';

test.skipUnless(
  !!process.env.KERNEL_ADDRESS,
  'parity harness E2E requires KERNEL_ADDRESS environment variable',
)('runs parity comparison between WASM and native kernel', async ({ page }) => {
  const wasmAdapter = new WasmKernelAdapter();
  const nativeAdapter = new NativeKernelAdapter(process.env.KERNEL_ADDRESS);

  const script = {
    name: 'e2e_box',
    tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
    steps: [{ name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 } }],
  };

  const harness = new ParityHarness();
  const result = await harness.run({
    script,
    wasmAdapter,
    nativeAdapter,
    reportPath: path.resolve(process.cwd(), 'reports/parity-e2e-box.json'),
  });

  expect(result.report.summary.totalSteps).toBe(1);
  expect(result.wasmResults).toHaveLength(1);
  expect(result.nativeResults).toHaveLength(1);
});
