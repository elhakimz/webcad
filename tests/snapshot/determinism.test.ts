import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HeadlessRenderer, createBoxMesh } from '../../src/render/HeadlessRenderer';

describe('HeadlessRenderer determinism', () => {
  let renderer: HeadlessRenderer;

  beforeAll(async () => {
    renderer = new HeadlessRenderer({
      width: 1024,
      height: 1024,
      views: ['iso', 'top', 'front', 'right'],
    });
    await renderer.init();
  }, 30_000);

  afterAll(async () => {
    await renderer.cleanup();
  });

  it('produces byte-identical PNGs across repeated renders of the same mesh', async () => {
    const mesh = createBoxMesh(-10, -10, -10, 10, 10, 10);

    const run1 = await renderer.renderMesh(mesh.positions, mesh.indices, 7);
    const run2 = await renderer.renderMesh(mesh.positions, mesh.indices, 7);

    expect(run1).toHaveLength(4);
    expect(run2).toHaveLength(4);

    for (let i = 0; i < run1.length; i++) {
      expect(run1[i].view).toBe(run2[i].view);
      expect(run1[i].pngBase64).toBe(run2[i].pngBase64);
    }
  });

  it('produces distinct PNGs for different views', async () => {
    const mesh = createBoxMesh(-10, -10, -10, 10, 10, 10);

    const results = await renderer.renderMesh(mesh.positions, mesh.indices, 7);

    const views = results.map((r) => r.view);
    expect(views).toEqual(['iso', 'top', 'front', 'right']);

    // Each view should produce a different image (cube looks different from each angle)
    const pngs = results.map((r) => r.pngBase64);
    const uniquePngs = new Set(pngs);
    expect(uniquePngs.size).toBe(4);
  });
});
