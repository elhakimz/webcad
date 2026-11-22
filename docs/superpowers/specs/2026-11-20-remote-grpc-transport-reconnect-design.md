# RemoteGrpcTransport: reconnect, heartbeat, connection state

**Ticket:** WC-EC-28 — RemoteGrpcTransport (client)
**Date:** 2026-11-20
**Status:** Draft - pending human review
**Depends on:** WC-EC-26, WC-EC-27
**Agent rating:** B (session semantics)

## Problem

`RemoteGrpcTransport.ts` already implements all `OCCTransport` methods over Connect/gRPC, but lacks:

1. **Reconnect with backoff** — if the gateway is killed mid-session, the transport stays broken until the page reloads. The epic requires "Kill gateway mid-session: UI recovers."
2. **Connection state events** — no way for `OpenCascadeService` or the UI to know if the transport is `connecting`, `connected`, `reconnecting`, `rehydrating`, `disconnected`, or `error`.
3. **Liveness detection** — no watchdog on the gateway's server heartbeats; a silent network failure isn't detected until the next RPC.
4. **Fire-and-forget error surfacing** — in-flight calls dropped by a disconnect are silently lost instead of retried or rejected per the ADR rule.
5. **Resume vs rehydrate ambiguity** — the transport currently cannot tell whether to `Subscribe(last_event_id)` (kernel still has state) or trigger a full `Restore` (kernel lost everything).

## Decision

Enhance `RemoteGrpcTransport.ts` in-place (Approach 1). All transport state (`sessionId`, `client`, listeners, pending calls) already lives in one class; adding reconnect, liveness, state events, and retry/abort logic there is the simplest change that meets all acceptance criteria. No new files.

The transport reuses the client-generated `session_id` on every reconnect and follows the approved gRPC design: resume via `Subscribe(last_event_id)` when the session survived, rehydrate via `Restore` only when the gateway signals kernel loss.

## Architecture

### ConnectionState enum

```
CONNECTING    — init() in progress (first OpenSession)
CONNECTED     — session open, RPCs can be sent
RECONNECTING  — connection lost, backoff reconnect in progress
REHYDRATING   — session re-opened, Restore or Subscribe resume pending
DISCONNECTED  — closeSession called, no reconnect
ERROR         — max reconnect attempts exceeded, stopped
```

### State subscribers — EventTarget

One mechanism only: `EventTarget` (works in browser and Node without polyfill).

- `transport.addEventListener('statechange', (e) => e.detail.state)`
- `transport.addEventListener('rehydrate-needed', (e) => e.detail)` — emitted when the gateway signals `needs_rehydrate`, `NOT_FOUND`, or kernel status `REHYDRATING`. `OpenCascadeService`/the document listens and calls `Restore` using an injected snapshot provider.
- `transport.addEventListener('token-expired', (e) => e.detail)` — emitted on `UNAUTHENTICATED`. The consumer injects a fresh token via `transport.setToken(token)` and reconnect retries.

### Session ID

- Generated once by the client (`crypto.randomUUID()`) on first `init()`.
- **Reused on every reconnect** — never regenerated.
- Stored in `CommandHeader.sessionId` on every RPC.
- Gateway uses it to find the existing session; `NOT_FOUND` after a gateway restart means the kernel lost state → trigger rehydrate.

### Retryable vs non-retryable errors

| Error class | Examples | Action |
|-------------|----------|--------|
| Retryable | network errors, `UNAVAILABLE`, kernel restarting | Backoff reconnect, then retry with same `request_id` (dedupe returns prior result) |
| Token refresh | `UNAUTHENTICATED` | Emit `token-expired`; consumer calls `setToken()`; reconnect with new token |
| Non-retryable | `PERMISSION_DENIED`, `RESOURCE_EXHAUSTED`, version mismatch | Reject immediately; version mismatch → surface "update required" |
| Session lost | `NOT_FOUND` on `OpenSession`/`Subscribe` | Emit `rehydrate-needed`; consumer calls `Restore`; replay aborted commands |

### Pending-call registry

`Map<requestId, { resolve, reject, requestId, deadline, attempt }>` tracks in-flight `execute()` calls.

**On reconnect with session survived:**
- Pending calls are **retried** with the same `request_id` once the session is re-opened and `Subscribe(last_event_id)` resumes.
- Dedupe at the gateway returns the prior result if the request was already applied.
- `client_seq` continues incrementing; retried calls get a fresh `client_seq` (the old one is abandoned — the gateway's reorder buffer gap times out per its gap timeout).

**On session/kernel lost:**
- All pending entries rejected with `GrpcTransportError('UNAVAILABLE', 'session lost')`.
- The consumer is responsible for replaying aborted commands in order after `Restore` (ADR rule).

**New calls during RECONNECTING:**
- Queued in a bounded ordered queue (default max 50, configurable).
- Each queued call gets a per-operation deadline from the config table.
- On timeout: reject with `DEADLINE_EXCEEDED`, send `Cancel {id}` to the gateway.
- Queue overflow: reject oldest entry with `RESOURCE_EXHAUSTED`.

### Heartbeat / liveness

- **No client heartbeat RPC.** No such gateway RPC exists (`Health` is kernel-side only).
- The `Subscribe` stream carries server heartbeats every 15 s (per the approved design).
- Client watchdog: if 2-3 heartbeat intervals are missed, state → `RECONNECTING`, reconnect loop starts.
- Watchdog timer cleared during reconnect, resumed on `CONNECTED`.

### Backoff

- Exponential with jitter: base 1s, doubles each failure, cap 30s, plus random jitter (0-25%).
- Max 10 attempts (~3.5 minutes total). After that: state → `ERROR`, no auto-reconnect.
- Longer outages: user must call `init()` again or the app shows a reconnect button.
- `online` and `visibilitychange` events trigger an immediate reconnect attempt (browsers throttle timers in hidden tabs).

### Single-flight reconnect

- A `generation` counter and `reconnecting` flag guard against two reconnect loops starting at once (e.g. heartbeat failure and RPC error simultaneously).
- `init()` while `RECONNECTING`: no-op (reconnect already in progress); returns when current attempt completes or fails.

### B-rep snapshot storage

**Removed.** The transport does NOT own a B-rep snapshot map. The document already holds `brepSnapshot` per entity. The transport emits `rehydrate-needed`; `OpenCascadeService`/the document calls `Restore` (batched, BlobRef for large B-reps) using an injected snapshot provider.

## Data Flow

**Normal operation:**
1. `init()`: state `CONNECTING`, create Connect client, call `OpenSession` with client-generated `session_id`, state → `CONNECTED`
2. Each OCC method builds protobuf op, `execute()` sends `Execute` RPC with incremented `clientSeq`
3. Response parsed; `GrpcTransportError` thrown on `failure` case

**On transport error (network, gateway kill):**
1. State → `RECONNECTING`, subscribers notified via `statechange`
2. Single-flight guard: if already reconnecting, skip
3. Reconnect loop: backoff wait (with jitter) → new Connect client → `OpenSession` (same `session_id`)
4. Gateway responds:
   - Session found: re-subscribe via `Subscribe(last_event_id)`, state → `CONNECTED`, retry pending calls
   - `NOT_FOUND`: state → `REHYDRATING`, emit `rehydrate-needed`; consumer calls `Restore`
5. Pending calls: retry (session survived) or reject `UNAVAILABLE` (session lost)

**On heartbeat watchdog timeout:** Same path as transport error.

**On `UNAUTHENTICATED`:** Emit `token-expired`; wait for `setToken()`; reconnect with new token.

**New call during RECONNECTING:** Added to bounded queue; processed in order once `CONNECTED`.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `execute()` returns `failure` | `GrpcTransportError(code, message)` — unchanged |
| Network / gateway kill | State `RECONNECTING`, backoff reconnect with jitter |
| Heartbeat watchdog timeout | Same as network error |
| `UNAUTHENTICATED` | Emit `token-expired`; consumer calls `setToken()`; reconnect |
| `PERMISSION_DENIED` / `RESOURCE_EXHAUSTED` | Reject immediately, no retry |
| Version mismatch | Reject immediately, surface "update required" |
| `NOT_FOUND` after restart | Emit `rehydrate-needed`; consumer calls `Restore` |
| Max reconnect attempts | State `ERROR`, no auto-reconnect |
| `closeSession()` during reconnect | State `DISCONNECTED`, clears timer, nulls client |
| `init()` while `CONNECTED` | No-op |
| `init()` while `RECONNECTING` | No-op, waits for current attempt |

## Testing

**Unit tests** (fake timers) in `src/core/io/__tests__/RemoteGrpcTransport.test.ts`:

1. State transitions: `CONNECTING` → `CONNECTED` on `init()`; simulated error → `RECONNECTING` → `CONNECTED`
2. Backoff with jitter: verify timing bounds, max 10 attempts, then `ERROR`
3. Session resume: same `session_id` on reconnect, `Subscribe(last_event_id)` called, no B-rep replay
4. Rehydrate signal: `NOT_FOUND` on `OpenSession` → emit `rehydrate-needed`, no transport-owned B-rep map
5. Pending call retry: same `request_id` retried after reconnect, dedupe returns prior result
6. Pending call abort: `UNAVAILABLE` rejection when session/kernel lost
7. Token expiry: `UNAUTHENTICATED` → emit `token-expired`; `setToken()` → reconnect
8. Non-retryable errors: `PERMISSION_DENIED`/`RESOURCE_EXHAUSTED` rejected immediately
9. New calls during reconnect: queued, processed in order, deadline + `Cancel` on timeout
10. `online`/`visibilitychange` triggers immediate reconnect
11. Single-flight guard: two simultaneous errors → one reconnect loop
12. All existing tests continue to pass

**Integration test** (new file `src/core/io/__tests__/RemoteGrpcTransport.integration.test.ts`):
- Kill and restart the real gateway with a mock kernel
- Confirm no duplicate application on retry (dedupe returns prior result)
- Confirm `rehydrate-needed` emitted after gateway restart with kernel loss
- Confirm seq-gap handling: abandoned `client_seq` doesn't stall the gateway

## Acceptance Criteria

- [ ] Kill gateway mid-session: UI recovers
- [ ] No silent failures on formerly fire-and-forget calls (retry with dedupe, or `UNAVAILABLE` + replay)

## Open Questions

1. Does `OpenCascadeService` inject the snapshot provider for `Restore`, or does the document call it directly?
2. What is the default bounded queue size for calls made during RECONNECTING?
3. What is the exact `last_event_id` semantics on `Subscribe` resume — does the gateway guarantee no missed events?
4. How does `client_seq` gap timeout interact with retried calls that get a fresh `client_seq`?
