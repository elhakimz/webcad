# WC-EC-11 — Gateway Kernel Supervisor Design

**Status:** Proposed
**Ticket:** WC-EC-11 — Gateway kernel supervisor (Node): spawn, pool, framing, respawn
**Priority:** high · **Agent:** B · **Labels:** server, kernel · **Depends on:** WC-EC-09, WC-EC-10
**Phase:** Phase 1

## 1. Goal

Node-side component that owns kernel processes: spawn, pool warm instances, health checks, kill on timeout, respawn + rehydrate, and FIFO ordering per session. Wire the existing `KernelSupervisor` into the gateway server, add stdio transport alongside UDS, and add tests covering both acceptance criteria.

## 2. Current State

| File | Status |
|------|--------|
| `src/core/gateway/kernel-supervisor.ts` | Exists — spawns kernel workers over UDS, spare pool, health checks, crash recovery with rehydration |
| `src/core/gateway/connect-server.ts` | `defaultGatewayImpl.executeOnKernel` / `restoreOnKernel` are stubs returning mock responses |
| `src/core/gateway/kernel-client.ts` | `GrpcKernelClient` — gRPC over UDS only |
| `src/core/gateway/session-manager.ts` | Session lifecycle + event replay buffer |
| `src/core/gateway/ordering.ts` | Per-session `client_seq` reorder buffer |
| `src/core/gateway/dedupe.ts` | `request_id` dedupe cache |
| `src/core/gateway/kernel-worker.cpp` | C++ kernel worker — gRPC over UDS only |
| `tests/gateway/` | Does not exist — no gateway unit tests |

## 3. Architecture

### Components

| Component | Responsibility | Depends on |
|-----------|---------------|------------|
| `KernelSupervisor` (modified) | Spawn/pool/respawn kernels; UDS + stdio transport | `kernel-client.ts`, `stdio-kernel-client.ts` (new) |
| `StdioKernelClient` (new) | Length-prefixed protobuf over child process stdin/stdout | `kernel-client.ts` (`KernelClient` interface) |
| `kernel-worker.cpp` (modified) | OCCT kernel worker; gRPC/UDS **or** stdio/length-prefixed protobuf | OCCT 7.9.3, protobuf C++ |
| `connect-server.ts` (modified) | `executeOnKernel`/`restoreOnKernel` delegate to `KernelSupervisor` | `kernel-supervisor.ts` |
| `session-manager.ts` | Session state, event replay | — |
| `ordering.ts` | Per-session `client_seq` reorder buffer | — |
| `dedupe.ts` | `request_id` dedupe cache | — |

### Transport selection

`KERNEL_TRANSPORT=uds` (default) or `KERNEL_TRANSPORT=stdio`, read in `KernelSupervisor` constructor. Stored per `ManagedKernel` so crash recovery respawns with the same transport.

## 4. Data Flow

### Normal execution (both transports)

```
Browser → Connect → EngineGatewayService.execute()
  → defaultGatewayImpl.execute()
    → dedupeCache.markPending(requestId)
    → orderer.submit({ clientSeq, requestId, ... })
    → kernelSupervisor.getKernelForSession(sessionId) → KernelClient
      → transport (UDS gRPC or stdio length-prefixed) → kernel-worker
      → OCCT 7.9.3 → ExecuteResponse
    → orderer.advance() → dedupeCache.complete(requestId) → return response
```

### Crash recovery (both transports)

```
kernel-worker exits → ChildProcess 'exit' → KernelSupervisor.onKernelCrash(sessionId)
  → sessionManager.setState(sessionId, 'rehydrating')
  → if restartCount > maxRestarts (3): stay rehydrating, error to client
  → respawn kernel (same transport) → sessionManager.setState(sessionId, 'connected')
  → client retries via Restore + replay (Stage 1 client-authoritative per ADR)
```

### Ordering

`SessionOrderer` buffers out-of-order `client_seq`, executes in FIFO order. `advance()` releases next buffered command. Buffer overflow (>64) or timeout (>5s) rejects buffered commands.

## 5. Class Changes

### `kernel-supervisor.ts` — modifications

**New types:**
```ts
export type KernelTransport = 'uds' | 'stdio';

export interface ManagedKernel {
  // ... existing fields ...
  transport: KernelTransport;   // NEW
}
```

**New config field:**
```ts
export interface KernelSupervisorConfig {
  binary?: string;
  socketDir?: string;
  transport?: KernelTransport;  // NEW
  sparePoolSize?: number;
  maxRestartsPerSession?: number;
}
```

**Behavior changes:**
- `spawnKernel(sessionId, transport?)` — if stdio, spawn `kernel_worker` with no socket args; create `StdioKernelClient` instead of `GrpcKernelClient`
- `waitForSocket()` — UDS only; for stdio, wait for first successful `health()` call over stdio
- `onKernelCrash(sessionId)` — respawn using `kernel.transport` (same transport as original)
- `createSpare()` — uses `this.config.transport` for spare kernels

### `stdio-kernel-client.ts` — NEW file

Implements `KernelClient` interface (from `kernel-client.ts`):

| Method | Behavior |
|--------|----------|
| `execute(request)` | Write 4-byte BE length + protobuf to stdin; read 4-byte BE length + protobuf from stdout; parse response |
| `executeWithProgress(request, onProgress)` | Streaming read from stdout; progress chunks via callback, final result via promise |
| `restore(request)` | Same framing as `execute` |
| `putBlob(chunks)` | Write each chunk as length-prefixed message to stdin |
| `streamResult(request, onChunk)` | Streaming read from stdout; each chunk via callback |
| `health(request)` | Health check over stdio framing |
| `close()` | End stdin, kill child process |

Framing: 4-byte big-endian uint32 length prefix + protobuf message body.

### `kernel-worker.cpp` — modifications

- Read `KERNEL_TRANSPORT` env var
- If `stdio`: do not bind UDS socket; read length-prefixed protobuf from stdin; dispatch to OCCT; write length-prefixed responses to stdout
- If `uds` (default): existing gRPC-over-UDS behavior unchanged

### `connect-server.ts` — modifications

```ts
import { kernelSupervisor } from './kernel-supervisor.js';

async executeOnKernel(sessionId: string, req: any): Promise<any> {
  const client = await kernelSupervisor.getKernelForSession(sessionId);
  return client.execute(req);
}

async restoreOnKernel(sessionId: string, req: any): Promise<any> {
  const client = await kernelSupervisor.getKernelForSession(sessionId);
  return client.restore(req);
}
```

## 6. Error Handling

| Scenario | Handling |
|----------|----------|
| Kernel process crashes mid-operation | `ChildProcess 'exit'` → `onKernelCrash` → session `rehydrating` → respawn → client retries via `Restore` + replay |
| Max restarts exceeded (3) | Session stays `rehydrating`; error returned to client |
| Stdio write/read failure (broken pipe, timeout) | Treated as kernel crash → `onKernelCrash` |
| `executeOnKernel` throws | Dedupe marked `failed`, orderer `advance()`, error propagated to Connect response |
| Duplicate `request_id` | Dedupe returns cached result or `ABORTED` if still in-flight |
| Out-of-order `client_seq` | Orderer buffers; timeout after 5s rejects buffered commands |
| Spare kernel dies during pre-warm | Removed from pool, replacement spawned |
| Health check fails | `onKernelCrash` triggered for that session |

## 7. Testing

### `tests/gateway/supervisor.test.ts` (Vitest)

1. **Spawn + get kernel:** `getKernelForSession(sessionId)` returns a client; `getKernelCount() === 1`
2. **Spare pool:** `getSpareCount() === SPARE_POOL_SIZE` after `start()`
3. **Crash recovery:** Simulate kernel process exit → session state `rehydrating` → `getKernelForSession` respawns → state `connected`
4. **Max restarts exceeded:** Crash kernel 4× → session stays `rehydrating`, no respawn
5. **Stdio transport:** `KERNEL_TRANSPORT=stdio` supervisor spawns kernel with stdio client; `execute()` works
6. **Ordering under load:** 20 concurrent executes with shuffled `client_seq` → all complete in order (1..20)

### `tests/gateway/connect-server.test.ts` (Vitest)

7. **Execute wired to supervisor:** `defaultGatewayImpl.executeOnKernel` delegates to supervisor (not stub mock)
8. **Crash mid-operation recovers:** Kill kernel during execute → session recovers on next request

### Mocking strategy

When `kernel_worker` binary isn't available in CI: mock `child_process.spawn` and `GrpcKernelClient`/`StdioKernelClient` to simulate kernel behavior (health checks, execute responses, exit events).

## 8. Acceptance Criteria Mapping

| Criterion | Verification |
|-----------|--------------|
| Killing a kernel mid-operation recovers the session automatically | Test 3 (supervisor) + Test 8 (connect-server integration) |
| Ordering preserved under load test | Test 6 (supervisor ordering under load) |

## 9. Files Changed

| File | Action |
|------|--------|
| `src/core/gateway/kernel-supervisor.ts` | Modify — add `transport` config, stdio spawn path, per-kernel transport tracking |
| `src/core/gateway/stdio-kernel-client.ts` | Create — length-prefixed protobuf over stdio |
| `src/core/gateway/kernel-worker.cpp` | Modify — add stdio mode (`KERNEL_TRANSPORT=stdio`) |
| `src/core/gateway/connect-server.ts` | Modify — wire `executeOnKernel`/`restoreOnKernel` to `KernelSupervisor` |
| `tests/gateway/supervisor.test.ts` | Create — unit tests for supervisor |
| `tests/gateway/connect-server.test.ts` | Create — integration tests for connect-server wiring |

## 10. Out of Scope

- TCP + mTLS cross-host transport (future)
- Server-authoritative document state (Stage 2 per ADR)
- Per-document kernel pooling (currently per-session)
- Result reference / blob storage (large results inline only)

---

**Estimated size:** ~450 lines across 6 files. Within the 15-file / 600-line guideline.