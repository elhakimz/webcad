// Kernel supervisor: manages one native OCCT kernel process per session.
// Delegates pool management (spare pool, idle eviction, affinity, cgroup, OOM)
// to KernelPoolManager (WC-EC-34). Keeps session/crash recovery logic.
//
// See docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md
// for architecture, authority model, and error handling.

import { sessionManager } from './session-manager.js';
import { KernelPoolManager, type ManagedKernel, KernelTransport } from './kernel-pool-manager.js';
import { KernelClient } from './kernel-client.js';
import { logger } from './logger.js';
import { kernelCrashes, kernelRespawns } from './metrics.js';

const KERNEL_BINARY = process.env.KERNEL_BINARY ?? './build/kernel_worker';
const KERNEL_SOCKET_DIR = process.env.KERNEL_SOCKET_DIR ?? '/tmp';
const SPARE_POOL_SIZE = parseInt(process.env.KERNEL_SPARE_POOL_SIZE ?? '2', 10);
const MAX_RESTARTS_PER_SESSION = parseInt(process.env.KERNEL_MAX_RESTARTS_PER_SESSION ?? '3', 10);
const HEALTH_CHECK_INTERVAL_MS = parseInt(process.env.KERNEL_HEALTH_CHECK_INTERVAL_MS ?? '5000', 10);

export type KernelState = 'spawning' | 'ready' | 'restarting' | 'rehydrating' | 'dead';

export interface KernelSupervisorConfig {
  binary?: string;
  socketDir?: string;
  transport?: KernelTransport;
  sparePoolSize?: number;
  maxRestartsPerSession?: number;
}

export class KernelSupervisor {
  private kernels = new Map<string, ManagedKernel>();
  private readonly poolManager: KernelPoolManager;
  private healthTimer: NodeJS.Timeout | null = null;
  private readonly config: Required<KernelSupervisorConfig>;

  constructor(config: KernelSupervisorConfig = {}) {
    this.config = {
      binary: config.binary ?? KERNEL_BINARY,
      socketDir: config.socketDir ?? KERNEL_SOCKET_DIR,
      transport: config.transport ?? 'uds',
      sparePoolSize: config.sparePoolSize ?? SPARE_POOL_SIZE,
      maxRestartsPerSession: config.maxRestartsPerSession ?? MAX_RESTARTS_PER_SESSION,
    };

    this.poolManager = new KernelPoolManager({
      binary: this.config.binary,
      socketDir: this.config.socketDir,
      transport: this.config.transport,
      sparePoolSize: this.config.sparePoolSize,
      maxRestartsPerSession: this.config.maxRestartsPerSession,
      onKernelCrash: (sessionId) => this.onKernelCrash(sessionId),
    });
  }

  async start(): Promise<void> {
    await this.poolManager.start();

    // Periodic health check (runs idle sweep + client health checks)
    this.healthTimer = setInterval(() => this.healthCheck(), HEALTH_CHECK_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    await this.poolManager.stop();
    this.kernels.clear();
  }

  /** Get or create a kernel for a session. Returns the kernel client. */
  async getKernelForSession(sessionId: string): Promise<KernelClient> {
    const existing = this.kernels.get(sessionId);
    if (existing && existing.client && existing.state === 'ready') {
      sessionManager.setKernelPid(sessionId, existing.pid ?? -1);
      return existing.client;
    }

    const kernel = await this.poolManager.allocate(sessionId);
    this.kernels.set(sessionId, kernel);

    sessionManager.setState(sessionId, 'connected');
    sessionManager.setKernelPid(sessionId, kernel.pid ?? -1);

    return kernel.client!;
  }

  /** Release a kernel back to the pool (session closed). */
  async release(sessionId: string): Promise<void> {
    await this.poolManager.release(sessionId);
    this.kernels.delete(sessionId);
  }

  /** Handle kernel crash: mark session REHYDRATING, respawn via pool manager, await client replay. */
  async onKernelCrash(sessionId: string): Promise<void> {
    const kernel = this.kernels.get(sessionId);
    if (!kernel) return;

    kernel.state = 'dead';
    kernel.lastCrashAt = Date.now();
    kernel.restartCount++;

    logger.error('Kernel crash', {
      sessionId,
      pid: kernel.pid,
      exitCode: kernel.exitCode,
      exitSignal: kernel.exitSignal,
      restartCount: kernel.restartCount,
    });

    kernelCrashes.inc({});
    sessionManager.setState(sessionId, 'rehydrating');

    if (kernel.restartCount > this.config.maxRestartsPerSession) {
      sessionManager.setState(sessionId, 'rehydrating');
      logger.error('Session max restarts exceeded, giving up', { sessionId });
      return;
    }

    // Release the dead kernel and allocate a fresh one via pool manager
    this.kernels.delete(sessionId);

    try {
      const replacement = await this.poolManager.allocate(sessionId);
      replacement.sessionId = sessionId;
      replacement.state = 'ready';
      replacement.restartCount = kernel.restartCount;
      this.kernels.set(sessionId, replacement);

      sessionManager.setState(sessionId, 'connected');
      sessionManager.setKernelPid(sessionId, replacement.pid ?? -1);

      kernelRespawns.inc({});

      logger.info('Kernel respawned', {
        sessionId,
        pid: replacement.pid,
        restartCount: replacement.restartCount,
      });
    } catch (err) {
      sessionManager.setState(sessionId, 'rehydrating');
      logger.error('Kernel respawn failed', { sessionId, err: err instanceof Error ? err : undefined });
    }
  }

  /** Periodic health check: run idle sweep via pool manager, then check client health. */
  private async healthCheck(): Promise<void> {
    // Run idle TTL eviction via pool manager
    await this.poolManager.sweep();

    for (const [sessionId, kernel] of this.kernels) {
      if (kernel.state !== 'ready' || !kernel.client) continue;
      try {
        await kernel.client.health({ service: 'KernelService' });
      } catch {
        logger.warn('Health check failed', { sessionId });
        this.onKernelCrash(sessionId);
      }
    }
  }

  getKernelCount(): number {
    return this.kernels.size;
  }

  getSpareCount(): number {
    return this.poolManager.getSpareCount();
  }
}

export const kernelSupervisor = new KernelSupervisor();