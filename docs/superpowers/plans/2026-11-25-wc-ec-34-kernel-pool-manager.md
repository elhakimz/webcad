# WC-EC-34: Kernel Pool Manager Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add idle TTL eviction, CPU affinity, cgroup memory/CPU limits, and OOM detection/recovery to the kernel process management layer via a new `KernelPoolManager` class delegated by `KernelSupervisor`.

**Architecture:** New `KernelPoolManager` class in `src/core/gateway/kernel-pool-manager.ts` owns pool-level kernel lifecycle (spare pool, idle eviction, affinity, cgroup, OOM). `KernelSupervisor` is refactored to delegate `allocate()`/`release()`/`sweep()` to it. No proto changes, no breaking changes to `KernelClient`, `SessionManager`, or `connect-server.ts`.

**Tech Stack:** Node.js, TypeScript 5 (strict), `child_process.spawn`, `process.resourceUsage()`, Linux cgroup v2 (`/sys/fs/cgroup`), Vitest 4 for tests.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/gateway/kernel-pool-manager.ts` | Create | `KernelPoolManager` class: spawn kernels, apply CPU affinity (taskset), cgroup limits, idle TTL eviction, OOM detection |
| `src/core/gateway/kernel-pool-manager.test.ts` | Create | Vitest tests for KernelPoolManager (idle eviction, affinity, cgroup, OOM, allocate/release) |
| `src/core/gateway/kernel-supervisor.ts` | Modify | Delegate `getKernelForSession` → `poolManager.allocate()`, `healthCheck` → `poolManager.sweep()`, `stop` → `poolManager.stop()` |

---

## Chunk 1: KernelPoolManager class

### Task 1: KernelPoolManager — allocate/release core

**Files:**
- Create: `src/core/gateway/kernel-pool-manager.ts`
- Test: `src/core/gateway/kernel-pool-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { KernelPoolManager } from './kernel-pool-manager.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('KernelPoolManager allocate/release', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allocates a kernel from spare pool when available', async () => {
    const mockProcess = { pid: 123, kill: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } } as any;
    vi.mocked(spawn).mockReturnValue(mockProcess);

    const mgr = new KernelPoolManager({ sparePoolSize: 1, binary: '/fake/kernel', socketDir: '/tmp' });
    await mgr.start();

    const kernel = await mgr.allocate('session-1');
    expect(kernel.sessionId).toBe('session-1');
    expect(kernel.state).toBe('ready');

    await mgr.stop();
  });
```

Run: `npx vitest run src/core/gateway/kernel-pool-manager.test.ts -t "allocates a kernel from spare pool when available"`
Expected: FAIL — `KernelPoolManager` not defined

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/gateway/kernel-pool-manager.test.ts -t "allocates a kernel from spare pool when available"`
Expected: FAIL with "Cannot find module './kernel-pool-manager'" or "KernelPoolManager is not defined"

- [ ] **Step 3: Write minimal implementation**

Create `src/core/gateway/kernel-pool-manager.ts` with the `KernelPoolManager` class, `ManagedKernel` interface, `KernelPoolManagerConfig`, `spawnKernel()`, `allocate()`, `release()`, `start()`, `stop()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/gateway/kernel-pool-manager.test.ts -t "allocates a kernel from spare pool when available"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/gateway/kernel-pool-manager.ts src/core/gateway/kernel-pool-manager.test.ts
git commit -m "WC-EC-34: KernelPoolManager allocate/release core"
```

---

### Task 2: KernelPoolManager — idle TTL eviction

**Files:**
- Modify: `src/core/gateway/kernel-pool-manager.test.ts`
- Modify: `src/core/gateway/kernel-pool-manager.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it('evicts idle kernel after idleTtlMs', async () => {
  const mockProcess = { pid: 123, kill: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } } as any;
  vi.mocked(spawn).mockReturnValue(mockProcess);

  const mgr = new KernelPoolManager({
    sparePoolSize: 0,
    binary: '/fake/kernel',
    socketDir: '/tmp',
    idleTtlMs: 100, // 100ms TTL for fast test
  });
  await mgr.start();

  const kernel = await mgr.allocate('session-1');
  expect(kernel.state).toBe('ready');

  // Wait past TTL
  await new Promise((r) => setTimeout(r, 200));

  // Trigger sweep
  await mgr.sweep();

  const kernels = mgr.getKernels();
  expect(kernels.has('session-1')).toBe(false);
  expect(mockProcess.kill).toHaveBeenCalled();

  await mgr.stop();
});
```

Run: `npx vitest run src/core/gateway/kernel-pool-manager.test.ts -t "evicts idle kernel after idleTtlMs"`
Expected: FAIL — `sweep()` not implemented or idle eviction not working

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/gateway/kernel-pool-manager.test.ts -t "evicts idle kernel after idleTtlMs"`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Add `sweep()` method to `KernelPoolManager` that iterates all managed kernels, checks `Date.now() - lastActivity > idleTtlMs`, kills the process, removes from map.

Add `touch()` method that updates `lastActivity`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/gateway/kernel-pool-manager.test.ts -t "evicts idle kernel after idleTtlMs"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/gateway/kernel-pool-manager.ts src/core/gateway/kernel-pool-manager.test.ts
git commit -m "WC-EC-34: KernelPoolManager idle TTL eviction"
```

---

### Task 3: KernelPoolManager — spare pool idle eviction

**Files:**
- Modify: `src/core/gateway/kernel-pool-manager.test.ts`
- Modify: `src/core/gateway/kernel-pool-manager.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it('evicts spare kernels after idleTtlMs', async () => {
  const mockProcess = { pid: 123, kill: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } } as any;
  vi.mocked(spawn).mockReturnValue(mockProcess);

  const mgr = new KernelPoolManager({
    sparePoolSize: 1,
    binary: '/fake/kernel',
    socketDir: '/tmp',
    idleTtlMs: 100,
  });
  await mgr.start();

  // Spare was created at start, never allocated
  await new Promise((r) => setTimeout(r, 200));
  await mgr.sweep();

  const spares = mgr.getSpares(); // or check kernels map
  expect(spares.length).toBe(0);
  expect(mockProcess.kill).toHaveBeenCalled();

  await mgr.stop();
});
```

Run: `npx vitest run src/core/gateway/kernel-pool-manager.test.ts -t "evicts spare kernels after idleTtlMs"`
Expected: FAIL — spare eviction not implemented

- [ ] **Step 2-5: Implement, test pass, commit** (same pattern as Task 2)

```bash
git add src/core/gateway/kernel-pool-manager.ts src/core/gateway/kernel-pool-manager.test.ts
git commit -m "WC-EC-34: KernelPoolManager spare pool idle eviction"
```

---

### Task 4: KernelPoolManager — CPU affinity (taskset, Linux only)

**Files:**
- Modify: `src/core/gateway/kernel-pool-manager.test.ts`
- Modify: `src/core/gateway/kernel-pool-manager.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it('applies CPU affinity via taskset on Linux', async () => {
  const mockProcess = { pid: 123, kill: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } } as any;
  vi.mocked(spawn).mockReturnValue(mockProcess);

  const mgr = new KernelPoolManager({
    sparePoolSize: 0,
    binary: '/fake/kernel',
    socketDir: '/tmp',
    cpuAffinityCores: [0, 2],
  });
  await mgr.start();

  await mgr.allocate('session-1');

  // taskset should have been called with cores 0,2 for PID 123
  // (mocked via child_process.spawnSync or execSync)

  await mgr.stop();
});
```

Run: `npx vitest run src/core/gateway/kernel-pool-manager.test.ts -t "applies CPU affinity via taskset on Linux"`
Expected: FAIL — affinity not implemented

- [ ] **Step 2-5: Implement, test pass, commit**

Add `applyAffinity()` method that calls `taskset -c <cores> <pid>` via `child_process.spawnSync` on Linux; no-op with warning on other platforms.

```bash
git add src/core/gateway/kernel-pool-manager.ts src/core/gateway/kernel-pool-manager.test.ts
git commit -m "WC-EC-34: KernelPoolManager CPU affinity via taskset"
```

---

## Chunk 2: cgroup limits and OOM

### Task 5: KernelPoolManager — cgroup v2 memory limit

**Files:**
- Modify: `src/core/gateway/kernel-pool-manager.test.ts`
- Modify: `src/core/gateway/kernel-pool-manager.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it('moves kernel process into cgroup with memory limit', async () => {
  // Mock fs operations for cgroup v2
  vi.mock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs/promises')>();
    return {
      ...actual,
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    };
  });

  const mockProcess = { pid: 123, kill: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } } as any;
  vi.mocked(spawn).mockReturnValue(mockProcess);

  const mgr = new KernelPoolManager({
    sparePoolSize: 0,
    binary: '/fake/kernel',
    socketDir: '/tmp',
    memoryLimitBytes: 512 * 1024 * 1024, // 512 MiB
  });
  await mgr.start();

  await mgr.allocate('session-1');

  // Verify cgroup directory created and memory.max written
  expect(vi.mocked(writeFile).mock.calls.some(
    ([path]) => String(path).includes('memory.max')
  )).toBe(true);

  await mgr.stop();
});
```

Run: `npx vitest run src/core/gateway/kernel-pool-manager.test.ts -t "moves kernel process into cgroup with memory limit"`
Expected: FAIL — cgroup not implemented

- [ ] **Step 2-5: Implement, test pass, commit**

Add `applyCgroupLimits()` method that creates `/sys/fs/cgroup/webcad/kernel-<pid>/`, writes `memory.max` and `cpu.max`, moves PID into `cgroup.procs`. Falls back gracefully if cgroup not available.

```bash
git add src/core/gateway/kernel-pool-manager.ts src/core/gateway/kernel-pool-manager.test.ts
git commit -m "WC-EC-34: KernelPoolManager cgroup v2 memory limit"
```

---

### Task 6: KernelPoolManager — OOM detection and recovery

**Files:**
- Modify: `src/core/gateway/kernel-pool-manager.test.ts`
- Modify: `src/core/gateway/kernel-pool-manager.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it('detects OOM via memory.current >= memory.max and kills process', async () => {
  const mockProcess = { pid: 123, kill: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } } as any;
  vi.mocked(spawn).mockReturnValue(mockProcess);

  const mgr = new KernelPoolManager({
    sparePoolSize: 0,
    binary: '/fake/kernel',
    socketDir: '/tmp',
    memoryLimitBytes: 100 * 1024 * 1024,
    oomPollIntervalMs: 50,
  });
  await mgr.start();

  const kernel = await mgr.allocate('session-1');

  // Simulate OOM: memory.current >= memory.max
  // Mock fs.readFile to return memory.current at limit
  // Trigger sweep → should detect OOM, kill process, mark dead

  await mgr.sweep();

  expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
  expect(kernel.state).toBe('dead');

  await mgr.stop();
});
```

Run: `npx vitest run src/core/gateway/kernel-pool-manager.test.ts -t "detects OOM via memory.current >= memory.max and kills process"`
Expected: FAIL — OOM detection not implemented

- [ ] **Step 2-5: Implement, test pass, commit**

Add OOM detection in `sweep()`: read `memory.current` from cgroup, compare to `memory.max`; if exceeded, `SIGKILL` the process, set state to `dead`. Fallback: poll `process.resourceUsage().maxRSS`.

```bash
git add src/core/gateway/kernel-pool-manager.ts src/core/gateway/kernel-pool-manager.test.ts
git commit -m "WC-EC-34: KernelPoolManager OOM detection and recovery"
```

---

## Chunk 3: KernelSupervisor delegation

### Task 7: KernelSupervisor delegates to KernelPoolManager

**Files:**
- Modify: `src/core/gateway/kernel-supervisor.ts`
- Test: `src/core/gateway/kernel-supervisor.test.ts` (existing)

- [ ] **Step 1: Modify KernelSupervisor**

Replace direct `spawnKernel`/`createSpare`/`stopKernel` logic with delegation to `KernelPoolManager`:

- Constructor: create `KernelPoolManager` instance with config mapped from env vars
- `getKernelForSession(sessionId)`: `await this.poolManager.allocate(sessionId)` then bind session
- `healthCheck()`: call `this.poolManager.sweep()` then existing client health checks
- `stop()`: `await this.poolManager.stop()`
- Remove `spawnKernel`, `createSpare`, `stopKernel` methods (moved to KernelPoolManager)

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run src/core/gateway/kernel-supervisor.test.ts`
Expected: All existing tests still pass (behavior preserved via delegation)

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/core/gateway/kernel-supervisor.ts
git commit -m "WC-EC-34: KernelSupervisor delegates to KernelPoolManager"
```

---

## Acceptance Criteria (verification)

Run these commands to confirm the plan is complete:

```bash
npm run typecheck    # 0 errors
npm run lint         # 0 errors
npm test             # all tests pass
npm run buf:lint     # no proto changes needed
```

**Manual verification:**
- KernelPoolManager allocates kernels from spare pool or spawns new ✓
- Idle TTL eviction kills kernel and removes from map ✓
- Spare pool kernels culled after idle TTL ✓
- CPU affinity applied via taskset on Linux ✓
- cgroup v2 memory limit enforced ✓
- cgroup unavailable → falls back gracefully ✓
- OOM detection triggers kill + mark dead ✓
- KernelSupervisor delegates to KernelPoolManager ✓
- No breaking changes to KernelClient, SessionManager, connect-server.ts, proto ✓

---

**Plan complete and saved to `docs/superpowers/plans/2026-11-25-wc-ec-34-kernel-pool-manager.md`. Ready to execute?**
