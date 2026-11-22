import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';

// Hoisted mock variables for vi.mock factories
const { writeFileMock, mkdirMock, statMock, platformMock } = vi.hoisted(() => ({
  writeFileMock: vi.fn().mockResolvedValue(undefined),
  mkdirMock: vi.fn().mockResolvedValue(undefined),
  statMock: vi.fn().mockResolvedValue({ isDirectory: () => true } as any),
  platformMock: vi.fn().mockReturnValue('win32'),
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    platform: platformMock,
    cpus: actual.cpus,
  };
});

import { platform } from 'node:os';

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

// Mock node:child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

// Mock node:fs/promises (used by cgroup code via dynamic import)
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    writeFile: writeFileMock,
    mkdir: mkdirMock,
    stat: statMock,
  };
});

import { KernelPoolManager } from './kernel-pool-manager.js';
import { sessionManager } from './session-manager.js';

type MockProcess = {
  pid: number;
  kill: (signal?: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  stderr: { on: (event: string, listener: (...args: unknown[]) => void) => void };
  killed: boolean;
  resourceUsage?: () => { maxRSS: number };
};

const mockProcess = (pid: number): MockProcess => ({
  pid,
  kill: vi.fn(),
  on: vi.fn(),
  stderr: { on: vi.fn() },
  resourceUsage: vi.fn(),
  killed: false,
} as unknown as MockProcess);

// Mock the platform function via vi.mocked (platform is mocked via vi.mock)
const platformSpy = vi.mocked(platform);

describe('KernelPoolManager allocate/release', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawn).mockReturnValue(mockProcess(1000) as any);
    platformSpy.mockReturnValue('win32');
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

    await mgr.allocate('session-1');
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

  it('captures exitCode and exitSignal when kernel process exits', async () => {
    const exitListeners = new Map<any, (code: number | null, signal: string | null) => void>();
    vi.mocked(spawn).mockImplementation(() => {
      const proc = mockProcess(1000);
      proc.on.mockImplementation((event: string, listener: any) => {
        if (event === 'exit') {
          exitListeners.set(proc, listener);
        }
      });
      return proc as any;
    });

    const onKernelCrash = vi.fn();
    const mgr = new KernelPoolManager({
      sparePoolSize: 0,
      binary: '/fake/kernel',
      socketDir: '/tmp',
      onKernelCrash,
    });
    await mgr.start();

    const kernel = await mgr.allocate('session-1');
    const proc = kernel.process!;

    // Simulate SIGSEGV exit
    const exitListener = exitListeners.get(proc)!;
    exitListener(null, 'SIGSEGV');

    const updated = mgr.getKernels().get('session-1');
    expect(updated!.exitCode).toBeNull();
    expect(updated!.exitSignal).toBe('SIGSEGV');
    expect(updated!.lastCrashAt).toBeGreaterThan(0);
    expect(updated!.state).toBe('dead');
    expect(onKernelCrash).toHaveBeenCalledWith('session-1');

    await mgr.stop();
  });
});

describe('KernelPoolManager idle TTL eviction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawn).mockReturnValue(mockProcess(1000) as any);
    platformSpy.mockReturnValue('win32');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('evicts idle kernel after idleTtlMs', async () => {
    const mgr = new KernelPoolManager({
      sparePoolSize: 0,
      binary: '/fake/kernel',
      socketDir: '/tmp',
      idleTtlMs: 100,
    });
    await mgr.start();

    const kernel = await mgr.allocate('session-1');
    expect(kernel.state).toBe('ready');
    const proc = kernel.process;

    await new Promise((r) => setTimeout(r, 200));
    await mgr.sweep();

    expect(mgr.getKernels().has('session-1')).toBe(false);
    expect(vi.mocked(proc!.kill)).toHaveBeenCalled();

    await mgr.stop();
  });

  it('does not evict active kernel within idleTtlMs', async () => {
    const mgr = new KernelPoolManager({
      sparePoolSize: 0,
      binary: '/fake/kernel',
      socketDir: '/tmp',
      idleTtlMs: 1000,
    });
    await mgr.start();

    await mgr.allocate('session-1');
    mgr.touch('session-1');
    await new Promise((r) => setTimeout(r, 150));
    await mgr.sweep();

    expect(mgr.getKernels().has('session-1')).toBe(true);

    await mgr.stop();
  });

  it('calls sessionManager.setState with restarting on idle eviction', async () => {
    const mgr = new KernelPoolManager({
      sparePoolSize: 0,
      binary: '/fake/kernel',
      socketDir: '/tmp',
      idleTtlMs: 100,
    });
    await mgr.start();

    await mgr.allocate('session-1');
    await new Promise((r) => setTimeout(r, 200));
    await mgr.sweep();

    expect(vi.mocked(sessionManager.setState)).toHaveBeenCalledWith('session-1', 'restarting');

    await mgr.stop();
  });

  it('evicts spare kernels after idleTtlMs and refills', async () => {
    const mgr = new KernelPoolManager({
      sparePoolSize: 1,
      binary: '/fake/kernel',
      socketDir: '/tmp',
      idleTtlMs: 100,
    });
    await mgr.start();

    expect(mgr.getSpareCount()).toBe(1);

    await new Promise((r) => setTimeout(r, 200));
    await mgr.sweep();

    expect(mgr.getSpareCount()).toBe(1);

    await mgr.stop();
  });
});

describe('KernelPoolManager CPU affinity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawn).mockReturnValue(mockProcess(1000) as any);
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      pid: 1000,
      output: [],
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
    } as any);
    platformSpy.mockReturnValue('linux');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies CPU affinity via taskset on Linux', async () => {
    const mgr = new KernelPoolManager({
      sparePoolSize: 0,
      binary: '/fake/kernel',
      socketDir: '/tmp',
      cpuAffinityCores: [0, 2],
    });
    await mgr.start();

    await mgr.allocate('session-1');

    expect(vi.mocked(spawnSync)).toHaveBeenCalledWith(
      'taskset',
      ['-c', '0,2', '1000'],
      expect.objectContaining({ stdio: 'ignore' })
    );

    await mgr.stop();
  });

  it('skips affinity on non-Linux platforms', async () => {
    platformSpy.mockReturnValue('win32');

    const mgr = new KernelPoolManager({
      sparePoolSize: 0,
      binary: '/fake/kernel',
      socketDir: '/tmp',
      cpuAffinityCores: [0, 2],
    });
    await mgr.start();

    await mgr.allocate('session-1');

    expect(vi.mocked(spawnSync)).not.toHaveBeenCalled();

    await mgr.stop();
  });
});

describe('KernelPoolManager cgroup v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawn).mockReturnValue(mockProcess(1000) as any);
    platformSpy.mockReturnValue('linux');
    writeFileMock.mockClear();
    mkdirMock.mockClear();
    statMock.mockResolvedValue({ isDirectory: () => true } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates cgroup dir and writes memory.max', async () => {
    const mgr = new KernelPoolManager({
      sparePoolSize: 0,
      binary: '/fake/kernel',
      socketDir: '/tmp',
      memoryLimitBytes: 512 * 1024 * 1024,
      cgroupEnabled: true,
    });
    await mgr.start();

    await mgr.allocate('session-1');

    expect(mkdirMock).toHaveBeenCalledWith(
      '/sys/fs/cgroup/webcad/kernel-1000',
      { recursive: true }
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      '/sys/fs/cgroup/webcad/kernel-1000/memory.max',
      '536870912'
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      '/sys/fs/cgroup/webcad/kernel-1000/cgroup.procs',
      '1000'
    );

    await mgr.stop();
  });

  it('falls back gracefully when cgroup stat fails', async () => {
    statMock.mockRejectedValue(new Error('no cgroup'));

    const mgr = new KernelPoolManager({
      sparePoolSize: 0,
      binary: '/fake/kernel',
      socketDir: '/tmp',
      memoryLimitBytes: 512 * 1024 * 1024,
      cgroupEnabled: true,
    });
    await mgr.start();

    await mgr.allocate('session-1');

    await mgr.stop();
  });
});

describe('KernelPoolManager OOM detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawn).mockReturnValue(mockProcess(1000) as any);
    platformSpy.mockReturnValue('win32');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects OOM via resourceUsage and kills process', async () => {
    const mgr = new KernelPoolManager({
      sparePoolSize: 0,
      binary: '/fake/kernel',
      socketDir: '/tmp',
      memoryLimitBytes: 100 * 1024 * 1024,
      oomPollIntervalMs: 10,
      cgroupEnabled: false,
    });
    await mgr.start();

    const kernel = await mgr.allocate('session-1');
    const proc = kernel.process!;

    vi.mocked((proc as any).resourceUsage).mockReturnValue({ maxRSS: 200 * 1024 * 1024 } as any);

    await (mgr as any).pollOom();

    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    expect(kernel.state).toBe('dead');
    expect(vi.mocked(sessionManager.setState)).toHaveBeenCalledWith('session-1', 'rehydrating');

    await mgr.stop();
  });
});

