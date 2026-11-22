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
});
