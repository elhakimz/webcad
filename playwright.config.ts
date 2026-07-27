import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  /**
   * Each page boots an OpenCascade WASM kernel and a Three.js WebGL context that
   * headless Chromium rasterises in software. That is CPU-bound, so stacking
   * contexts does not just slow the suite down — pages stop reaching
   * `domcontentloaded` inside any sane timeout. Measured on a 16-core box:
   * 4 workers → most tests time out; 2 workers → stable.
   */
  workers: process.env.CI ? 1 : 2,

  /** A cold boot plus a multi-step command flow does not fit in the 30s default. */
  timeout: 90_000,
  expect: { timeout: 15_000 },

  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
    /**
     * Set UAT_SLOWMO to watch a run happen at human speed, e.g.
     *   UAT_SLOWMO=300 npx playwright test uat --headed --workers=1
     */
    launchOptions: {
      slowMo: process.env.UAT_SLOWMO ? Number(process.env.UAT_SLOWMO) : 0,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
