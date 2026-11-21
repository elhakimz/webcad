import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defaultGatewayImpl } from '../../src/core/gateway/connect-server.js';
import { kernelSupervisor } from '../../src/core/gateway/kernel-supervisor.js';

vi.mock('../../src/core/gateway/kernel-supervisor.js', () => ({
  kernelSupervisor: {
    getKernelForSession: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('defaultGatewayImpl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('executeOnKernel delegates to KernelSupervisor', async () => {
    const mockClient = { execute: vi.fn().mockResolvedValue({ status: 'completed' }) };
    vi.mocked(kernelSupervisor.getKernelForSession).mockResolvedValue(mockClient as any);

    const result = await defaultGatewayImpl.executeOnKernel('session-1', {
      header: { sessionId: 'session-1', requestId: 'req-1' },
    } as any);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockClient.execute).toHaveBeenCalled();
    expect(result.status).toBe('completed');
  });

  it('restoreOnKernel delegates to KernelSupervisor', async () => {
    const mockClient = { restore: vi.fn().mockResolvedValue({ status: 'restored' }) };
    vi.mocked(kernelSupervisor.getKernelForSession).mockResolvedValue(mockClient as any);

    const result = await defaultGatewayImpl.restoreOnKernel('session-1', {
      header: { sessionId: 'session-1', requestId: 'req-1' },
    } as any);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockClient.restore).toHaveBeenCalled();
    expect(result.status).toBe('restored');
  });

  it('crash mid-operation: session recovers on next request', async () => {
    // First call: kernel crashes (getKernelForSession throws)
    vi.mocked(kernelSupervisor.getKernelForSession).mockRejectedValueOnce(
      new Error('kernel crashed')
    );

    await expect(
      defaultGatewayImpl.executeOnKernel('session-1', {
        header: { sessionId: 'session-1', requestId: 'req-1' },
      } as any)
    ).rejects.toThrow('kernel crashed');

    // Second call: supervisor respawns and succeeds
    const mockClient = { execute: vi.fn().mockResolvedValue({ status: 'completed' }) };
    vi.mocked(kernelSupervisor.getKernelForSession).mockResolvedValue(mockClient as any);

    const result = await defaultGatewayImpl.executeOnKernel('session-1', {
      header: { sessionId: 'session-1', requestId: 'req-2' },
    } as any);

    expect(result.status).toBe('completed');
  });
});
