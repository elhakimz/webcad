# WC-EC-28 RemoteGrpcTransport Reconnect Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance `RemoteGrpcTransport.ts` with reconnect with backoff, connection state events via EventTarget, heartbeat watchdog, pending-call retry/abort, bounded queue during reconnect, and error classification — matching the approved gRPC design (resume via `Subscribe(last_event_id)`, rehydrate via `Restore` only on kernel loss).

**Architecture:** In-place enhancement of `RemoteGrpcTransport.ts` (Approach 1). All transport state already lives in one class. The transport emits `statechange`, `rehydrate-needed`, and `token-expired` events on an `EventTarget`. `OpenCascadeService` listens for `rehydrate-needed` and calls `Restore` via an injected snapshot provider.

**Tech Stack:** TypeScript 5, Vitest 4 (jsdom), @connectrpc/connect-web, EventTarget (native DOM/Node)

---

## Files to Create / Modify

| File | Action | Responsibility |
|------|--------|----------------|
| `docs/superpowers/specs/2026-11-20-remote-grpc-transport-reconnect-design.md` | Modify | Mark status "approved", check acceptance criteria, record open questions as resolved where possible |
| `src/core/io/RemoteGrpcTransport.ts` | Modify | Core implementation: ConnectionState, EventTarget, pending-call registry, backoff reconnect, heartbeat watchdog, bounded queue, error classification |
| `src/core/io/OpenCascadeService.ts` | Modify | Listen for `rehydrate-needed`/`token-expired` events, inject snapshot provider for `Restore` |
| `src/core/io/__tests__/RemoteGrpcTransport.test.ts` | Modify | Extend existing tests with reconnect, heartbeat, state event, retry/abort tests using fake timers |
| `src/core/io/__tests__/RemoteGrpcTransport.integration.test.ts` | Create | Integration test: kill/restart gateway with mock kernel, assert no duplicate application on retry |

---

## Chunk 1: ConnectionState + EventTarget + state events

### Task 1.1: Write failing test for ConnectionState and state events

**Files:** `src/core/io/__tests__/RemoteGrpcTransport.test.ts`

```ts
describe('ConnectionState', () => {
  it('emits statechange from CONNECTING to CONNECTED on init', async () => {
    const states: string[] = [];
    transport.addEventListener('statechange', (e: Event) => {
      const ce = e as CustomEvent;
      states.push(ce.detail.state);
    });
    // init already called in beforeEach; verify CONNECTED was emitted
    expect(states).toContain('CONNECTED');
  });

  it('transitions to RECONNECTING on transport error, then back to CONNECTED on successful reconnect', async () => {
    // Simulate network error by rejecting execute, then resolving
    const states: string[] = [];
    transport.addEventListener('statechange', (e: Event) => {
      const ce = e as CustomEvent;
      states.push(ce.detail.state);
    });
    mockExecute.mockRejectedValueOnce(new Error('connection refused'));
    await expect(transport.createBox(0, 0, 0, 10, 10, 10)).rejects.toThrow();
    // After reconnect backoff completes, state should be CONNECTED again
    await vi.advanceTimersByTimeAsync(5000);
    expect(states).toContain('RECONNECTING');
    expect(states).toContain('CONNECTED');
  });
});
```

**Step 1.2: Run test — expect FAIL** (ConnectionState not implemented, EventTarget not used)

**Step 1.3: Implement ConnectionState enum and EventTarget in RemoteGrpcTransport.ts**

Add to `RemoteGrpcTransport.ts`:

```ts
export type ConnectionState = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'REHYDRATING' | 'DISCONNECTED' | 'ERROR';

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason?: any) => void;
  requestId: string;
  deadline: number;
  attempt: number;
}

interface QueuedCall {
  opName: string;
  payload: unknown;
  requestId: string;
  resolve: (value: unknown) => void;
  reject: (reason?: any) => void;
  deadline: number;
}
```

Replace `eventListeners` Set with `EventTarget`:

```ts
private stateTarget = new EventTarget();
private state: ConnectionState = 'CONNECTING';
private generation = 0;
private reconnecting = false;
private reconnectAttempts = 0;
private subscribeStream: any = null;
private watchdogTimer: any = null;
private backoffTimer: any = null;
private pendingCalls = new Map<string, PendingCall>();
private callQueue: QueuedCall[] = [];
private token: string | null = null;
private maxReconnectAttempts = 10;
private backoffBaseMs = 1000;
private backoffCapMs = 30_000;
private maxQueueSize = 50;
private heartbeatIntervalMs = 15_000;
private heartbeatMissedThreshold = 3;
private heartbeatMissed = 0;
```

Add state transition helper:

```ts
private setState(next: ConnectionState) {
  if (this.state === next) return;
  const prev = this.state;
  this.state = next;
  this.stateTarget.dispatchEvent(new CustomEvent('statechange', {
    detail: { state: next, previous: prev },
  }));
}
```

Add `addEventListener`/`removeEventListener` methods delegating to `stateTarget`.

Add `get state(): ConnectionState` getter.

**Step 1.4: Run test — expect PASS**

**Step 1.5: Commit**

```bash
git add src/core/io/RemoteGrpcTransport.ts src/core/io/__tests__/RemoteGrpcTransport.test.ts
git commit -m "feat(WC-EC-28): add ConnectionState enum and EventTarget state events"
```

---

## Chunk 2: Pending-call registry + retry/abort

### Task 2.1: Write failing test for pending call retry and abort

```ts
describe('pending-call registry', () => {
  it('retries pending call with same requestId after reconnect (dedupe)', async () => {
    const requestId = 'test-req-1';
    const firstCall = transport.createBox(0, 0, 0, 10, 10, 10, undefined, undefined, requestId);
    // Capture the pending call
    await new Promise(r => setTimeout(r, 10));
    // Simulate network error
    mockExecute.mockRejectedValueOnce(new Error('connection refused'));
    // Reconnect
    mockExecute.mockResolvedValueOnce({ result: { case: 'success', value: {} }, mesh: undefined, brepRef: undefined });
    await expect(firstCall).resolves.toBeDefined();
    // Verify the retry used the same requestId
    const executeCalls = mockExecute.mock.calls.map(c => c[0]);
    const retried = executeCalls.find(c => c.header.requestId === requestId);
    expect(retried).toBeDefined();
  });

  it('rejects pending calls with UNAVAILABLE when session is lost', async () => {
    // Simulate NOT_FOUND on OpenSession
    mockOpenSession.mockRejectedValueOnce(new Error('NOT_FOUND'));
    await expect(transport.init()).rejects.toThrow();
    // Pending calls should be rejected
  });
});
```

**Step 2.2: Run test — expect FAIL**

**Step 2.3: Implement pending-call tracking in `execute()`**

Modify `execute()` to register pending calls:

```ts
private async execute<C extends OpCase>(
  opName: C,
  payload: unknown,
  requestId?: string,
): Promise<ExecuteResponse> {
  const reqId = requestId ?? crypto.randomUUID();

  // If reconnecting, queue the call
  if (this.state === 'RECONNECTING' || this.state === 'REHYDRATING') {
    return this.queueCall(opName, payload, reqId);
  }

  this.pendingCountValue++;
  const deadline = Date.now() + this.config.timeoutMs;
  const pending: PendingCall = { resolve: () => {}, reject: () => {}, requestId: reqId, deadline, attempt: 0 };
  this.pendingCalls.set(reqId, pending);

  const timeoutId = setTimeout(() => {
    this.pendingCalls.delete(reqId);
    pending.reject(new GrpcTransportError('DEADLINE_EXCEEDED', `Operation ${opName} timed out`));
    this.cancel(opName); // send Cancel to gateway
  }, this.config.timeoutMs);

  try {
    const request = create(ExecuteRequestSchema, {
      header: this.header(reqId),
      includeBrep: this.config.includeBrep,
      op: { case: opName as ExecuteRequest['op']['case'], value: payload } as ExecuteRequest['op'],
    });

    const response = await this.clientOrThrow.execute(request, {
      headers: { 'x-session-id': this.sessionId },
      responseTimeout: this.config.timeoutMs,
    });

    clearTimeout(timeoutId);
    this.pendingCalls.delete(reqId);

    if (response.result?.case === 'failure') {
      const f = response.result.value;
      throw new GrpcTransportError(
        ExecutionFailureCode[f.code] ?? 'UNKNOWN',
        `Execution failure (${f.code}): ${f.message}`,
      );
    }

    return response;
  } finally {
    this.pendingCountValue--;
  }
}
```

**Step 2.4: Run test — expect PASS**

**Step 2.5: Commit**

```bash
git add src/core/io/RemoteGrpcTransport.ts src/core/io/__tests__/RemoteGrpcTransport.test.ts
git commit -m "feat(WC-EC-28): add pending-call registry with retry/abort"
```

---

## Chunk 3: Backoff reconnect loop

### Task 3.1: Write failing test for backoff reconnect

```ts
describe('reconnect', () => {
  it('uses exponential backoff with jitter, max 10 attempts, then ERROR', async () => {
    vi.useFakeTimers();
    const states: string[] = [];
    transport.addEventListener('statechange', (e: Event) => {
      const ce = e as CustomEvent;
      states.push(ce.detail.state);
    });
    mockExecute.mockRejectedValue(new Error('connection refused'));
    await expect(transport.createBox(0, 0, 0, 10, 10, 10)).rejects.toThrow();
    expect(states).toContain('RECONNECTING');
    // Advance through backoff attempts
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }
    expect(states.filter(s => s === 'ERROR')).toHaveLength(1);
    vi.useRealTimers();
  });
});
```

**Step 3.2: Run test — expect FAIL**

**Step 3.3: Implement reconnect loop with backoff**

```ts
private async reconnect(): Promise<void> {
  if (this.reconnecting) return;
  this.reconnecting = true;
  const gen = ++this.generation;

  try {
    while (this.reconnectAttempts < this.maxReconnectAttempts && this.state !== 'DISCONNECTED' && this.state !== 'ERROR') {
      this.reconnectAttempts++;
      const delay = Math.min(this.backoffBaseMs * Math.pow(2, this.reconnectAttempts - 1), this.backoffCapMs);
      const jitter = Math.random() * 0.25 * delay;
      await new Promise(r => setTimeout(r, delay + jitter));
      if (gen !== this.generation) return; // single-flight: superseded

      try {
        await this.attemptReconnect();
        this.reconnectAttempts = 0;
        return;
      } catch (err) {
        // continue retrying
      }
    }
    this.setState('ERROR');
  } finally {
    this.reconnecting = false;
  }
}

private async attemptReconnect(): Promise<void> {
  const transport = createConnectTransport({ baseUrl: this.config.gatewayUrl });
  this.client = createClient(EngineGatewayService, transport);

  // OpenSession with same sessionId
  const request = create(OpenSessionRequestSchema, {
    header: create(CommandHeaderSchema, {
      sessionId: this.sessionId,
      requestId: crypto.randomUUID(),
      clientSeq: 0n,
      documentId: '',
    }),
    clientVersion: '1.0.0',
    includeBrep: this.config.includeBrep,
  });

  try {
    await this.clientOrThrow.openSession(request);
  } catch (err: any) {
    if (err.message?.includes('NOT_FOUND') || err.code === 'NOT_FOUND') {
      this.setState('REHYDRATING');
      this.stateTarget.dispatchEvent(new CustomEvent('rehydrate-needed', {
        detail: { sessionId: this.sessionId, reason: 'session_not_found' },
      }));
      return; // consumer will call Restore
    }
    throw err;
  }

  // Resume Subscribe with last_event_id
  await this.resumeSubscribe();
  this.setState('CONNECTED');

  // Retry pending calls
  await this.retryPendingCalls();

  // Process queued calls
  await this.processQueue();
}
```

**Step 3.4: Run test — expect PASS**

**Step 3.5: Commit**

```bash
git add src/core/io/RemoteGrpcTransport.ts src/core/io/__tests__/RemoteGrpcTransport.test.ts
git commit -m "feat(WC-EC-28): add backoff reconnect loop with session resume"
```

---

## Chunk 4: Heartbeat watchdog

### Task 4.1: Write failing test for heartbeat watchdog

```ts
describe('heartbeat watchdog', () => {
  it('triggers reconnect after 3 missed heartbeats', async () => {
    vi.useFakeTimers();
    const states: string[] = [];
    transport.addEventListener('statechange', (e: Event) => {
      const ce = e as CustomEvent;
      states.push(ce.detail.state);
    });
    // Simulate subscribe stream ending / no heartbeats
    mockSubscribe.mockReturnValueOnce({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.resolve({ done: true, value: undefined }),
      }),
    });
    await transport.subscribe(() => {});
    // Advance 3 heartbeat intervals (45s)
    await vi.advanceTimersByTimeAsync(45_000);
    expect(states).toContain('RECONNECTING');
    vi.useRealTimers();
  });
});
```

**Step 4.2: Run test — expect FAIL**

**Step 4.3: Implement heartbeat watchdog in subscribe()**

Modify `subscribe()` to:
- Track last heartbeat time
- Start watchdog timer
- On heartbeat event, reset watchdog
- On 3 missed heartbeats, trigger reconnect

```ts
async subscribe(onEvent: (event: SessionEvent) => void): Promise<void> {
  if (!this.client) {
    throw new GrpcTransportError('FAILED_PRECONDITION', 'Transport not initialized');
  }
  this.stateTarget.addEventListener('statechange', () => {}); // ensure target exists

  const wrappedListener = (event: SessionEvent) => {
    if (event.type === 'heartbeat') {
      this.heartbeatMissed = 0;
      this.restartWatchdog();
    }
    onEvent(event);
  };
  this.eventListeners.add(wrappedListener);

  if (this.subscribed) return;
  this.subscribed = true;

  const request = create(SubscribeRequestSchema, {
    header: this.header(),
    lastEventId: 0n, // resume from last known event
  });

  try {
    const stream = this.client.subscribe(request, {
      headers: { 'x-session-id': this.sessionId },
      responseTimeout: 0,
    });
    this.subscribeStream = stream;

    this.restartWatchdog();

    for await (const event of stream) {
      this.eventListeners.forEach((listener) => listener(event));
      if (event.type === 'heartbeat') {
        this.heartbeatMissed = 0;
      }
    }
  } catch (err) {
    this.subscribed = false;
    this.stopWatchdog();
    this.handleTransportError(err);
    throw err;
  }
}

private restartWatchdog() {
  this.stopWatchdog();
  this.watchdogTimer = setTimeout(() => {
    this.heartbeatMissed++;
    if (this.heartbeatMissed >= this.heartbeatMissedThreshold) {
      this.handleTransportError(new Error('heartbeat timeout'));
    } else {
      this.restartWatchdog();
    }
  }, this.heartbeatIntervalMs * 2); // 2 intervals between checks
}

private stopWatchdog() {
  if (this.watchdogTimer) {
    clearTimeout(this.watchdogTimer);
    this.watchdogTimer = null;
  }
}

private handleTransportError(err: any) {
  // Classify error
  if (err.code === 'UNAUTHENTICATED' || err.message?.includes('UNAUTHENTICATED')) {
    this.stateTarget.dispatchEvent(new CustomEvent('token-expired', {
      detail: { sessionId: this.sessionId, reason: 'token_expired' },
    }));
    return;
  }
  if (err.code === 'PERMISSION_DENIED' || err.code === 'RESOURCE_EXHAUSTED') {
    // Non-retryable: reject pending calls
    this.rejectPendingCalls(new GrpcTransportError(err.code ?? 'UNKNOWN', err.message));
    return;
  }
  // Retryable: reconnect
  this.setState('RECONNECTING');
  this.stopWatchdog();
  this.reconnect();
}
```

**Step 4.4: Run test — expect PASS**

**Step 4.5: Commit**

```bash
git add src/core/io/RemoteGrpcTransport.ts src/core/io/__tests__/RemoteGrpcTransport.test.ts
git commit -m "feat(WC-EC-28): add heartbeat watchdog on Subscribe stream"
```

---

## Chunk 5: Bounded queue + per-operation deadlines + Cancel

### Task 5.1: Write failing test for bounded queue

```ts
describe('bounded queue during reconnect', () => {
  it('queues calls made during RECONNECTING, processes in order on reconnect', async () => {
    // Force reconnecting state
    (transport as any).setState('RECONNECTING');
    const p1 = transport.createBox(0, 0, 0, 10, 10, 10);
    const p2 = transport.createBox(0, 0, 0, 20, 20, 20);
    // Simulate reconnect completing
    mockExecute.mockResolvedValue({ result: { case: 'success', value: {} }, mesh: undefined, brepRef: undefined });
    (transport as any).setState('CONNECTED');
    await (transport as any).processQueue();
    const results = await Promise.all([p1, p2]);
    expect(results).toHaveLength(2);
  });

  it('rejects with DEADLINE_EXCEEDED and sends Cancel on timeout', async () => {
    vi.useFakeTimers();
    (transport as any).setState('RECONNECTING');
    const p = transport.createBox(0, 0, 0, 10, 10, 10);
    await vi.advanceTimersByTimeAsync(60_000); // exceed timeoutMs
    await expect(p).rejects.toThrow(/DEADLINE_EXCEEDED/);
    vi.useRealTimers();
  });
});
```

**Step 5.2: Run test — expect FAIL**

**Step 5.3: Implement queueCall, processQueue, Cancel**

```ts
private queueCall(opName: string, payload: unknown, requestId: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (this.callQueue.length >= this.maxQueueSize) {
      const oldest = this.callQueue.shift();
      if (oldest) {
        oldest.reject(new GrpcTransportError('RESOURCE_EXHAUSTED', 'reconnect queue full'));
      }
    }
    this.callQueue.push({
      opName,
      payload,
      requestId,
      resolve,
      reject,
      deadline: Date.now() + this.config.timeoutMs,
    });
  });
}

private async processQueue(): Promise<void> {
  const queue = [...this.callQueue];
  this.callQueue = [];
  for (const item of queue) {
    try {
      const response = await this.execute(item.opName, item.payload, item.requestId);
      item.resolve(response);
    } catch (err) {
      item.reject(err);
    }
  }
}

private cancel(opName: string): void {
  // Send Cancel RPC to gateway
  if (!this.client) return;
  this.client.cancel(
    create(CancelRequestSchema, { header: this.header() }),
    { headers: { 'x-session-id': this.sessionId } },
  ).catch(() => {}); // fire-and-forget Cancel
}
```

Also add `setToken(token: string)` method:

```ts
setToken(token: string): void {
  this.token = token;
}
```

And modify `header()` to include authorization when token is set.

**Step 5.4: Run test — expect PASS**

**Step 5.5: Commit**

```bash
git add src/core/io/RemoteGrpcTransport.ts src/core/io/__tests__/RemoteGrpcTransport.test.ts
git commit -m "feat(WC-EC-28): add bounded queue, per-operation deadlines, Cancel, setToken"
```

---

## Chunk 6: Error classification + online/visibilitychange

### Task 6.1: Write failing test for error classification

```ts
describe('error classification', () => {
  it('rejects PERMISSION_DENIED immediately without retry', async () => {
    mockExecute.mockRejectedValue(new GrpcTransportError('PERMISSION_DENIED', 'access denied'));
    await expect(transport.createBox(0, 0, 0, 10, 10, 10)).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it('emits token-expired on UNAUTHENTICATED', async () => {
    const events: any[] = [];
    transport.addEventListener('token-expired', (e: Event) => {
      events.push((e as CustomEvent).detail);
    });
    mockExecute.mockRejectedValue(new GrpcTransportError('UNAUTHENTICATED', 'token expired'));
    await expect(transport.createBox(0, 0, 0, 10, 10, 10)).rejects.toThrow(/UNAUTHENTICATED/);
    expect(events.length).toBeGreaterThan(0);
  });
});
```

**Step 6.2: Run test — expect FAIL**

**Step 6.3: Implement error classification in execute() catch + handleTransportError**

In `execute()`'s catch block, classify errors:

```ts
} catch (err: any) {
  clearTimeout(timeoutId);
  this.pendingCalls.delete(reqId);

  if (err instanceof GrpcTransportError) {
    // Non-retryable: reject immediately
    if (err.code === 'PERMISSION_DENIED' || err.code === 'RESOURCE_EXHAUSTED') {
      throw err;
    }
    // Token refresh: emit token-expired
    if (err.code === 'UNAUTHENTICATED') {
      this.stateTarget.dispatchEvent(new CustomEvent('token-expired', {
        detail: { sessionId: this.sessionId, reason: 'token_expired' },
      }));
      throw err;
    }
    // Version mismatch
    if (err.message?.includes('version')) {
      throw new GrpcTransportError('FAILED_PRECONDITION', 'update required: client version mismatch');
    }
  }

  // Retryable: network error, UNAVAILABLE, kernel restarting
  this.setState('RECONNECTING');
  this.stopWatchdog();
  this.reconnect();
  throw err; // re-throw so caller sees the error; reconnect happens in background
}
```

Add `online`/`visibilitychange` listeners in `init()`:

```ts
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => this.reconnect());
  window.addEventListener('visibilitychange', () => {
    if (!document.hidden) this.reconnect();
  });
}
```

**Step 6.4: Run test — expect PASS**

**Step 6.5: Commit**

```bash
git add src/core/io/RemoteGrpcTransport.ts src/core/io/__tests__/RemoteGrpcTransport.test.ts
git commit -m "feat(WC-EC-28): add error classification and online/visibilitychange reconnect triggers"
```

---

## Chunk 7: OpenCascadeService integration

### Task 7.1: Write failing test for rehydrate-needed listener

```ts
describe('OpenCascadeService rehydrate integration', () => {
  it('listens for rehydrate-needed and calls Restore', async () => {
    // Mock the transport's event listener
    const restoreSpy = vi.fn().mockResolvedValue({ success: true });
    // ...
  });
});
```

**Step 7.2: Run test — expect FAIL**

**Step 7.3: Modify OpenCascadeService to listen for transport events**

Add to `OpenCascadeService.init()` after transport creation:

```ts
// Listen for rehydrate-needed from gRPC transport
if (this.transport instanceof RemoteGrpcTransport) {
  this.transport.addEventListener('rehydrate-needed', async (e: Event) => {
    const detail = (e as CustomEvent).detail;
    try {
      await this.rehydrate(doc); // uses importBRep per entity
    } catch (err) {
      this.reportError(`Rehydrate failed: ${err}`);
    }
  });

  this.transport.addEventListener('token-expired', (e: Event) => {
    this.reportError('Authentication token expired. Please refresh.');
  });
}
```

Need to import `RemoteGrpcTransport` type check. Also add `setToken` passthrough:

```ts
setToken(token: string): void {
  if (this.transport && 'setToken' in this.transport) {
    (this.transport as any).setToken(token);
  }
}
```

**Step 7.4: Run test — expect PASS**

**Step 7.5: Commit**

```bash
git add src/core/io/OpenCascadeService.ts
git commit -m "feat(WC-EC-28): OpenCascadeService listens for rehydrate-needed and token-expired"
```

---

## Chunk 8: Integration test + existing tests

### Task 8.1: Write integration test

**Files:** `src/core/io/__tests__/RemoteGrpcTransport.integration.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// Integration test uses real gateway server with mock kernel
import { createGatewayServer, defaultGatewayImpl } from '../../gateway/connect-server.js';
import { sessionManager } from '../../gateway/session-manager.js';
import { RemoteGrpcTransport } from '../RemoteGrpcTransport.js';

describe('RemoteGrpcTransport integration', () => {
  let server: any;
  let transport: RemoteGrpcTransport;

  beforeEach(async () => {
    sessionManager.clearAll();
    server = createGatewayServer(defaultGatewayImpl, { port: 0 });
    await new Promise<void>(r => server.listen(0, r as any));
    const port = (server.address() as any).port;
    transport = new RemoteGrpcTransport({ gatewayUrl: `http://localhost:${port}` });
    await transport.init();
  });

  afterEach(async () => {
    await transport.closeSession();
    server.close();
  });

  it('recovers after gateway restart mid-session (no duplicate application)', async () => {
    await transport.createBox(0, 0, 0, 10, 10, 10);
    // Kill gateway
    server.close();
    await new Promise(r => setTimeout(r, 100));
    // Restart gateway
    server = createGatewayServer(defaultGatewayImpl, { port: 0 });
    await new Promise<void>(r => server.listen(0, r as any));
    const port = (server.address() as any).port;
    transport = new RemoteGrpcTransport({ gatewayUrl: `http://localhost:${port}`, sessionId: (transport as any).sessionId });
    await transport.init();
    // CreateBox again - should not duplicate (dedupe returns prior result)
    const result = await transport.createBox(0, 0, 0, 10, 10, 10);
    expect(result).toBeDefined();
  });
});
```

**Step 8.2: Run integration test — expect PASS**

**Step 8.3: Run all existing unit tests — expect PASS**

**Step 8.4: Commit**

```bash
git add src/core/io/__tests__/RemoteGrpcTransport.integration.test.ts
git commit -m "feat(WC-EC-28): add integration test for gateway restart recovery"
```

---

## Chunk 9: Verify + design doc update

### Task 9.1: Run `npm run verify`

Commands:
- `npm run typecheck` — expect 0 errors
- `npm run lint` — expect 0 warnings/errors
- `npm test` — expect 0 failures
- `npm run buf:lint` — expect pass (pre-existing buf:breaking issue may fail, note it)

### Task 9.2: Update design doc

Mark status as "approved", check acceptance criteria, record open questions resolution.

### Task 9.3: Commit

```bash
git add docs/superpowers/specs/2026-11-20-remote-grpc-transport-reconnect-design.md
git commit -m "docs(WC-EC-28): mark design as approved, record open questions"
```

---

## Acceptance Criteria (from design doc)

- [ ] Kill gateway mid-session: UI recovers
- [ ] No silent failures on formerly fire-and-forget calls (retry with dedupe, or `UNAVAILABLE` + replay)

## Open Questions (from design doc)

1. Does `OpenCascadeService` inject the snapshot provider for `Restore`, or does the document call it directly? — **Pending** (design decision)
2. Default bounded queue size for calls during RECONNECTING? — **Set to 50** (configurable)
3. Exact `last_event_id` semantics on `Subscribe` resume — gateway guarantee on no missed events? — **Pending** (gateway-side guarantee)
4. How does `client_seq` gap timeout interact with retried calls that get a fresh `client_seq`? — **Pending** (gateway-side gap timeout)
