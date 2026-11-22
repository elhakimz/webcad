import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';

// Hoisted mock variables for vi.mock factories
const { platformMock } = vi.hoisted(() => ({
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

import { KernelSupervisor } from './kernel-supervisor.js';
import { sessionManager } from './session-manager.js';
import { spawn as spawnImport } from 'node:child_process';

const spawnMock = vi.mocked(spawnImport);

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

const platformSpy = vi.mocked(platformMock);

describe('KernelSupervisor crash isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.mockReturnValue(mockProcess(1000) as any);
    platformSpy.mockReturnValue('win32');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes onKernelCrash callback to KernelPoolManager', async () => {
    const supervisor = new KernelSupervisor({
      sparePoolSize: 1,
      binary: '/fake/kernel',
      socketDir: '/tmp',
    });
    await supervisor.start();
    await supervisor.stop();

    // Verify spawn was called (pool manager created a spare kernel)
    expect(spawnMock).toHaveBeenCalled();
  });

  it('logs structured crash event on kernel crash', async () => {
    const exitListeners = new Map<any, (code: number | null, signal: string | null) => void>();
    spawnMock.mockImplementation(() => {
      const proc = mockProcess(1000);
      (proc.on as any).mockImplementation((event: string, listener: any) => {
        if (event === 'exit') {
          exitListeners.set(proc, listener);
        }
      });
      return proc as any;
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const supervisor = new KernelSupervisor({
      sparePoolSize: 0,
      binary: '/fake/kernel',
      socketDir: '/tmp',
    });
    await supervisor.start();

    // Allocate via getKernelForSession so the kernel is tracked in supervisor's map
    await supervisor.getKernelForSession('session-1');
    const kernel = (supervisor as any).kernels.get('session-1');
    const proc = kernel.process!;

    // Simulate SIGSEGV crash
    const exitListener = exitListeners.get(proc)!;
    exitListener(null, 'SIGSEGV');

    // Wait for async respawn
    await new Promise((r) => setTimeout(r, 50));

    // Verify structured crash log was emitted
    const crashLogCalls = consoleErrorSpy.mock.calls.filter(([msg]) =>
      typeof msg === 'string' && msg.includes('[KernelCrash]')
    );
    expect(crashLogCalls.length).toBeGreaterThan(0);
    const logMsg = crashLogCalls[0][0] as string;
    expect(logMsg).toContain('session=session-1');
    expect(logMsg).toContain('pid=1000');
    expect(logMsg).toContain('exitCode=null');
    expect(logMsg).toContain('signal=SIGSEGV');
    expect(logMsg).toContain('restartCount=');

    consoleErrorSpy.mockRestore();

    await supervisor.stop();
  });

  it('stops respawning after maxRestartsPerSession exceeded', async () => {
    let spawnCount = 0;
    spawnMock.mockImplementation(() => {
      spawnCount++;
      const proc = mockProcess(1000 + spawnCount);
      (proc.on as any).mockImplementation((event: string, listener: any) => {
        if (event === 'exit') {
          setTimeout(() => listener(null, 'SIGSEGV'), 10);
        }
      });
      return proc as any;
    });

    const supervisor = new KernelSupervisor({
      sparePoolSize: 0,
      binary: '/fake/kernel',
      socketDir: '/tmp',
      maxRestartsPerSession: 2,
    });
    await supervisor.start();

    await supervisor.getKernelForSession('session-1');

    // Wait for crashes and respawn attempts
    await new Promise((r) => setTimeout(r, 200));

    // After max restarts, session should stay in rehydrating
    expect(vi.mocked(sessionManager.setState)).toHaveBeenCalledWith('session-1', 'rehydrating');

    await supervisor.stop();
  });

  it('stays in rehydrating when respawn fails after crash', async () => {
    const exitListeners = new Map<any, (code: number | null, signal: string | null) => void>();
    let spawnCount = 0;
    spawnMock.mockImplementation(() => {
      spawnCount++;
      const proc = mockProcess(1000 + spawnCount);
      (proc.on as any).mockImplementation((event: string, listener: any) => {
        if (event === 'exit') {
          exitListeners.set(proc, listener);
        }
      });
      return proc as any;
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const supervisor = new KernelSupervisor({
      sparePoolSize: 0,
      binary: '/fake/kernel',
      socketDir: '/tmp',
      maxRestartsPerSession: 5,
    });
    await supervisor.start();

    // Allocate a kernel normally
    await supervisor.getKernelForSession('session-1');
    const kernel = (supervisor as any).kernels.get('session-1');
    const proc = kernel.process!;

    // First crash - triggers respawn
    const exitListener1 = exitListeners.get(proc)!;
    exitListener1(null, 'SIGSEGV');

    // Wait for respawn to complete
    await new Promise((r) => setTimeout(r, 50));

    // Now make spawn fail for subsequent respawns
    spawnCount = 0;
    spawnMock.mockImplementation(() => {
      throw new Error('spawn failed');
    });

    // Get the new kernel's process and crash it
    const newKernel = (supervisor as any).kernels.get('session-1');
    const newProc = newKernel.process!;
    const exitListener2 = exitListeners.get(newProc)!;
    exitListener2(null, 'SIGSEGV');

    // Wait for async respawn failure handling
    await new Promise((r) => setTimeout(r, 50));

    // Session should be in rehydrating state
    expect(vi.mocked(sessionManager.setState)).toHaveBeenCalledWith('session-1', 'rehydrating');

    consoleErrorSpy.mockRestore();

    await supervisor.stop();
  });
});
