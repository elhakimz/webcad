import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defaultGatewayImpl } from './connect-server.js';
import { kernelSupervisor } from './kernel-supervisor.js';
import { sessionManager } from './session-manager.js';
import { dedupeCache } from './dedupe.js';
import { ordererRegistry } from './ordering.js';

vi.mock('./kernel-supervisor.js', () => ({
  kernelSupervisor: {
    getKernelForSession: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('./session-manager.js', () => ({
  sessionManager: {
    createSession: vi.fn(),
    getSession: vi.fn(),
    closeSession: vi.fn().mockReturnValue(true),
    getEventsAfter: vi.fn().mockReturnValue([]),
    getLastEventId: vi.fn().mockReturnValue(0),
  },
}));

vi.mock('./dedupe.js', () => ({
  dedupeCache: {
    lookup: vi.fn(),
    markPending: vi.fn().mockReturnValue(true),
    complete: vi.fn(),
    fail: vi.fn(),
  },
}));

vi.mock('./ordering.js', () => ({
  ordererRegistry: {
    getOrCreate: vi.fn().mockReturnValue({
      submit: vi.fn().mockResolvedValue(undefined),
      advance: vi.fn(),
      cancelQueued: vi.fn(),
      cleanup: vi.fn(),
    }),
    remove: vi.fn(),
  },
}));

describe('Restore handler - B-rep re-import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sessionManager.getSession).mockReturnValue({
      id: 'sess-1',
      ownerId: 'user-1',
      state: 'connected',
    } as any);
    vi.mocked(kernelSupervisor.getKernelForSession).mockResolvedValue({
      restore: vi.fn().mockResolvedValue({ status: 'restored', resultRef: 'brep-1' }),
    } as any);
    vi.mocked(dedupeCache.lookup).mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('restore delegates to kernel client with sessionId', async () => {
    const result = await defaultGatewayImpl.restoreOnKernel('sess-1', {
      header: { sessionId: 'sess-1', requestId: 'req-1' },
    } as any);
    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('sess-1');
    expect(result.status).toBe('restored');
  });

  it('Restore handler passes principal to dedupe and ordering', async () => {
    vi.mocked(dedupeCache.markPending).mockReturnValue(true);
    vi.mocked(ordererRegistry.getOrCreate).mockReturnValue({
      submit: vi.fn().mockResolvedValue(undefined),
      advance: vi.fn(),
      cancelQueued: vi.fn(),
      cleanup: vi.fn(),
    } as any);

    await defaultGatewayImpl.Restore({
      header: { sessionId: 'sess-1', requestId: 'req-1', clientSeq: 1 },
    } as any);

    expect(dedupeCache.markPending).toHaveBeenCalledWith('user-1', 'sess-1', 'req-1');
    expect(ordererRegistry.getOrCreate).toHaveBeenCalledWith('user-1', 'sess-1');
  });

  it('Restore returns NOT_FOUND-equivalent for unknown session (principal falls back to sessionId)', async () => {
    vi.mocked(sessionManager.getSession).mockReturnValue(undefined);
    vi.mocked(dedupeCache.markPending).mockReturnValue(true);

    await defaultGatewayImpl.Restore({
      header: { sessionId: 'unknown-sess', requestId: 'req-1', clientSeq: 1 },
    } as any);

    // When session is unknown, principal falls back to sessionId
    expect(dedupeCache.markPending).toHaveBeenCalledWith('unknown-sess', 'unknown-sess', 'req-1');
  });

  it('Restore completes dedupe entry on success', async () => {
    vi.mocked(dedupeCache.markPending).mockReturnValue(true);
    vi.mocked(ordererRegistry.getOrCreate).mockReturnValue({
      submit: vi.fn().mockResolvedValue(undefined),
      advance: vi.fn(),
    } as any);

    await defaultGatewayImpl.Restore({
      header: { sessionId: 'sess-1', requestId: 'req-1', clientSeq: 1 },
    } as any);

    expect(dedupeCache.complete).toHaveBeenCalledWith('user-1', 'sess-1', 'req-1', 'brep-1');
    const getOrCreateMock = vi.mocked(ordererRegistry.getOrCreate);
    expect(getOrCreateMock).toHaveBeenCalledWith('user-1', 'sess-1');
    const orderer = getOrCreateMock.mock.results[0].value;
    expect(orderer.submit).toHaveBeenCalled();
    expect(orderer.advance).toHaveBeenCalled();
  });

  it('Restore fails dedupe entry on kernel error', async () => {
    vi.mocked(dedupeCache.markPending).mockReturnValue(true);
    vi.mocked(ordererRegistry.getOrCreate).mockReturnValue({
      submit: vi.fn().mockResolvedValue(undefined),
      advance: vi.fn(),
    } as any);
    vi.mocked(kernelSupervisor.getKernelForSession).mockResolvedValue({
      restore: vi.fn().mockRejectedValue(new Error('kernel error')),
    } as any);

    await expect(
      defaultGatewayImpl.Restore({
        header: { sessionId: 'sess-1', requestId: 'req-1', clientSeq: 1 },
      } as any)
    ).rejects.toThrow('kernel error');

    expect(dedupeCache.fail).toHaveBeenCalledWith('user-1', 'sess-1', 'req-1', 0, 'kernel error');
  });
});
