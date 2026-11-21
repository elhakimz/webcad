# Replacing Web Worker transport with gRPC (kernel link) and Connect (browser link)

**Ticket:** WC-EC (Epic: WebCad Engine Container) — WC-EC-09, 26, 27, 28, 29, 30, 31, 32, 36, 37, 47
**Date:** 2026-11-19
**Status:** Draft - pending human review

## Problem

WebCAD currently runs OCCT inside a browser Web Worker (`src/core/io/OCCWorker.ts`).
Commands travel from `src/core/io/OCCWorkerClient.ts` to the worker via
`worker.postMessage({ type, payload, id })`, and results come back through
`worker.onmessage`. The client matches requests to responses by a numeric `id`
map (`resolvers` / `rejecters`) and exposes a `pendingCount` used by the test
bridge's idle signal. There is **no WebSocket code** in `src/`, and **no `ws`
dependency** in `package.json`. The only "codec" is the ad-hoc
`{ type, payload, id }` postMessage envelope.

`OpenCascadeService.ts` wraps `OCCWorkerClient`, building `THREE.BufferGeometry`
from responses. It holds a single `workerClient` and exposes `pendingCount`,
`isInitialized`, `init()`, `clearCache()`, and a `rehydrate(doc)` method that
re-imports every solid's B-rep into the worker after undo.

The reform moves the OCCT kernel to a server-side process behind a Node.js
gateway, replacing the postMessage worker transport with:

- **gRPC** (HTTP/2) for gateway → kernel (native, Unix domain socket same-host,
  TCP+mTLS cross-host)
- **Connect protocol** for browser → gateway (connect-es client, connect-node
  server)

The local WASM worker transport stays as an option selected by config
(empty = local worker), behind the same `OCCTransport` interface. WebSocket is
removed from the engine path; no parallel WebSocket implementation is kept
(there is none to remove today).

## Decision

Use **protobuf as the single source of truth**, with **buf** for lint,
breaking-change checks, and codegen. PR 1 generates TypeScript only. The kernel
language is decided separately by the kernel-strategy ADR (WC-EC-05); PR 2a
uses a mock kernel and PR 2b implements the real kernel in the chosen language.

The gateway exposes both a Connect endpoint (browser-facing) and native gRPC
(gateway→kernel, internal only, never exposed to browsers).

Rejected alternatives:

- **gRPC-Web + Envoy.** Adds an extra proxy hop and operational complexity
  (Envoy config, TLS termination) without benefit. Connect already speaks
  gRPC-Web natively on the same HTTP surface, so Envoy is unnecessary.
- **WebSocket + protobuf.** Keeps the very pattern we are replacing. WebSocket
  framing duplicates what Connect provides over HTTP, and reintroduces upgrade/
  cookie/CORS complexity that Connect sidesteps via standard HTTP headers when
  same-origin; cross-origin Connect still needs CORS (see section G).
- **WebTransport.** Reached Baseline in March 2026, but implementations are
  uneven across browsers, Node has no built-in server support, and browsers on
  UDP-blocked networks fail the handshake. It would add a third protocol
  surface (gRPC + Connect + WebTransport) with no benefit over Connect's
  unary/server-streaming RPC model.

Trade-offs and revisit triggers: no client/bidi streaming means high-frequency
client→server traffic (live sketch drag, presence cursors) goes over unary
RPCs. The community `connect-bidi-web` package (0.x) offers bidi for Connect
over WebSocket/WebTransport as a possible future option. Revisit if measured
latency or request rates demand it.

## Open questions

| # | Question | Proposed resolution | Decided by |
|---|----------|-------------------|------------|
| O1 | Where are upload bytes stored: gateway temp dir or MinIO? | Gateway temp dir for PR 1/2a; MinIO evaluation in PR 2b | Human |
| O2 | Kernel language for PR 2b | Decided by kernel-strategy ADR WC-EC-05 | Human |
| O3 | Reorder-buffer timeout | 5 s (proposed default, configurable) | Human |
| O4 | Dedupe cache TTL | 10 min (proposed default, configurable) | Human |
| O5 | Dedupe cache size cap | 10k entries (proposed default, configurable) | Human |
| O6 | Replay buffer size | 1024 events or 2 minutes (proposed defaults, configurable) | Human |
| O7 | Result inline limit | 4 MiB (proposed default, configurable) | Human |
| O8 | BlobRef chunk size | <= 1 MiB per chunk (proposed default, configurable) | Human |
| O9 | BlobRef TTL | 15 min (proposed default, configurable) | Human |
| O10 | Per-session BlobRef quota | 64 MiB (proposed default, configurable) | Human |
| O11 | result_id TTL | 5 min (proposed default, configurable) | Human |
| O12 | Heartbeat interval | 15 s (proposed default, configurable) | Human |
| O13 | Max concurrent unary calls per session | 64 (interim, revisit after benchmark WC-EC-33) | Human |
| O14 | Per-operation-type deadlines | 120 s everywhere (interim, config table, revisit after benchmark WC-EC-33) | Human |

## Architecture

### A. Proto definitions (`proto/webcad/engine/v1/`)

Two files: `common.proto` and `engine.proto`.

**`common.proto`** — shared types:

- `CommandHeader { session_id, request_id, client_seq, document_id? }`
- `ResultHeader { request_id }`
- `MeshData { positions (bytes, float32 LE xyz), indices (bytes, uint32 LE),
  face_mapping (bytes, int32 LE), edge_lines (bytes, float32 LE packed),
  edge_offsets (bytes, uint32 LE offsets) }`
- `BrepReference { format (binary|text|step), sha256, data (bytes, opt-in) }` —
  `step` covers STEP-encoded legacy snapshots from
  the browser worker. The native kernel imports all three formats.
- `BlobRef { upload_id, sha256, size, session_id }` — generalised reference to
  any large uploaded field (B-rep, polyhedron point arrays, etc.), not only B-rep
- `RestoreRequest { repeated RestoreItem items, include_brep (bool) }` —
  repeated item list; max 128 items, max 64 MiB total per request
- `RestoreItem { entity_id, oneof { brep_ref (BrepReference), upload_id } }`
- `SessionEvent { event_id, oneof: progress, kernel_status, heartbeat,
  needs_rehydrate }` — `event_id` is monotonic per session
- `kernel_status` enum: `CONNECTED, RESTARTING, REHYDRATING`
- `ExecuteFailure { operation, code, message, details }` — in-band execution
  failure; `operation` names the failing operation
- `execution_failure_code` enum: `MISSING_ENTITY, INVALID_PARAMETER,
  INVALID_PROFILE, UNSUPPORTED, OPERATION_FAILED, GEOMETRY_EMPTY,
  IMPORT_FAILED, EXPORT_FAILED, INTERNAL`

**`engine.proto`** — services and messages:

`EngineGateway` (browser-facing, unary + server-streaming only):
- `OpenSession(OpenSessionRequest) → OpenSessionResponse`
- `Execute(ExecuteRequest) → ExecuteResponse` (unary, carries client_seq)
- `Restore(RestoreRequest) → RestoreResponse` (unary, carries client_seq)
- `Subscribe(SubscribeRequest) → stream SessionEvent` (server stream, unsequenced)
- `UploadChunk(UploadChunkRequest) → UploadChunkResponse` (unary, unsequenced)
- `Cancel(CancelRequest) → CancelResponse` (unary, unsequenced)
- `CloseSession(CloseSessionRequest) → CloseSessionResponse` (unary, unsequenced)
- `StreamResult(StreamResultRequest) → stream ResultChunk` (server stream, unsequenced)

`Kernel` (gateway-facing, unary + server-streaming):
- `Execute(ExecuteRequest) → ExecuteResponse` (unary)
- `ExecuteWithProgress(ExecuteRequest) → stream ExecuteProgress` (server stream)
- `Restore(RestoreRequest) → RestoreResponse` (unary)
- `PutBlob(stream PutBlobRequest) → PutBlobResponse` (client streaming — uploads
  blobs > 4 MiB from gateway to kernel; max blob size 16 MiB per stream)
- `StreamResult(stream ResultChunkRequest) → stream ResultChunk` (bidi-style:
  client sends result chunk requests, server streams result chunks; used by the
  kernel to push outputs > 16 MiB back to the gateway)
- `Health(HealthCheckRequest) → HealthCheckResponse` (unary; also serves
  `grpc.health.v1`)

`ExecuteRequest` carries `CommandHeader` + `oneof op` with the 34 operations from
`OCCWorker.ts`: `init, clearCache, releaseShapes, checkValidity, exportBRep,
importBRep, extractFaceProfile, createBox/Cylinder/Frustum/Sphere/Cone/Torus/
Wedge/Pyramid/Polyhedron/ConvexHull/Extrude/Revolve/Compound/Sweep/Loft/Boolean,
multMatrixShape/transformShape/rotateShape/mirrorShape/scaleShape,
filletSolid/chamferSolid/filletSolidFace/chamferSolidFace, makeThickSolid,
draftSolidFaces`

Each operation's payload fields are taken exactly from its handler in
`OCCWorker.ts` — no invented or renamed fields. Where an operation accepts a
large field, use `oneof { bytes inline; BlobRef ref }` for that field.

`ExecuteResponse` carries `ResultHeader` + `oneof { success, failure }`:
- `success { shape_id, oneof result, mesh (MeshData), brep_ref (BrepReference) }`
  — `result` is a per-operation typed message (box, cylinder, etc.) or a generic
  shape reference; `mesh` and `brep_ref` are optional payloads
- `failure { ExecuteFailure }` — in-band execution error (kernel-side problems)

`OpenSessionRequest` carries `CommandHeader` plus an optional `document_id`
(reserved for future multi-document sessions); the gateway rejects an
`OpenSession` for a `session_id` that already exists with `ALREADY_EXISTS`,
so clients must generate a fresh UUID v4 `session_id` per session.

`OpenSessionResponse` includes `protocol_version`, `minimum_client_version`,
`server_limits` (max message size, inline limit, chunk size, quotas),
`heartbeat_interval`, kernel and OCCT version, supported operations list.

`BrepReference { format (binary|text|step), sha256, data (bytes, opt-in) }` —
`step` covers STEP-encoded legacy snapshots from the browser worker. The native
kernel imports all three formats. `include_brep` is a boolean field on
`ExecuteRequest`/`RestoreRequest` (not on `BrepReference`), default per stage:
- `include_brep = true` while the client is authoritative (undo/redo and
  `Solid3D.brepSnapshot` depend on bytes returning with every operation)
- `include_brep = false` once the server holds authoritative state (return only
  the sha256 revision)

### B. Ordering and deduplication

WebSocket/postMessage provided FIFO ordering; separate unary gRPC calls do not.
The gateway applies commands per session strictly in `client_seq` order.

Sequenced RPCs (carry `client_seq`): `Execute`, `Restore`.
Unsequenced RPCs (no `client_seq`): `Subscribe`, `UploadChunk`, `Cancel`,
`CloseSession`, `StreamResult`, `OpenSession`, `Health`.

- `client_seq` starts at 1 per session, continues across Subscribe reconnects,
  and resets only on a new `OpenSession`.
- The gateway uses a bounded reorder buffer (proposed default: 64 entries,
  5 s timeout — both configurable). If the buffer overflows or a gap cannot be
  filled before timeout, the gateway aborts queued commands with `ABORTED`,
  moves the session to `REHYDRATING`, and forces the client to redo
  `OpenSession` + `Restore`. The client deadline includes time spent waiting
  for earlier sequence numbers.
- Deduplication by `request_id`: a duplicate `request_id` that arrives while
  the original is still running joins the in-flight call (no second execution);
  a completed duplicate returns the prior result.
- The dedupe cache is bounded: stores `request_id → status + result reference`
  with a TTL (proposed default: 10 min) and a size cap (proposed default: 10k
  entries). Results above 256 KiB are stored by reference (`result_id`),
  never inline. The dedupe TTL must be >= `result_id` TTL (5 min) so a retried
  request never returns a dead reference.
- Multi-instance gateways need sticky routing: every RPC carries an
  `x-session-id` header and nginx hashes on it.

### C. Client transport — `RemoteGrpcTransport`

Implements `OCCTransport` (same interface as the existing `OCCWorkerClient`):

- All 34 operation methods return `Promise<result>` — every call is awaited;
  no fire-and-forget.
- Fixes current fire-and-forget call sites:
  - `Document.undo()`/`redo()` call `transformShape(id, dx, dy, dz)` without
    awaiting — made tracked and awaited with failures surfaced to the UI.
  - `Document.restoreSolidBRep()` calls `importBRep` via `Promise.resolve(...).
    catch(...)` — made tracked and awaited with failures surfaced to the UI.
- Uses `connect-es` client to the gateway's Connect endpoint; `Execute`/`Restore`
  unary RPCs for commands, `Subscribe` server stream for events.
- `pendingCount` semantics preserved for `TestBridge` idle signal.
- Config-selected: empty string = local WASM worker (`OCCWorkerClient`),
  otherwise `RemoteGrpcTransport`.

`OpenCascadeService` holds either transport behind the `OCCTransport` interface.

### D. Subscribe stream and rehydrate

Server-streaming `Subscribe` RPC emits `SessionEvent`:
- `progress` — operation progress
- `kernel_status` — `CONNECTED / RESTARTING / REHYDRATING`
- `heartbeat` — every 15 s (proposed default, configurable)
- `needs_rehydrate` — the event gap cannot be replayed

Every `SessionEvent` carries a monotonic per-session `event_id`. Resume via
`last_event_id`: the gateway replays events after `last_event_id` from its
replay buffer. Replay buffer: 1024 events or 2 minutes (proposed defaults,
configurable), whichever is reached first. If the gap cannot be replayed
(buffer overwritten), the gateway emits `needs_rehydrate` and the client
reuses the `restoreMany` flow (WC-EC-30) via `EngineGateway.Restore(entity_id +
BrepReference or BlobRef)`.

`Restore` exists on both `EngineGateway` (browser-facing) and `Kernel`
(gateway-facing). Client reconnects with exponential backoff and shows
connection state in the UI.

### E. Payload limits

| Limit | Value | Scope | Notes |
|-------|-------|-------|-------|
| Browser→gateway request | 4 MiB | Connect read/write max-bytes | Verify option names per library |
| Inline response | 4 MiB | Connect/gRPC response | Above → result_id + StreamResult |
| StreamResult chunk | <= 1 MiB | per chunk | sha256 per stream; mesh and B-rep chunk types |
| Chunked upload | <= 1 MiB | per `UploadChunk` call | sha256 verified |
| BlobRef TTL | 15 min | per upload_id | Bound to session |
| Per-session BlobRef quota | 64 MiB | per session | Counts only unconsumed bytes; released once consumed by the kernel |
| PutBlob max blob size | 16 MiB | per stream | Gateway→kernel client streaming; rejected above by kernel |
| result_id TTL | 5 min | per result_id | Bound to session; freed on TTL expiry or explicit client release; must be <= dedupe TTL |
| Restore max items | 128 | per RestoreRequest | Repeated item list; rejected above with INVALID_ARGUMENT |
| Restore max bytes | 64 MiB | per RestoreRequest | Sum of all item blob sizes; rejected above with RESOURCE_EXHAUSTED |
| Gateway→kernel hard cap | 16 MiB | per gRPC message | Never raised above 16 MiB; outputs over 16 MiB use kernel→gateway StreamResult |
| Dedupe inline result cap | 256 KiB | dedupe cache | Above → stored by result_id |
| Reorder buffer | 64 entries / 5 s | per session | Overflow → ABORTED + REHYDRATING |

- `BlobRef` generalises `upload_id` so any large field (not only B-rep; e.g.
  polyhedron point arrays) can use it.
- Oversized non-`BlobRef` requests fail with `RESOURCE_EXHAUSTED` stating the
  limit.
- The gateway rejects browser→gateway requests over 4 MiB unless sent via
  `BlobRef` (chunked `UploadChunk`); the kernel rejects gateway→kernel messages
  over 16 MiB unless sent via `PutBlob` or `StreamResult`. Outputs over 16 MiB
  are streamed kernel→gateway via `StreamResult` and referenced by `result_id`.
- Where upload bytes are stored (gateway temp dir vs MinIO) is an open question
  (O1).
- Compression: gzip for B-rep text only. Browser request compression must be
  verified — browsers typically only compress responses.

Payload tests:
- 3.9 MiB request → inline OK
- 4.1 MiB request → rejected unless sent via `BlobRef` (chunked `UploadChunk`)
- 4.1 MiB response → returned by `result_id` + `StreamResult`
- Over 16 MiB output → streamed kernel→gateway via `StreamResult`, referenced by `result_id`; rejected only if the client declines streaming

### F. Errors and deadlines

| gRPC code | Meaning |
|-----------|---------|
| `INVALID_ARGUMENT` | protovalidate failures, bad request fields |
| `UNAUTHENTICATED` | JWT missing, expired, or invalid |
| `PERMISSION_DENIED` | Session/project claim insufficient |
| `FAILED_PRECONDITION` | Needs rehydrate (session state lost) |
| `ABORTED` | Stale version, aborted queued commands, reorder timeout |
| `UNAVAILABLE` | Kernel restarting / not reachable |
| `DEADLINE_EXCEEDED` | Operation or stream deadline |
| `CANCELLED` | Client cancelled the RPC |
| `INTERNAL` | Unexpected gateway or kernel failure |
| `NOT_FOUND` | Session, upload, or result not found |
| `RESOURCE_EXHAUSTED` | Quota (per-session BlobRef, rate limit) |

Execution (kernel-side) failures come in-band through
`ExecuteResponse.failure { ExecuteFailure }`, with a code from the
`execution_failure_code` enum derived from error cases thrown in `OCCWorker.ts`
handlers:

| Failure code | Meaning |
|--------------|---------|
| `MISSING_ENTITY` | Entity not found / not in kernel cache |
| `INVALID_PARAMETER` | Bad radius, angle, dimensions |
| `INVALID_PROFILE` | Failed wire or face creation, non-planar face extraction |
| `UNSUPPORTED` | Non-uniform scale, unsupported loft shape, unsupported operation |
| `OPERATION_FAILED` | Extrude, sweep, loft, shell, fillet, boolean failure |
| `GEOMETRY_EMPTY` | No geometry generated from shape |
| `IMPORT_FAILED` | B-rep import produced null shape |
| `EXPORT_FAILED` | B-rep export produced no file |
| `INTERNAL` | Unexpected gateway/kernel failure |

Per-operation-type deadlines replace the fixed 120 s client timeout and
propagate gateway → kernel via gRPC context. Deadline values are taken from
the benchmark ticket (WC-EC-33).

Cancel semantics by command state:
- **Queued / buffered** (awaiting its `client_seq` turn): dropped silently,
  no kernel impact, session state unchanged.
- **Running** (kernel actively executing): kill the kernel process,
  respawn, rehydrate (WC-EC-31 behavior), return `CANCELLED` to the client.

On deadline: same as Cancel running — kill-and-respawn assumes **one kernel
process per session**. The process pool holds only pre-warmed idle spares; a
live process is never shared across sessions. Kill the kernel process, respawn,
rehydrate (WC-EC-31 behavior), then return `DEADLINE_EXCEEDED`.

Commands queued behind a cancelled or timed-out command are aborted with
`ABORTED`, the session moves to `REHYDRATING`, and the client must redo
`OpenSession` + `Restore`.

A duplicate `request_id` that arrives while the original is still running joins
the in-flight call (no second execution); a completed duplicate returns the
prior result.

JWT expiry during `Subscribe`: the server ends the stream with
`UNAUTHENTICATED`; the client reopens with a fresh token. Auth covers
`UploadChunk` and `StreamResult` as well as `Execute`/`Restore`/`Subscribe`.

UDS socket permissions: kernel socket is `0700` owned by the gateway user.
mTLS certificate rotation: certificates are reloaded on SIGHUP without
restarting the gateway or kernel processes.

### G. Auth

JWT in `Authorization: Bearer <token>` header via a Connect/gRPC interceptor,
replacing whatever auth the postMessage transport used (none — same-origin
tab). Validates session/project claims.

Prefer same-origin (nginx in front of both Vite and the gateway) so COOP/COEP
stay valid. CORS added only for real cross-origin deployments. Cross-origin
Connect needs CORS; same-origin does not.

Session IDs are **client-generated** (UUID v4) so that sticky routing on
`x-session-id` works for `OpenSession` itself — the gateway does not create the
session id, it only associates it with a kernel process.

A gateway restart loses ordering, dedupe and replay state. Clients receive
`NOT_FOUND` on any subsequent RPC and must redo `OpenSession` + `Restore`.

### H. Infrastructure

- **Browser → nginx:** HTTP/2 over TLS. In dev, run **nginx in front of both
  Vite and the gateway** (nginx is already in docker-compose); Vite serves
  HTTP/1.1 to nginx, nginx upgrades to HTTP/2 TLS for the browser. The Vite
  dev proxy is **not** used for engine traffic — `/webcad.engine.v1/` goes
  straight to nginx, which proxies Connect to the gateway.
- **nginx → gateway:** HTTP/1.1 with `proxy_buffering off` and a long read
  timeout for streams. nginx terminates browser HTTP/2 and proxies Connect to
  the gateway. nginx is **not** on the gateway→kernel link.
- **Gateway → kernel:** native gRPC HTTP/2 over Unix domain socket (same host)
  or TCP+mTLS (cross hosts). gRPC is internal — it never crosses nginx.
  HTTP/2 keepalive between gateway and kernel.
- **UDS socket permissions:** kernel socket is `0700`, owned by the gateway user.
- **mTLS certificate rotation:** certificates are reloaded on SIGHUP without
  restarting gateway or kernel processes.
- **nginx sticky routing:** hash on `x-session-id` header for multi-instance
  gateways.
- **docker-compose:** app, kernel, postgres, minio, nginx services.

### I. Validation and quotas (WC-EC-32)

- `protovalidate` constraints on all proto message fields.
- Per-session rate limits on `Execute`/`Restore`/`UploadChunk`/`Subscribe`.
- Per-session BlobRef quota (64 MiB proposed default, configurable).

### J. Observability

- W3C trace-context propagation gateway → kernel.
- Metrics from WC-EC-33: request latency, error rate, active sessions,
  kernel restart count, rehydrate count.

### K. Cleanup and docs

- Remove the ad-hoc `{ type, payload, id }` postMessage envelope only if the
  local WASM worker transport is removed (it is NOT — it stays as a config
  option). No `ws` dependency to remove (none exists).
- Keep mesh and edge-line packing helpers — now used inside `bytes` fields in
  proto messages.
- Update `AGENTS.md`, `README.md`, and the protocol spec (WC-EC-09).
- Write ADR rejecting gRPC-Web+Envoy, WebSocket+protobuf, WebTransport (one
  paragraph each — see Decision section above).

## Data flow

```
Browser (RemoteGrpcTransport, connect-es)
    │  Connect HTTP/2 POST (unary Execute/Restore, server-stream Subscribe)
    ▼
nginx (TLS termination, hash on x-session-id)
    │  HTTP/1.1, proxy_buffering off
    ▼
Gateway (connect-node server)
    │  gRPC HTTP/2, UDS or TCP+mTLS (internal)
    ▼
Kernel (gRPC server, OCCT — language per WC-EC-05)
```

## Typed arrays

Decoded `bytes` fields may be misaligned relative to a `ArrayBuffer` boundary.
The client must copy into a fresh buffer or use `DataView` before creating
`Float32Array`/`Uint32Array`/`Int32Array` views. Test: pack a `Float32Array`
starting at an odd byte offset, round-trip through `bytes`, and assert values
are preserved.

## Testing

1. `buf lint` and `buf breaking` in CI.
2. Golden binary vectors for mesh and edge-line packing.
3. Same command script through three paths with matching results:
   - (1) local WASM worker
   - (2) browser client → gateway → mock kernel
   - (3) gateway → real kernel
4. Ordering: Node HTTP/2 test client injects random delays on 100 concurrent
   unary calls; gateway applies them in `client_seq` order; duplicate
   `request_id` applied once. (A browser cannot reorder requests.)
5. Kill kernel mid-operation: session recovers, client sees right status.
6. Payload sizes: 3.9 MiB inline OK; 4.1 MiB request rejected unless via
   `BlobRef`; 4.1 MiB response returned by `result_id`; over 16 MiB output
   streamed kernel→gateway via `StreamResult`, referenced by `result_id`.
7. Deadline expiry, Cancel, Subscribe drop + resume.
8. Playwright through nginx asserting HTTP/2, at least 20 concurrent unary
   calls while a Subscribe stream is open.
9. Playwright stream-buffering detection through nginx.
10. Slow-consumer backpressure on Subscribe (bounded server queue).
11. Token expiry during Subscribe: server ends stream with `UNAUTHENTICATED`,
    client reopens with fresh token.
12. StreamResult integrity: sha256 per stream matches.
13. Client/server protocol-version skew: `OpenSessionResponse.protocol_version`
    vs client minimum.
14. Typed arrays: odd byte offset round-trip preserves values.
15. Gateway restart: session state lost, client gets `NOT_FOUND`, redoes
    `OpenSession` + `Restore`.
16. Legacy STEP/BREP import: kernel accepts binary, text and STEP B-rep
    formats; client round-trips each.
17. Over-16 MiB output: streamed kernel→gateway via `StreamResult`, client
    reassembles and verifies sha256.
18. In-flight duplicate `request_id`: second call joins the running call,
    returns same result; no double execution.
19. Gap timeout → `ABORTED` + `REHYDRATING`; client must `OpenSession` +
    `Restore` to continue.
20. BlobRef quota release: bytes counted only while unconsumed; freed once
    consumed; per-session 64 MiB cap enforced.
21. Cancel queued vs running: queued = dropped silently; running = kill +
    rehydrate + `CANCELLED`.
22. Sticky routing: nginx hash on `x-session-id` routes all session RPCs to
    same gateway instance.

### F. Errors and deadlines

gRPC status codes are reserved for transport and session problems only:

## Rollout (four PRs)

1. **PR 1:** proto + codegen + CI (`proto/webcad/engine/v1/`, `buf.yaml`,
   `buf.gen.yaml`, buf lint/breaking in CI). TypeScript codegen only.
2. **PR 2a:** gateway + mock kernel (TypeScript). Connect server, ordering/
   dedupe, large payloads, auth interceptor, deadlines, Subscribe/rehydrate.
3. **PR 2b:** real kernel server in the language chosen by WC-EC-05 ADR.
4. **PR 3:** client + infra + cleanup (`RemoteGrpcTransport`, nginx, Vite
   proxy, docker-compose, docs updates).

## Non-goals

- Engine-core features (command registry, feature graph, versions).
- Kernel operation porting (OCCT implementation in the kernel language).
- Any change to operation semantics.
- Parallel WebSocket implementation (none exists today; none added).

## Review resolution

| Required change | Section changed |
|-----------------|-----------------|
| Status "Draft - pending human review", date 2026-11-19 | Header |
| Open questions section | New section after Decision |
| Review resolution table | End of doc |
| Error model: in-band failure enum, UNAUTHENTICATED/PERMISSION_DENIED/NOT_FOUND/INTERNAL | F |
| Rehydrate/resume: Restore on EngineGateway, needs_rehydrate, event_id, replay buffer, last_event_id semantics | D |
| Ordering: unsequenced RPCs, client_seq rules, 5s reorder buffer, bounded dedupe cache, x-session-id sticky routing, Node HTTP/2 test | B |
| HTTP versions: HTTP/2 TLS browser→nginx, HTTP/1.1 nginx→gateway, remove grpc_pass | G, H |
| Payload limits table, BlobRef generalisation, gzip B-rep text only, storage location open question | E |
| Remove grpc_pass statement | H |
| Remove hardcoded C++, PR split into 2a/2b | A, Rollout |
| Rewrite Problem section (Web Worker postMessage, no ws) | Problem |
| Rewrite Cleanup section (no ws to remove, ad-hoc envelope stays) | K |
| Typed arrays misalignment + DataView test | Typed arrays section |
| Auth JWT expiry during Subscribe, upload/StreamResult auth, UDS permissions, mTLS rotation | F, G, H |
| Validation and quotas section (WC-EC-32) | I |
| OpenSession response details | A |
| BrepReference include_brep flag | A |
| Kill-and-respawn one-kernel-per-session assumption | F |
| Additional tests (Playwright h2, backpressure, token expiry, StreamResult integrity, version skew, trace-context, metrics) | Testing, J |
| Rejected alternatives updates (WebTransport facts, gRPC-Web Envoy, WebSocket+CORS) | Decision |
| Trade-offs and revisit triggers paragraph | Decision |
| Mark numeric defaults as proposed/configurable | Throughout (tables + text) |
| Client-streaming PutBlob RPC + StreamResult kernel→gateway for >16 MiB outputs; max blob 16 MiB; fix test 6 wording | A, E, Testing |
| result_id freed on TTL or explicit client release (not on full fetch) | E, Open questions |
| Benchmark ticket reference fixed to WC-EC-33 | F, Open questions |
| include_brep moved from BrepReference to ExecuteRequest/RestoreRequest | A |
| Remove "BlobRef instead of raw bytes" paragraph; keep oneof { bytes inline; BlobRef ref } | A |
| Restore takes repeated item list (max 128 items, max 64 MiB per request) | A, D |
| Cancel semantics by state: queued = drop; running = kill + rehydrate + CANCELLED | F |
| nginx in front of Vite + gateway for dev everywhere; remove Vite-proxy engine bullets | G, H, Rollout |
| Remove "native gRPC on same port"; fix CORS sentence | Decision |
| document_id reserved in OpenSessionRequest and CommandHeader | A |
| OpenSession rejects existing session_id with ALREADY_EXISTS | A |
| O13 (64 concurrent) and O14 (120 s everywhere) marked interim, revisit after benchmark WC-EC-33 | Open questions |
| Removed duplicated paragraphs | Throughout |
| Added missing tests: gateway restart, legacy STEP/BREP import, over-16 MiB streaming, in-flight duplicate join, gap → ABORTED/REHYDRATING, quota release, cancel queued vs running, sticky routing | Testing |
| Second round: PutBlob + StreamResult max blob size and rejection layers; test 6 wording | A, E, Testing |
| Second round: result_id freed on TTL or explicit release | E |
| Second round: Benchmark ticket reference corrected to WC-EC-33 | J |
| Second round: include_brep on ExecuteRequest/RestoreRequest (not BrepReference) | A |
| Second round: Remove "BlobRef instead of raw bytes" paragraph; keep oneof | A |
| Second round: Restore repeated item list with max items/bytes | A, D |
| Second round: Cancel semantics by state (queued drop / running kill+rehydrate) | F |
| Second round: nginx in front of Vite + gateway for dev | G, H, Rollout |
| Second round: Remove "native gRPC on same port"; fix CORS sentence | Decision |
| Second round: document_id reserved in OpenSessionRequest and CommandHeader | A |
| Second round: OpenSession rejects existing session_id with ALREADY_EXISTS | A |
| Second round: O13 (64) and O14 (120 s) marked interim, revisit after WC-EC-33 | Open questions |