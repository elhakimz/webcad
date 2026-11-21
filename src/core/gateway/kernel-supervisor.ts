// Kernel supervisor: manages one native OCCT kernel process per session.
// Spawns kernel_worker over gRPC/UDS, pools warm spares, handles crash recovery
// via REHYDRATING → Restore → replay.
//
// See docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md
// for architecture, authority model, and error handling.

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sessionManager } from './session-manager.js';
import { GrpcKernelClient, KernelClient } from './kernel-client.js';
import { StdioKernelClient } from './stdio-kernel-client.js';

const KERNEL_BINARY = process.env.KERNEL_BINARY ?? './build/kernel_worker';
const KERNEL_SOCKET_DIR = process.env.KERNEL_SOCKET_DIR ?? '/tmp';
const SPARE_POOL_SIZE = parseInt(process.env.KERNEL_SPARE_POOL_SIZE ?? '2', 10);
const SPAWN_TIMEOUT_MS = parseInt(process.env.KERNEL_SPAWN_TIMEOUT_MS ?? '10000', 10);
const HEALTH_CHECK_INTERVAL_MS = parseInt(process.env.KERNEL_HEALTH_CHECK_INTERVAL_MS ?? '5000', 10);

export type KernelTransport = 'uds' | 'stdio';

export type KernelState = 'spawning' | 'ready' | 'restarting' | 'rehydrating' | 'dead';

export interface ManagedKernel {
  sessionId: string;
  pid: number | null;
  socketPath: string;
  client: KernelClient | null;
  process: ChildProcess | null;
  state: KernelState;
  lastCrashAt: number | null;
  restartCount: number;
  transport: KernelTransport;
}

export interface KernelSupervisorConfig {
  binary?: string;
  socketDir?: string;
  transport?: KernelTransport;
  sparePoolSize?: number;
  maxRestartsPerSession?: number;
}

export class KernelSupervisor {
  private kernels = new Map<string, ManagedKernel>();
  private spares: ManagedKernel[] = [];
  private healthTimer: NodeJS.Timeout | null = null;
  private readonly config: Required<KernelSupervisorConfig>;

  constructor(config: KernelSupervisorConfig = {}) {
    this.config = {
      binary: config.binary ?? KERNEL_BINARY,
      socketDir: config.socketDir ?? KERNEL_SOCKET_DIR,
      transport: config.transport ?? 'uds',
      sparePoolSize: config.sparePoolSize ?? SPARE_POOL_SIZE,
      maxRestartsPerSession: config.maxRestartsPerSession ?? 3,
    };
  }

  async start(): Promise<void> {
    // Pre-warm spare kernel processes
    for (let i = 0; i < this.config.sparePoolSize; i++) {
      await this.createSpare();
    }

    // Periodic health check
    this.healthTimer = setInterval(() => this.healthCheck(), HEALTH_CHECK_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    // Stop all spares
    for (const spare of this.spares) {
      await this.stopKernel(spare);
    }
    this.spares = [];

    // Stop all managed kernels
    for (const [, kernel] of this.kernels) {
      await this.stopKernel(kernel);
    }
    this.kernels.clear();
  }

  /** Get or create a kernel for a session. Returns the kernel client. */
  async getKernelForSession(sessionId: string): Promise<KernelClient> {
    const existing = this.kernels.get(sessionId);
    if (existing && existing.client && existing.state === 'ready') {
      sessionManager.setKernelPid(sessionId, existing.pid ?? -1);
      return existing.client;
    }

    // Try to grab a spare
    let spare = this.spares.shift();
    if (!spare) {
      spare = await this.spawnKernel(sessionId, this.config.transport);
    }

    // Re-assign spare to this session
    spare.sessionId = sessionId;
    spare.state = 'ready';
    spare.restartCount = 0;
    this.kernels.set(sessionId, spare);

    sessionManager.setState(sessionId, 'connected');
    sessionManager.setKernelPid(sessionId, spare.pid ?? -1);

    // Refill spare pool
    await this.createSpare();

    return spare.client!;
  }

  /** Handle kernel crash: mark session REHYDRATING, respawn, restore from client snapshots. */
  async onKernelCrash(sessionId: string): Promise<void> {
    const kernel = this.kernels.get(sessionId);
    if (!kernel) return;

    kernel.state = 'dead';
    kernel.lastCrashAt = Date.now();
    kernel.restartCount++;

    sessionManager.setState(sessionId, 'rehydrating');

    if (kernel.restartCount > this.config.maxRestartsPerSession) {
      sessionManager.setState(sessionId, 'rehydrating');
      console.error(`[Supervisor] Session ${sessionId}: max restarts exceeded, giving up`);
      return;
    }

    // Respawn kernel for this session
    try {
      const replacement = await this.spawnKernel(sessionId, kernel.transport);
      replacement.sessionId = sessionId;
      replacement.state = 'ready';
      replacement.restartCount = kernel.restartCount;
      this.kernels.set(sessionId, replacement);

      sessionManager.setState(sessionId, 'connected');
      sessionManager.setKernelPid(sessionId, replacement.pid ?? -1);

      console.log(`[Supervisor] Session ${sessionId}: kernel respawned (PID ${replacement.pid}), awaiting client replay`);
    } catch (err) {
      sessionManager.setState(sessionId, 'rehydrating');
      console.error(`[Supervisor] Session ${sessionId}: respawn failed`, err);
    }
  }

  private async createSpare(): Promise<void> {
    const spare = await this.spawnKernel(undefined, this.config.transport);
    spare.state = 'spawning';
    this.spares.push(spare);
  }

  private async spawnKernel(sessionId: string | undefined, transport: KernelTransport = this.config.transport): Promise<ManagedKernel> {
    let socketPath = '';
    let args: string[] = [];

    if (transport === 'uds') {
      socketPath = join(this.config.socketDir, `webcad-kernel-${randomUUID()}.sock`);
      args = [socketPath.replace(/^unix:\/\//, '')];
    }

    const child = spawn(this.config.binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.on('exit', (code, signal) => {
      kernel.state = 'dead';
      kernel.process = null;
      console.error(`[Supervisor] Kernel PID ${child.pid} exited: code=${code} signal=${signal}`);
      if (kernel.sessionId) {
        this.onKernelCrash(kernel.sessionId);
      } else {
        // Spare died — remove and replace
        this.spares = this.spares.filter((s) => s !== kernel);
        this.createSpare().catch(console.error);
      }
    });

    child.stderr?.on('data', (data) => {
      console.error(`[Kernel PID ${child.pid}] ${data}`);
    });

    const kernel: ManagedKernel = {
      sessionId: sessionId ?? '',
      pid: child.pid ?? null,
      socketPath,
      client: null,
      process: child,
      state: 'spawning',
      lastCrashAt: null,
      restartCount: 0,
      transport,
    };

    if (transport === 'stdio') {
      const client = new StdioKernelClient(`stdio:${this.config.binary}`);
      kernel.client = client;
      await this.waitForStdio(client, SPAWN_TIMEOUT_MS);
    } else {
      // Connect gRPC client once the socket is ready
      const client = new GrpcKernelClient(`unix:${socketPath}`);
      kernel.client = client;

      // Wait for socket to become available (simple health check)
      await this.waitForSocket(socketPath, SPAWN_TIMEOUT_MS);
    }
    kernel.state = 'ready';

    return kernel;
  }

  private async waitForSocket(socketPath: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const client = new GrpcKernelClient(`unix:${socketPath}`);
        await client.health({ service: 'KernelService' });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    throw new Error(`Kernel socket not ready within ${timeoutMs}ms: ${socketPath}`);
  }

  private async waitForStdio(client: StdioKernelClient, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        await client.health({ service: 'KernelService' });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    throw new Error(`Stdio kernel not ready within ${timeoutMs}ms`);
  }

  private async healthCheck(): Promise<void> {
    for (const [sessionId, kernel] of this.kernels) {
      if (kernel.state !== 'ready' || !kernel.client) continue;
      try {
        await kernel.client.health({ service: 'KernelService' });
      } catch {
        console.error(`[Supervisor] Session ${sessionId}: health check failed`);
        this.onKernelCrash(sessionId);
      }
    }
  }

  private async stopKernel(kernel: ManagedKernel): Promise<void> {
    if (kernel.process) {
      try {
                    kernel.process.kill('SIGTERM');
      } catch {
        // ignore
      }
      kernel.process = null;
    }
    kernel.client = null;
    kernel.state = 'dead';

    // Clean up socket file
    try {
      await rm(kernel.socketPath, { force: true });
    } catch {
      // ignore
    }
  }

  getKernelCount(): number {
    return this.kernels.size;
  }

  getSpareCount(): number {
    return this.spares.length;
  }
}

export const kernelSupervisor = new KernelSupervisor();