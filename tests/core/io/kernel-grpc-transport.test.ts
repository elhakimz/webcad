import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KernelGrpcTransport } from '../../../src/core/io/KernelGrpcTransport.js';

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
