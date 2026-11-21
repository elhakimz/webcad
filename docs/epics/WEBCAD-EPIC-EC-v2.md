# WebCad Engine Container (WC-EC) - v2: native OCCT kernel

Run the WebCad geometry kernel as native OCCT (latest stable, pinned to 8.0.1) in server-side worker processes behind a Node gateway, connected to the UI over WebSocket; the OCCT WASM worker remains in the browser as offline/preview fallback. Then evolve the service into an Onshape-style engine: server-owned document, feature graph, persistent topology references, versioned operation log.

Supersedes the first version of this epic (WASM-in-Node server). Staged deployment: Node app + native kernel workers + postgres + minio + nginx; split mesh/export or collaboration services only after measured contention.

**Priority:** high · **Labels:** webcad, engine

## Tickets overview

| ID | Title | Priority | Phase |
|---|---|---|---|
| WC-EC-01 | ADR: native OCCT 8.x kernel behind a language-neutral protocol | high | Phase 1 |
| WC-EC-02 | OCCT 8.0.1 build image (pinned, reproducible) | high | Phase 1 |
| WC-EC-03 | Language-neutral kernel protocol spec + codecs (TS and C++) | high | Phase 1 |
| WC-EC-04 | Kernel worker skeleton (C++17, CMake) | high | Phase 1 |
| WC-EC-05 | Gateway kernel supervisor (Node): spawn, pool, framing, respawn | high | Phase 1 |
| WC-EC-06 | Parity harness: WASM worker vs native kernel | high | Phase 2 |
| WC-EC-07 | Port: primitives and transforms | high | Phase 2 |
| WC-EC-08 | Port: sketch to wire/face, extrude, revolve | high | Phase 2 |
| WC-EC-09 | Port: booleans (cut/fuse/common, parallel mode) | high | Phase 2 |
| WC-EC-10 | Port: fillet, chamfer, shell, draft, offset | high | Phase 2 |
| WC-EC-11 | Port: sweep, loft, text/path, scad CSG executor ops and remaining message types | medium | Phase 2 |
| WC-EC-12 | Port: tessellation to binary buffers | high | Phase 2 |
| WC-EC-13 | B-rep import/export and cross-version compatibility | high | Phase 2 |
| WC-EC-14 | Server-side STEP / STL / glTF export | medium | Phase 2 |
| WC-EC-15 | Extract OCCTransport interface; keep WASM worker as local fallback | high | Phase 3 |
| WC-EC-16 | Gateway: WebSocket server, auth hello, sessions | high | Phase 3 |
| WC-EC-17 | RemoteWsTransport (client) | high | Phase 3 |
| WC-EC-18 | Vite dev proxy and local/remote switch | medium | Phase 3 |
| WC-EC-19 | Session resume, rehydrate and restoreMany | high | Phase 3 |
| WC-EC-20 | Cancellation, per-operation timeouts, progress events | medium | Phase 3 |
| WC-EC-21 | Input validation, frame limits and quotas | high | Phase 3 |
| WC-EC-22 | Benchmark on real models: native vs WASM, thread scaling | high | Phase 4 |
| WC-EC-23 | Kernel process pool, affinity, idle eviction, cgroup limits | medium | Phase 4 |
| WC-EC-24 | Crash isolation, diagnostics and sanitizer CI | high | Phase 4 |
| WC-EC-25 | Dockerfile and docker-compose (app, kernel, postgres, minio, nginx) | high | Phase 4 |
| WC-EC-26 | Auth, origin check and sandboxing | high | Phase 4 |
| WC-EC-27 | Observability: metrics and structured logs | medium | Phase 4 |
| WC-EC-28 | Production file API (replace Vite dev middleware) | medium | Phase 4 |
| WC-EC-29 | OCCT upgrade policy and regression corpus | medium | Phase 4 |
| WC-EC-30 | Spike: shape history API for persistent references | high | Phase 5 |
| WC-EC-31 | Persistent face/edge ids | high | Phase 5 |
| WC-EC-32 | Replace index references; geometric-signature fallback | high | Phase 5 |
| WC-EC-33 | Document-level feature graph and partial rebuild | high | Phase 5 |
| WC-EC-34 | Per-step shape cache keyed by feature-chain hash | medium | Phase 5 |
| WC-EC-35 | Command API (AddFeature / EditFeature / Suppress / Reorder) | high | Phase 5 |
| WC-EC-36 | Operation log and microversions in Postgres | high | Phase 5 |
| WC-EC-37 | Document actor: serial queue, worker affinity, viewer broadcast | high | Phase 5 |
| WC-EC-38 | Server-side sketch re-solve | medium | Phase 5 |
| WC-EC-39 | Per-user undo/redo as inverse changes | medium | Phase 5 |
| WC-EC-40 | Concurrent writers with rebase (stage 2) | low | Phase 5 |
| WC-EC-41 | Assembly model (backlog) | low | Phase 5 |

---

## Phase 1 - Native kernel foundations

### WC-EC-01 - ADR: native OCCT 8.x kernel behind a language-neutral protocol

**Priority:** high · **Labels:** adr, architecture · **Parent:** WC-EC

**Goal:** Record the decision: Node gateway + native OCCT kernel worker processes; WASM worker stays in the browser as offline/preview fallback.

**Tasks**
- [ ] Document benchmark evidence (same job, boolean-heavy: WASM-in-Node 6.3 s vs native OCCT 7.7 0.6 s vs native OCCT 8.0 0.43 s for 30 cuts; meshing ~3x; single core, one run, WASM build is an older OCCT) and its caveats
- [ ] Pin target: OCCT 8.0.1 (latest stable per public sources as of Oct 2026); confirm the exact git tag on the OCCT GitHub releases page
- [ ] Decide kernel language (C++17 direct; Python OCP only as prototyping aid)
- [ ] LGPL-2.1 review for server deployment and any binary distribution
- [ ] Define what is authoritative: server owns B-rep; client receives meshes

**Acceptance criteria**
- [ ] ADR merged in docs
- [ ] Open risks listed (8.0.x maturity, ecosystem bindings lag, OCCT version differences)

### WC-EC-02 - OCCT 8.0.1 build image (pinned, reproducible)

**Priority:** high · **Labels:** infra, kernel · **Parent:** WC-EC · **Depends on:** WC-EC-01

**Goal:** Container image with OCCT built from the pinned tag.

**Tasks**
- [ ] Multi-stage Dockerfile: build OCCT from source (Release, only required modules), runtime stage with shared libs only
- [ ] Verify module/toolkit layout against the 8.0 documentation (Data Exchange modules were restructured in 8.0)
- [ ] Enable/disable TBB per decision; record compiler flags
- [ ] SBOM and image scan in CI

**Acceptance criteria**
- [ ] Image builds reproducibly in CI
- [ ] Smoke test: create box, boolean, mesh, BRep round trip inside the image

### WC-EC-03 - Language-neutral kernel protocol spec + codecs (TS and C++)

**Priority:** high · **Labels:** protocol, kernel · **Parent:** WC-EC · **Depends on:** WC-EC-01

**Goal:** Replace JS-structured-clone assumptions with a spec both gateway and kernel implement.

**Tasks**
- [ ] Frame = [u32 headerLen][header][buffers]; header (JSON, JSON-Schema defined) lists buffers name/dtype/length
- [ ] Message catalog derived from the ~40 types in OCCWorker.ts; response always carries id, success, error
- [ ] edgeLines packed as Float32Array + offsets (no number[][] on the wire)
- [ ] Golden test vectors shared by TS and C++ implementations
- [ ] Version field and capability negotiation in hello

**Acceptance criteria**
- [ ] Round-trip tests pass in both languages with identical golden files
- [ ] Spec reviewed against every message type

### WC-EC-04 - Kernel worker skeleton (C++17, CMake)

**Priority:** high · **Labels:** kernel · **Parent:** WC-EC · **Depends on:** WC-EC-02, WC-EC-03

**Goal:** Process that reads framed requests from a Unix socket or stdio and dispatches to handlers.

**Tasks**
- [ ] Handler registry, per-process shape cache keyed by entityId (as today)
- [ ] Map Standard_Failure / std::exception to protocol errors; never crash on bad input
- [ ] Structured logging, debug flag for verbose logs
- [ ] Graceful shutdown; health ping
- [ ] Unit tests with a fake client

**Acceptance criteria**
- [ ] Handles ping, createBox, release over the protocol
- [ ] Malformed frames produce errors, not crashes

### WC-EC-05 - Gateway kernel supervisor (Node): spawn, pool, framing, respawn

**Priority:** high · **Labels:** server, kernel · **Parent:** WC-EC · **Depends on:** WC-EC-04

**Goal:** Node side that owns kernel processes.

**Tasks**
- [ ] Spawn kernel processes and speak the protocol over UDS/stdio
- [ ] Per-session (later per-document) FIFO queue preserving ordering the client relies on
- [ ] Backpressure, health checks, kill on timeout, respawn + rehydrate
- [ ] Process pool with warm instances (native start is far cheaper than the ~3 s WASM init)

**Acceptance criteria**
- [ ] Killing a kernel mid-operation recovers the session automatically
- [ ] Ordering preserved under load test


---

## Phase 2 - Port operations (parity-driven)

### WC-EC-06 - Parity harness: WASM worker vs native kernel

**Priority:** high · **Labels:** testing, kernel · **Parent:** WC-EC · **Depends on:** WC-EC-04

**Goal:** Use the existing WASM worker as the behavioral oracle while porting.

**Tasks**
- [ ] Operation scripts replayed against both kernels
- [ ] Compare volume, surface area, bbox, face/edge/vertex counts, validity (BRepCheck) with tolerances
- [ ] Known differences between OCCT versions documented, not silently ignored
- [ ] Run in CI per ported operation group

**Acceptance criteria**
- [ ] Harness green for each ported group
- [ ] Report artifact lists tolerances and diffs

### WC-EC-07 - Port: primitives and transforms

**Priority:** high · **Labels:** kernel, port · **Parent:** WC-EC · **Depends on:** WC-EC-06

**Goal:** Box, cylinder, sphere, cone, torus, wedge; translate/rotate/scale/mirror; copy; release.

**Tasks**
- [ ] Implement handlers against OCCT 8 C++ API (no _1/_2 binding suffixes; Message_ProgressRange arguments)
- [ ] Map entityId lifecycle (create/transform/release)

**Acceptance criteria**
- [ ] Parity harness passes for the group

### WC-EC-08 - Port: sketch to wire/face, extrude, revolve

**Priority:** high · **Labels:** kernel, port · **Parent:** WC-EC · **Depends on:** WC-EC-06

**Goal:** Profile construction and basic feature ops.

**Tasks**
- [ ] Wire/face building from sketch payloads, arcs/splines/holes
- [ ] Extrude (incl. draft/both directions), revolve
- [ ] Validation of closed profiles with clear errors

**Acceptance criteria**
- [ ] Parity harness passes for the group

### WC-EC-09 - Port: booleans (cut/fuse/common, parallel mode)

**Priority:** high · **Labels:** kernel, port · **Parent:** WC-EC · **Depends on:** WC-EC-06

**Goal:** Booleans are the hot path in the benchmark.

**Tasks**
- [ ] Implement with BRepAlgoAPI_*; evaluate SetRunParallel and fuzzy tolerance
- [ ] Retain history (Generated/Modified/IsDeleted) for persistent ids later
- [ ] Timing comparison vs WASM on the benchmark job

**Acceptance criteria**
- [ ] Parity passes
- [ ] Native is measurably faster than WASM on the benchmark job

### WC-EC-10 - Port: fillet, chamfer, shell, draft, offset

**Priority:** high · **Labels:** kernel, port · **Parent:** WC-EC · **Depends on:** WC-EC-06

**Goal:** Finishing operations that currently take raw edgeIndex/faceIndices.

**Tasks**
- [ ] Port with the same inputs first (indices), keep behavior identical
- [ ] Expose history so persistent refs can replace indices later (see engine core)
- [ ] Error reporting for failed fillets (which edge)

**Acceptance criteria**
- [ ] Parity harness passes
- [ ] Failure cases return structured errors

### WC-EC-11 - Port: sweep, loft, text/path, scad CSG executor ops and remaining message types

**Priority:** medium · **Labels:** kernel, port · **Parent:** WC-EC · **Depends on:** WC-EC-06

**Goal:** Everything else in OCCWorker.ts (inventory the full message list; ~40 types).

**Tasks**
- [ ] Inventory remaining handlers and rank by usage
- [ ] Port in order of usage; leave rarely used ones on a deprecation list
- [ ] Support temp ids used by the scad CsgExecutor (scad_N)

**Acceptance criteria**
- [ ] Message inventory shows 100% ported or explicitly deprecated

### WC-EC-12 - Port: tessellation to binary buffers

**Priority:** high · **Labels:** kernel, port, performance · **Parent:** WC-EC · **Depends on:** WC-EC-06, WC-EC-03

**Goal:** positions, indices, faceMapping, edge polylines from BRepMesh_IncrementalMesh.

**Tasks**
- [ ] Deflection/angle parameters matching current visual quality
- [ ] faceMapping (triangle -> face index) and edge lines as packed buffers
- [ ] Parallel meshing (OSD_ThreadPool/BRepMesh parallel flag) measured on a multi-core host

**Acceptance criteria**
- [ ] Mesh stats match WASM within tolerance
- [ ] Payload smaller than JSON equivalent (measure)

### WC-EC-13 - B-rep import/export and cross-version compatibility

**Priority:** high · **Labels:** kernel, persistence · **Parent:** WC-EC · **Depends on:** WC-EC-04

**Goal:** importBRep/exportBRep with native BinTools plus text BRep fallback.

**Tasks**
- [ ] Test B-rep produced by the browser WASM worker (older OCCT, text BRep path because BinTools is absent there) imported by OCCT 8.0.1
- [ ] Test 8.0.1 export imported by the WASM worker if the local fallback is kept
- [ ] Content hash of B-rep for caching and revisions
- [ ] Fuzz-test the importer (untrusted input)

**Acceptance criteria**
- [ ] Cross-version round trips pass or incompatibilities are documented with a migration path

### WC-EC-14 - Server-side STEP / STL / glTF export

**Priority:** medium · **Labels:** kernel, export · **Parent:** WC-EC · **Depends on:** WC-EC-12

**Goal:** Exports run in the kernel (later a separate mesh worker if they block geometry ops).

**Tasks**
- [ ] Use the OCCT 8 data-exchange modules (verify names/layout in 8.0 docs)
- [ ] Stream results to MinIO, return a link

**Acceptance criteria**
- [ ] Exports of a sample assembly open correctly in a third-party viewer


---

## Phase 3 - Gateway and client integration

### WC-EC-15 - Extract OCCTransport interface; keep WASM worker as local fallback

**Priority:** high · **Labels:** refactor, transport · **Parent:** WC-EC

**Goal:** Seam between UI and kernel.

**Tasks**
- [ ] Derive OCCTransport from OCCWorkerClient public methods (send, pendingCount, init)
- [ ] LocalWorkerTransport = today's OCCWorkerClient
- [ ] OpenCascadeService selects transport from config

**Acceptance criteria**
- [ ] No behavior change in local mode
- [ ] TestBridge idle detection (pendingCount) still works

### WC-EC-16 - Gateway: WebSocket server, auth hello, sessions

**Priority:** high · **Labels:** server, transport · **Parent:** WC-EC · **Depends on:** WC-EC-05, WC-EC-03

**Goal:** ws server mapping sessions to kernel processes via the supervisor.

**Tasks**
- [ ] hello {sessionId, projectId, token}
- [ ] Session registry; isolation of entityIds between sessions
- [ ] Forward binary frames to/from the kernel unchanged where possible (zero-copy Buffers)

**Acceptance criteria**
- [ ] Two sessions cannot see each other's shapes

### WC-EC-17 - RemoteWsTransport (client)

**Priority:** high · **Labels:** client, transport · **Parent:** WC-EC · **Depends on:** WC-EC-15, WC-EC-16

**Goal:** Client transport implementing OCCTransport over WebSocket.

**Tasks**
- [ ] Request/response by id, timeout, heartbeat
- [ ] Reconnect with backoff; connection state events; UI status: connected / reconnecting / rehydrating
- [ ] Surface failures of previously fire-and-forget calls (restoreSolidBRep, undo transformShape)

**Acceptance criteria**
- [ ] Kill gateway mid-session: UI recovers
- [ ] No silent failures on formerly fire-and-forget calls

### WC-EC-18 - Vite dev proxy and local/remote switch

**Priority:** medium · **Labels:** dx, config · **Parent:** WC-EC · **Depends on:** WC-EC-17

**Goal:** Same-origin WS in dev (COOP/COEP enabled).

**Tasks**
- [ ] server.proxy /occ with ws: true
- [ ] VITE_OCC_URL; empty = local WASM worker

**Acceptance criteria**
- [ ] npm run dev works in both modes without COEP errors

### WC-EC-19 - Session resume, rehydrate and restoreMany

**Priority:** high · **Labels:** resilience, protocol · **Parent:** WC-EC · **Depends on:** WC-EC-17, WC-EC-13

**Goal:** Recover kernel state after disconnect or kernel crash.

**Tasks**
- [ ] Grace period keeping the kernel alive after disconnect
- [ ] hello with sessionId resumes; otherwise needsRehydrate
- [ ] restoreMany re-imports all solids in one round trip (reuse brepSnapshot/PersistenceService)

**Acceptance criteria**
- [ ] Reconnect within grace: nothing re-imported
- [ ] After kernel crash: all solids restored; test with 50+ solids

### WC-EC-20 - Cancellation, per-operation timeouts, progress events

**Priority:** medium · **Labels:** resilience, protocol · **Parent:** WC-EC · **Depends on:** WC-EC-19

**Goal:** A native kernel process can simply be killed and respawned.

**Tasks**
- [ ] Server-side timeout per operation type (replace fixed 120 s client timeout)
- [ ] cancel {id}: kill process, respawn, rehydrate
- [ ] progress {id, pct} messages for long operations; gate log frames behind debug flag

**Acceptance criteria**
- [ ] Runaway op is killed and the session recovers automatically

### WC-EC-21 - Input validation, frame limits and quotas

**Priority:** high · **Labels:** security · **Parent:** WC-EC · **Depends on:** WC-EC-16, WC-EC-03

**Goal:** Worker currently trusts payloads (e.g. points: any[]).

**Tasks**
- [ ] Schema validation for every message type at the gateway
- [ ] Max frame size; ops/sec rate limits; per-session shape and memory caps
- [ ] Malformed payload returns an error without killing the session

**Acceptance criteria**
- [ ] Negative/fuzz tests pass


---

## Phase 4 - Performance, deployment, operations

### WC-EC-22 - Benchmark on real models: native vs WASM, thread scaling

**Priority:** high · **Labels:** performance, testing · **Parent:** WC-EC · **Depends on:** WC-EC-09, WC-EC-12

**Goal:** The first benchmark was synthetic and ran on one core.

**Tasks**
- [ ] Collect representative models and operation scripts from real projects
- [ ] Measure p50/p95 per operation, memory per document, throughput per core
- [ ] Measure parallel booleans/meshing on a multi-core host and the effect of OCCT's parallel flags
- [ ] Define capacity targets (documents per core/host)

**Acceptance criteria**
- [ ] Report with targets; hosting size recommendation

### WC-EC-23 - Kernel process pool, affinity, idle eviction, cgroup limits

**Priority:** medium · **Labels:** infra, performance · **Parent:** WC-EC · **Depends on:** WC-EC-05

**Goal:** Bound CPU and memory per kernel process.

**Tasks**
- [ ] Warm pool; assign by session now, by document later
- [ ] Idle TTL eviction; release shapes on disconnect
- [ ] cgroup/container memory and CPU limits; OOM handling

**Acceptance criteria**
- [ ] Soak test keeps memory bounded

### WC-EC-24 - Crash isolation, diagnostics and sanitizer CI

**Priority:** high · **Labels:** kernel, quality · **Parent:** WC-EC · **Depends on:** WC-EC-04

**Goal:** Native crashes must never take down other users.

**Tasks**
- [ ] Core dump/crash report capture with operation context
- [ ] ASan/UBSan CI builds running the parity suite
- [ ] Fuzz B-rep/sketch payload parsers
- [ ] Automatic respawn tested with injected crashes

**Acceptance criteria**
- [ ] Injected segfault affects only one session and recovers

### WC-EC-25 - Dockerfile and docker-compose (app, kernel, postgres, minio, nginx)

**Priority:** high · **Labels:** infra, docker · **Parent:** WC-EC · **Depends on:** WC-EC-02, WC-EC-16

**Goal:** Stage-1 deployment: monolith app + native kernel workers.

**Tasks**
- [ ] App container (Node gateway) and kernel image from the pinned OCCT build
- [ ] compose with healthchecks, volumes, env config
- [ ] nginx with WebSocket upgrade, timeouts, COOP/COEP headers

**Acceptance criteria**
- [ ] docker compose up gives a working UI + native engine
- [ ] WS survives nginx idle timeouts via heartbeat

### WC-EC-26 - Auth, origin check and sandboxing

**Priority:** high · **Labels:** security, infra · **Parent:** WC-EC · **Depends on:** WC-EC-25

**Goal:** Uploaded B-rep is untrusted input to a native parser.

**Tasks**
- [ ] Short-lived token on WS upgrade; Origin check
- [ ] Kernel runs non-root, read-only FS, seccomp/no network, CPU/memory limits
- [ ] Per-user quotas

**Acceptance criteria**
- [ ] Unauthenticated upgrade rejected
- [ ] Crafted B-rep cannot affect other sessions or the host

### WC-EC-27 - Observability: metrics and structured logs

**Priority:** medium · **Labels:** infra, observability · **Parent:** WC-EC · **Depends on:** WC-EC-25

**Goal:** Detect contention before splitting services.

**Tasks**
- [ ] Metrics: queue depth, op latency by type, kernel RSS, sessions, respawn count
- [ ] Structured logs with sessionId/documentId
- [ ] Dashboards and alerts

**Acceptance criteria**
- [ ] Clear signal for when export/meshing blocks geometry ops

### WC-EC-28 - Production file API (replace Vite dev middleware)

**Priority:** medium · **Labels:** backend, infra · **Parent:** WC-EC · **Depends on:** WC-EC-25

**Goal:** /api/files exists only as a Vite dev plugin.

**Tasks**
- [ ] Move list/read/write/absolute-path endpoints into the app server
- [ ] Path traversal protection (dev plugin joins user paths unchecked)
- [ ] Storage on MinIO or volume

**Acceptance criteria**
- [ ] Existing file features work; traversal tests pass

### WC-EC-29 - OCCT upgrade policy and regression corpus

**Priority:** medium · **Labels:** kernel, process · **Parent:** WC-EC · **Depends on:** WC-EC-06

**Goal:** 8.0.x is new; bindings in the wider ecosystem lag it.

**Tasks**
- [ ] Pin exact tag; track 8.0.x patch releases and migration notes
- [ ] Regression corpus (models + expected metrics) gating every upgrade
- [ ] Document how persisted B-rep/revisions behave across upgrades

**Acceptance criteria**
- [ ] Upgrade checklist and CI gate in place


---

## Phase 5 - Onshape-style engine core

### WC-EC-30 - Spike: shape history API for persistent references

**Priority:** high · **Labels:** spike, topology · **Parent:** WC-EC · **Depends on:** WC-EC-04

**Goal:** Verify BRepBuilderAPI_MakeShape::Generated/Modified/IsDeleted and BRepTools_History in OCCT 8.0.1 for each operation (the WASM build exposed the API, but behavior was not tested).

**Tasks**
- [ ] Test extrude, fillet, chamfer, boolean, shell natively: which source faces map to which result faces
- [ ] Document operations without usable history

**Acceptance criteria**
- [ ] Table of operations vs history quality
- [ ] Go/no-go for history-based propagation

### WC-EC-31 - Persistent face/edge ids

**Priority:** high · **Labels:** topology, engine · **Parent:** WC-EC · **Depends on:** WC-EC-30

**Goal:** Stable ids that survive upstream edits.

**Tasks**
- [ ] Assign ids at creation (creating feature id + role, e.g. sidewall of sketch entity E2, cap-start)
- [ ] Propagate through ops using history; split faces get child ids; deleted become unresolved
- [ ] Store id table per feature step

**Acceptance criteria**
- [ ] Edit upstream sketch dimension: downstream fillet still targets same face
- [ ] Ids deterministic across rebuilds

### WC-EC-32 - Replace index references; geometric-signature fallback

**Priority:** high · **Labels:** topology, engine · **Parent:** WC-EC · **Depends on:** WC-EC-31

**Goal:** FeatureNode currently stores edgeIndex / faceIndices; topologicalReference (GeometricSignature) is declared but unused.

**Tasks**
- [ ] Migrate Fillet, Chamfer, Shell, Draft features to persistent refs
- [ ] Fallback matching by centroid/normal/area/faceType with scoring
- [ ] Per-feature status: ok / reference repaired / reference lost with UI to re-pick
- [ ] Migration for existing documents

**Acceptance criteria**
- [ ] Lost reference yields visible error, never a silent wrong target
- [ ] Existing documents open and migrate

### WC-EC-33 - Document-level feature graph and partial rebuild

**Priority:** high · **Labels:** engine, architecture · **Parent:** WC-EC · **Depends on:** WC-EC-31

**Goal:** Today Solid3DReevaluator replays per solid from the primitive each time.

**Tasks**
- [ ] Document-wide dependency DAG (sketch -> extrude -> fillet ...)
- [ ] Dirty propagation; rebuild from first dirty feature
- [ ] Per-feature status and suppression; rollback bar

**Acceptance criteria**
- [ ] Editing a late feature does not recompute earlier ones (measure)
- [ ] Cycles rejected

### WC-EC-34 - Per-step shape cache keyed by feature-chain hash

**Priority:** medium · **Labels:** engine, performance · **Parent:** WC-EC · **Depends on:** WC-EC-33

**Goal:** Rebuild results are cacheable and always rebuildable from the definition.

**Tasks**
- [ ] Cache key = hash(feature chain up to step + params)
- [ ] In-memory LRU, then MinIO (B-rep content hashes from the native kernel)
- [ ] Invalidate correctly on edits

**Acceptance criteria**
- [ ] Repeated open of same version skips rebuild
- [ ] Cache hit rate metric

### WC-EC-35 - Command API (AddFeature / EditFeature / Suppress / Reorder)

**Priority:** high · **Labels:** engine, protocol · **Parent:** WC-EC · **Depends on:** WC-EC-33, WC-EC-16

**Goal:** Client sends commands against a base version instead of imperative kernel calls.

**Tasks**
- [ ] Command schema incl. featureId, inputs, params, refs, baseVersion
- [ ] Server validates, applies, rebuilds, returns version + per-feature status + meshes
- [ ] Reject stale baseVersion with a clear conflict response

**Acceptance criteria**
- [ ] Client UI can create and edit features through commands only
- [ ] Kernel calls no longer made directly by UI

### WC-EC-36 - Operation log and microversions in Postgres

**Priority:** high · **Labels:** backend, versioning · **Parent:** WC-EC · **Depends on:** WC-EC-35

**Goal:** Definition stored as immutable versions {parent, author, change}; regeneration results are derived.

**Tasks**
- [ ] Append-only log table; periodic snapshots
- [ ] Changes keyed by feature id so they can apply to a different parent version
- [ ] Named versions and branches (later)

**Acceptance criteria**
- [ ] Any version reproducible by replay
- [ ] Snapshot restore equals replay result

### WC-EC-37 - Document actor: serial queue, worker affinity, viewer broadcast

**Priority:** high · **Labels:** engine, collab · **Parent:** WC-EC · **Depends on:** WC-EC-35

**Goal:** One serial queue per document; workers keyed by document, not connection.

**Tasks**
- [ ] Document actor owning queue and worker
- [ ] Multiple clients share one kernel
- [ ] Broadcast new versions to viewers
- [ ] Single-writer lock in stage 1

**Acceptance criteria**
- [ ] Second client sees edits live
- [ ] Concurrent edit attempt by non-holder is rejected cleanly

### WC-EC-38 - Server-side sketch re-solve

**Priority:** medium · **Labels:** engine, sketch · **Parent:** WC-EC · **Depends on:** WC-EC-33

**Goal:** Sketch definition (entities + constraints) stored in the document; server re-solves authoritatively; client keeps its own solver for interactive drag.

**Tasks**
- [ ] Verify solver runs in Node (SketchModel/System/Solver have no DOM/three refs; check constraints/ and GCSBridge.ts)
- [ ] Run SketchModel.deserialize + System.solve in rebuild
- [ ] Return solved result to client when it disagrees

**Acceptance criteria**
- [ ] Server rebuild without a browser reproduces client sketches
- [ ] Disagreement path tested

### WC-EC-39 - Per-user undo/redo as inverse changes

**Priority:** medium · **Labels:** engine, versioning · **Parent:** WC-EC · **Depends on:** WC-EC-35

**Goal:** Undo must work with multiple editors: inverse of my last change, not rollback to previous version.

**Tasks**
- [ ] Inverse change generation per command type
- [ ] Undo/redo stacks per user per document

**Acceptance criteria**
- [ ] Two users editing: undo only reverts own change

### WC-EC-40 - Concurrent writers with rebase (stage 2)

**Priority:** low · **Labels:** collab, versioning · **Parent:** WC-EC · **Depends on:** WC-EC-36, WC-EC-37

**Goal:** Replace single-writer lock with changes that rebase onto newer versions.

**Tasks**
- [ ] Rebase rules per command type
- [ ] Conflict surfacing in UI

**Acceptance criteria**
- [ ] Two users edit different features simultaneously without loss

### WC-EC-41 - Assembly model (backlog)

**Priority:** low · **Labels:** engine, assembly · **Parent:** WC-EC · **Depends on:** WC-EC-35

**Goal:** Assemblies referencing Part Studios as stable version snapshots.

**Tasks**
- [ ] Design only: references, mates, versioned part references

**Acceptance criteria**
- [ ] Design note reviewed
