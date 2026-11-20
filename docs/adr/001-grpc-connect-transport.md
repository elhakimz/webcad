# ADR-001: Replace WebSocket engine transport with gRPC (kernel) + Connect (browser)

**Status:** Draft - pending human review  
**Date:** 2026-11-19  
**Epic:** WebCad Engine Container (WC-EC)  
**Author:** [pending]  

## Context

WebCAD currently runs OCCT (OpenCascade) in the browser via a Web Worker using `opencascade.js` — a large WASM payload delivered to every client. The engine transport between the browser client and the worker uses `postMessage`. There is no WebSocket code and no `ws` dependency in the repository.

The goal is to move OCCT to a server-side kernel, with the browser connecting through a gateway. Two protocols are used:

- **Browser → Gateway**: Connect protocol (connect-es / connect-node) over HTTP/2 terminated by nginx
- **Gateway → Kernel**: native gRPC (HTTP/2) over Unix domain socket (same host) or TCP with mTLS (across hosts)

The WebSocket transport is removed entirely. The local WASM worker transport remains as a fallback when no gateway URL is configured.

## Decision

Use **protobuf + buf** as the single source of truth. Generate TypeScript client stubs (PR 1) and kernel server code in the language chosen by the kernel-strategy ADR (PR 2b). The gateway and mock kernel are TypeScript (PR 2a).

- **Browser ↔ Gateway**: Connect protocol. Only unary and server-streaming RPCs (browsers cannot do native gRPC, client streaming, or bidirectional streaming).
- **Gateway → Kernel**: native gRPC. Client streaming supported on this hop only (PutBlob for large blobs).
- **Session ID**: client-generated (UUID v4) to enable sticky routing on `x-session-id` for `OpenSession` itself.

## Rejected Alternatives

### gRPC-Web + Envoy

Rejected. Adds an extra proxy hop (Envoy) between browser and gateway. Connect already speaks gRPC-Web natively, so Envoy provides no protocol advantage while adding operational complexity, configuration surface, and another potential failure point. The Connect client can fall back to gRPC-Web encoding transparently when needed.

### WebSocket + protobuf

Rejected. WebSocket + protobuf would require a custom frame codec, heartbeats, reconnection logic, and ordering guarantees built from scratch. Connect provides these out of the box over HTTP/2. Claim that Connect sidesteps CORS is incorrect — cross-origin Connect requires CORS just like WebSocket; same-origin deployment (Vite proxy / nginx) avoids both issues.

### WebTransport

Rejected. WebTransport reached Baseline in March 2026, but implementations are uneven across browsers, Node has no built-in server support, and browsers on UDP-blocked networks fail the QUIC handshake. It also lacks the mature gRPC/Connect ecosystem (codegen, interceptors, retries, tracing). Keep as a future option if measured latency or request rates demand bidirectional streaming.

## Trade-offs and Revisit Triggers

No client/bidi streaming on the browser hop means high-frequency client→server traffic (live sketch drag, presence cursors) is unary — one RPC per event. The community `connect-bidi-web` package (0.x) offers bidi for Connect over WebSocket/WebTransport as a possible future option. Revisit if measured latency or request rates demand it.

## Open Questions

- Where are upload bytes stored: gateway temp dir vs MinIO?
- Exact numeric defaults for dedupe cap (O5), concurrent unary calls (O13), per-operation deadlines (O14) — interim values recorded, revisit after benchmark (WC-EC-33).
- Kernel language for PR 2b — awaiting kernel-strategy ADR (WC-EC-05) decision.

## Review Resolution

| Item | Section Changed |
|------|----------------|
| Error model: in-band ExecuteResponse failure enum | common.proto, engine.proto, section B |
| Rehydrate/resume: Restore on EngineGateway, needs_rehydrate, event_id, replay buffer | engine.proto, section C |
| Ordering: unsequenced vs sequenced RPCs, client_seq scoping, dedupe TTL/cap, sticky routing, reorder buffer size | sections B, D |
| HTTP/2: browser→nginx TLS, nginx→gateway HTTP/1.1, dev via nginx | sections G, H |
| Payload limits: table with 4 MiB request / 16 MiB cap / result_id + StreamResult / BlobRef oneof | sections E, D |
| Remove grpc_pass for gateway→kernel; nginx only terminates browser HTTP/2 | section G |
| Kernel language not hardcoded; PR 2a/2b split | section D, PR structure |
| Problem statement: postMessage worker, no ws dependency, actual undo/restore call sites | Problem section |
| Cleanup: remove vacuous steps, keep mesh/edge-line packing helpers | Cleanup section |
| Typed arrays: misaligned buffer handling via DataView | section A, test additions |
| Auth: JWT expiry on Subscribe, upload/StreamMesh auth, UDS permissions, mTLS rotation, protovalidate | sections F, D |
| OpenSession response fields; include_brep default per stage | engine.proto, section A |
| Kill-and-respawn assumes one kernel per session | section D |
| Added tests: gateway restart, legacy STEP/BREP, over-16MiB streaming, in-flight duplicate, gap→ABORTED, quota release, cancel queued vs running, sticky routing | Test plan |
| PutBlob client streaming on gateway→kernel; StreamResult for large results | engine.proto, section D |
| result_id freed on TTL or explicit release (not on full fetch) | section D |
| Benchmark ticket: WC-EC-33 (not WC-EC-38) | section D |
| include_brep moved from BrepReference to execute/restore request | engine.proto, section A |
| Deleted old BlobRef paragraph; kept oneof | engine.proto, section A |
| Restore takes repeated item list with max items/bytes | engine.proto, section D |
| Cancel semantics by state: queued=drop, running=kill+rehydrate | section D |
| nginx in front of Vite and gateway for dev; remove Vite-proxy engine bullets | sections G, H, PR 3 |
| Removed "native gRPC on same port"; fixed CORS sentence | Decision, section G |
| document_id reserved in OpenSessionRequest and CommandHeader | common.proto, engine.proto |
| OpenSession behavior for existing session_id | engine.proto, section A |
| O13=64, O14=120s interim values | section D |
| Removed duplicated paragraphs; added missing tests | Test plan |