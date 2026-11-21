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
    expect(report.totalParts).toBe(report.results.length);
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

  it('create_box with include_brep returns MeshData', async () => {
    await adapter.init();
    const results = await adapter.execute({
      name: 'mesh_box_test',
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [
        {
          name: 'create_box',
          parameters: {
            x: 0, y: 0, z: 0,
            dx: 2, dy: 2, dz: 2,
            deflection: 0.1,
            entity_id: 'mesh_box',
            include_brep: true,
          },
        },
      ],
    });

    const result = results[0];
    expect(result.success).toBe(true);
    expect(result.mesh).toBeDefined();
    const mesh = result.mesh!;

    // positions: xyz triplets (float32)
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.positions.length % 3).toBe(0);

    // indices: triangle indices (uint32)
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.indices.length % 3).toBe(0);

    // face_mapping: one int32 per triangle
    expect(mesh.faceMapping.length).toBe(mesh.indices.length / 3);

    // edge_offsets: N+1 entries for N edges
    expect(mesh.edgeOffsets.length).toBeGreaterThan(0);
    expect(mesh.edgeOffsets[0]).toBe(0);

    // edge_lines: packed [x1,y1,z1,x2,y2,z2,...]
    expect(mesh.edgeLines.length).toBeGreaterThan(0);
    expect(mesh.edgeLines.length % 3).toBe(0);

    // Cube with deflection 0.1 should produce a reasonable number of vertices/faces
    // A 2x2x2 box face is 2x2, meshed at 0.1 deflection => ~20x20 grid per face
    // At minimum we expect multiple triangles
    expect(mesh.indices.length).toBeGreaterThanOrEqual(12); // at least 2 triangles per face * 6 faces
  }, 60000);

  it('create_box without include_brep returns no MeshData', async () => {
    await adapter.init();
    const results = await adapter.execute({
      name: 'no_mesh_box_test',
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [
        {
          name: 'create_box',
          parameters: {
            x: 0, y: 0, z: 0,
            dx: 2, dy: 2, dz: 2,
            deflection: 0.1,
            entity_id: 'no_mesh_box',
            // include_brep not set -> defaults to false
          },
        },
      ],
    });

    const result = results[0];
    expect(result.success).toBe(true);
    expect(result.mesh).toBeUndefined();
  }, 60000);

  it('fillet_solid multi-edge: fillets all 12 edges of a cube in ONE operation and exports STEP', async () => {
    await adapter.init();
    const all12Edges = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const results = await adapter.execute({
      name: 'fillet_all_12_edges_test',
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [
        {
          name: 'create_box',
          parameters: {
            x: 0, y: 0, z: 0,
            dx: 2, dy: 2, dz: 2,
            deflection: 0.1,
            entity_id: 'fillet_12_box',
          },
        },
        {
          name: 'fillet_solid',
          parameters: {
            entity_id: 'fillet_12_box',
            edge_indices: all12Edges,
            radius: 0.2,
            deflection: 0.1,
          },
        },
        {
          name: 'step_export',
          parameters: {
            entity_id: 'fillet_12_box',
          },
        },
      ],
    });

    // Step 0: create_box
    expect(results[0].success).toBe(true);
    expect(results[0].metrics.faceCount).toBe(6);
    expect(results[0].metrics.edgeCount).toBe(12);

    // Step 1: fillet_solid (all 12 edges in 1 operation)
    const filletResult = results[1];
    expect(filletResult.success).toBe(true);
    expect(filletResult.shapeId).toBe('fillet_12_box');
    expect(filletResult.metrics.valid).toBe(true);
    expect(filletResult.metrics.faceCount).toBe(26);
    expect(filletResult.metrics.volume).toBeGreaterThan(7.0);
    expect(filletResult.metrics.volume).toBeLessThan(8.0);

    // Step 2: step_export
    const stepResult = results[2];
    expect(stepResult.success).toBe(true);
    expect(stepResult.brepRef).toBeDefined();
    expect(stepResult.brepRef!.data).toBeDefined();
    expect(stepResult.brepRef!.data!.length).toBeGreaterThan(100);

    const stepText = Buffer.from(stepResult.brepRef!.data!).toString('utf-8');
    expect(stepText).toContain('ISO-10303-21;');
    expect(stepText).toContain('END-ISO-10303-21;');
  }, 60000);

  it('chamfer_solid multi-edge: chamfers all 12 edges of a cube in ONE operation and exports STEP', async () => {
    await adapter.init();
    const all12Edges = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const results = await adapter.execute({
      name: 'chamfer_all_12_edges_test',
      tolerances: { volume: 1e-4, surface: 1e-4, bbox: 1e-3, counts: 0 },
      steps: [
        {
          name: 'create_box',
          parameters: {
            x: 0, y: 0, z: 0,
            dx: 2, dy: 2, dz: 2,
            deflection: 0.1,
            entity_id: 'chamfer_12_box',
          },
        },
        {
          name: 'chamfer_solid',
          parameters: {
            entity_id: 'chamfer_12_box',
            edge_indices: all12Edges,
            radius: 0.2,
            deflection: 0.1,
          },
        },
        {
          name: 'step_export',
          parameters: {
            entity_id: 'chamfer_12_box',
          },
        },
      ],
    });

    // Step 0: create_box
    expect(results[0].success).toBe(true);

    // Step 1: chamfer_solid (all 12 edges in 1 operation)
    const chamferResult = results[1];
    expect(chamferResult.success).toBe(true);
    expect(chamferResult.shapeId).toBe('chamfer_12_box');
    expect(chamferResult.metrics.valid).toBe(true);
    expect(chamferResult.metrics.faceCount).toBe(26);
    expect(chamferResult.metrics.volume).toBeGreaterThan(7.0);
    expect(chamferResult.metrics.volume).toBeLessThan(8.0);

    // Step 2: step_export
    const stepResult = results[2];
    expect(stepResult.success).toBe(true);
    expect(stepResult.brepRef).toBeDefined();
    expect(stepResult.brepRef!.data).toBeDefined();
    expect(stepResult.brepRef!.data!.length).toBeGreaterThan(100);

    const stepText = Buffer.from(stepResult.brepRef!.data!).toString('utf-8');
    expect(stepText).toContain('ISO-10303-21;');
    expect(stepText).toContain('END-ISO-10303-21;');
  }, 60000);
});
