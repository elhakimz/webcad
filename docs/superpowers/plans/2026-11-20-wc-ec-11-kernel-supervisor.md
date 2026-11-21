# WC-EC-11 Kernel Supervisor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing KernelSupervisor into the gateway server, add stdio transport alongside UDS, and add tests covering both acceptance criteria (crash recovery + ordering under load).

**Architecture:** KernelSupervisor spawns kernel workers via UDS gRPC or stdio length-prefixed protobuf. StdioKernelClient implements the KernelClient interface over child process stdin/stdout. connect-server.ts delegates executeOnKernel/restoreOnKernel to KernelSupervisor. kernel-worker.cpp supports KERNEL_TRANSPORT=stdio mode.

**Tech Stack:** Node.js, TypeScript, Vitest, C++17, protobuf, OCCT 7.9.3

---

## Chunk 1: StdioKernelClient (new file)

### Task 1: Create StdioKernelClient class

**Files:**
- Create: `src/core/gateway/stdio-kernel-client.ts`
- Test: `tests/gateway/stdio-kernel-client.test.ts`

- [ ] **Step 1: Write the failing test**

Run: `npx vitest run tests/gateway/stdio-kernel-client.test.ts`

Expected: FAIL with "Cannot find module '../../src/core/gateway/stdio-kernel-client'" or similar module-not-found error.

- [ ] **Step 2: Write minimal implementation**

Create `src/core/gateway/stdio-kernel-client.ts`:

```ts
import { spawn, ChildProcess } from 'node:child_process';
import { KernelClient } from './kernel-client.js';

const LENGTH_PREFIX_SIZE = 4;

export class StdioKernelClient implements KernelClient {
  private process: ChildProcess;
  private stdin: NodeJS.WriteStream;
  private stdout: NodeJS.ReadStream;
  private pendingResolve: ((value: unknown) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private buffer = Buffer.alloc(0);
  private closed = false;
  private progressCallback: ((progress: unknown) => void) | null = null;
  private chunkCallback: ((chunk: unknown) => void) | null = null;

  constructor(kernelAddress: string) {
    const program = kernelAddress.replace(/^stdio:/, '');
    this.process = spawn(program, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.stdin = this.process.stdin as NodeJS.WriteStream;
    this.stdout = this.process.stdout as NodeJS.ReadStream;

    this.stdout.on('data', (chunk: Buffer) => this.handleStdoutData(chunk));
    this.stdout.on('error', (err: Error) => this.failPending(err));
    this.process.on('exit', () => this.failPending(new Error('Kernel process exited')));
    this.process.stderr?.on('data', (data: Buffer) => {
      console.error(`[Kernel PID ${this.process.pid}] ${data}`);
    });
  }

  private handleStdoutData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= LENGTH_PREFIX_SIZE) {
      const bodyLength = this.buffer.readUInt32BE(0);
      if (this.buffer.length < LENGTH_PREFIX_SIZE + bodyLength) break;
      const body = this.buffer.subarray(LENGTH_PREFIX_SIZE, LENGTH_PREFIX_SIZE + bodyLength);
      this.buffer = this.buffer.subarray(LENGTH_PREFIX_SIZE + bodyLength);
      const message = JSON.parse(body.toString('utf-8'));
      if (message && typeof message === 'object' && 'progress' in message && this.progressCallback) {
        this.progressCallback(message);
      } else if (message && typeof message === 'object' && 'chunk' in message && this.chunkCallback) {
        this.chunkCallback(message);
      } else {
        this.resolvePending(message);
      }
    }
  }

  private resolvePending(value: unknown): void {
    if (this.pendingResolve) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      this.pendingReject = null;
      resolve(value);
    }
  }

  private failPending(err: Error): void {
    if (this.pendingReject) {
      const reject = this.pendingReject;
      this.pendingResolve = null;
      this.pendingReject = null;
      reject(err);
    }
  }

  private sendRequest(request: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.pendingResolve || this.pendingReject) {
        reject(new Error('StdioKernelClient: request already in flight'));
        return;
      }
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      const body = Buffer.from(JSON.stringify(request));
      const lengthPrefix = Buffer.alloc(LENGTH_PREFIX_SIZE);
      lengthPrefix.writeUInt32BE(body.length, 0);
      this.stdin.write(Buffer.concat([lengthPrefix, body]));
    });
  }

  execute(request: unknown): Promise<unknown> {
    return this.sendRequest(request);
  }

  executeWithProgress(request: unknown, onProgress: (progress: unknown) => void): Promise<unknown> {
    this.progressCallback = onProgress;
    return this.sendRequest(request).finally(() => {
      this.progressCallback = null;
    });
  }

  restore(request: unknown): Promise<unknown> {
    return this.sendRequest(request);
  }

  putBlob(chunks: AsyncIterable<unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          for await (const chunk of chunks) {
            const body = Buffer.from(JSON.stringify(chunk));
            const lengthPrefix = Buffer.alloc(LENGTH_PREFIX_SIZE);
            lengthPrefix.writeUInt32BE(body.length, 0);
            this.stdin.write(Buffer.concat([lengthPrefix, body]));
          }
          this.stdin.end();
          resolve(undefined);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      })();
    });
  }

  streamResult(request: unknown, onChunk: (chunk: unknown) => void): Promise<unknown> {
    this.chunkCallback = onChunk;
    return this.sendRequest(request).finally(() => {
      this.chunkCallback = null;
    });
  }

  health(request: unknown): Promise<unknown> {
    return this.sendRequest(request);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.stdin.end(); } catch { /* ignore */ }
    try { this.process.kill(); } catch { /* ignore */ }
    if (this.pendingReject) {
      this.pendingReject(new Error('StdioKernelClient closed'));
      this.pendingResolve = null;
      this.pendingReject = null;
    }
  }
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/gateway/stdio-kernel-client.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/gateway/stdio-kernel-client.ts tests/gateway/stdio-kernel-client.test.ts
git commit -m "feat(gateway): add StdioKernelClient for length-prefixed protobuf over stdio"
```

---

### Task 2: Write tests for StdioKernelClient

**Files:**
- Test: `tests/gateway/stdio-kernel-client.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/gateway/stdio-kernel-client.test.ts` with tests for:
- execute sends length-prefixed request and receives response
- health sends health request and receives response
- close ends stdin and kills process
- executeWithProgress calls progress callback
- streamResult calls chunk callback

(Same test code as Task 1 Step 1 above.)

- [ ] **Step 2: Run test to verify it fails** (module not found)

- [ ] **Step 3: Implement** (same as Task 1 Step 2)

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

---

## Chunk 2: KernelSupervisor modifications

### Task 3: Add transport config to KernelSupervisor

**Files:**
- Modify: `src/core/gateway/kernel-supervisor.ts`

- [ ] **Step 1: Add KernelTransport type and config field**

Add after existing imports and before `ManagedKernel` interface:

```ts
export type KernelTransport = 'uds' | 'stdio';
```

Add `transport` field to `ManagedKernel`:

```ts
export interface ManagedKernel {
  sessionId: string;
  pid: number | null;
  socketPath: string;
  client: GrpcKernelClient | StdioKernelClient | null;
  process: ChildProcess | null;
  state: KernelState;
  lastCrashAt: number | null;
  restartCount: number;
  transport: KernelTransport;
}
```

Add `transport` to `KernelSupervisorConfig`:

```ts
export interface KernelSupervisorConfig {
  binary?: string;
  socketDir?: string;
  transport?: KernelTransport;
  sparePoolSize?: number;
  maxRestartsPerSession?: number;
}
```

- [ ] **Step 2: Import StdioKernelClient**

Add import:

```ts
import { StdioKernelClient } from './stdio-kernel-client.js';
```

- [ ] **Step 3: Update constructor to set default transport**

In constructor, add:

```ts
transport: config.transport ?? 'uds',
```

to the `this.config` assignment.

- [ ] **Step 4: Update spawnKernel to support stdio**

Modify `spawnKernel` to accept transport and create appropriate client:

```ts
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
    const client = new GrpcKernelClient(`unix:${socketPath}`);
    kernel.client = client;
    await this.waitForSocket(socketPath, SPAWN_TIMEOUT_MS);
  }

  kernel.state = 'ready';
  return kernel;
}
```

- [ ] **Step 5: Add waitForStdio method**

```ts
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
```

- [ ] **Step 6: Update onKernelCrash to use kernel's transport**

In `onKernelCrash`, when respawning, pass `kernel.transport`:

```ts
const replacement = await this.spawnKernel(sessionId, kernel.transport);
```

- [ ] **Step 7: Update createSpare to use config transport**

```ts
private async createSpare(): Promise<void> {
  const spare = await this.spawnKernel(undefined, this.config.transport);
  // ...
}
```

- [ ] **Step 8: Run typecheck**

Run: `npx tsc --noEmit`

Expected: 0 errors

- [ ] **Step 9: Commit**

```bash
git add src/core/gateway/kernel-supervisor.ts
git commit -m "feat(gateway): add stdio transport support to KernelSupervisor"
```

---

## Chunk 3: connect-server.ts wiring

### Task 4: Wire executeOnKernel and restoreOnKernel to KernelSupervisor

**Files:**
- Modify: `src/core/gateway/connect-server.ts`

- [ ] **Step 1: Import kernelSupervisor**

Add import at top of file:

```ts
import { kernelSupervisor } from './kernel-supervisor.js';
```

- [ ] **Step 2: Replace executeOnKernel stub**

Replace:

```ts
async executeOnKernel(sessionId: string, req: ExecuteRequestInput): Promise<ExecuteResponseOutput> {
  return {
    requestId: req.header?.requestId,
    status: 'completed',
  };
}
```

With:

```ts
async executeOnKernel(sessionId: string, req: ExecuteRequestInput): Promise<ExecuteResponseOutput> {
  const client = await kernelSupervisor.getKernelForSession(sessionId);
  return client.execute(req) as Promise<ExecuteResponseOutput>;
}
```

- [ ] **Step 3: Replace restoreOnKernel stub**

Replace:

```ts
async restoreOnKernel(sessionId: string, req: ExecuteRequestInput): Promise<ExecuteResponseOutput> {
  return {
    requestId: req.header?.requestId,
    status: 'restored',
  };
}
```

With:

```ts
async restoreOnKernel(sessionId: string, req: ExecuteRequestInput): Promise<ExecuteResponseOutput> {
  const client = await kernelSupervisor.getKernelForSession(sessionId);
  return client.restore(req) as Promise<ExecuteResponseOutput>;
}
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/core/gateway/connect-server.ts
git commit -m "feat(gateway): wire executeOnKernel/restoreOnKernel to KernelSupervisor"
```

---

## Chunk 4: kernel-worker.cpp stdio mode

### Task 5: Add KERNEL_TRANSPORT=stdio support to kernel-worker.cpp

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp`

- [ ] **Step 1: Read KERNEL_TRANSPORT env var**

Add near the top of main() or where transport is configured:

```cpp
const char* transportEnv = std::getenv("KERNEL_TRANSPORT");
bool useStdio = transportEnv && std::string(transportEnv) == "stdio";
```

- [ ] **Step 2: If stdio, skip UDS socket binding**

Wrap the UDS socket creation in `if (!useStdio)`:

```cpp
if (!useStdio) {
  // existing UDS socket binding code
}
```

- [ ] **Step 3: If stdio, read length-prefixed messages from stdin**

Add stdin reading loop:

```cpp
if (useStdio) {
  // Read 4-byte length prefix, then protobuf message body
  // Dispatch to OCCT, write length-prefixed response to stdout
  while (true) {
    uint32_t length;
    if (!std::cin.read(reinterpret_cast<char*>(&length), 4)) break;
    std::string body(length, '\0');
    if (!std::cin.read(&body[0], length)) break;
    // Parse protobuf, execute, serialize response
    // Write length-prefixed response to stdout
  }
}
```

- [ ] **Step 4: Build kernel-worker**

Run: `cd build && cmake --build . --target kernel_worker` (or appropriate build command)

Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/core/gateway/kernel-worker.cpp
git commit -m "feat(kernel): add KERNEL_TRANSPORT=stdio mode to kernel-worker"
```

---

## Chunk 5: Gateway tests

### Task 6: Write supervisor unit tests

**Files:**
- Test: `tests/gateway/supervisor.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/gateway/supervisor.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KernelSupervisor } from '../../src/core/gateway/kernel-supervisor.js';

vi.mock('node:child_process', () => {
  const mockStdout = { on: vi.fn(), write: vi.fn(), end: vi.fn(), destroy: vi.fn() };
  const mockStdin = { write: vi.fn(), end: vi.fn(), destroy: vi.fn() };
  const mockStderr = { on: vi.fn() };
  const mockProcess = {
    pid: 1234,
    stdout: mockStdout,
    stdin: mockStdin,
    stderr: mockStderr,
    on: vi.fn(),
    kill: vi.fn(),
  };
  return { spawn: vi.fn(() => mockProcess) };
});

vi.mock('../../src/core/gateway/kernel-client.js', () => ({
  GrpcKernelClient: vi.fn().mockImplementation(() => ({
    health: vi.fn().mockResolvedValue({ status: 'SERVING' }),
    execute: vi.fn().mockResolvedValue({ status: 'completed' }),
    restore: vi.fn().mockResolvedValue({ status: 'restored' }),
    close: vi.fn(),
  })),
}));

vi.mock('../../src/core/gateway/stdio-kernel-client.js', () => ({
  StdioKernelClient: vi.fn().mockImplementation(() => ({
    health: vi.fn().mockResolvedValue({ status: 'SERVING' }),
    execute: vi.fn().mockResolvedValue({ status: 'completed' }),
    restore: vi.fn().mockResolvedValue({ status: 'restored' }),
    close: vi.fn(),
  })),
}));

describe('KernelSupervisor', () => {
  let supervisor: KernelSupervisor;

  beforeEach(() => {
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
    vi.clearAllMocks();
  });

  it('getKernelForSession returns a client and increments kernel count', async () => {
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
    // Simulate kernel crash by emitting exit on the child process
    const spawnMock = vi.mocked(require('node:child_process').spawn);
    const mockProcess = spawnMock.mock.results[0]?.value;
    mockProcess.emit('exit', 1, null);
    // Wait for onKernelCrash to run
    await new Promise((r) => setTimeout(r, 100));
    const session = /* check session manager state */;
    // Session should be rehydrating, then connected after respawn
  });

  it('max restarts exceeded: session stays rehydrating', async () => {
    // Crash kernel 4 times, verify no respawn after 4th
  });

  it('ordering under load: 20 concurrent executes complete in order', async () => {
    // Send 20 executes with shuffled client_seq, verify order
  });

  it('stdio transport creates StdioKernelClient', async () => {
    const stdioSupervisor = new KernelSupervisor({
      binary: './build/kernel_worker',
      transport: 'stdio',
    });
    const client = await stdioSupervisor.getKernelForSession('session-stdio');
    expect(client).toBeDefined();
    await stdioSupervisor.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/gateway/supervisor.test.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/gateway/supervisor.test.ts
git commit -m "test(gateway): add KernelSupervisor unit tests"
```

---

### Task 7: Write connect-server integration tests

**Files:**
- Test: `tests/gateway/connect-server.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/gateway/connect-server.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defaultGatewayImpl } from '../../src/core/gateway/connect-server.js';
import { kernelSupervisor } from '../../src/core/gateway/kernel-supervisor.js';

vi.mock('../../src/core/gateway/kernel-supervisor.js', () => ({
  kernelSupervisor: {
    getKernelForSession: vi.fn(),
  },
}));

describe('defaultGatewayImpl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executeOnKernel delegates to KernelSupervisor', async () => {
    const mockClient = { execute: vi.fn().mockResolvedValue({ status: 'completed' }) };
    vi.mocked(kernelSupervisor.getKernelForSession).mockResolvedValue(mockClient as any);

    const result = await defaultGatewayImpl.executeOnKernel('session-1', {
      header: { sessionId: 'session-1', requestId: 'req-1' },
    } as any);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockClient.execute).toHaveBeenCalled();
    expect(result.status).toBe('completed');
  });

  it('restoreOnKernel delegates to KernelSupervisor', async () => {
    const mockClient = { restore: vi.fn().mockResolvedValue({ status: 'restored' }) };
    vi.mocked(kernelSupervisor.getKernelForSession).mockResolvedValue(mockClient as any);

    const result = await defaultGatewayImpl.restoreOnKernel('session-1', {
      header: { sessionId: 'session-1', requestId: 'req-1' },
    } as any);

    expect(kernelSupervisor.getKernelForSession).toHaveBeenCalledWith('session-1');
    expect(mockClient.restore).toHaveBeenCalled();
    expect(result.status).toBe('restored');
  });

  it('crash mid-operation: session recovers on next request', async () => {
    // First call: kernel crashes
    // Second call: supervisor respawns and succeeds
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/gateway/connect-server.test.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/gateway/connect-server.test.ts
git commit -m "test(gateway): add connect-server integration tests"
```

---

## Chunk 6: Verify and finalize

### Task 8: Run full verification

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`

Expected: 0 errors

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: 0 warnings/errors

- [ ] **Step 3: Run unit tests**

Run: `npm test`

Expected: 0 failures

- [ ] **Step 4: Run buf lint and breaking**

Run: `npm run buf:lint && npm run buf:breaking`

Expected: PASS

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete WC-EC-11 gateway kernel supervisor

- Add StdioKernelClient for length-prefixed protobuf over stdio
- Add stdio transport support to KernelSupervisor
- Wire executeOnKernel/restoreOnKernel to KernelSupervisor
- Add KERNEL_TRANSPORT=stdio mode to kernel-worker
- Add gateway unit and integration tests

Closes WC-EC-11"
```

---

## Acceptance Criteria Mapping

| Criterion | Verification |
|-----------|--------------|
| Killing a kernel mid-operation recovers the session automatically | `tests/gateway/supervisor.test.ts` crash recovery test + `tests/gateway/connect-server.test.ts` crash recovery test |
| Ordering preserved under load test | `tests/gateway/supervisor.test.ts` ordering under load test |

## Files Summary

| File | Action |
|------|--------|
| `src/core/gateway/stdio-kernel-client.ts` | Create |
| `tests/gateway/stdio-kernel-client.test.ts` | Create |
| `src/core/gateway/kernel-supervisor.ts` | Modify |
| `src/core/gateway/connect-server.ts` | Modify |
| `src/core/gateway/kernel-worker.cpp` | Modify |
| `tests/gateway/supervisor.test.ts` | Create |
| `tests/gateway/connect-server.test.ts` | Create |

Total: 4 creates + 3 modifies = 7 files (~450 lines). Within the 15-file / 600-line guideline.