import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';

// Mock kernel-client.ts (loads proto at module load time — avoid in tests)
// Use function (not arrow) so `new GrpcKernelClient()` works
vi.mock('./kernel-client.js', () => ({
  GrpcKernelClient: vi.fn(function (this: any, _address: string) {
    this.health = vi.fn().mockResolvedValue({});
    this.close = vi.fn();
    this.execute = vi.fn().mockResolvedValue({});
  }),
  KernelClient: Symbol('KernelClient'),
  KernelTransport: 'uds',
}));

// Mock session-manager.ts (loads generated protobuf — avoid in tests)
vi.mock('./session-manager.js', () => ({
  sessionManager: {
    setState: vi.fn(),
    setKernelPid: vi.fn(),
  },
}));

// Mock stdio-kernel-client.ts
vi.mock('./stdio-kernel-client.js', () => ({
  StdioKernelClient: vi.fn(function (this: any, _address: string) {
    this.health = vi.fn().mockResolvedValue({});
  }),
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

import { KernelPoolManager } from './kernel-pool-manager.js';

type MockProcess = {
  pid: number;
  kill: (signal?: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  stderr: { on: (event: string, listener: (...args: unknown[]) => void) => void };
  killed: boolean;
};

const mockProcess = (pid: number): MockProcess => ({
  pid,
  kill: vi.fn(),
  on: vi.fn(),
  stderr: { on: vi.fn() },
  killed: false,
} as unknown as MockProcess);

describe('KernelPoolManager allocate/release', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawn).mockReturnValue(mockProcess(1000));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allocates a kernel from spare pool when available', async () => {
    const mgr = new KernelPoolManager({
      sparePoolSize: 1,
      binary: '/fake/kernel',
      socketDir: '/tmp',
    });
    await mgr.start();

    const kernel = await mgr.allocate('session-1');
    expect(kernel.sessionId).toBe('session-1');
    expect(kernel.state).toBe('ready');
    expect(kernel.pid).toBe(1000);

    await mgr.stop();
  });

  it('spawns a new kernel when no spare is available', async () => {
    const mgr = new KernelPoolManager({
      sparePoolSize: 0,
      binary: '/fake/kernel',
      socketDir: '/tmp',
    });
    await mgr.start();

    const kernel = await mgr.allocate('session-1');
    expect(kernel.sessionId).toBe('session-1');
    expect(kernel.state).toBe('ready');

    await mgr.stop();
  });

  it('returns kernel to spare pool on release', async () => {
    const mgr = new KernelPoolManager({
      sparePoolSize: 2,
      binary: '/fake/kernel',
      socketDir: '/tmp',
    });
    await mgr.start();

    const kernel = await mgr.allocate('session-1');
    expect(mgr.getKernels().has('session-1')).toBe(true);

    await mgr.release('session-1');
    expect(mgr.getKernels().has('session-1')).toBe(false);
    expect(mgr.getSpareCount()).toBeGreaterThan(0);

    await mgr.stop();
  });

  it('updates lastActivity on touch', async () => {
    const mgr = new KernelPoolManager({
      sparePoolSize: 0,
      binary: '/fake/kernel',
      socketDir: '/tmp',
    });
    await mgr.start();

    const kernel = await mgr.allocate('session-1');
    const firstActivity = kernel.lastActivity;

    // Advance time slightly and touch
    await new Promise((r) => setTimeout(r, 10));
    mgr.touch('session-1');

    const updated = mgr.getKernels().get('session-1');
    expect(updated!.lastActivity).toBeGreaterThanOrEqual(firstActivity);

    await mgr.stop();
  });

  it('throws when allocate fails due to spawn error', async () => {
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error('spawn failed');
    });

    const mgr = new KernelPoolManager({
      sparePoolSize: 0,
      binary: '/fake/kernel',
      socketDir: '/tmp',
    });
    await mgr.start();

    await expect(mgr.allocate('session-1')).rejects.toThrow('spawn failed');

    await mgr.stop();
  });
});
