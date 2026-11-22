import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Shared mock functions so the @connectrpc/connect createClient mock can return them.
// vi.hoisted makes them accessible both inside vi.mock factories and in the test body.
const {
  mockExecute,
  mockOpenSession,
  mockRestore,
  mockSubscribe,
  mockCancel,
  mockCloseSession,
} = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockOpenSession: vi.fn(),
  mockRestore: vi.fn(),
  mockSubscribe: vi.fn(),
  mockCancel: vi.fn(),
  mockCloseSession: vi.fn(),
}));

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
    BrepReferenceSchema: {},
    BrepReference_Format: { BINARY: 1 },
  };
});

vi.mock('../../generated/proto/webcad/engine/v1/engine_pb.js', () => ({
  EngineGatewayService: {},
  RestoreRequestSchema: {},
  RestoreItemSchema: {},
  ExecuteRequestSchema: {},
  ExecuteResponse: class {},
  OpenSessionRequestSchema: {},
  SubscribeRequestSchema: {},
  CancelRequestSchema: {},
  CloseSessionRequestSchema: {},
  NeedsRehydrateEventSchema: {},
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));

vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({
    execute: mockExecute,
    openSession: mockOpenSession,
    restore: mockRestore,
    subscribe: mockSubscribe,
    cancel: mockCancel,
    closeSession: mockCloseSession,
  })),
}));

import { RemoteGrpcTransport, GrpcTransportError, ConnectionState } from '../RemoteGrpcTransport';

function makeTransport(overrides: Partial<ConstructorParameters<typeof RemoteGrpcTransport>[0]> = {}) {
  const config = {
    gatewayUrl: 'http://localhost:8080',
    sessionId: 'test-session-123',
    maxRetries: 2,
    baseBackoffMs: 10,
    maxBackoffMs: 100,
    jitter: 0,
    queueSize: 10,
    deadlineMs: 5000,
    heartbeatIntervalMs: 15000,
    heartbeatMissedThreshold: 3,
    includeBrep: false,
    timeoutMs: 5000,
    ...overrides,
  };

  const client = {
    execute: mockExecute,
    cancel: mockCancel,
    restore: mockRestore,
    subscribe: mockSubscribe,
    openSession: mockOpenSession,
  };

  const transport = new RemoteGrpcTransport(config as any);
  (transport as any).client = client;
  return { transport, client, config };
}

describe('RemoteGrpcTransport reconnect integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset mock call history between tests
    mockExecute.mockReset();
    mockOpenSession.mockReset();
    mockRestore.mockReset();
    mockSubscribe.mockReset();
    mockCancel.mockReset();
    mockCloseSession.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('session lost -> rehydrate-needed emitted -> retry succeeds via dedupe', async () => {
    const { transport } = makeTransport();

    const events: any[] = [];
    transport.addEventListener('rehydrate-needed', (e: Event) => {
      events.push((e as CustomEvent).detail);
    });

    // First call: session lost (SESSION_NOT_FOUND)
    mockExecute.mockRejectedValueOnce(new GrpcTransportError('SESSION_NOT_FOUND', 'session lost'));

    await expect(
      transport.createBox(0, 0, 0, 10, 10, 10, 0.1, 'entity-1')
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });

    // Verify rehydrate-needed was dispatched
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].sessionId).toBe('test-session-123');

    // Advance timers so the fire-and-forget attemptReconnect can complete
    await vi.advanceTimersByTimeAsync(100);

    // Gateway recovered: retry succeeds (dedupe returns prior result)
    mockExecute.mockResolvedValue({
      result: { case: 'success', value: { entityId: 'entity-1' } },
      mesh: undefined,
      brepRef: undefined,
    });

    const result = await transport.createBox(0, 0, 0, 10, 10, 10, 0.1, 'entity-1');
    expect(result).toBeDefined();
    expect(result.positions).toEqual([]);
    expect(result.indices).toEqual([]);
  });

  it('does not re-apply already-executed command on retry (dedupe)', async () => {
    const { transport } = makeTransport();

    // Simulate: command was applied on gateway but response was lost (network error)
    mockExecute.mockRejectedValueOnce(new Error('network disconnect'));

    // Second attempt: gateway dedupes and returns prior result
    mockExecute.mockResolvedValue({
      result: { case: 'success', value: { entityId: 'entity-1', alreadyApplied: true } },
      mesh: undefined,
      brepRef: undefined,
    });

    const promise = transport.createBox(0, 0, 0, 10, 10, 10, 0.1, 'entity-1');
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;
    expect(result).toBeDefined();

    // Verify execute was called twice (retry happened)
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('transitions through CONNECTING -> CONNECTED on init', async () => {
    const { transport } = makeTransport();

    const states: string[] = [];
    transport.addEventListener('statechange', (e: Event) => {
      states.push((e as CustomEvent).detail.state);
    });

    await transport.init();

    expect(states).toContain('CONNECTING');
    expect(states).toContain('CONNECTED');
    expect(transport.state).toBe(ConnectionState.CONNECTED);
  });

  it('emits statechange on reconnect after transient error', async () => {
    const { transport } = makeTransport();

    const states: string[] = [];
    transport.addEventListener('statechange', (e: Event) => {
      states.push((e as CustomEvent).detail.state);
    });

    // First call fails with retryable error
    mockExecute.mockRejectedValueOnce(new GrpcTransportError('UNAVAILABLE', 'gateway down'));
    // Retry succeeds
    mockExecute.mockResolvedValue({
      result: { case: 'success', value: {} },
      mesh: undefined,
      brepRef: undefined,
    });

    const promise = transport.createBox(0, 0, 0, 10, 10, 10, 0.1, 'entity-1');
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBeDefined();

    // Should have gone through RECONNECTING and back to CONNECTED
    expect(states).toContain(ConnectionState.RECONNECTING);
    expect(states).toContain(ConnectionState.CONNECTED);
  });

  it('restore() RPC sends BrepReference with format and sha256', async () => {
    const { transport } = makeTransport();

    mockRestore.mockResolvedValue({ restoredEntityIds: ['entity-1', 'entity-2'] });

    const result = await transport.restore([
      { entityId: 'entity-1', brepRefId: 'sha256-abc' },
      { entityId: 'entity-2', brepRefId: 'sha256-def' },
    ]);

    expect(result).toEqual(['entity-1', 'entity-2']);
    expect(mockRestore).toHaveBeenCalledTimes(1);
    const callArg = mockRestore.mock.calls[0][0];
    expect(callArg.items).toHaveLength(2);
    expect(callArg.items[0].entityId).toBe('entity-1');
    expect(callArg.items[0].source.case).toBe('brepRef');
    expect(callArg.items[0].source.value.format).toBe(1); // BINARY
    expect(callArg.items[0].source.value.sha256).toBe('sha256-abc');
  });
});
