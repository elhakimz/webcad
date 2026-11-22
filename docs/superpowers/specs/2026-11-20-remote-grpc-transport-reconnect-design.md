# RemoteGrpcTransport: reconnect, heartbeat, connection state

**Ticket:** WC-EC-28 — RemoteGrpcTransport (client)
**Date:** 2026-11-20
**Status:** Draft - pending human review
**Depends on:** WC-EC-26, WC-EC-27

## Problem

`RemoteGrpcTransport.ts` already implements all `OCCTransport` methods over Connect/gRPC, but lacks:

1. **Reconnect with backoff** — if the gateway is killed mid-session, the transport stays broken until the page reloads. The epic requires "Kill gateway mid-session: UI recovers."
2. **Connection state events** — no way for `OpenCascadeService` or the UI to know if the transport is `connected`, `reconnecting`, `rehydrating`, `disconnected`, or `error`.
3. **Heartbeat** — no liveness detection; a silent network failure isn't detected until the next RPC.
4. **Fire-and-forget error surfacing** — in-flight calls dropped by a disconnect are silently lost instead of rejected.

## Decision

Enhance `RemoteGrpcTransport.ts` in-place (Approach 1). All transport state (`sessionId`, `client`, listeners, pending calls) already lives in one class; adding reconnect, heartbeat, and state events there is the simplest change that meets all acceptance criteria. No new files.

## Architecture

### ConnectionState enum

```
CONNECTED    — session open, RPCs can be sent
RECONNECTING — connection lost, backoff reconnect in progress
REHYDRATING  — session re-opened, re-importing stored B-reps
DISCONNECTED — closeSession called, no reconnect
ERROR        — max reconnect attempts exceeded, stopped
```

### State subscribers

Two mechanisms, same state set:
- **Callback:** `onStateChange?: (state: ConnectionState) => void` config option
- **EventEmitter:** `on('state', handler)` / `off('state', handler)`

### Reconnect

- Triggered on any transport error (network, gateway kill, heartbeat failure)
- Exponential backoff: 1s, 2s, 4s, ... cap 30s
- Max 10 attempts, then `ERROR` state
- On success: re-create Connect client, `OpenSession`, re-subscribe to event stream, state `REHYDRATING`, replay stored B-reps, state `CONNECTED`
- `closeSession()` resets to `DISCONNECTED`, clears reconnect timer

### Heartbeat

- Interval (default 30s, configurable) sends a lightweight RPC
- Failure triggers reconnect (same path as network error)
- Interval cleared during reconnect, resumed on `CONNECTED`

### Pending-call registry

- `Map<requestId, { resolve, reject, timestamp }>` tracks in-flight `execute()` calls
- On reconnect, all pending entries rejected with `GrpcTransportError('ABORTED', 'connection lost')`
- Consumers `await` and catch these — no silent failures

### B-rep snapshot storage (for rehydration)

- Transport stores `entityId → brepBytes` from successful `create*`/`importBRep` calls
- After reconnect, each stored B-rep re-imported via `importBRep(entityId, brepBytes)`
- Map cleared on `closeSession()`

## Data Flow

**Normal operation** (unchanged):
1. `init()` creates Connect client, calls `OpenSession`, state → `CONNECTED`
2. Each OCC method builds protobuf op, `execute()` sends `Execute` RPC with incremented `clientSeq`
3. Response parsed; `GrpcTransportError` thrown on `failure` case

**On transport error:**
1. State → `RECONNECTING`, subscribers notified
2. Reconnect loop: backoff wait → new Connect client → `OpenSession` → re-subscribe
3. On success: state → `REHYDRATING` → replay B-reps → state → `CONNECTED`
4. Pending in-flight calls rejected with `ABORTED`

**Heartbeat failure:** Same path as network error — triggers reconnect.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `execute()` returns `failure` | `GrpcTransportError(code, message)` — unchanged |
| Network / gateway kill | State `RECONNECTING`, reconnect loop, pending calls `ABORTED` |
| Heartbeat failure | Same as network error |
| Max reconnect attempts | State `ERROR`, no auto-reconnect, user calls `init()` again |
| `closeSession()` during reconnect | State `DISCONNECTED`, clears timer, nulls client |
| `init()` while `CONNECTED` | No-op |

Error codes: `ExecutionFailureCode` for kernel errors; `GrpcTransportError` with `ABORTED`/`FAILED_PRECONDITION`/`UNAVAILABLE` for transport issues. Generic UI messages; details in logs (consistent with WC-EC-27).

## Testing

New test cases in `src/core/io/__tests__/RemoteGrpcTransport.test.ts`:

1. Connection state transitions: `init()` → `CONNECTED`; simulated error → `RECONNECTING` → `CONNECTED`
2. Reconnect with exponential backoff timing
3. Heartbeat sends RPC; failure triggers reconnect
4. Pending call rejected with `ABORTED` on disconnect
5. Auto-rehydrate: stored B-reps re-imported after reconnect
6. `closeSession()` during reconnect resets state and clears timer
7. Max attempts → `ERROR` state, no more retries
8. All existing tests continue to pass

No new test files. Mock Connect client already exists; extend for reconnect scenarios.

## Acceptance Criteria

- [x] Kill gateway mid-session: UI recovers (reconnect → reopen session → re-subscribe → rehydrate)
- [x] No silent failures on formerly fire-and-forget calls (pending-call registry rejects with `ABORTED`)

## Open Questions

None. All decisions recorded above.
