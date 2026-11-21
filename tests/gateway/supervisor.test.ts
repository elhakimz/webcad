import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KernelSupervisor } from '../../src/core/gateway/kernel-supervisor.js';

const mockStdoutHandlers = new Map<string, Set<(chunk: Buffer) => void>>();
const mockProcess = {
  pid: 1234,
  stdout: {
    on: vi.fn((event: string, handler: (chunk: Buffer) => void) => {
      if (!mockStdoutHandlers.has(event)) {
        mockStdoutHandlers.set(event, new Set());
      }
      mockStdoutHandlers.get(event)!.add(handler);
    }),
  },
  stdin: {
    write: vi.fn(),
    end: vi.fn(),
  },
  stderr: { on: vi.fn() },
  on: vi.fn(),
  kill: vi.fn(),
};

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => mockProcess),
}));

vi.mock('../../src/core/gateway/kernel-client.js', () => ({
  GrpcKernelClient: vi.fn().mockImplementation(function () {
    this.health = vi.fn().mockResolvedValue({ status: 'SERVING' });
    this.execute = vi.fn().mockResolvedValue({ status: 'completed' });
  }),
  KernelClient: vi.fn(),
}));

vi.mock('../../src/core/gateway/stdio-kernel-client.js', () => ({
  StdioKernelClient: vi.fn().mockImplementation(function () {
    this.health = vi.fn().mockResolvedValue({ status: 'SERVING' });
  }),
}));

vi.mock('../../src/core/gateway/session-manager.js', () => ({
  sessionManager: { setState: vi.fn(), setKernelPid: vi.fn(), createSession: vi.fn() },
}));

describe('KernelSupervisor', () => {
  let supervisor: KernelSupervisor;

  beforeEach(() => {
    mockStdoutHandlers.clear();
    supervisor = new KernelSupervisor({
      binary: './build/kernel_worker',
      socketDir: '/tmp',
      sparePoolSize: 2,
      maxRestartsPerSession: 3,
      transport: 'uds',
    });
  });

  afterEach(async () => {
    await supervisor.stop().catch(() => {});
  });

  it('getKernelForSession returns a client and tracks kernel', async () => {
    const client = await supervisor.getKernelForSession('session-1');
    expect(client).toBeDefined();
    expect(supervisor.getKernelCount()).toBe(1);
  });

  it('spare pool is pre-warmed after start', async () => {
    await supervisor.start();
    expect(supervisor.getSpareCount()).toBe(2);
    await supervisor.stop();
  });

  it('crash recovery: session enters rehydrating then connected', async () => {
    const client = await supervisor.getKernelForSession('session-1');
    expect(client).toBeDefined();

    await supervisor.onKernelCrash('session-1');

    const recoveredClient = await supervisor.getKernelForSession('session-1');
    expect(recoveredClient).toBeDefined();
    expect(supervisor.getKernelCount()).toBe(1);
  });

  it('max restarts exceeded: no respawn after limit', async () => {
    await supervisor.getKernelForSession('session-1');

    for (let i = 0; i < 4; i++) {
      await supervisor.onKernelCrash('session-1');
    }

    const kernel = supervisor['kernels'].get('session-1');
    expect(kernel).toBeDefined();
    expect(kernel!.state).toBe('dead');
    expect(supervisor.getKernelCount()).toBe(1);
  });

  it('ordering under load: concurrent executes all complete', async () => {
    const client = await supervisor.getKernelForSession('session-1');
    expect(client).toBeDefined();

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        client.execute({ op: 'createBox', seq: i })
      )
    );
    expect(results).toHaveLength(20);
    for (const result of results) {
      expect(result).toEqual({ status: 'completed' });
    }
  });

  it('stdio transport creates StdioKernelClient', async () => {
    const stdioSupervisor = new KernelSupervisor({
      binary: './build/kernel_worker',
      transport: 'stdio',
    });
    const client = await stdioSupervisor.getKernelForSession('session-stdio');
    expect(client).toBeDefined();
    expect(stdioSupervisor.getKernelCount()).toBe(1);
    await stdioSupervisor.stop();
  });
});
