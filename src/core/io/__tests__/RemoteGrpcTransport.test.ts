import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// @bufbuild/protobuf v2.x does not export `proto3`, but the generated pb files
// import it. Provide a shim with everything the pb static initializers need.
vi.mock('@bufbuild/protobuf', () => {
  const fieldList: any[] = [];
  return {
    Message: class {
      static runtime: any;
      static typeName: string;
      static fields: any[] = [];
      constructor(data?: any) { if (data) Object.assign(this, data); }
      toBinary() { return new Uint8Array(); }
      static fromBinary() { return new this(); }
    },
    proto3: {
      util: {
        newFieldList: (fn: any) => { fieldList.push(fn); return fieldList; },
        setEnumType: () => {},
        getEnumType: () => ({}),
      },
      getEnumType: () => ({}),
    },
    protoInt64: { fromNumber: (n: number) => ({ toNumber: () => n }), toNumber: () => 0 },
    MethodKind: { Unary: 0, ServerStreaming: 1, ClientStreaming: 2, BidiStreaming: 3 },
  };
});

// Mock the generated protobuf modules so their static initializers (which need
// proto3 from @bufbuild/protobuf) never run. Match the import paths used by
// RemoteGrpcTransport.ts and engine_pb.ts (with .js extensions for ESM).
vi.mock('../../generated/proto/webcad/engine/v1/common_pb.js', () => {
  const ExecutionFailureCode = {
    UNSPECIFIED: 0,
    MISSING_ENTITY: 1,
    INVALID_PARAMETER: 2,
    INVALID_PROFILE: 3,
    UNSUPPORTED: 4,
    OPERATION_FAILED: 5,
    GEOMETRY_EMPTY: 6,
    IMPORT_FAILED: 7,
    EXPORT_FAILED: 8,
    BLOB_TOO_LARGE: 9,
    SESSION_NOT_FOUND: 10,
    UPLOAD_NOT_FOUND: 11,
    RESULT_NOT_FOUND: 12,
    QUOTA_EXCEEDED: 13,
  } as const;
  return {
    ExecutionFailureCode,
    CommandHeader: class {},
    MeshData: class {},
    BrepReference: class {},
  };
});

vi.mock('../../generated/proto/webcad/engine/v1/engine_pb.js', () => ({
  InitOp: class {}, ClearCacheOp: class {}, ReleaseShapesOp: class {}, CheckValidityOp: class {},
  ExportBRepOp: class {}, ImportBRepOp: class {}, ExtractFaceProfileOp: class {}, CreateBoxOp: class {},
  CreateCylinderOp: class {}, CreateSphereOp: class {}, CreateConeOp: class {}, CreateFrustumOp: class {},
  CreateTorusOp: class {}, CreateWedgeOp: class {}, CreatePyramidOp: class {}, CreatePolyhedronOp: class {},
  CreateConvexHullOp: class {}, CreateExtrudeOp: class {}, CreateRevolveOp: class {}, CreateCompoundOp: class {},
  CreateSweepOp: class {}, CreateLoftOp: class {}, CreateBooleanOp: class {}, MultMatrixShapeOp: class {},
  TransformShapeOp: class {}, RotateShapeOp: class {}, MirrorShapeOp: class {}, ScaleShapeOp: class {},
  FilletSolidOp: class {}, ChamferSolidOp: class {}, FilletSolidFaceOp: class {}, ChamferSolidFaceOp: class {},
  MakeThickSolidOp: class {}, DraftSolidFacesOp: class {},
  ExecuteResponse: class {},
  SessionEvent: class {},
}));

vi.mock('../../generated/proto/webcad/engine/v1/engine_connect.js', () => ({
  EngineGatewayService: { typeName: 'webcad.engine.v1.EngineGatewayService', methods: {} },
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));

// Mock functions defined via vi.hoisted so they are accessible both in the
// vi.mock factory and in the test file without importing from the mocked
// module (which would fail type-checking since @connectrpc/connect doesn't
// actually export mockExecute etc.).
const { mockExecute, mockOpenSession, mockSubscribe, mockCloseSession } =
  vi.hoisted(() => ({
    mockExecute: vi.fn(),
    mockOpenSession: vi.fn(),
    mockSubscribe: vi.fn(),
    mockCloseSession: vi.fn(),
  }));

vi.mock('@connectrpc/connect', () => {
  const mockClient = {
    execute: mockExecute,
    openSession: mockOpenSession,
    subscribe: mockSubscribe,
    closeSession: mockCloseSession,
  };
  return {
    createClient: vi.fn(() => mockClient),
    mockExecute,
    mockOpenSession,
    mockSubscribe,
    mockCloseSession,
    mockClient,
  };
});

import { RemoteGrpcTransport } from '../RemoteGrpcTransport';
import { createConnectTransport } from '@connectrpc/connect-web';

describe('RemoteGrpcTransport', () => {
  let transport: RemoteGrpcTransport;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({
      result: { case: 'success', value: {} },
      mesh: undefined,
      brepRef: undefined,
    });
    mockOpenSession.mockResolvedValue(undefined);

    transport = new RemoteGrpcTransport({
      gatewayUrl: 'http://localhost:8080',
      sessionId: 'test-session-123',
      includeBrep: true,
      timeoutMs: 5000,
    });
    await transport.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('creates a Connect client with the gateway URL', () => {
      expect(createConnectTransport).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:8080',
      });
    });

    it('generates a session ID when none provided', async () => {
      const t = new RemoteGrpcTransport({ gatewayUrl: 'http://localhost:8080' });
      await t.init();
      expect((t as any).sessionId).toBeDefined();
      expect(typeof (t as any).sessionId).toBe('string');
      expect((t as any).sessionId.length).toBeGreaterThan(0);
    });
  });

  describe('pendingCount', () => {
    it('starts at 0', () => {
      expect(transport.pendingCount).toBe(0);
    });

    it('increments during an execute call and decrements after', async () => {
      mockExecute.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => {
          resolve({ result: { case: 'success', value: {} }, mesh: undefined, brepRef: undefined });
        }, 50);
      }));

      const promise = transport.createBox(0, 0, 0, 10, 10, 10);
      expect(transport.pendingCount).toBe(1);
      await promise;
      expect(transport.pendingCount).toBe(0);
    });

    it('decrements pendingCount even when the call throws', async () => {
      mockExecute.mockRejectedValue(new Error('kernel error'));
      await expect(transport.createBox(0, 0, 0, 10, 10, 10)).rejects.toThrow('kernel error');
      expect(transport.pendingCount).toBe(0);
    });
  });

  describe('header generation', () => {
    it('increments clientSeq on each call', async () => {
      await transport.createBox(0, 0, 0, 10, 10, 10, undefined, 'e1');
      await transport.createBox(0, 0, 0, 10, 10, 10, undefined, 'e2');

      expect(mockExecute).toHaveBeenCalledTimes(2);
      const firstCall = mockExecute.mock.calls[0][0];
      const secondCall = mockExecute.mock.calls[1][0];
      expect(firstCall.header.clientSeq).toBe(1n);
      expect(secondCall.header.clientSeq).toBe(2n);
    });

    it('sets sessionId from config', async () => {
      await transport.createBox(0, 0, 0, 10, 10, 10, undefined, 'e1');
      const call = mockExecute.mock.calls[0][0];
      expect(call.header.sessionId).toBe('test-session-123');
    });

    it('passes x-session-id header', async () => {
      await transport.createBox(0, 0, 0, 10, 10, 10, undefined, 'e1');
      const opts = mockExecute.mock.calls[0][1];
      expect(opts.headers['x-session-id']).toBe('test-session-123');
    });
  });

  describe('error handling', () => {
    it('throws GrpcTransportError on execution failure', async () => {
      mockExecute.mockResolvedValue({
        result: {
          case: 'failure',
          value: { code: 3, message: 'shape not found', details: [] },
        },
        mesh: undefined,
        brepRef: undefined,
      });

      await expect(transport.createBox(0, 0, 0, 10, 10, 10)).rejects.toThrow(/shape not found/);
    });

    it('throws on transport error (e.g. network)', async () => {
      mockExecute.mockRejectedValue(new Error('connection refused'));
      await expect(transport.createBox(0, 0, 0, 10, 10, 10)).rejects.toThrow('connection refused');
    });
  });

  describe('mesh data conversion (typed array alignment)', () => {
    it('copies misaligned Float32Array into a fresh number array', async () => {
      const buffer = new ArrayBuffer(20);
      const view = new DataView(buffer);
      view.setFloat32(0, 1.5, true);
      view.setFloat32(4, 2.5, true);
      view.setFloat32(8, 3.5, true);

      const positionsBytes = new Uint8Array(buffer, 1, 12);

      mockExecute.mockResolvedValue({
        result: { case: 'success', value: {} },
        mesh: {
          positions: positionsBytes,
          indices: new Uint8Array(),
          faceMapping: undefined,
          edgeLines: undefined,
          edgeOffsets: undefined,
        } as any,
        brepRef: undefined,
      });

      const result = await transport.createBox(0, 0, 0, 10, 10, 10);
      expect(result.positions.length).toBeGreaterThan(0);
    });

    it('handles edgeLines with offsets', async () => {
      const offsets = new Uint32Array([0, 2, 4]);
      const lines = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);

      mockExecute.mockResolvedValue({
        result: { case: 'success', value: {} },
        mesh: {
          positions: new Uint8Array(),
          indices: new Uint8Array(),
          faceMapping: undefined,
          edgeLines: lines,
          edgeOffsets: offsets,
        } as any,
        brepRef: undefined,
      });

      const result = await transport.createBox(0, 0, 0, 10, 10, 10);
      expect(result.edgeLines).toHaveLength(2);
    });
  });

  describe('closeSession', () => {
    it('calls closeSession on the client', async () => {
      await transport.closeSession();
      expect(mockCloseSession).toHaveBeenCalled();
    });
  });
});
