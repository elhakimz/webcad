import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KernelGrpcTransport } from '../../../src/core/io/KernelGrpcTransport.js';
import { Point3DSchema, PolyhedronFaceSchema } from '../../../src/generated/proto/webcad/engine/v1/engine_pb.js';

// Mock kernelSupervisor
vi.mock('../../../src/core/gateway/kernel-supervisor.js', () => ({
  kernelSupervisor: {
    getKernelForSession: vi.fn(),
  },
}));

import { kernelSupervisor } from '../../../src/core/gateway/kernel-supervisor.js';

describe('KernelGrpcTransport.init()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates GrpcKernelClient from kernelSupervisor and marks initialized', async () => {
    const mockClient = { execute: vi.fn() };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect((transport as any).client).toBe(mockClient);
    expect((transport as any).initialized).toBe(true);
  });

  it('is idempotent — second call does not re-fetch client', async () => {
    const mockClient = { execute: vi.fn() };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.init();

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledTimes(1);
  });
});

describe('KernelGrpcTransport.clearCache()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with clear_cache op and returns success', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ success: true });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.clearCache();

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ clear_cache: {} })
    );
    expect(result).toEqual({ success: true });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ success: true });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.clearCache();

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });
});

describe('KernelGrpcTransport.releaseShapes()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with release_shapes op and entity_ids', async () => {
    const mockExecute = vi.fn().mockResolvedValue(undefined);
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.releaseShapes(['shape-1', 'shape-2']);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        release_shapes: { entity_ids: ['shape-1', 'shape-2'] },
      })
    );
  });
});

describe('KernelGrpcTransport.checkValidity()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with check_validity op and entity_id', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ isValid: true, faceCount: 6, errorMsg: '' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.checkValidity('shape-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        check_validity: { entity_id: 'shape-1' },
      })
    );
    expect(result).toEqual({ isValid: true, faceCount: 6, errorMsg: '' });
  });
});

describe('KernelGrpcTransport.exportBRep()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with export_brep op and entity_id', async () => {
    const mockExecute = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.exportBRep('shape-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        export_brep: { entity_id: 'shape-1' },
      })
    );
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('KernelGrpcTransport.importBRep()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with import_brep op, entity_id, brep_bytes, deflection', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ entityId: 'shape-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const brepBytes = new Uint8Array([0, 1, 2]);
    const result = await transport.importBRep('shape-1', brepBytes, 0.001);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        import_brep: { entity_id: 'shape-1', brep_bytes: brepBytes, deflection: 0.001 },
      })
    );
    expect(result).toEqual({ entityId: 'shape-1' });
  });
});

describe('KernelGrpcTransport.createBox()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_box op and box params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'box-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.createBox(0, 0, 0, 10, 10, 10, 0.001, 'box-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_box: {
          x: 0,
          y: 0,
          z: 0,
          dx: 10,
          dy: 10,
          dz: 10,
          deflection: 0.001,
          entityId: 'box-1',
        },
      })
    );
    expect(result).toEqual({ shapeId: 'box-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createBox(0, 0, 0, 5, 5, 5);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults deflection to 0 and entityId to empty string', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createBox(1, 2, 3, 4, 5, 6);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_box: expect.objectContaining({
          deflection: 0,
          entityId: '',
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.createCylinder()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_cylinder op and cylinder params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'cyl-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.createCylinder(0, 0, 0, 5, 10, 0.001, 'cyl-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_cylinder: {
          x: 0,
          y: 0,
          z: 0,
          r: 5,
          h: 10,
          deflection: 0.001,
          entityId: 'cyl-1',
        },
      })
    );
    expect(result).toEqual({ shapeId: 'cyl-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createCylinder(0, 0, 0, 5, 10);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults deflection to 0 and entityId to empty string', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createCylinder(1, 2, 3, 4, 5);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_cylinder: expect.objectContaining({
          deflection: 0,
          entityId: '',
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.createSphere()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_sphere op and sphere params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'sphere-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.createSphere(0, 0, 0, 5, 0.001, 'sphere-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_sphere: {
          x: 0,
          y: 0,
          z: 0,
          r: 5,
          deflection: 0.001,
          entityId: 'sphere-1',
        },
      })
    );
    expect(result).toEqual({ shapeId: 'sphere-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createSphere(0, 0, 0, 5);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults deflection to 0 and entityId to empty string', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createSphere(1, 2, 3, 4);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_sphere: expect.objectContaining({
          deflection: 0,
          entityId: '',
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.createCone()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_cone op and cone params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'cone-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.createCone(0, 0, 0, 5, 10, 0.001, 'cone-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_cone: {
          x: 0,
          y: 0,
          z: 0,
          r: 5,
          h: 10,
          deflection: 0.001,
          entityId: 'cone-1',
        },
      })
    );
    expect(result).toEqual({ shapeId: 'cone-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createCone(0, 0, 0, 5, 10);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults deflection to 0 and entityId to empty string', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createCone(1, 2, 3, 4, 5);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_cone: expect.objectContaining({
          deflection: 0,
          entityId: '',
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.createFrustum()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_frustum op and frustum params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'frustum-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.createFrustum(0, 0, 0, 5, 3, 10, 0.001, 'frustum-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_frustum: {
          x: 0,
          y: 0,
          z: 0,
          r1: 5,
          r2: 3,
          h: 10,
          deflection: 0.001,
          entityId: 'frustum-1',
        },
      })
    );
    expect(result).toEqual({ shapeId: 'frustum-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createFrustum(0, 0, 0, 5, 3, 10);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults deflection to 0 and entityId to empty string', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createFrustum(1, 2, 3, 4, 2, 5);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_frustum: expect.objectContaining({
          deflection: 0,
          entityId: '',
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.createTorus()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_torus op and torus params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'torus-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.createTorus(0, 0, 0, 5, 2, 0.001, 'torus-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_torus: {
          x: 0,
          y: 0,
          z: 0,
          r1: 5,
          r2: 2,
          deflection: 0.001,
          entityId: 'torus-1',
        },
      })
    );
    expect(result).toEqual({ shapeId: 'torus-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createTorus(0, 0, 0, 5, 2);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults deflection to 0 and entityId to empty string', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createTorus(1, 2, 3, 4, 2);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_torus: expect.objectContaining({
          deflection: 0,
          entityId: '',
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.createWedge()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_wedge op and wedge params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'wedge-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.createWedge(0, 0, 0, 10, 0, 10, 5, 0.001, 'wedge-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_wedge: {
          x1: 0,
          y1: 0,
          z1: 0,
          x2: 10,
          y2: 0,
          height: 10,
          ltx: 5,
          deflection: 0.001,
          entityId: 'wedge-1',
        },
      })
    );
    expect(result).toEqual({ shapeId: 'wedge-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createWedge(0, 0, 0, 10, 0, 10, 5);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults deflection to 0 and entityId to empty string', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createWedge(1, 2, 3, 4, 5, 6, 7);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_wedge: expect.objectContaining({
          deflection: 0,
          entityId: '',
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.createPyramid()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_pyramid op and pyramid params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'pyramid-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.createPyramid(0, 0, 0, 4, 5, 10, 0.001, 'pyramid-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_pyramid: {
          x: 0,
          y: 0,
          z: 0,
          sides: 4,
          radius: 5,
          h: 10,
          deflection: 0.001,
          entityId: 'pyramid-1',
        },
      })
    );
    expect(result).toEqual({ shapeId: 'pyramid-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createPyramid(0, 0, 0, 4, 5, 10);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults deflection to 0 and entityId to empty string', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createPyramid(1, 2, 3, 4, 5, 6);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_pyramid: expect.objectContaining({
          deflection: 0,
          entityId: '',
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.createPolyhedron()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_polyhedron op and polyhedron params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'polyhedron-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const points = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }];
    const faces = [[0, 1, 2]];
    const result = await transport.createPolyhedron(points, faces, 0.001, 'polyhedron-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_polyhedron: {
          pointsInline: [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
          ],
          faces: [{ vertexIndices: [0, 1, 2] }],
          deflection: 0.001,
          entityId: 'polyhedron-1',
        },
      })
    );
    expect(result).toEqual({ shapeId: 'polyhedron-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createPolyhedron([{ x: 0, y: 0, z: 0 }], [[0]]);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults deflection to 0 and entityId to empty string', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createPolyhedron(
      [{ x: 1, y: 2, z: 3 }],
      [[0]]
    );

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_polyhedron: expect.objectContaining({
          deflection: 0,
          entityId: '',
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.createConvexHull()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_convex_hull op and convex hull params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'convexhull-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const points = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }];
    const shapeIds = ['shape-1', 'shape-2'];
    const result = await transport.createConvexHull(points, shapeIds, 0.001, 'convexhull-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_convex_hull: {
          shapeIds: ['shape-1', 'shape-2'],
          pointsInline: [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
          ],
          deflection: 0.001,
          entityId: 'convexhull-1',
        },
      })
    );
    expect(result).toEqual({ shapeId: 'convexhull-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createConvexHull([{ x: 0, y: 0, z: 0 }]);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults deflection to 0 and entityId to empty string', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createConvexHull([{ x: 1, y: 2, z: 3 }]);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_convex_hull: expect.objectContaining({
          deflection: 0,
          entityId: '',
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.extractFaceProfile()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with extract_face_profile op, entity_id, face_index, deflection', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ loops: [] });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.extractFaceProfile('shape-1', 3, 0.001);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        extract_face_profile: { entity_id: 'shape-1', face_index: 3, deflection: 0.001 },
      })
    );
    expect(result).toEqual({ loops: [] });
  });
});

describe('KernelGrpcTransport.createExtrude()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_extrude op and extrude params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'extrude-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const points = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }];
    const result = await transport.createExtrude(points, 10.0, 2.0, 0.001, true, 'extrude-1', [0, 0, 1]);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_extrude: {
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
          ],
          height: 10.0,
          thickness: 2.0,
          deflection: 0.001,
          isClosed: true,
          entityId: 'extrude-1',
          vector: [0, 0, 1],
        },
      })
    );
    expect(result).toEqual({ shapeId: 'extrude-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createExtrude([{ x: 0, y: 0, z: 0 }], 5.0);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults thickness to 0, deflection to 0, isClosed to false, entityId to empty string, vector to []', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createExtrude([{ x: 1, y: 2, z: 3 }], 5.0);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_extrude: expect.objectContaining({
          thickness: 0,
          deflection: 0,
          isClosed: false,
          entityId: '',
          vector: [],
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.createRevolve()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_revolve op and revolve params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'revolve-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const points = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }];
    const result = await transport.createRevolve(points, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 360.0, 2.0, 0.001, true, 'revolve-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_revolve: {
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
          ],
          axisPoint: { x: 0, y: 0, z: 0 },
          axisDir: { x: 0, y: 0, z: 1 },
          angle: 360.0,
          thickness: 2.0,
          deflection: 0.001,
          isClosed: true,
          entityId: 'revolve-1',
        },
      })
    );
    expect(result).toEqual({ shapeId: 'revolve-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createRevolve([{ x: 0, y: 0, z: 0 }], { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 90.0);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults thickness to 0, deflection to 0, isClosed to false, entityId to empty string', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createRevolve([{ x: 1, y: 2, z: 3 }], { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 45.0);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_revolve: expect.objectContaining({
          thickness: 0,
          deflection: 0,
          isClosed: false,
          entityId: '',
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.createCompound()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_compound op and compound params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'compound-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.createCompound(['shape-1', 'shape-2'], 'compound-1', 0.001);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_compound: {
          childrenIds: ['shape-1', 'shape-2'],
          entityId: 'compound-1',
          deflection: 0.001,
        },
      })
    );
    expect(result).toEqual({ shapeId: 'compound-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createCompound(['shape-1'], 'compound-1');

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults deflection to 0', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createCompound(['shape-1'], 'compound-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_compound: expect.objectContaining({
          deflection: 0,
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.createSweep()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_sweep op and sweep params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'sweep-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const profilePoints = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }];
    const spinePoints = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }];
    const result = await transport.createSweep(profilePoints, spinePoints, true, 0.001, 'sweep-1', 2, 'tangent');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_sweep: {
          profilePoints: [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
          ],
          spinePoints: [
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 10 },
          ],
          isSolid: true,
          deflection: 0.001,
          entityId: 'sweep-1',
          profileCount: 2,
          cornerMode: 'tangent',
        },
      })
    );
    expect(result).toEqual({ shapeId: 'sweep-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createSweep([{ x: 0, y: 0, z: 0 }], [{ x: 0, y: 0, z: 0 }], true);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults deflection to 0, entityId to empty string, profileCount to 0, cornerMode to empty string', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createSweep([{ x: 1, y: 2, z: 3 }], [{ x: 0, y: 0, z: 0 }], true);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_sweep: expect.objectContaining({
          deflection: 0,
          entityId: '',
          profileCount: 0,
          cornerMode: '',
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.createLoft()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_loft op and loft params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'loft-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const profiles = [
      { id: 'p1', points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], closed: true },
      { id: 'p2', points: [{ x: 0, y: 0, z: 10 }, { x: 1, y: 0, z: 10 }], closed: true },
    ];
    const result = await transport.createLoft(profiles, true, false, 0.001, 'loft-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_loft: {
          profiles: [
            { id: 'p1', points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], closed: true },
            { id: 'p2', points: [{ x: 0, y: 0, z: 10 }, { x: 1, y: 0, z: 10 }], closed: true },
          ],
          isSolid: true,
          isRuled: false,
          deflection: 0.001,
          entityId: 'loft-1',
        },
      })
    );
    expect(result).toEqual({ shapeId: 'loft-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createLoft([{ id: 'p1', points: [{ x: 0, y: 0, z: 0 }], closed: true }], true, false);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults deflection to 0 and entityId to empty string', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createLoft([{ id: 'p1', points: [{ x: 1, y: 2, z: 3 }], closed: true }], true, false);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_loft: expect.objectContaining({
          deflection: 0,
          entityId: '',
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.createBoolean()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with create_boolean op and boolean params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'boolean-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.createBoolean('fuse', 'shape-a', 'shape-b', 'boolean-1', 0.001, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_boolean: {
          operation: 'fuse',
          idA: 'shape-a',
          idB: 'shape-b',
          entityId: 'boolean-1',
          deflection: 0.001,
          rotA: { x: 0, y: 0, z: 0 },
          rotB: { x: 0, y: 0, z: 0 },
          centerA: { x: 0, y: 0, z: 0 },
          centerB: { x: 0, y: 0, z: 0 },
        },
      })
    );
    expect(result).toEqual({ shapeId: 'boolean-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.createBoolean('cut', 'shape-a', 'shape-b', 'boolean-1');

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults deflection to 0 and optional Point3D fields to undefined', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.createBoolean('common', 'shape-a', 'shape-b', 'boolean-1');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        create_boolean: expect.objectContaining({
          deflection: 0,
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.multMatrixShape()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with mult_matrix_shape op and matrix params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'matrix-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const result = await transport.multMatrixShape('shape-1', m, 'target-1', 0.001);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        mult_matrix_shape: {
          entityId: 'shape-1',
          m,
          targetEntityId: 'target-1',
          deflection: 0.001,
        },
      })
    );
    expect(result).toEqual({ shapeId: 'matrix-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.multMatrixShape('shape-1', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults targetEntityId to empty string and deflection to 0', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.multMatrixShape('shape-1', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        mult_matrix_shape: expect.objectContaining({
          targetEntityId: '',
          deflection: 0,
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.transformShape()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with transform_shape op and dx/dy/dz params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'transform-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.transformShape('shape-1', 10, 20, 30, 'target-1', 0.001);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        transform_shape: {
          entityId: 'shape-1',
          dx: 10,
          dy: 20,
          dz: 30,
          targetEntityId: 'target-1',
          deflection: 0.001,
        },
      })
    );
    expect(result).toEqual({ shapeId: 'transform-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.transformShape('shape-1', 1, 2, 3);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults targetEntityId to empty string and deflection to 0', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.transformShape('shape-1', 1, 2, 3);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        transform_shape: expect.objectContaining({
          targetEntityId: '',
          deflection: 0,
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.rotateShape()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with rotate_shape op and rotation params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'rotate-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.rotateShape('shape-1', 45, 0, 0, 0, 0, 0, 'target-1', 0.001);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        rotate_shape: {
          entityId: 'shape-1',
          rx: 45,
          ry: 0,
          rz: 0,
          cx: 0,
          cy: 0,
          cz: 0,
          targetEntityId: 'target-1',
          deflection: 0.001,
        },
      })
    );
    expect(result).toEqual({ shapeId: 'rotate-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.rotateShape('shape-1', 90, 0, 0, 10, 20, 30);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults targetEntityId to empty string and deflection to 0', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.rotateShape('shape-1', 90, 0, 0, 10, 20, 30);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        rotate_shape: expect.objectContaining({
          targetEntityId: '',
          deflection: 0,
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.mirrorShape()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with mirror_shape op and p1/p2 params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'mirror-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 0, y: 1, z: 0 };
    const normal = { x: 0, y: 0, z: 1 };
    const result = await transport.mirrorShape('shape-1', p1, p2, 'target-1', 0.001, normal);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        mirror_shape: {
          entityId: 'shape-1',
          p1,
          p2,
          targetEntityId: 'target-1',
          deflection: 0.001,
          normal,
        },
      })
    );
    expect(result).toEqual({ shapeId: 'mirror-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.mirrorShape('shape-1', { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults targetEntityId to empty string and deflection to 0', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.mirrorShape('shape-1', { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        mirror_shape: expect.objectContaining({
          targetEntityId: '',
          deflection: 0,
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.scaleShape()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with scale_shape op and scale params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'scale-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const result = await transport.scaleShape('shape-1', 2.0, 0, 0, 0, 'target-1', 0.001, 2.0, 2.0, 2.0);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        scale_shape: {
          entityId: 'shape-1',
          factor: 2.0,
          cx: 0,
          cy: 0,
          cz: 0,
          targetEntityId: 'target-1',
          deflection: 0.001,
          factorX: 2.0,
          factorY: 2.0,
          factorZ: 2.0,
        },
      })
    );
    expect(result).toEqual({ shapeId: 'scale-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.scaleShape('shape-1', undefined, 10, 20, 30);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults targetEntityId to empty string and deflection to 0', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.scaleShape('shape-1', undefined, 10, 20, 30);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        scale_shape: expect.objectContaining({
          targetEntityId: '',
          deflection: 0,
        }),
      })
    );
  });
});

describe('KernelGrpcTransport.filletSolid()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls client.execute with fillet_solid op and fillet params', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ shapeId: 'fillet-1' });
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    const visualP1 = { x: 0, y: 0, z: 0 };
    const visualP2 = { x: 1, y: 1, z: 1 };
    const result = await transport.filletSolid('shape-1', 5, 2.5, 0.001, visualP1, visualP2);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        fillet_solid: {
          entityId: 'shape-1',
          edgeIndex: 5,
          radius: 2.5,
          deflection: 0.001,
          visualP1,
          visualP2,
        },
      })
    );
    expect(result).toEqual({ shapeId: 'fillet-1' });
  });

  it('calls init before executing', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.filletSolid('shape-1', 3, 1.0);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockExecute).toHaveBeenCalled();
  });

  it('defaults deflection to 0 and optional visual points to undefined', async () => {
    const mockExecute = vi.fn().mockResolvedValue({});
    const mockClient = { execute: mockExecute };
    (kernelSupervisor.getKernelForSession as any).mockResolvedValue(mockClient);

    const transport = new KernelGrpcTransport('session-1');
    await transport.init();
    await transport.filletSolid('shape-1', 3, 1.0);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        fillet_solid: expect.objectContaining({
          deflection: 0,
          visualP1: undefined,
          visualP2: undefined,
        }),
      })
    );
  });
});
