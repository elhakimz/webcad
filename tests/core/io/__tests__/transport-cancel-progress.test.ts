import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCascadeService } from '../../../../src/core/io/OpenCascadeService';
import { RemoteGrpcTransport } from '../../../../src/core/io/RemoteGrpcTransport';
import { SessionEvent } from '../../../../src/generated/proto/webcad/engine/v1/engine_pb';

describe('OpenCascadeService cancel + progress', () => {
  let service: OpenCascadeService;
  let transport: RemoteGrpcTransport;

  beforeEach(() => {
    service = OpenCascadeService.getInstance();
    transport = new RemoteGrpcTransport({ gatewayUrl: 'http://localhost:8080' });
    // Mock the client so init() isn't needed
    (transport as any).client = { execute: vi.fn(), cancel: vi.fn() };
    // Mock transport-level cancel/subscribe/unsubscribe as spies
    (transport as any).cancel = vi.fn().mockResolvedValue(undefined);
    (transport as any).subscribe = vi.fn().mockResolvedValue(undefined);
    (transport as any).unsubscribe = vi.fn();
    (service as any).transport = transport;
    // Reset singleton progress state across tests
    (service as any).progressCallbacks = new Set();
    (service as any).progressHandler = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (service as any).transport = null;
    (service as any).progressCallbacks = new Set();
    (service as any).progressHandler = null;
  });

  it('cancel passes through to transport', async () => {
    await service.cancel('req-123');
    expect((transport as any).cancel).toHaveBeenCalledWith('req-123');
  });

  it('cancel resolves when transport is not initialized', async () => {
    (service as any).transport = null;
    await expect(service.cancel('req-123')).resolves.toBeUndefined();
  });

  it('onProgress subscribes to transport and forwards progress events', async () => {
    const cb = vi.fn();
    service.onProgress(cb);

    expect(transport.subscribe).toHaveBeenCalled();

    // Simulate a progress event arriving via the transport's subscribe handler
    const subscribeHandler = transport.subscribe.mock.calls[0][0];
    const progressEvent = {
      payload: {
        case: 'progress' as const,
        value: { operation: 'createBox', percent: 50, message: 'halfway' },
      },
    } as SessionEvent;
    subscribeHandler(progressEvent);

    expect(cb).toHaveBeenCalledWith({
      operation: 'createBox',
      percent: 50,
      message: 'halfway',
    });
  });

  it('offProgress removes callback and unsubscribes when no more callbacks', async () => {
    const cb = vi.fn();
    service.onProgress(cb);
    service.offProgress(cb);

    expect(transport.unsubscribe).toHaveBeenCalled();
  });

  it('offProgress does not unsubscribe when other callbacks remain', async () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    service.onProgress(cb1);
    service.onProgress(cb2);
    service.offProgress(cb1);

    expect(transport.unsubscribe).not.toHaveBeenCalled();
  });
});

describe('RemoteGrpcTransport cancel', () => {
  let transport: RemoteGrpcTransport;
  let mockClient: any;

  beforeEach(() => {
    transport = new RemoteGrpcTransport({ gatewayUrl: 'http://localhost:8080' });
    mockClient = {
      execute: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    (transport as any).client = mockClient;
    (transport as any).sessionId = 'test-session';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cancel in-flight rejects the caller promise with CANCELLED', async () => {
    const requestId = 'req-inflight';
    let rejectFn: (reason: any) => void;
    const promise = new Promise<never>((_, reject) => {
      rejectFn = reject;
    });

    (transport as any).pendingCalls.set(requestId, {
      resolve: () => {},
      reject: rejectFn!,
      requestId,
      deadline: Date.now() + 5000,
      attempt: 0,
      opName: 'createBox',
      payload: {},
    });
    (transport as any).pendingCountValue = 1;

    await transport.cancel(requestId);

    expect(mockClient.cancel).toHaveBeenCalledWith(requestId);
    await expect(promise).rejects.toMatchObject({ code: 'CANCELLED' });
    expect((transport as any).pendingCalls.has(requestId)).toBe(false);
    expect((transport as any).pendingCountValue).toBe(0);
  });

  it('cancel non-existent requestId resolves silently', async () => {
    await expect(transport.cancel('req-does-not-exist')).resolves.toBeUndefined();
    expect(mockClient.cancel).not.toHaveBeenCalled();
  });

  it('cancel after completion is a no-op', async () => {
    const requestId = 'req-completed';
    // pendingCalls is empty (already completed), cancel should be no-op
    await expect(transport.cancel(requestId)).resolves.toBeUndefined();
    expect(mockClient.cancel).not.toHaveBeenCalled();
  });

  it('cancel ignores client cancel errors but still rejects caller', async () => {
    const requestId = 'req-error';
    let rejectFn: (reason: any) => void;
    const promise = new Promise<never>((_, reject) => {
      rejectFn = reject;
    });

    mockClient.cancel = vi.fn().mockRejectedValue(new Error('cancel rpc failed'));
    (transport as any).pendingCalls.set(requestId, {
      resolve: () => {},
      reject: rejectFn!,
      requestId,
      deadline: Date.now() + 5000,
      attempt: 0,
      opName: 'createBox',
      payload: {},
    });

    await transport.cancel(requestId);

    await expect(promise).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});

describe('RemoteGrpcTransport per-call timeoutMs override', () => {
  let transport: RemoteGrpcTransport;
  let mockClient: any;

  beforeEach(() => {
    transport = new RemoteGrpcTransport({ gatewayUrl: 'http://localhost:8080', timeoutMs: 120_000 });
    mockClient = {
      execute: vi.fn().mockImplementation(() => new Promise(() => {})), // never resolves
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    (transport as any).client = mockClient;
    (transport as any).sessionId = 'test-session';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses per-call timeoutMs instead of config deadlineMs', async () => {
    // Per-call timeoutMs of 10ms should trigger DEADLINE_EXCEEDED quickly,
    // even though config deadline is 120s.
    const executePromise = transport.createBox(0, 0, 0, 1, 1, 1, 0.1, 'box1', 10);
    await expect(executePromise).rejects.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
    expect(mockClient.cancel).toHaveBeenCalled();
  });

  it('uses config deadlineMs when no per-call timeoutMs provided', async () => {
    const executePromise = transport.createBox(0, 0, 0, 1, 1, 1, 0.1, 'box1');
    // Config deadline is 120s — client.cancel should NOT be called within 50ms.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mockClient.cancel).not.toHaveBeenCalled();
    executePromise.then(() => {}, () => {});
  });
});
