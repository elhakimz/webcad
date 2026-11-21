import { chromium, type Browser, type Page } from '@playwright/test';
import * as path from 'path';

export interface SnapshotOptions {
  width?: number;
  height?: number;
  views?: ('iso' | 'top' | 'front' | 'right')[];
  outputDir?: string;
}

export interface SnapshotResult {
  view: string;
  pngBase64: string;
}

const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;

const VIEW_MAP: Record<string, string> = {
  iso: 'ISOMETRIC',
  top: 'TOP',
  front: 'FRONT',
  right: 'RIGHT',
};

/**
 * Headless renderer that drives Playwright to render CAD meshes to PNG
 * from fixed views with deterministic output for golden file diffing.
 *
 * Uses a headless Chromium instance loading `tests/snapshot/snapshot-host.html`
 * which exposes `window.__webcadSnapshot` for mesh loading, view setting,
 * and PNG capture.
 */
export class HeadlessRenderer {
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(private options: SnapshotOptions = {}) {}

  /** Launch headless Chromium and load the snapshot host page. */
  async init(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext({
      viewport: {
        width: this.options.width ?? DEFAULT_WIDTH,
        height: this.options.height ?? DEFAULT_HEIGHT,
      },
      deviceScaleFactor: 1,
    });
    this.page = await context.newPage();

    const hostPath = path.resolve(
      process.cwd(),
      'tests/snapshot/snapshot-host.html',
    );
    await this.page.goto(`file://${hostPath}`);

    await this.page.waitForFunction(
      () => !!(window as unknown as { __webcadSnapshot?: unknown }).__webcadSnapshot,
      { timeout: 15_000 },
    );
  }

  /**
   * Render a mesh from all configured views and return base64-encoded PNGs.
   *
   * @param positions - Flat array of [x, y, z, x, y, z, ...] vertex positions
   * @param indices - Flat array of triangle indices [i0, i1, i2, i3, i4, i5, ...]
   * @param colorIndex - ACI color index (7 = default light bluish-gray)
   */
  async renderMesh(
    positions: number[],
    indices: number[],
    colorIndex: number = 7,
  ): Promise<SnapshotResult[]> {
    if (!this.page) {
      throw new Error('HeadlessRenderer not initialized. Call init() first.');
    }

    await this.page.evaluate(
      ({ positions, indices, colorIndex }) => {
        (window as unknown as { __webcadSnapshot: { loadMesh: (p: number[], i: number[], c?: number) => void } }).__webcadSnapshot.loadMesh(positions, indices, colorIndex);
      },
      { positions, indices, colorIndex },
    );

    const views = this.options.views ?? ['iso', 'top', 'front', 'right'];
    const results: SnapshotResult[] = [];

    for (const view of views) {
      const viewName = VIEW_MAP[view];
      if (!viewName) {
        throw new Error(`Unknown view: ${view}`);
      }

      await this.page.evaluate(
        (viewName: string) => {
          (window as unknown as { __webcadSnapshot: { setView: (v: string) => void } }).__webcadSnapshot.setView(viewName);
        },
        viewName,
      );

      const pngBase64 = await this.page.evaluate(() => {
        const dataUrl = (window as unknown as { __webcadSnapshot: { capturePNG: () => string } }).__webcadSnapshot.capturePNG();
        return dataUrl.split(',')[1]; // strip "data:image/png;base64,"
      });

      results.push({ view, pngBase64 });
    }

    return results;
  }

  /** Close the browser and release resources. */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

/**
 * Generate a box (cube) mesh from min/max corner coordinates.
 * Returns positions and indices suitable for HeadlessRenderer.renderMesh().
 */
export function createBoxMesh(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): { positions: number[]; indices: number[] } {
  const positions: number[] = [
    // bottom face (z = minZ)
    minX, minY, minZ,
    maxX, minY, minZ,
    maxX, maxY, minZ,
    minX, maxY, minZ,
    // top face (z = maxZ)
    minX, minY, maxZ,
    maxX, minY, maxZ,
    maxX, maxY, maxZ,
    minX, maxY, maxZ,
  ];

  const indices: number[] = [
    // bottom
    0, 1, 2, 0, 2, 3,
    // top
    4, 5, 6, 4, 6, 7,
    // front (y = minY)
    0, 1, 5, 0, 5, 4,
    // right (x = maxX)
    1, 2, 6, 1, 6, 5,
    // back (y = maxY)
    2, 3, 7, 2, 7, 6,
    // left (x = minX)
    3, 0, 4, 3, 4, 7,
  ];

  return { positions, indices };
}
