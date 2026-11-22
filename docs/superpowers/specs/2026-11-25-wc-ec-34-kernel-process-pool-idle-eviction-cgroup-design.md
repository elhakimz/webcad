# WC-EC-34: Kernel Process Pool, Affinity, Idle Eviction, cgroup Limits

**Status:** Proposed  
**Ticket:** WC-EC-34  
**Priority:** High  
**Phase:** 3  
**Rating:** C (spans gateway layer, process management, cgroup/affinity OS integration, idle eviction)

---

## 1. Problem Statement

`KernelSupervisor` (`src/core/gateway/kernel-supervisor.ts`) already manages one native OCCT kernel process per session with a warm spare pool and crash recovery. However, it lacks:

- **Idle eviction** — kernels for inactive sessions are never released; memory and file descriptors accumulate indefinitely.
- **CPU affinity** — kernels are not pinned to specific CPU cores, causing cache thrashing and noisy-neighbor effects under load.
- **cgroup limits** — no per-kernel memory or CPU limits, so a runaway kernel can exhaust host resources.
- **OOM handling** — no detection or recovery when a kernel process exceeds its memory budget.
- **Formal warm pool management** — spare pool size is fixed at startup; no dynamic resizing based on load.

WC-EC-34 adds these capabilities as a new `KernelPoolManager` class that `KernelSupervisor` delegates to, keeping process-level concerns separate from session-level concerns.

---

## 2. Goals

- **Idle TTL eviction** — kill kernel processes for sessions idle beyond `KERNEL_IDLE_TTL_MS` (default 300000ms = 5 min), release their shapes, respawn on next request.
- **CPU affinity** — pin kernel processes to CPU cores via `taskset` at spawn (Linux only); no-op with warning on non-Linux.
- **cgroup memory limit** — enforce per-kernel memory limit via cgroup v2 `memory.max` when available; fall back to `process.resourceUsage()` polling on bare metal/dev machines.
- **cgroup CPU limit** — enforce per-kernel CPU quota via cgroup v2 `cpu.max` when available.
- **OOM detection and recovery** — when a kernel exceeds its memory limit, kill it, mark session `rehydrating`, respawn, and let the client `Restore` from snapshots.
- **Warm pool with idle TTL** — spare kernels in the pool also get evicted after idle TTL; pool refills on demand.
- **Zero breaking changes** to `KernelClient`, `SessionManager`, `connect-server.ts`, or proto — all changes are internal to the gateway kernel management layer.

---

## 3. Non-Goals

- No changes to `proto/` (no new messages or RPCs).
- No changes to `connect-server.ts` `Execute`/`Restore` flow (session-to-kernel assignment unchanged).
- No document-level kernel assignment (multiple sessions sharing one kernel — that's a future phase).
- No Windows CPU affinity (taskset is Linux-only; skip gracefully on other platforms).
- No cgroup v1 support (cgroup v2 only; fall back to monitoring on cgroup v1 systems).
- No changes to the WASM/OCCWorker browser transport — WC-EC-34 is gateway/kernel side only.

---

## 4. Design

### 4.1 New component: KernelPoolManager

`src/core/gateway/kernel-pool-manager.ts`

A new class responsible for pool-level kernel lifecycle concerns: spare pool, idle TTL eviction, CPU affinity, cgroup limits, and OOM monitoring. `KernelSupervisor` delegates to it.

```typescript
export interface KernelPoolManagerConfig {
  binary?: string;
  socketDir?: string;
  transport?: KernelTransport;
  sparePoolSize?: number;
  maxRestartsPerSession?: number;
  idleTtlMs?: number;              // default 300_000 (5 min)
  memoryLimitBytes?: number;       // default: unlimited (0 = no limit)
  cpuAffinityCores?: number[];     // default: undefined (no affinity)
  cgroupEnabled?: boolean;         // default: true (try cgroup, fall back)
  oomPollIntervalMs?: number;      // default: 10_000 (10 s)
}

export class KernelPoolManager {
  constructor(config: KernelPoolManagerConfig);
  async start(): Promise<void>;
  async stop(): Promise<void>;
  /** Allocate a kernel for a session (from spare or spawn new). */
  allocate(sessionId: string): Promise<ManagedKernel>;
  /** Release a kernel back to spare pool (session closed or idle-evicted). */
  release(sessionId: string): Promise<void>;
  /** Mark a kernel as active (resets idle timer). */
  touch(sessionId: string): void;
  /** Get all managed kernels (for health checks, OOM scan). */
  getKernels(): Map<string, ManagedKernel>;
  /** Run one OOM/idle eviction cycle (called by health check timer). */
  async sweep(): Promise<void>;
}
```

**ManagedKernel extension** — add fields to the existing interface:

```typescript
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
  // NEW: WC-EC-34
  lastActivity: number;            // last touch/allocate timestamp
  affinityCores: number[] | null;  // assigned CPU cores (Linux only)
  cgroupPath: string | null;       // cgroup v2 path for this kernel (if applicable)
  memoryLimitBytes: number;        // per-kernel memory limit (0 = unlimited)
}
```

### 4.2 Idle eviction

**Mechanism:**
- `touch(sessionId)` sets `lastActivity = Date.now()` on every `allocate()` and on every successful `Execute`/`Restore` via `KernelSupervisor`.
- `sweep()` iterates all managed kernels; any kernel with `Date.now() - lastActivity > idleTtlMs` is evicted:
  1. If kernel has a session: call `sessionManager.setState(sessionId, 'restarting')` (not `rehydrating` — the session is still valid, just the kernel was recycled).
  2. Release shapes via `client.releaseShapes([])` (best effort, ignore errors).
  3. Kill the child process (`child.kill('SIGTERM')`, then `SIGKILL` after grace period).
  4. Remove from `kernels` map; add to spares if under `sparePoolSize`.
- Spare kernels in the pool are also subject to idle eviction (a spare that's never allocated eventually gets culled).

**Rationale for `restarting` vs `rehydrating`:** Idle eviction is not a crash — the client's document state is intact. The session should transition to `restarting` and the next `Execute` will allocate a fresh kernel. The client doesn't need to replay unless the kernel actually crashed.

### 4.3 CPU affinity

**Linux:** At `spawnKernel()`, after `spawn()`, read `/sys/fs/cgroup` to detect available CPUs, then apply `taskset -c <cores> <pid>` via `child_process.spawnSync('taskset', ...)`. If `taskset` is unavailable or fails, log a warning and continue without affinity.

**Affinity assignment strategy:** Round-robin across available cores. If `cpuAffinityCores` is configured, use those cores. Otherwise, detect CPU count from `os.cpus().length` and assign `pid % cpuCount`.

**Non-Linux (Windows/macOS):** `taskset` is unavailable. Log `[KernelPoolManager] CPU affinity not supported on <platform>, skipping` and continue with no affinity.

### 4.4 cgroup limits

**Detection:** On startup, check if `/sys/fs/cgroup` is mounted and writable (cgroup v2 unified hierarchy). If yes, cgroup management is enabled.

**Per-kernel cgroup:** Create a child cgroup under the gateway's cgroup:
```
/sys/fs/cgroup/webcad/kernel-<pid>/
```

Set limits:
- `memory.max` = `memoryLimitBytes` (from config, or parent cgroup's limit if not set)
- `cpu.max` = CPU quota (if configured)

**Move kernel process into cgroup:** Write the kernel's PID to `/sys/fs/cgroup/webcad/kernel-<pid>/cgroup.procs`.

**Fallback (no cgroup or non-Linux):** Use `setInterval` to poll `process.resourceUsage()` for each kernel. If `maxRSS` exceeds `memoryLimitBytes`, trigger OOM handling. Poll interval defaults to 10s.

**cgroup v1:** Not supported. Log a warning and fall back to `process.resourceUsage()` monitoring.

### 4.5 OOM handling

**Detection (cgroup v2):** Read `/sys/fs/cgroup/webcad/kernel-<pid>/memory.current` and compare to `memory.max`. If current >= max, OOM.

**Detection (fallback):** Poll `process.resourceUsage().maxRSS` every `oomPollIntervalMs`. If maxRSS > `memoryLimitBytes`, OOM.

**Recovery:**
1. Log `[KernelPoolManager] OOM detected for kernel PID <pid> (session <sessionId>)`.
2. Kill the process (`SIGKILL`).
3. Set kernel state to `dead`.
4. `sessionManager.setState(sessionId, 'rehydrating')` — this IS a crash-like event; client must `Restore` and replay.
5. `KernelSupervisor.onKernelCrash(sessionId)` handles respawn + replay.

### 4.6 KernelSupervisor changes

`KernelSupervisor` is refactored to delegate pool management to `KernelPoolManager`:

- `getKernelForSession(sessionId)` → `poolManager.allocate(sessionId)` then set up client session binding.
- `onKernelCrash(sessionId)` → unchanged (still handled by KernelSupervisor, but kernel object comes from poolManager).
- `healthCheck()` → calls `poolManager.sweep()` for idle/OOM eviction, then does existing client health checks.
- `stop()` → `poolManager.stop()` instead of manually stopping kernels and spares.

`ManagedKernel` objects are now created by `KernelPoolManager.spawnKernel()` (moved from KernelSupervisor). `KernelSupervisor` no longer directly spawns processes.

### 4.7 Data flow

```
Client request → connect-server.Execute
  → KernelSupervisor.getKernelForSession(sessionId)
    → KernelPoolManager.allocate(sessionId)
      → (spare available?) use spare : spawnKernel(sessionId)
        → spawn child process
        → apply CPU affinity (taskset, Linux only)
        → move into cgroup (set memory.max, cpu.max)
        → connect GrpcKernelClient over UDS
      → touch lastActivity
      → return kernel client
  → client.execute(req)
  → KernelSupervisor touches session lastActivity on success

Periodic sweep (every HEALTH_CHECK_INTERVAL_MS):
  → KernelPoolManager.sweep()
    → for each kernel: check idle TTL → evict if expired
    → for each kernel: check OOM → kill + rehydrate if exceeded
    → refill spare pool if under sparePoolSize
```

---

## 5. Error Handling

| Error | Detection | Action | Session state | Retryable? |
|-------|-----------|--------|---------------|------------|
| Idle TTL exceeded | sweep() finds `Date.now() - lastActivity > idleTtlMs` | Kill kernel, release shapes, return to spare | `restarting` (client reconnects, new kernel allocated) | Yes |
| Memory limit exceeded (cgroup) | `memory.current >= memory.max` | SIGKILL, respawn | `rehydrating` (client Restore + replay) | Yes |
| Memory limit exceeded (polling) | `maxRSS > memoryLimitBytes` | SIGKILL, respawn | `rehydrating` | Yes |
| CPU affinity failure (taskset missing) | spawnSync throws | Log warning, continue without affinity | Unchanged | N/A |
| cgroup not available | `/sys/fs/cgroup` not writable | Fall back to process.resourceUsage() polling | Unchanged | N/A |
| Spawn failure | spawnKernel throws | Log error, session stays unassigned | Unchanged | Yes (next request retries) |

---

## 6. Tests

### 6.1 KernelPoolManager (`src/core/gateway/kernel-pool-manager.test.ts`)

- Idle TTL: kernel idle beyond TTL → evicted (process killed, removed from kernels map)
- Idle TTL: kernel active within TTL → not evicted
- Spare pool idle eviction: spare never allocated → culled after idle TTL
- CPU affinity (Linux only, mocked): taskset called with correct cores
- CPU affinity (non-Linux): warning logged, no crash
- cgroup memory limit: memory.current >= max → OOM handling triggered
- cgroup not available: falls back to process.resourceUsage() polling
- OOM recovery: process killed, session set to rehydrating, KernelSupervisor.onKernelCrash called
- allocate/release: kernel allocated from spare, released back to spare
- allocate: no spare → new kernel spawned

### 6.2 KernelSupervisor (`src/core/gateway/kernel-supervisor.test.ts`)

- getKernelForSession delegates to KernelPoolManager.allocate
- healthCheck calls KernelPoolManager.sweep
- Existing crash recovery tests still pass

### 6.3 Existing tests preserved

All existing kernel-supervisor tests, session-manager tests, and connect-server tests continue to pass.

---

## 7. Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `KERNEL_IDLE_TTL_MS` | `300000` (5 min) | Kernel idle TTL before eviction |
| `KERNEL_MEMORY_LIMIT_BYTES` | `0` (unlimited) | Per-kernel memory limit in bytes |
| `KERNEL_CPU_AFFINITY_CORES` | `""` (auto) | Comma-separated CPU core IDs for affinity |
| `KERNEL_CGROUP_ENABLED` | `true` | Try cgroup v2 limits; fall back to polling |
| `KERNEL_OOM_POLL_INTERVAL_MS` | `10000` (10 s) | Polling interval for fallback OOM detection |

---

## 8. Acceptance Criteria

- [ ] `npm run typecheck` passes (0 errors)
- [ ] `npm run lint` passes (0 errors)
- [ ] `npm test` passes (all existing + new KernelPoolManager tests)
- [ ] `npm run buf:lint` passes (no proto changes)
- [ ] KernelPoolManager allocates kernels from spare pool or spawns new
- [ ] Idle TTL eviction kills kernel and returns it to spare pool
- [ ] CPU affinity applied via taskset on Linux (mocked in tests)
- [ ] cgroup memory limit enforced on cgroup v2 systems
- [ ] cgroup unavailable → falls back to process.resourceUsage() polling
- [ ] OOM detection triggers kill + rehydrate
- [ ] KernelSupervisor delegates pool management to KernelPoolManager
- [ ] No breaking changes to KernelClient, SessionManager, connect-server.ts, or proto
- [ ] Design doc written and reviewed (this document)

---

## 9. Open Questions

| # | Question | Proposed default | Status |
|---|----------|-----------------|--------|
| 1 | Idle eviction → session state `restarting` vs `rehydrating`? | `restarting` (not a crash, client reconnects cleanly) | Decided |
| 2 | Should idle-evicted kernels be returned to spare pool or fully killed? | Return to spare (under sparePoolSize), kill if over | Decided |
| 3 | Spare pool kernels also subject to idle TTL? | Yes — culled after idle TTL | Decided |
| 4 | cgroup v1 support? | No — fall back to polling | Decided |
| 5 | CPU affinity on Windows/macOS? | No — warning + skip | Decided |

---

## 10. Files

- **Design spec (this file):** docs/superpowers/specs/2026-11-25-wc-ec-34-kernel-process-pool-idle-eviction-cgroup-design.md
- **New component:** src/core/gateway/kernel-pool-manager.ts
- **New tests:** src/core/gateway/kernel-pool-manager.test.ts
- **Modified:** src/core/gateway/kernel-supervisor.ts (delegate to KernelPoolManager)
- **Epic:** docs/epics/WEBCAD-EPIC-EC-v5.md (WC-EC-34 row)
- **Related tickets:** WC-EC-11 (kernel supervisor skeleton), WC-EC-33 (density measurement)
