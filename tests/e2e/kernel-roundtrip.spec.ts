import { test, expect } from '@playwright/test';

test.describe('Kernel round-trip via Connect', () => {
  test('create box → MeshData returned', async ({ page }) => {
    // Connect through RemoteGrpcTransport → EngineGatewayService → kernel
    // Verify MeshData is returned and rendered
    test.skip(true, 'Requires native OCCT kernel binary built and running');
  });

  test('Kernel crash recovery: crash → REHYDRATING → Restore → replay', async ({ page }) => {
    // Kill kernel process, verify session recovers
    test.skip(true, 'Requires native OCCT kernel binary built and running');
  });
});
