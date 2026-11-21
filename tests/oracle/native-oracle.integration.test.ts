import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import { NativeKernelAdapter } from '../../src/core/harness/native-kernel-adapter';
import { OracleRunner } from '../../src/core/oracle/oracle-runner';

describe('Native kernel oracle integration (localhost:50051)', () => {
  let adapter: NativeKernelAdapter;
  let runner: OracleRunner;

  beforeAll(async () => {
    adapter = new NativeKernelAdapter('localhost:50051');
    runner = new OracleRunner();
    runner.loadFixtures(path.resolve(__dirname, '../../tests/fixtures/oracle'));
  });

  afterAll(async () => {
    if (adapter.cleanup) await adapter.cleanup();
  });

  it('all reference parts pass against native kernel', async () => {
    const report = await runner.run(adapter);
    console.log('ORACLE REPORT:', JSON.stringify(report, null, 2));
    expect(report.failedParts).toBe(0);
    expect(report.passedParts).toBe(report.totalParts);
    expect(report.totalParts).toBe(16);
    for (const result of report.results) {
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  }, 60000);

  it('extract_face_profile returns 2D loops for cube face', async () => {
    await adapter.init();
    // First create a cube, then extract profile from one of its faces
    const createResult = await adapter.execute({
      name: 'extract_face_profile_test',
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [
        {
          name: 'create_box',
          parameters: {
            x: 0, y: 0, z: 0,
            dx: 2, dy: 2, dz: 2,
            deflection: 0.1,
            entity_id: 'cube_for_profile',
          },
        },
        {
          name: 'extract_face_profile',
          parameters: {
            entity_id: 'cube_for_profile',
            face_index: 0,
            deflection: 0.1,
          },
        },
      ],
    });

    const profileResult = createResult[1];
    expect(profileResult.success).toBe(true);
    expect(profileResult.loops).toBeDefined();
    expect(profileResult.loops!.length).toBe(1);

    const loop = profileResult.loops![0];
    expect(loop.points.length).toBeGreaterThanOrEqual(3);

    // A cube face profile should be a square of side 2
    // Collect unique (x,y) coordinates
    const coords = loop.points.map(p => ({ x: p.x, y: p.y }));
    const xs = [...new Set(coords.map(c => Math.round(c.x * 1000) / 1000))];
    const ys = [...new Set(coords.map(c => Math.round(c.y * 1000) / 1000))];
    expect(xs.length).toBe(2);
    expect(ys.length).toBe(2);
    expect(Math.abs(xs[1] - xs[0])).toBeCloseTo(2, 4);
    expect(Math.abs(ys[1] - ys[0])).toBeCloseTo(2, 4);
  }, 60000);
});
