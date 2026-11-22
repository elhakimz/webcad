# WC-EC-31: Cancellation, Per-Operation Timeouts, Progress Events

**Status:** Proposed  
**Ticket:** WC-EC-31  
**Priority:** Medium  
**Phase:** 3  
**Rating:** B (involves session semantics and transport-layer changes)

---

## 1. Problem Statement

RemoteGrpcTransport (WC-EC-28/30) already implements internal cancellation (deadline timer calls `client.cancel()`), heartbeat watchdog, reconnect with bounded queue, and error classification. However:

1. **No public cancel API** — callers cannot cancel an in-flight operation. Cancel is only invoked internally on deadline expiry.
2. **No typed progress subscription** — `SessionEvent` carries `ProgressEvent` payloads through `subscribe()`, but OpenCascadeService exposes no typed progress callback. UI/commands can't subscribe to kernel progress.
3. **No per-call timeout override** — `timeoutMs`/`deadlineMs` are config-level only. Individual long-running operations (booleans, lofts, sweeps) can't set their own deadline.

---

## 2. Goals

- Add `cancel(requestId)` to `OCCTransport` and `RemoteGrpcTransport` so callers can cancel in-flight operations.
- Add typed progress event subscription through `OpenCascadeService` (maps `SessionEvent` ProgressEvent → typed callback).
- Add optional per-call `timeoutMs` override on transport execute paths.
- All existing behavior preserved (retries, dedupe, reconnect, heartbeat watchdog unchanged).

---

## 3. Non-Goals

- No changes to `proto/` (all RPCs and messages already exist: `Cancel`, `ExecuteWithProgress`, `ProgressEvent`, `StreamResult`).
- No new transport implementations (OCCWorkerClient unchanged).
- No changes to commands or UI layers (they consume via OpenCascadeService).
- No `ExecuteWithProgress` client method on RemoteGrpcTransport — progress arrives via the existing `Subscribe` stream, not a separate RPC.

---

## 4. Design

### 4.1 OCCTransport interface addition

```typescript
export interface OCCTransport {
  // ... existing methods ...
  /** Cancel an in-flight operation by requestId. Resolves when cancel is sent. */
  cancel(requestId: string): Promise<void>;
}
```

OCCWorkerClient (local worker) implements `cancel()` as a no-op-resolving promise (worker has no cancellation mechanism yet).

### 4.2 RemoteGrpcTransport changes

**New public method:**

```typescript
async cancel(requestId: string): Promise<void> {
  const pending = this.pendingCalls.get(requestId);
  if (!pending) return; // not in flight — already completed or never existed

  // Cancel on the gateway/kernel side
  if (this.client) {
    await this.client.cancel(
      create(CancelRequestSchema, { header: this.header(requestId), requestId }),
    ).catch(() => {}); // cancel may race with completion — ignore errors
  }

  // Reject the caller's promise
  const err = new GrpcTransportError('CANCELLED', `Operation ${pending.opName} cancelled`);
  this.pendingCalls.delete(requestId);
  this.pendingCountValue--;
  pending.reject(err);
}
```

**Per-call timeout override:**

The private `execute()` method already uses `this.config.deadlineMs` for the per-operation deadline. Add an optional `timeoutMs` parameter to public methods that need it (createBox, createCylinder, createBoolean, transformShape, etc.) which overrides `this.config.deadlineMs` for that call.

Implementation: `execute()` accepts an optional `timeoutMs` override:

```typescript
private async execute<C extends OpCase>(
  opName: C,
  payload: unknown,
  requestId?: string,
  timeoutMs?: number,  // NEW: per-call deadline override
): Promise<ExecuteResponse> {
  const deadline = Date.now() + (timeoutMs ?? this.config.deadlineMs);
  // ... rest unchanged
}
```

Each public method passes through an optional `timeoutMs` parameter:

```typescript
async createBox(..., timeoutMs?: number): Promise<{...}> {
  const response = await this.execute('createBox', op, undefined, timeoutMs);
  return this.meshDataToResult(response.mesh, response.brepRef);
}
```

### 4.3 OpenCascadeService changes

**Progress subscription:**

```typescript
private progressListeners = new Set<(event: { operation: string; percent: number; message: string }) => void>();

onProgress(callback: (event: { operation: string; percent: number; message: string }) => void): void {
  this.progressListeners.add(callback);
}

offProgress(callback: (event: { operation: string; percent: number; message: string }) => void): void {
  this.progressListeners.delete(callback);
}
```

When the transport is a RemoteGrpcService, subscribe to its EventTarget for `SessionEvent` and re-emit ProgressEvent payloads to progress listeners. This is wired in `init()` after transport creation.

**Cancel pass-through:**

```typescript
async cancel(requestId: string): Promise<void> {
  if (this.transport && 'cancel' in this.transport) {
    await (this.transport as RemoteGrpcTransport).cancel(requestId);
  }
}
```

### 4.4 Event flow for progress

1. Kernel sends `ExecuteProgress` messages via `ExecuteWithProgress` (gateway→kernel).
2. Gateway converts to `SessionEvent` with `ProgressEvent` payload on the `Subscribe` stream.
3. Transport's `subscribe()` forwards all `SessionEvent`s to its EventTarget listeners.
4. OpenCascadeService subscribes to transport's EventTarget, filters for `ProgressEvent`, and fans out to `onProgress` callbacks.

### 4.5 Cancel flow

1. Caller calls `OpenCascadeService.cancel(requestId)` → `transport.cancel(requestId)`.
2. Transport looks up pending call by `requestId`.
3. Transport calls `client.cancel(reqId)` (gateway cancels kernel operation).
4. Transport rejects the caller's promise with `GrpcTransportError('CANCELLED', ...)`.
5. The RPC's `finally` block cleans up `pendingCalls` (idempotent `Map.delete`).

---

## 5. Error Handling

- `cancel()` on non-existent `requestId`: resolves silently (no-op).
- `cancel()` when transport not initialized: throws `GrpcTransportError('FAILED_PRECONDITION', ...)`.
- Cancel RPC failure (already completed, network error): swallowed — caller's promise already rejected.
- Per-call `timeoutMs` of 0 or negative: treated as no override (uses config default).

---

## 6. Tests

New file: `tests/core/io/__tests__/transport-cancel-progress.test.ts`

1. **Cancel in-flight operation** — start a long-running op, cancel it, assert promise rejects with `CANCELLED`.
2. **Cancel non-existent requestId** — resolves silently, no error.
3. **Cancel after completion** — no-op, doesn't reject settled promise.
4. **Progress event subscription** — subscribe via `onProgress`, simulate `SessionEvent` with `ProgressEvent`, assert callback receives `{operation, percent, message}`.
5. **Per-call timeout override** — call with short `timeoutMs`, assert `DEADLINE_EXCEEDED` before config default.
6. **OpenCascadeService.cancel pass-through** — delegates to transport.cancel.

Use fake timers for deadline/backoff. Mock the Connect client.

---

## 7. Acceptance Criteria

- [ ] `npm run typecheck` passes (0 errors)
- [ ] `npm run lint` passes (0 errors)
- [ ] `npm test` passes (all existing + new tests)
- [ ] Public `cancel(requestId)` available on `OCCTransport` and `RemoteGrpcTransport`
- [ ] `OpenCascadeService.onProgress()` / `offProgress()` typed callbacks work
- [ ] Per-call `timeoutMs` override works on transport methods
- [ ] No proto changes required

---

## 8. Open Questions

None — all decisions resolved.

---

## 9. Agent Rating

**B** — involves transport-layer session semantics, cancel race conditions, and progress event fan-out.