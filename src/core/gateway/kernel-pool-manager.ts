// KernelPoolManager: pool-level kernel lifecycle management for WC-EC-34.
// Handles spare pool, idle TTL eviction, CPU affinity, cgroup limits, OOM detection.
// KernelSupervisor delegates pool management to this class.

import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { platform } from 'node:os';
import { join } from 'node:path';
import { sessionManager } from './session-manager.js';
import { GrpcKernelClient, KernelClient } from './kernel-client.js';
import { StdioKernelClient } from './stdio-kernel-client.js';

export type KernelTransport = 'uds' | 'stdio';

const KERNEL_BINARY = process.env.KERNEL_BINARY ?? './build/kernel_worker';
const KERNEL_SOCKET_DIR = process.env.KERNEL_SOCKET_DIR ?? '/tmp';
const SPARE_POOL_SIZE = parseInt(process.env.KERNEL_SPARE_POOL_SIZE ?? '2', 10);
const SPAWN_TIMEOUT_MS = parseInt(process.env.KERNEL_SPAWN_TIMEOUT_MS ?? '10000', 10);
const IDLE_TTL_MS = parseInt(process.env.KERNEL_IDLE_TTL_MS ?? '300000', 10);
const MEMORY_LIMIT_BYTES = parseInt(process.env.KERNEL_MEMORY_LIMIT_BYTES ?? '0', 10);
const CGROUP_ENABLED = process.env.KERNEL_CGROUP_ENABLED !== 'false';
const OOM_POLL_INTERVAL_MS = parseInt(process.env.KERNEL_OOM_POLL_INTERVAL_MS ?? '10000', 10);

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
  // WC-EC-34 fields
  lastActivity: number;
  affinityCores: number[] | null;
  cgroupPath: string | null;
  memoryLimitBytes: number;
}

export interface KernelPoolManagerConfig {
  binary?: string;
  socketDir?: string;
  transport?: KernelTransport;
  sparePoolSize?: number;
  maxRestartsPerSession?: number;
  idleTtlMs?: number;
  memoryLimitBytes?: number;
  cpuAffinityCores?: number[];
  cgroupEnabled?: boolean;
  oomPollIntervalMs?: number;
}

export class KernelPoolManager {
  private kernels = new Map<string, ManagedKernel>();
  private spares: ManagedKernel[] = [];
  private readonly config: Required<KernelPoolManagerConfig>;
  private cgroupAvailable = false;
  private oomTimer: NodeJS.Timeout | null = null;

  constructor(config: KernelPoolManagerConfig = {}) {
    this.config = {
      binary: config.binary ?? KERNEL_BINARY,
      socketDir: config.socketDir ?? KERNEL_SOCKET_DIR,
      transport: config.transport ?? 'uds',
      sparePoolSize: config.sparePoolSize ?? SPARE_POOL_SIZE,
      maxRestartsPerSession: config.maxRestartsPerSession ?? 3,
      idleTtlMs: config.idleTtlMs ?? IDLE_TTL_MS,
      memoryLimitBytes: config.memoryLimitBytes ?? MEMORY_LIMIT_BYTES,
      cpuAffinityCores: config.cpuAffinityCores ?? [],
      cgroupEnabled: config.cgroupEnabled ?? CGROUP_ENABLED,
      oomPollIntervalMs: config.oomPollIntervalMs ?? OOM_POLL_INTERVAL_MS,
    };
  }

  async start(): Promise<void> {
    // Detect cgroup v2 availability
    this.cgroupAvailable = this.config.cgroupEnabled && await this.detectCgroupV2();

    // Pre-warm spare kernel processes
    for (let i = 0; i < this.config.sparePoolSize; i++) {
      await this.createSpare();
    }

    // Start OOM polling fallback timer (only if no cgroup and memory limit set)
    if (!this.cgroupAvailable && this.config.memoryLimitBytes > 0) {
      this.oomTimer = setInterval(() => this.pollOom(), this.config.oomPollIntervalMs);
    }
  }

  async stop(): Promise<void> {
    if (this.oomTimer) {
      clearInterval(this.oomTimer);
      this.oomTimer = null;
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

  /** Allocate a kernel for a session (from spare or spawn new). */
  async allocate(sessionId: string): Promise<ManagedKernel> {
    // Try to grab a spare
    let kernel = this.spares.shift();
    if (!kernel) {
      kernel = await this.spawnKernel(sessionId, this.config.transport);
    }

    // Re-assign spare to this session
    kernel.sessionId = sessionId;
    kernel.state = 'ready';
    kernel.restartCount = 0;
    kernel.lastActivity = Date.now();
    this.kernels.set(sessionId, kernel);

    // Refill spare pool
    await this.createSpare();

    return kernel;
  }

  /** Release a kernel back to spare pool (session closed or idle-evicted). */
  async release(sessionId: string): Promise<void> {
    const kernel = this.kernels.get(sessionId);
    if (!kernel) return;

    this.kernels.delete(sessionId);

    // Return to spare pool if under capacity
    if (this.spares.length < this.config.sparePoolSize && kernel.process && kernel.state !== 'dead') {
      kernel.sessionId = '';
      kernel.state = 'spawning';
      this.spares.push(kernel);
    } else {
      await this.stopKernel(kernel);
    }
  }

  /** Mark a kernel as active (resets idle timer). */
  touch(sessionId: string): void {
    const kernel = this.kernels.get(sessionId);
    if (kernel) {
      kernel.lastActivity = Date.now();
    }
  }

  /** Get all managed kernels (for health checks, OOM scan). */
  getKernels(): Map<string, ManagedKernel> {
    return this.kernels;
  }

  /** Get number of spare kernels in the pool. */
  getSpareCount(): number {
    return this.spares.length;
  }

  /** Run one idle/OOM eviction cycle. Called by KernelSupervisor health check. */
  async sweep(): Promise<void> {
    const now = Date.now();

    // Evict idle kernels
    for (const [sessionId, kernel] of this.kernels) {
      if (kernel.state !== 'ready' || !kernel.process) continue;
      if (now - kernel.lastActivity > this.config.idleTtlMs) {
        await this.evictIdle(sessionId, kernel);
      }
    }

    // Evict idle spares
    this.spares = this.spares.filter((spare) => {
      if (spare.state !== 'spawning' || !spare.process) return true;
      if (now - spare.lastActivity > this.config.idleTtlMs) {
        // Fire-and-forget stop; we're filtering synchronously
        this.stopKernel(spare).catch(() => {});
        return false;
      }
      return true;
    });

    // Refill spare pool
    while (this.spares.length < this.config.sparePoolSize) {
      await this.createSpare();
    }
  }

  private async evictIdle(sessionId: string, kernel: ManagedKernel): Promise<void> {
    // Session transitions to restarting (not rehydrating — not a crash)
    sessionManager.setState(sessionId, 'restarting');

    // Release shapes (best effort)
    try {
      if (kernel.client) {
        await kernel.client.execute({ op: { case: 'releaseShapes', value: { shapeIds: [] } } });
      }
    } catch {
      // ignore — best effort
    }

    // Kill the process
    if (kernel.process) {
      try {
        kernel.process.kill('SIGTERM');
      } catch {
        // ignore
      }
      try {
        await new Promise((r) => setTimeout(r, 1000));
        if (kernel.process && !kernel.process.killed) {
          kernel.process.kill('SIGKILL');
        }
      } catch {
        // ignore
      }
    }

    this.kernels.delete(sessionId);

    // Return to spare if under capacity
    if (this.spares.length < this.config.sparePoolSize && kernel.process && !kernel.process.killed) {
      kernel.sessionId = '';
      kernel.state = 'spawning';
      this.spares.push(kernel);
    } else {
      await this.stopKernel(kernel);
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

    // Apply CPU affinity (Linux only)
    if (platform() === 'linux') {
      this.applyAffinity(child.pid ?? 0);
    }

    child.on('exit', (_code, _signal) => {
      const kernel = this.findKernelByProcess(child);
      if (kernel) {
        kernel.state = 'dead';
        kernel.process = null;
        if (kernel.sessionId) {
          // Handled by KernelSupervisor.onKernelCrash
        } else {
          this.spares = this.spares.filter((s) => s !== kernel);
          this.createSpare().catch(console.error);
        }
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
      lastActivity: Date.now(),
      affinityCores: platform() === 'linux' ? this.detectAffinityCores() : null,
      cgroupPath: null,
      memoryLimitBytes: this.config.memoryLimitBytes,
    };

    if (transport === 'stdio') {
      const client = new StdioKernelClient(`stdio:${this.config.binary}`);
      kernel.client = client;
      await this.waitForStdio(client, SPAWN_TIMEOUT_MS);
    } else {
      const client = new GrpcKernelClient(`unix:${socketPath}`);
      kernel.client = client;
      await this.waitForSocket(socketPath, SPAWN_TIMEOUT_MS);
    }

    // Apply cgroup limits after process is running
    if (this.cgroupAvailable && kernel.pid) {
      await this.applyCgroupLimits(kernel);
    }

    kernel.state = 'ready';
    return kernel;
  }

  private findKernelByProcess(child: ChildProcess): ManagedKernel | undefined {
    for (const kernel of this.kernels.values()) {
      if (kernel.process === child) return kernel;
    }
    for (const spare of this.spares) {
      if (spare.process === child) return spare;
    }
    return undefined;
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

  // ---- WC-EC-34: CPU affinity ----

  private applyAffinity(pid: number): void {
    if (platform() !== 'linux') {
      console.log(`[KernelPoolManager] CPU affinity not supported on ${platform()}, skipping`);
      return;
    }

    const cores = this.config.cpuAffinityCores.length > 0
      ? this.config.cpuAffinityCores
      : this.detectAffinityCores();

    if (cores.length === 0) return;

    try {
      spawnSync('taskset', ['-c', cores.join(','), String(pid)], { stdio: 'ignore' });
    } catch {
      console.log(`[KernelPoolManager] taskset failed for PID ${pid}, continuing without affinity`);
    }
  }

  private detectAffinityCores(): number[] {
    const cpuCount = require('node:os').cpus().length;
    // Round-robin: assign based on current kernel count
    const coreIndex = (this.kernels.size + this.spares.length) % cpuCount;
    return [coreIndex];
  }

  // ---- WC-EC-34: cgroup v2 ----

  private async detectCgroupV2(): Promise<boolean> {
    try {
      const { stat } = await import('node:fs/promises');
      const info = await stat('/sys/fs/cgroup');
      return info.isDirectory();
    } catch {
      return false;
    }
  }

  private async applyCgroupLimits(kernel: ManagedKernel): Promise<void> {
    if (!kernel.pid) return;

    const cgroupPath = `/sys/fs/cgroup/webcad/kernel-${kernel.pid}`;
    kernel.cgroupPath = cgroupPath;

    try {
      await (await import('node:fs/promises')).mkdir(cgroupPath, { recursive: true });

      // Write memory.max if limit configured
      if (this.config.memoryLimitBytes > 0) {
        await writeFile(`${cgroupPath}/memory.max`, String(this.config.memoryLimitBytes));
      }

      // Move process into cgroup
      await writeFile(`${cgroupPath}/cgroup.procs`, String(kernel.pid));
    } catch {
      // cgroup not available or not permitted — fall back to polling
      this.cgroupAvailable = false;
      kernel.cgroupPath = null;
    }
  }

  private async pollOom(): Promise<void> {
    if (this.config.memoryLimitBytes <= 0) return;

    for (const [sessionId, kernel] of this.kernels) {
      if (kernel.state !== 'ready' || !kernel.process) continue;

      try {
        const usage = (kernel.process as any).resourceUsage();
        if (usage.maxRSS > this.config.memoryLimitBytes) {
          await this.handleOom(sessionId, kernel);
        }
      } catch {
        // resourceUsage may not be available on all platforms
      }
    }
  }

  private async handleOom(sessionId: string, kernel: ManagedKernel): Promise<void> {
    console.error(`[KernelPoolManager] OOM detected for kernel PID ${kernel.pid} (session ${sessionId})`);

    kernel.state = 'dead';
    if (kernel.process) {
      try {
        kernel.process.kill('SIGKILL');
      } catch {
        // ignore
      }
    }

    sessionManager.setState(sessionId, 'rehydrating');

    this.kernels.delete(sessionId);
  }
}

export const kernelPoolManager = new KernelPoolManager();
