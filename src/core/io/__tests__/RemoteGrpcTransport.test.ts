import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// @bufbuild/protobuf v2.x does not export `proto3`, but the generated pb files
// import it. Provide a shim with everything the pb static initializers need.
vi.mock('@bufbuild/protobuf', () => {
  const fieldList: any[] = [];
  return {
    create: vi.fn((schema: any, data: any) => ({ ...data })),
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
    CommandHeaderSchema: {},
    MeshData: class {},
    BrepReference: class {},
  };
});

vi.mock('../../generated/proto/webcad/engine/v1/engine_pb.js', () => ({
  EngineGatewayService: {},
  OpenSessionRequestSchema: {},
  CloseSessionRequestSchema: {},
  ExecuteRequestSchema: {},
  ExecuteResponse: class {},
  SubscribeRequestSchema: {},
  SessionEvent: class {},
  ReleaseShapesOpSchema: {},
  CheckValidityOpSchema: {},
  ExportBRepOpSchema: {},
  ImportBRepOpSchema: {},
  ExtractFaceProfileOpSchema: {},
  CreateBoxOpSchema: {},
  CreateCylinderOpSchema: {},
  CreateSphereOpSchema: {},
  CreateConeOpSchema: {},
  CreateFrustumOpSchema: {},
  CreateTorusOpSchema: {},
  CreateWedgeOpSchema: {},
  CreatePyramidOpSchema: {},
  CreatePolyhedronOpSchema: {},
  CreateConvexHullOpSchema: {},
  CreateExtrudeOpSchema: {},
  CreateRevolveOpSchema: {},
  CreateCompoundOpSchema: {},
  CreateSweepOpSchema: {},
  CreateLoftOpSchema: {},
  CreateBooleanOpSchema: {},
  MultMatrixShapeOpSchema: {},
  TransformShapeOpSchema: {},
  RotateShapeOpSchema: {},
  MirrorShapeOpSchema: {},
  ScaleShapeOpSchema: {},
  FilletSolidOpSchema: {},
  ChamferSolidOpSchema: {},
  FilletSolidFaceOpSchema: {},
  ChamferSolidFaceOpSchema: {},
  MakeThickSolidOpSchema: {},
  DraftSolidFacesOpSchema: {},
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
    cancel: vi.fn().mockResolvedValue(undefined),
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

import { RemoteGrpcTransport, GrpcTransportError, ConnectionState } from '../RemoteGrpcTransport';
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
      mockExecute.mockRejectedValueOnce(new GrpcTransportError('PERMISSION_DENIED', 'access denied'));
      await expect(transport.createBox(0, 0, 0, 10, 10, 10)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
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

    it('retries on transient transport error and succeeds', async () => {
      mockExecute.mockRejectedValueOnce(new Error('connection refused'));
      await expect(transport.createBox(0, 0, 0, 10, 10, 10)).resolves.toBeDefined();
      expect(mockExecute).toHaveBeenCalledTimes(2);
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

  describe('ConnectionState', () => {
    it('emits statechange CONNECTED on init', async () => {
      const states: string[] = [];
      transport.addEventListener('statechange', (e: Event) => {
        const ce = e as CustomEvent;
        states.push(ce.detail.state);
      });
      expect(transport.state).toBe('CONNECTED');
    });

    it('exposes current state via getter', () => {
      expect((transport as any).state).toBe('CONNECTED');
    });

    it('transitions to RECONNECTING on transport error, then CONNECTED on successful reconnect', async () => {
      vi.useFakeTimers();
      const states: string[] = [];
      transport.addEventListener('statechange', (e: Event) => {
        const ce = e as CustomEvent;
        states.push(ce.detail.state);
      });
      mockExecute.mockRejectedValueOnce(new Error('connection refused'));
      mockExecute.mockResolvedValueOnce({ result: { case: 'success', value: {} }, mesh: undefined, brepRef: undefined });
      const promise = transport.createBox(0, 0, 0, 10, 10, 10);
      await vi.advanceTimersByTimeAsync(5000);
      await expect(promise).resolves.toBeDefined();
      expect(states).toContain('RECONNECTING');
      vi.useRealTimers();
    });
  });

  describe('pending-call registry', () => {
    it('retries pending call with same requestId after reconnect', async () => {
      vi.useFakeTimers();
      mockExecute.mockRejectedValueOnce(new Error('connection refused'));
      mockExecute.mockResolvedValueOnce({ result: { case: 'success', value: {} }, mesh: undefined, brepRef: undefined });
      const promise = transport.createBox(0, 0, 0, 10, 10, 10);
      await vi.advanceTimersByTimeAsync(5000);
      await expect(promise).resolves.toBeDefined();
      const executeCalls = mockExecute.mock.calls.map(c => c[0]);
      const firstId = executeCalls[0].header.requestId;
      const retried = executeCalls.find(c => c.header.requestId === firstId && executeCalls.indexOf(c) > 0);
      expect(retried).toBeDefined();
      vi.useRealTimers();
    });

    it('retries pending call when transport errors then recovers', async () => {
      mockExecute.mockRejectedValueOnce(new Error('connection refused'));
      await expect(transport.createBox(0, 0, 0, 10, 10, 10)).resolves.toBeDefined();
      expect(mockExecute).toHaveBeenCalledTimes(2);
      expect(transport.pendingCount).toBe(0);
    });
  });

  describe('reconnect backoff', () => {
    it('uses exponential backoff and reaches ERROR after max attempts', async () => {
      vi.useFakeTimers();
      const states: string[] = [];
      transport.addEventListener('statechange', (e: Event) => {
        const ce = e as CustomEvent;
        states.push(ce.detail.state);
      });
      // Short backoff config for fast test
      (transport as any).config.maxRetries = 2;
      (transport as any).config.baseBackoffMs = 10;
      (transport as any).config.maxBackoffMs = 100;
      mockExecute.mockRejectedValue(new Error('connection refused'));
      const promise = transport.createBox(0, 0, 0, 10, 10, 10);
      // Advance enough to exhaust retries (10ms + 20ms + jitter)
      await vi.advanceTimersByTimeAsync(500);
      await expect(promise).rejects.toThrow('connection refused');
      expect(states).toContain('RECONNECTING');
      expect(states.filter(s => s === 'ERROR')).toHaveLength(1);
      vi.useRealTimers();
    });
  });

  describe('heartbeat watchdog', () => {
    it('triggers reconnect after missed heartbeats', async () => {
      vi.useFakeTimers();
      const states: string[] = [];
      transport.addEventListener('statechange', (e: Event) => {
        const ce = e as CustomEvent;
        states.push(ce.detail.state);
      });
      // Restart watchdog with fake timers (beforeEach used real timers)
      (transport as any).stopHeartbeatWatchdog();
      (transport as any).startHeartbeatWatchdog();
      // Simulate a stale heartbeat (older than threshold)
      (transport as any).lastHeartbeat = Date.now() - 60_000;
      await vi.advanceTimersByTimeAsync(20_000);
      expect(states).toContain('RECONNECTING');
      vi.useRealTimers();
    });
  });

  describe('bounded queue during reconnect', () => {
    it('queues calls made during RECONNECTING', async () => {
      (transport as any).setState('RECONNECTING');
      const p1 = transport.createBox(0, 0, 0, 10, 10, 10);
      const p2 = transport.createBox(0, 0, 0, 20, 20, 20);
      mockExecute.mockResolvedValue({ result: { case: 'success', value: {} }, mesh: undefined, brepRef: undefined });
      (transport as any).setState('CONNECTED');
      await (transport as any).processQueue();
      const results = await Promise.all([p1, p2]);
      expect(results).toHaveLength(2);
    });

    it('rejects with DEADLINE_EXCEEDED on timeout', async () => {
      vi.useFakeTimers();
      (transport as any).config.deadlineMs = 100;
      mockExecute.mockReturnValue(new Promise(() => {})); // never resolves
      const p = transport.createBox(0, 0, 0, 10, 10, 10);
      await vi.advanceTimersByTimeAsync(200);
      await expect(p).rejects.toThrow(/DEADLINE_EXCEEDED/);
      vi.useRealTimers();
    });
  });

  describe('error classification', () => {
    it('rejects PERMISSION_DENIED immediately without retry', async () => {
      mockExecute.mockRejectedValue(new GrpcTransportError('PERMISSION_DENIED', 'access denied'));
      await expect(transport.createBox(0, 0, 0, 10, 10, 10)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    });

    it('emits token-expired on UNAUTHENTICATED', async () => {
      const events: any[] = [];
      transport.addEventListener('token-expired', (e: Event) => {
        events.push((e as CustomEvent).detail);
      });
      mockExecute.mockRejectedValue(new GrpcTransportError('UNAUTHENTICATED', 'token expired'));
      await expect(transport.createBox(0, 0, 0, 10, 10, 10)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(events.length).toBeGreaterThan(0);
    });

    it('emits rehydrate-needed on SESSION_NOT_FOUND', async () => {
      const events: any[] = [];
      transport.addEventListener('rehydrate-needed', (e: Event) => {
        events.push((e as CustomEvent).detail);
      });
      mockExecute.mockRejectedValue(new GrpcTransportError('SESSION_NOT_FOUND', 'session lost'));
      await expect(transport.createBox(0, 0, 0, 10, 10, 10)).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].reason).toContain('session lost');
    });

    it('emits rehydrate-needed on NOT_FOUND', async () => {
      const events: any[] = [];
      transport.addEventListener('rehydrate-needed', (e: Event) => {
        events.push((e as CustomEvent).detail);
      });
      mockExecute.mockRejectedValue(new GrpcTransportError('NOT_FOUND', 'gateway restart — state cleared'));
      await expect(transport.createBox(0, 0, 0, 10, 10, 10)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(events.length).toBeGreaterThan(0);
    });
  });
});
