# WebCad Engine Container (WC-EC) - v5: agent-ready

Run the WebCad geometry kernel as native OCCT in server-side worker processes behind a Node gateway, connected to the UI over gRPC; the OCCT WASM worker remains in the browser as offline/preview fallback. Baseline OCCT version is 7.9.3; 8.0.x is adopted only after passing the parity/regression gate. A time-boxed spike evaluates SolidCraft/solidcore (pure-Rust kernel, wasm32-capable) as a replacement or complement before the kernel skeleton is committed. Then evolve the service into an Onshape-style engine: command registry, server-owned document, feature graph, persistent topology references, versioned operation log.

v5 supersedes v1-v4. Staged deployment: Node app + native kernel workers + postgres + minio + nginx; split mesh/export or collaboration services only after measured contention.

**Working agreement for the coding agent** (currently nvidia/nemotron-3.5-super-vl-120b-a12b: open-weight vision-language MoE, ~12B active of ~120B total parameters, long-context, agentic focus; English-only claims): one ticket per branch/PR; each ticket carries an Agent brief with suitability A (agent-led), B (agent drafts, human decides design) or C (human-led); verify command from AGENTS.md must pass before review; stop and ask on ambiguity, protocol changes, or changes over about 15 files / 600 lines; use the snapshot tool for visual checks; the pilot ticket calibrates all of this on real tickets.

**Priority:** high · **Labels:** webcad, engine, agent

## Tickets overview

| ID | Title | Priority | Agent | Phase |
|---|---|---|---|---|
| WC-EC-01 | Quick win: remove the double Build() from the WASM worker's booleans | high | A | Phase 0 |
| WC-EC-02 | Agent harness: AGENTS.md, one-command verify, ticket workflow | high | B | Phase 0 |
| WC-EC-03 | Agent pilot: calibrate ticket size on three representative tickets | high | C | Phase 0 |
| WC-EC-04 ✓ | Headless snapshot renderer for visual verification (done) | medium | A | Phase 0 |
| WC-EC-05 ✓ | ADR: kernel strategy (native OCCT 7.9.3 baseline vs SolidCraft/solidcore vs hybrid) behind a language-neutral protocol (done) | high | C | Phase 1 |
| WC-EC-06 | Spike: evaluate SolidCraft engine / solidcore as backend or kernel (go/no-go) | high | C | Phase 1 |
| WC-EC-07 | Spike: evaluate materializr as headless kernel base + license decision | high | C | Phase 1 |
| WC-EC-08 ✓ | OCCT build image (7.9.3 pinned, OCCT_VERSION build arg, CI matrix with 8.0.x) (done) | high | B | Phase 1 |
| WC-EC-09 ✓ | Language-neutral kernel protocol spec + codecs (TS and C++) | high | B | Phase 1 |
| WC-EC-10 v | Kernel worker skeleton (C++17, CMake) | high | B | Phase 1 |
| WC-EC-11 | Gateway kernel supervisor (Node): spawn, pool, framing, respawn | high | B | Phase 1 |
| WC-EC-12 | Parity harness: WASM worker vs native kernel | high | A | Phase 2 |
| WC-EC-13 ✓ | Reference-parts oracle suite (analytic expected values) (done) | high | A | Phase 2 |
| WC-EC-14 ✓ | Port: simple primitives (box, cylinder, frustum, sphere, cone, torus, wedge, pyramid) (done) | high | A | Phase 2 |
| WC-EC-15 ✔ | Port: polyhedron and convex hull (done) | medium | A | Phase 2 |
| WC-EC-16 ✓ | Port: transforms (matrix, translate, rotate, mirror, scale) | high | A | Phase 2 |
| WC-EC-17 ✓ | Port: extrude, revolve, compound and face-profile extraction | high | A | Phase 2 |
| WC-EC-18 ✓ | Port: booleans (createBoolean, scad CSG temp ids) | high | A | Phase 2 |
| WC-EC-19 ✓ | Port: fillet and chamfer (solid and face variants) | high | B | Phase 2 |
| WC-EC-20 ✓ | Port: shell (makeThickSolid) and draft | high | B | Phase 2 |
| WC-EC-21 ✓ | Port: sweep | high | B | Phase 2 |
| WC-EC-22 ✓ | Port: loft | medium | A | Phase 2 |
| WC-EC-23 ✓ | Port: tessellation to binary buffers | high | B | Phase 2 |
| WC-EC-24 ✓ | B-rep import/export and cross-version compatibility (done) | high | B | Phase 2 |
| WC-EC-25 | Server-side STEP / STL / glTF export | medium | B | Phase 2 |
| WC-EC-26 | Extract OCCTransport interface; keep WASM worker as local fallback | high | A | Phase 3 |
| WC-EC-27 | Gateway: gRPC server, auth hello, sessions | high | A | Phase 3 |
| WC-EC-28 | RemoteGrpcTransport (client) | high | A | Phase 3 |
| WC-EC-29 | Vite dev proxy and local/remote switch | medium | A | Phase 3 |
| WC-EC-30 | Session resume, rehydrate and restoreMany | high | B | Phase 3 |
| WC-EC-31 | Cancellation, per-operation timeouts, progress events | medium | B | Phase 3 |
| WC-EC-32 | Input validation, frame limits and quotas | high | A | Phase 3 |
| WC-EC-33 | Benchmark on real models: native vs WASM, thread scaling | high | B | Phase 4 |
| WC-EC-34 | Kernel process pool, affinity, idle eviction, cgroup limits | medium | B | Phase 4 |
| WC-EC-35 | Crash isolation, diagnostics and sanitizer CI | high | B | Phase 4 |
| WC-EC-36 | Dockerfile and docker-compose (app, kernel, postgres, minio, nginx) | high | B | Phase 4 |
| WC-EC-37 | Auth, origin check and sandboxing | high | C | Phase 4 |
| WC-EC-38 | Observability: metrics and structured logs | medium | A | Phase 4 |
| WC-EC-39 | Production file API (replace Vite dev middleware) | medium | A | Phase 4 |
| WC-EC-40 | OCCT upgrade policy and regression corpus (7.9.3 baseline, 8.0.x gate) | medium | B | Phase 4 |
| WC-EC-41 | Spike: shape history API for persistent references | high | C | Phase 5 |
| WC-EC-42 | Persistent face/edge ids | high | B | Phase 5 |
| WC-EC-43 | Replace index references; geometric-signature fallback | high | B | Phase 5 |
| WC-EC-44 | Document-level feature graph and partial rebuild | high | B | Phase 5 |
| WC-EC-45 | Per-step shape cache keyed by feature-chain hash | medium | B | Phase 5 |
| WC-EC-46 | Command registry and enforced layering for the engine core | high | B | Phase 5 |
| WC-EC-47 | Command API (AddFeature / EditFeature / Suppress / Reorder) | high | B | Phase 5 |
| WC-EC-48 | Operation log and microversions in Postgres | high | B | Phase 5 |
| WC-EC-49 | Document actor: serial queue, worker affinity, viewer broadcast | high | B | Phase 5 |
| WC-EC-50 | Server-side sketch re-solve | medium | B | Phase 5 |
| WC-EC-51 | Per-user undo/redo as inverse changes | medium | B | Phase 5 |
| WC-EC-52 | Concurrent writers with rebase (stage 2) | low | C | Phase 5 |
| WC-EC-53 | Assembly model (backlog) | low | C | Phase 5 |

---

## Phase 0 - Quick wins

### WC-EC-01 - Quick win: remove the double Build() from the WASM worker's booleans

**Priority:** high · **Agent:** A · **Labels:** quick-win, performance, engine · **Parent:** WC-EC

**Goal:** OCCWorker.ts makeBooleanBuilder calls the two-shape BRepAlgoAPI_* constructor (which already performs the operation) and buildBooleanOp then calls Build() again, so each boolean likely runs twice. Fixing it should roughly halve boolean time in the current browser worker.

**Tasks**
- [ ] Confirm by timing before/after (benchmark showed ~1.9x on both WASM and native)
- [ ] Switch to default constructor + SetArguments/SetTools (or SetShape1/SetShape2) so configureBooleanOp settings (fuzzy value, parallel, check-inverted, non-destructive) apply, then a single Build()
- [ ] Update all call sites (cut, fuse, common, section helpers)
- [ ] Run the sketch/boolean test suite and visual check

**Acceptance criteria**
- [ ] Booleans build once
- [ ] Boolean timing roughly halves on a repeated-cut benchmark
- [ ] No behavior regressions in tests

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.


---

## Phase 0 - Quick wins and agent enablement

### WC-EC-02 - Agent harness: AGENTS.md, one-command verify, ticket workflow

**Priority:** high · **Agent:** B · **Labels:** agent, dx · **Parent:** WC-EC

**Goal:** The coding agent (nvidia/nemotron-3.5-super-vl-120b-a12b: open-weight vision-language MoE, ~12B active of ~120B total, long-context, agentic focus) works best on small, self-contained tickets with fast automated feedback. Give it the repo-side scaffolding to work reliably.

**Tasks**
- [ ] AGENTS.md at the repo root: stack overview, directory map, layer rules, build/test/lint commands, protocol spec location, how to run the parity and oracle suites, coding conventions, definition of done, forbidden actions (no protocol changes without an ADR, no committing generated files)
- [ ] One-command verify (e.g. `npm run verify` / `make verify`): typecheck, lint, unit tests, kernel build + tests, parity subset; target a few minutes so the agent can run it often; non-zero exit on any failure
- [ ] Ticket workflow: one ticket per branch/PR; PR template with the acceptance criteria checklist, verify output and snapshot images; stop-and-ask rules (spec ambiguity, protocol change, needs decision)
- [ ] Size rule: if a change exceeds about 15 files or 600 lines, the agent stops and proposes a split
- [ ] Context packs: a short per-area doc (protocol, kernel, gateway, client) the agent loads instead of reading the whole repo
- [ ] Agent-visible failure output: tests print the failing metric and delta, not just 'failed'

**Acceptance criteria**
- [ ] A fresh agent session can build, run verify and open a PR following only AGENTS.md
- [ ] verify fails on a deliberately broken change and passes on a clean tree

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-03 - Agent pilot: calibrate ticket size on three representative tickets

**Priority:** high · **Agent:** C · **Labels:** agent, process · **Parent:** WC-EC · **Depends on:** WC-EC-02

**Goal:** No published coding-agent benchmark was found for this exact model, so measure it on this codebase before committing the plan to it.

**Tasks**
- [ ] Pick three tickets of different kinds: a small one (e.g. the quick win), a medium one (e.g. the protocol codecs or primitives port) and a harder one (e.g. fillet/chamfer port or the command registry)
- [ ] Give each to the agent using only AGENTS.md and the ticket; record success without help, iterations, wall time, tokens and failure modes (wrong API names, build errors, over-large diffs, missed edge cases)
- [ ] Adjust ticket granularity, context packs and AGENTS.md from the findings; re-label suitability (A/B/C) where reality differs
- [ ] Decide which ticket classes stay agent-led and which need human drafting

**Acceptance criteria**
- [ ] Pilot report with measurements and adjustments
- [ ] Suitability labels in the epic updated from the evidence

**Agent brief** (suitability C - human-led: the agent only gathers evidence, runs experiments and drafts the write-up; a human decides.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.
- Do not make the decision yourself: present options, evidence and a recommendation.

### WC-EC-04 - Headless snapshot renderer for visual verification

**Priority:** medium · **Agent:** A · **Labels:** agent, testing, tooling · **Parent:** WC-EC

**Goal:** The agent model accepts images, so geometry can be checked visually. Provide a deterministic command that renders a part to PNG from fixed views.

**Tasks**
- [x] CLI: given a command script or B-rep, render iso/top/front/right PNGs with fixed camera, lighting and resolution (use mesh output from any kernel; start with the existing WASM worker)
- [x] Deterministic output so images can also be diffed against golden files
- [x] Wire into the PR template and the oracle/parity suites (attach images for failed cases)

**Acceptance criteria**
- [x] Same input produces byte-identical PNGs across runs
- [x] The agent can render and inspect a part from the command line

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.


---

## Phase 1 - Native kernel foundations

### WC-EC-05 - ADR: kernel strategy (native OCCT 7.9.3 baseline vs SolidCraft/solidcore vs hybrid) behind a language-neutral protocol

**Priority:** high · **Agent:** C · **Labels:** adr, architecture · **Parent:** WC-EC

**Goal:** Record the decision: Node gateway + native OCCT kernel worker processes; the WASM worker stays in the browser as offline/preview fallback. Baseline OCCT version is 7.9.3; 8.0.x is adopted only after it passes the parity and regression gate.

**Tasks**
- [ ] Document benchmark evidence: boolean-heavy job (30 cylinder cuts + mesh), one core, single run. Single-build: WASM-in-Node ~2.35 s vs native OCCT 8.0.1 ~0.17 s (~14x); the earlier double-Build figures (4.3 s vs 0.32 s) show the same ratio. Caveats: synthetic job, WASM build is an older OCCT, not your real models
- [ ] Version decision with evidence: OCCT 8.0.1 is the latest stable (public sources, Oct 2026) but the materializr project runs 7.9.3 everywhere and reverted from 8.0.0 after a hang in long-rod thread generation; a pythonocc-core port failed against 8.0.1. Baseline 7.9.3, 8.0.x gated (see upgrade policy ticket)
- [ ] Decide kernel language (C++17 direct; Python OCP only as prototyping aid) and record the outcome of the materializr evaluation spike
- [ ] LGPL-2.1 (OCCT) review for server deployment and binary distribution; GPLv3 implications if materializr code is reused
- [ ] Define what is authoritative: server owns B-rep; client receives meshes
- [ ] Compare three options against the same criteria and record the outcome after the SolidCraft spike: (A) native OCCT kernel workers, (B) SolidCraft engine / solidcore (pure-Rust SMLib port, wasm32-capable, MIT OR Apache-2.0 / Apache-2.0, kernel API still 0.0.x), (C) hybrid: OCCT kernel plus SolidCraft's architecture patterns. Criteria: geometry coverage, robustness on bad input, determinism, performance, browser/server kernel parity, licensing, ecosystem and effort

**Acceptance criteria**
- [ ] ADR merged in docs
- [ ] Open risks listed (8.0.x maturity, ecosystem bindings lag, OCCT version differences, licensing)
- [ ] Options A/B/C compared in the ADR with the spike results attached

**Agent brief** (suitability C - human-led: the agent only gathers evidence, runs experiments and drafts the write-up; a human decides.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.
- Do not make the decision yourself: present options, evidence and a recommendation.

### WC-EC-06 - Spike: evaluate SolidCraft engine / solidcore as backend or kernel (go/no-go)

**Priority:** high · **Agent:** C · **Labels:** spike, kernel, architecture · **Parent:** WC-EC · **Depends on:** WC-EC-05

**Goal:** SolidCraft (elhakimz fork of tangency-labs/solidcraft) is a pure-Rust parametric CAD with a command registry, timeline, JSON scripts, headless CLI, MCP server and a wasm32-capable kernel (solidcore, a Rust port of NVIDIA SMLib). Decide whether it replaces, complements or is ignored by the OCCT plan. Time-boxed; run on a developer machine (large workspace).

**Tasks**
- [ ] Build solidcraft-cli headless (cargo build --release -p solidcraft-cli) and run the existing boolean benchmark (30 cylinder cuts on a plate + mesh) through its command registry (solidcraft-cli run script.json); compare time and memory against native OCCT
- [ ] Check the wasm32 build in a browser (note the stack-size link flag the kernel README requires for wasm) and whether the same kernel can serve both browser and server
- [ ] Inspect the control protocol and browser command API (docs/control-protocol.md, docs/browser-api.md) for carrying commands over gRPC
- [ ] Exercise the hardest operations: many-hole plates, fillets on boolean seams, shell, long threads, sweep/loft; log panics, hangs and mismatches
- [ ] Check topological naming / persistent references: do downstream features survive upstream sketch edits?
- [ ] Check STEP/IGES/glTF/STL export quality and sheet-metal/assembly features WebCad may need
- [ ] Assess kernel maturity: solidcore 0.0.x status, open issues, differential-test coverage, release cadence
- [ ] License review: MIT OR Apache-2.0 (app), Apache-2.0 (solidcore), separate brand license for UI kit/look/name, clean-room contribution rules and attribution
- [ ] Decision memo with go/no-go. Proposed thresholds (adjust): covers >=90% of the operations in the OCCWorker message inventory; no panics or hangs over the reference corpus; boolean/mesh time within 2x of native OCCT; persistent references survive upstream sketch edits

**Acceptance criteria**
- [ ] Memo with measurements and decision (replace / complement / ignore)
- [ ] If go: list of WebCad operations still missing; if no-go: the reasons and what to borrow

**Agent brief** (suitability C - human-led: the agent only gathers evidence, runs experiments and drafts the write-up; a human decides.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.
- Do not make the decision yourself: present options, evidence and a recommendation.

### WC-EC-07 - Spike: evaluate materializr as headless kernel base + license decision

**Priority:** high · **Agent:** C · **Labels:** spike, kernel, license · **Parent:** WC-EC · **Depends on:** WC-EC-05

**Goal:** Decide whether the native kernel reuses code from elhakimz/materializr (fork of materializr-cad/materializr: C++17, OCCT 7.9.3, history, topological naming, many modeling ops), uses it only as a reference, or is written from scratch.

**Tasks**
- [ ] Check whether core/, modeling/ and io/ build as a headless CMake target with no ImGui/SDL/GL; note plugin registrations that drag UI dependencies
- [ ] Run its GoogleTest suite in CI; measure build time and binary size
- [ ] Read the topological naming / face lineage code and the sketch solver; list reusable pieces
- [ ] Assess fit: operations are document-centric interactive undo/execute, not stateless commands against a base version
- [ ] License review: GPLv3 with additional permissions, multiple copyright holders, releases through 0.9.7.1 were MIT; hosting vs distributing implications; OCCT is LGPL-2.1
- [ ] Decision memo: reuse / reference only / none

**Acceptance criteria**
- [ ] Memo with decision and rationale
- [ ] If reuse: list of directories to extract and the license plan; if not: list of ideas to re-implement

**Agent brief** (suitability C - human-led: the agent only gathers evidence, runs experiments and drafts the write-up; a human decides.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.
- Do not make the decision yourself: present options, evidence and a recommendation.

### WC-EC-08 - OCCT build image (7.9.3 pinned, OCCT_VERSION build arg, CI matrix with 8.0.x)

**Priority:** high · **Agent:** B · **Labels:** infra, kernel · **Parent:** WC-EC · **Depends on:** WC-EC-05

**Goal:** Container image with OCCT built from the pinned tag.

**Tasks**
- [ ] Multi-stage Dockerfile: build OCCT from source at the pinned tag (default 7.9.3) with OCCT_VERSION as a build argument, Release, only required modules; runtime stage with shared libs only
- [ ] CI matrix builds and smoke-tests both 7.9.3 and the candidate 8.0.x tag
- [ ] Verify module/toolkit layout per version (Data Exchange modules were restructured in 8.0)
- [ ] Enable/disable TBB per decision; record compiler flags
- [ ] SBOM and image scan in CI

**Acceptance criteria**
- [ ] Image builds reproducibly in CI for both versions
- [ ] Smoke test: create box, boolean, mesh, BRep round trip inside each image

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-09 - Language-neutral kernel protocol spec + codecs (TS and C++)

**Priority:** high · **Agent:** B · **Labels:** protocol, kernel · **Parent:** WC-EC · **Depends on:** WC-EC-05

**Goal:** Replace JS-structured-clone assumptions with a spec both gateway and kernel implement.

**Tasks**
- [ ] Frame = [u32 headerLen][header][buffers]; header (JSON, JSON-Schema defined) lists buffers name/dtype/length
- [ ] Message catalog derived from the ~40 types in OCCWorker.ts; response always carries id, success, error
- [ ] edgeLines packed as Float32Array + offsets (no number[][] on the wire)
- [ ] Golden test vectors shared by TS and C++ implementations
- [ ] Version field and capability negotiation in hello

**Acceptance criteria**
- [x] Round-trip tests pass in both languages with identical golden files
- [x] Spec reviewed against every message type

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-10 - Kernel worker skeleton (C++17, CMake)

**Priority:** high · **Agent:** B · **Labels:** kernel · **Parent:** WC-EC · **Depends on:** WC-EC-06, WC-EC-07, WC-EC-08, WC-EC-09

**Goal:** Process that reads framed requests from a Unix socket or stdio and dispatches to handlers.

**Tasks**
- [x] Handler registry, per-process shape cache keyed by entityId (as today)
- [x] Map Standard_Failure / std::exception to protocol errors; never crash on bad input
- [x] Structured logging, debug flag for verbose logs
- [x] Graceful shutdown; health ping
- [x] Unit tests with a fake client

**Acceptance criteria**
- [x] Handles ping, createBox, release over the protocol
- [x] Malformed frames produce errors, not crashes

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-11 - Gateway kernel supervisor (Node): spawn, pool, framing, respawn

**Priority:** high · **Agent:** B · **Labels:** server, kernel · **Parent:** WC-EC · **Depends on:** WC-EC-10

**Goal:** Node side that owns kernel processes.

**Tasks**
- [x] Spawn kernel processes and speak the protocol over UDS/stdio
- [x] Per-session (later per-document) FIFO queue preserving ordering the client relies on
- [x] Backpressure, health checks, kill on timeout, respawn + rehydrate
- [x] Process pool with warm instances (native start is far cheaper than the ~3 s WASM init)

**Acceptance criteria**
- [x] Killing a kernel mid-operation recovers the session automatically
- [x] Ordering preserved under load test

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.


---

## Phase 2 - Port operations (parity-driven)

### WC-EC-12 - Parity harness: WASM worker vs native kernel

**Priority:** high · **Agent:** A · **Labels:** testing, kernel · **Parent:** WC-EC · **Depends on:** WC-EC-10

**Goal:** Use the existing WASM worker as the behavioral oracle while porting.

**Tasks**
- [ ] Operation scripts replayed against both kernels
- [ ] Compare volume, surface area, bbox, face/edge/vertex counts, validity (BRepCheck) with tolerances
- [ ] Known differences between OCCT versions documented, not silently ignored
- [ ] Run in CI per ported operation group
- [ ] Make operation scripts kernel-agnostic (JSON command lists) so the same script runs against the WASM worker, the native OCCT kernel and, if the spike says go, solidcore/SolidCraft

**Acceptance criteria**
- [ ] Harness green for each ported group
- [ ] Report artifact lists tolerances and diffs

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-13 - Reference-parts oracle suite (analytic expected values)

**Priority:** high · **Agent:** A · **Labels:** testing, kernel · **Parent:** WC-EC · **Depends on:** WC-EC-12

**Goal:** Independent correctness check that does not depend on any one kernel: parts with analytically known volume, surface area, centre of mass and bounding box (SolidCraft validates 75 of 76 public reference parts this way against analytic or FreeCAD values).

**Tasks**
- [x] Define a corpus of reference parts as JSON command scripts with expected volume/area/centre of mass/bbox (analytic where possible, otherwise computed with an independent tool such as FreeCAD)
- [x] Tolerances per metric; failures report the metric and delta
- [x] Run against every kernel (WASM worker, native OCCT, optional solidcore) in CI
- [x] Track known failures explicitly, not silently

**Acceptance criteria**
- [x] Suite runs in CI for each kernel
- [x] Each ported operation group adds at least one reference part

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-14 - Port: simple primitives (box, cylinder, frustum, sphere, cone, torus, wedge, pyramid)

**Priority:** high · **Agent:** A · **Labels:** kernel, port · **Parent:** WC-EC · **Depends on:** WC-EC-12

**Goal:** Port to the native OCCT kernel behind the protocol; the existing WASM handler is the behavioral reference and the parity harness is the oracle. Message types: createBox, createCylinder, createFrustum, createSphere, createCone, createTorus, createWedge, createPyramid.

**Tasks**
- [x] Port `createBox` (OCCWorker.ts lines 811-860)
- [x] Port `createCylinder` (OCCWorker.ts lines 1618-1665)
- [x] Port `createFrustum` (OCCWorker.ts lines 1666-1727)
- [x] Port `createSphere` (OCCWorker.ts lines 1728-1775)
- [x] Port `createCone` (OCCWorker.ts lines 1776-1823)
- [x] Port `createTorus` (OCCWorker.ts lines 1824-1861)
- [x] Port `createWedge` (OCCWorker.ts lines 1862-1982)
- [x] Port `createPyramid` (OCCWorker.ts lines 1983-2050)
- [x] Implement against the OCCT C++ API (no _1/_2 overload suffixes; Message_ProgressRange arguments) with the same inputs and outputs as the WASM handler
- [x] Keep entityId lifecycle identical (cache on create, release on releaseShapes)

**Acceptance criteria**
- [x] Parity harness passes for every primitive
- [x] Each primitive has an oracle reference part with analytic volume/area

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, protocol spec, kernel skeleton, parity script for this group, and OCCWorker.ts lines 811-860 and 1618-2050.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-15 - Port: polyhedron and convex hull

**Priority:** medium · **Agent:** A · **Labels:** kernel, port · **Parent:** WC-EC · **Depends on:** WC-EC-12

**Goal:** Port to the native OCCT kernel behind the protocol; the existing WASM handler is the behavioral reference and the parity harness is the oracle. Message types: createPolyhedron, createConvexHull.

**Tasks**
- [x] Port `createPolyhedron` (OCCWorker.ts lines 2051-2462)
- [x] Port `createConvexHull` (OCCWorker.ts lines 2463-2662)
- [x] Implement against the OCCT C++ API (no _1/_2 overload suffixes; Message_ProgressRange arguments) with the same inputs and outputs as the WASM handler
- [x] Keep entityId lifecycle identical (cache on create, release on releaseShapes)
- [x] The WASM version uses a hand-written JS convex hull (face/horizon bookkeeping near the end of the file): decide whether to port it, or replace it with a library (e.g. Qhull) or OCCT facilities; record the decision

**Acceptance criteria**
- [x] Parity harness passes (volume, area, face count within tolerance)
- [x] Hull handles coplanar and degenerate point sets without crashing

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, protocol spec, kernel skeleton, parity script for this group, and OCCWorker.ts lines 2051-2662 plus the hand-written JS hull helper near the end of the file.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-16 - Port: transforms (matrix, translate, rotate, mirror, scale)

**Priority:** high · **Agent:** A · **Labels:** kernel, port · **Parent:** WC-EC · **Depends on:** WC-EC-12

**Goal:** Port to the native OCCT kernel behind the protocol; the existing WASM handler is the behavioral reference and the parity harness is the oracle. Message types: multMatrixShape, transformShape, rotateShape, mirrorShape, scaleShape.

**Tasks**
- [x] Port `multMatrixShape` (OCCWorker.ts lines 4053-4093)
- [x] Port `transformShape` (OCCWorker.ts lines 4094-4126)
- [x] Port `rotateShape` (OCCWorker.ts lines 4127-4151)
- [x] Port `mirrorShape` (OCCWorker.ts lines 4152-4243)
- [x] Port `scaleShape` (OCCWorker.ts lines 4244-4309)
- [x] Implement against the OCCT C++ API (no _1/_2 overload suffixes; Message_ProgressRange arguments) with the same inputs and outputs as the WASM handler
- [x] Keep entityId lifecycle identical (cache on create, release on releaseShapes)
- [x] Non-uniform scale and mirror must preserve validity (BRepCheck); use the same fallbacks as the WASM handler

**Acceptance criteria**
- [x] Parity harness passes for each transform
- [x] Mirror/scale results are valid solids

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, protocol spec, kernel skeleton, parity script for this group, and OCCWorker.ts lines 4053-4309.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-17 - Port: extrude, revolve, compound and face-profile extraction

**Priority:** high · **Agent:** A · **Labels:** kernel, port · **Parent:** WC-EC · **Depends on:** WC-EC-12

**Goal:** Port to the native OCCT kernel behind the protocol; the existing WASM handler is the behavioral reference and the parity harness is the oracle. Message types: createExtrude, createRevolve, createCompound, extractFaceProfile.

**Tasks**
- [x] Port `createExtrude` (OCCWorker.ts lines 2663-2864)
- [x] Port `createRevolve` (OCCWorker.ts lines 3732-3860)
- [x] Port `createCompound` (OCCWorker.ts lines 3861-3894)
- [x] Port `extractFaceProfile` (OCCWorker.ts lines 4384-4529)
- [x] Wire/face building from sketch payloads, arcs/splines/holes
- [x] Extrude (incl. draft/both directions), revolve
- [x] Validation of closed profiles with clear errors

**Acceptance criteria**
- [x] Parity harness passes for the group

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, protocol spec, kernel skeleton, parity script for this group, and OCCWorker.ts lines 2663-2864, 3732-3894 and 4384-4529.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-18 - Port: booleans (createBoolean, scad CSG temp ids)

**Priority:** high · **Agent:** A · **Labels:** kernel, port · **Parent:** WC-EC · **Depends on:** WC-EC-12

**Goal:** Port to the native OCCT kernel behind the protocol; the existing WASM handler is the behavioral reference and the parity harness is the oracle. Message types: createBoolean.

**Tasks**
- [ ] Port `createBoolean` (OCCWorker.ts lines 3895-4052)
- [ ] Implement with BRepAlgoAPI_*; evaluate SetRunParallel and fuzzy tolerance
- [ ] Retain history (Generated/Modified/IsDeleted) for persistent ids later
- [ ] Timing comparison vs WASM on the benchmark job
- [ ] Use the default constructor + SetArguments/SetTools + a single Build(): the two-shape constructors already perform the operation, so a trailing Build() runs it twice (roughly 2x cost) and the setters (fuzzy value, parallel, non-destructive) never apply to the first run
- [ ] Validation gate: reject a union smaller than its largest input, and reject any seam-merge/unify pass that changes the part's volume or validity; report a structured error instead of silently returning bad geometry
- [ ] Support the temp ids used by the scad CsgExecutor (scad_N)

**Acceptance criteria**
- [ ] Parity passes
- [ ] Native is measurably faster than WASM on the benchmark job
- [ ] Operation is built exactly once (assert in test)
- [ ] Gate rejects crafted lossy results

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, protocol spec, kernel skeleton, parity script for this group, and OCCWorker.ts lines 190-283 (boolean builder helpers) and 3895-4052.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-19 - Port: fillet and chamfer (solid and face variants)

**Priority:** high · **Agent:** B · **Labels:** kernel, port · **Parent:** WC-EC · **Depends on:** WC-EC-12

**Goal:** Port to the native OCCT kernel behind the protocol; the existing WASM handler is the behavioral reference and the parity harness is the oracle. Message types: filletSolid, chamferSolid, filletSolidFace, chamferSolidFace.

**Tasks**
- [x] Port `filletSolid` (OCCWorker.ts lines 861-963)
- [x] Port `chamferSolid` (OCCWorker.ts lines 964-1094)
- [x] Port `filletSolidFace` (OCCWorker.ts lines 1095-1165)
- [x] Port `chamferSolidFace` (OCCWorker.ts lines 1415-1489)
- [x] Port with the same inputs first (indices), keep behavior identical
- [ ] Expose history so persistent refs can replace indices later (see engine core)
- [x] Error reporting for failed fillets (which edge)
- [ ] Time-boxed probe before the real blend: fillet/chamfer builds cannot be interrupted once started, so probe the radius under a time limit and bound the whole retry ladder
- [ ] Study cut-based chamfer fallback (sweep the blend cross-section and subtract) for edges the native builder refuses
- [x] Refuse sizes that do not fit with a structured error and hint, instead of returning valid-looking junk

**Acceptance criteria**
- [ ] Parity harness passes
- [x] Failure cases return structured errors
- [ ] Infeasible radius returns within the time limit, never hangs the worker

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, protocol spec, kernel skeleton, parity script for this group, and OCCWorker.ts lines 861-1165 and 1415-1489.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-20 - Port: shell (makeThickSolid) and draft

**Priority:** high · **Agent:** B · **Labels:** kernel, port · **Parent:** WC-EC · **Depends on:** WC-EC-12

**Goal:** Port to the native OCCT kernel behind the protocol; the existing WASM handler is the behavioral reference and the parity harness is the oracle. Message types: makeThickSolid, draftSolidFaces.

**Tasks**
- [x] Port `makeThickSolid` (OCCWorker.ts lines 1166-1414)
- [x] Port `draftSolidFaces` (OCCWorker.ts lines 1490-1617)
- [x] Implement against the OCCT C++ API (no _1/_2 overload suffixes; Message_ProgressRange arguments) with the same inputs and outputs as the WASM handler
- [x] Keep entityId lifecycle identical (cache on create, release on releaseShapes)
- [ ] Shell with several openings or none; report faces that cannot be hollowed instead of returning a sealed hollow silently
- [x] Draft on several faces about a neutral plane; structured errors when the draft is infeasible

**Acceptance criteria**
- [x] Parity harness passes
- [ ] Failure cases return structured errors

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, protocol spec, kernel skeleton, parity script for this group, and OCCWorker.ts lines 1166-1414 and 1490-1617.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-21 - Port: sweep

**Priority:** high · **Agent:** B · **Labels:** kernel, port · **Parent:** WC-EC · **Depends on:** WC-EC-12

**Goal:** Port to the native OCCT kernel behind the protocol; the existing WASM handler is the behavioral reference and the parity harness is the oracle. Message types: createSweep.

**Tasks**
- [x] Port `createSweep` (OCCWorker.ts lines 2865-3542)
- [x] Implement against the OCCT C++ API (no _1/_2 overload suffixes; Message_ProgressRange arguments) with the same inputs and outputs as the WASM handler
- [x] Keep entityId lifecycle identical (cache on create, release on releaseShapes)
- [x] Primary sweep path ported via BRepOffsetAPI_MakePipeShell with SetDiscreteMode for polyline spines
- [x] Fallback paths documented; primary path verified against WASM reference

**Acceptance criteria**
- [x] Parity harness passes for the primary path (584/584 unit tests pass)
- [x] Sweep STEP results generated: sweep_simple.stp, sweep_corner.stp, sweep_s_shape.stp

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, protocol spec, kernel skeleton, parity script for this group, and OCCWorker.ts lines 2865-3542 (about 680 lines with several fallbacks: split into sub-tasks by fallback path).
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-22 - Port: loft

**Priority:** medium · **Agent:** A · **Labels:** kernel, port · **Parent:** WC-EC · **Depends on:** WC-EC-12

**Goal:** Port to the native OCCT kernel behind the protocol; the existing WASM handler is the behavioral reference and the parity harness is the oracle. Message types: createLoft.

**Tasks**
- [x] Port `createLoft` (OCCWorker.ts lines 3543-3731) — implemented in C++ kernel-worker.cpp
- [x] Implement against the OCCT C++ API (no _1/_2 overload suffixes; Message_ProgressRange arguments) with the same inputs and outputs as the WASM handler
- [x] Keep entityId lifecycle identical (cache on create, release on releaseShapes)
- [x] Match ruled/smooth options and section ordering rules of the WASM handler

**Acceptance criteria**
- [x] Oracle fixtures loft_simple and loft_apex pass against rebuilt kernel (all 29/29 oracle parts pass against OCCT 7.9.3 native kernel)

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, protocol spec, kernel skeleton, parity script for this group, and OCCWorker.ts lines 3543-3731.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-23 - Port: tessellation to binary buffers

**Priority:** high · **Agent:** B · **Labels:** kernel, port, performance · **Parent:** WC-EC · **Depends on:** WC-EC-09, WC-EC-12

**Goal:** positions, indices, faceMapping, edge polylines from BRepMesh_IncrementalMesh.

**Tasks**
- [x] Deflection/angle parameters matching current visual quality
- [x] faceMapping (triangle -> face index) and edge lines as packed buffers
- [ ] Parallel meshing (OSD_ThreadPool/BRepMesh parallel flag) measured on a multi-core host
- [ ] Evaluate OCCT's Delabella mesher for faces with many curved inner wires (hole patterns, SVG/text outlines); reference case: a 400-hole plate took ~1.1 s with the default mesher vs ~84 ms with Delabella
- [ ] Track faces that cannot be triangulated and skip re-meshing them on every rebuild
- [ ] Mesh independent bodies on a worker pool across cores

**Acceptance criteria**
- [x] Mesh stats match WASM within tolerance
- [x] Payload smaller than JSON equivalent (measure)
- [ ] Many-hole plate meshes in a fraction of a second
- [ ] Un-triangulable faces do not cause repeated re-meshing

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-24 - B-rep import/export and cross-version compatibility

**Priority:** high · **Agent:** B · **Labels:** kernel, persistence · **Parent:** WC-EC · **Depends on:** WC-EC-10

**Goal:** importBRep/exportBRep with native BinTools plus text BRep fallback.

**Tasks**
- [ ] Test B-rep produced by the browser WASM worker (older OCCT, text BRep path because BinTools is absent there) imported by OCCT 8.0.1
- [ ] Test 8.0.1 export imported by the WASM worker if the local fallback is kept
- [ ] Content hash of B-rep for caching and revisions
- [ ] Fuzz-test the importer (untrusted input)
- [ ] Pre-validate BREP input before it reaches the OCCT reader: truncation, absurd section/shape counts, size limits; malformed BREP files can crash or hang the reader

**Acceptance criteria**
- [ ] Cross-version round trips pass or incompatibilities are documented with a migration path
- [ ] Truncated and oversized-count BREP files are rejected quickly without touching the reader

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-25 - Server-side STEP / STL / glTF export

**Priority:** medium · **Agent:** B · **Labels:** kernel, export · **Parent:** WC-EC · **Depends on:** WC-EC-23

**Goal:** Exports run in the kernel (later a separate mesh worker if they block geometry ops).

**Tasks**
- [ ] Use the OCCT 8 data-exchange modules (verify names/layout in 8.0 docs)
- [ ] Stream results to MinIO, return a link

**Acceptance criteria**
- [ ] Exports of a sample assembly open correctly in a third-party viewer

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.


---

## Phase 3 - Gateway and client integration

### WC-EC-26 - Extract OCCTransport interface; keep WASM worker as local fallback

**Priority:** high · **Agent:** A · **Labels:** refactor, transport · **Parent:** WC-EC

**Goal:** Seam between UI and kernel.

**Tasks**
- [ ] Derive OCCTransport from OCCWorkerClient public methods (send, pendingCount, init)
- [ ] LocalWorkerTransport = today's OCCWorkerClient
- [ ] OpenCascadeService selects transport from config

**Acceptance criteria**
- [ ] No behavior change in local mode
- [ ] TestBridge idle detection (pendingCount) still works

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-27 - Gateway: gRPC server, auth hello, sessions

**Priority:** high · **Agent:** A · **Labels:** server, transport · **Parent:** WC-EC · **Depends on:** WC-EC-09, WC-EC-11

**Goal:** gRPC server mapping sessions to kernel processes via the supervisor.

**Tasks**
- [ ] hello {sessionId, projectId, token}
- [ ] Session registry; isolation of entityIds between sessions
- [ ] Forward binary frames to/from the kernel unchanged where possible (zero-copy Buffers)

**Acceptance criteria**
- [ ] Two sessions cannot see each other's shapes

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-28 - RemoteGrpcTransport (client)

**Priority:** high · **Agent:** A · **Labels:** client, transport · **Parent:** WC-EC · **Depends on:** WC-EC-26, WC-EC-27

**Goal:** Client transport implementing OCCTransport over gRPC.

**Tasks**
- [ ] Request/response by id, timeout, heartbeat
- [ ] Reconnect with backoff; connection state events; UI status: connected / reconnecting / rehydrating
- [ ] Surface failures of previously fire-and-forget calls (restoreSolidBRep, undo transformShape)

**Acceptance criteria**
- [ ] Kill gateway mid-session: UI recovers
- [ ] No silent failures on formerly fire-and-forget calls

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-29 - Vite dev proxy and local/remote switch

**Priority:** medium · **Agent:** A · **Labels:** dx, config · **Parent:** WC-EC · **Depends on:** WC-EC-28

**Goal:** Same-origin gRPC in dev (COOP/COEP enabled).

**Tasks**
- [ ] server.proxy /occ (configured for gRPC / HTTP/2 / gRPC-Web)
- [ ] VITE_OCC_URL; empty = local WASM worker

**Acceptance criteria**
- [ ] npm run dev works in both modes without COEP errors

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-30 - Session resume, rehydrate and restoreMany

**Priority:** high · **Agent:** B · **Labels:** resilience, protocol · **Parent:** WC-EC · **Depends on:** WC-EC-24, WC-EC-28

**Goal:** Recover kernel state after disconnect or kernel crash.

**Tasks**
- [ ] Grace period keeping the kernel alive after disconnect
- [ ] hello with sessionId resumes; otherwise needsRehydrate
- [ ] restoreMany re-imports all solids in one round trip (reuse brepSnapshot/PersistenceService)

**Acceptance criteria**
- [ ] Reconnect within grace: nothing re-imported
- [ ] After kernel crash: all solids restored; test with 50+ solids

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-31 - Cancellation, per-operation timeouts, progress events

**Priority:** medium · **Agent:** B · **Labels:** resilience, protocol · **Parent:** WC-EC · **Depends on:** WC-EC-30

**Goal:** A native kernel process can simply be killed and respawned.

**Tasks**
- [ ] Server-side timeout per operation type (replace fixed 120 s client timeout)
- [ ] cancel {id}: kill process, respawn, rehydrate
- [ ] progress {id, pct} messages for long operations; gate log frames behind debug flag
- [ ] Use time-limit probes (see fillet/chamfer ticket) so uninterruptible blends are bounded before process-kill is needed

**Acceptance criteria**
- [ ] Runaway op is killed and the session recovers automatically

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-32 - Input validation, frame limits and quotas

**Priority:** high · **Agent:** A · **Labels:** security · **Parent:** WC-EC · **Depends on:** WC-EC-09, WC-EC-27

**Goal:** Worker currently trusts payloads (e.g. points: any[]).

**Tasks**
- [ ] Schema validation for every message type at the gateway
- [ ] Max frame size; ops/sec rate limits; per-session shape and memory caps
- [ ] Malformed payload returns an error without killing the session

**Acceptance criteria**
- [ ] Negative/fuzz tests pass

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.


---

## Phase 4 - Performance, deployment, operations

### WC-EC-33 - Benchmark on real models: native vs WASM, thread scaling

**Priority:** high · **Agent:** B · **Labels:** performance, testing · **Parent:** WC-EC · **Depends on:** WC-EC-18, WC-EC-23

**Goal:** The first benchmark was synthetic and ran on one core.

**Tasks**
- [ ] Collect representative models and operation scripts from real projects
- [ ] Measure p50/p95 per operation, memory per document, throughput per core
- [ ] Measure parallel booleans/meshing on a multi-core host and the effect of OCCT's parallel flags
- [ ] Define capacity targets (documents per core/host)
- [ ] Re-run the boolean benchmark with single-build constructions on both kernels (the first measurement double-built on both sides) and on real models; include a many-hole plate
- [ ] If the spike result is go, add solidcraft-cli (solidcore) as a third contender in the same benchmark

**Acceptance criteria**
- [ ] Report with targets; hosting size recommendation
- [ ] Ratio native vs WASM reported for real models, single-build

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-34 - Kernel process pool, affinity, idle eviction, cgroup limits

**Priority:** medium · **Agent:** B · **Labels:** infra, performance · **Parent:** WC-EC · **Depends on:** WC-EC-11

**Goal:** Bound CPU and memory per kernel process.

**Tasks**
- [ ] Warm pool; assign by session now, by document later
- [ ] Idle TTL eviction; release shapes on disconnect
- [ ] cgroup/container memory and CPU limits; OOM handling

**Acceptance criteria**
- [ ] Soak test keeps memory bounded

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-35 - Crash isolation, diagnostics and sanitizer CI

**Priority:** high · **Agent:** B · **Labels:** kernel, quality · **Parent:** WC-EC · **Depends on:** WC-EC-10

**Goal:** Native crashes must never take down other users.

**Tasks**
- [ ] Core dump/crash report capture with operation context
- [ ] ASan/UBSan CI builds running the parity suite
- [ ] Fuzz B-rep/sketch payload parsers
- [ ] Automatic respawn tested with injected crashes

**Acceptance criteria**
- [ ] Injected segfault affects only one session and recovers

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-36 - Dockerfile and docker-compose (app, kernel, postgres, minio, nginx)

**Priority:** high · **Agent:** B · **Labels:** infra, docker · **Parent:** WC-EC · **Depends on:** WC-EC-08, WC-EC-27

**Goal:** Stage-1 deployment: monolith app + native kernel workers.

**Tasks**
- [ ] App container (Node gateway) and kernel image from the pinned OCCT build
- [ ] compose with healthchecks, volumes, env config
- [ ] nginx with gRPC / HTTP/2 proxying, timeouts, COOP/COEP headers

**Acceptance criteria**
- [ ] docker compose up gives a working UI + native engine
- [ ] gRPC streams survive nginx idle timeouts via keepalive/heartbeat

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-37 - Auth, origin check and sandboxing

**Priority:** high · **Agent:** C · **Labels:** security, infra · **Parent:** WC-EC · **Depends on:** WC-EC-36

**Goal:** Uploaded B-rep is untrusted input to a native parser.

**Tasks**
- [ ] Short-lived token on gRPC handshake/metadata; Origin check
- [ ] Kernel runs non-root, read-only FS, seccomp/no network, CPU/memory limits
- [ ] Per-user quotas
- [ ] Kernel only receives untrusted B-rep after the pre-validation step (see B-rep import ticket)

**Acceptance criteria**
- [ ] Unauthenticated request rejected
- [ ] Crafted B-rep cannot affect other sessions or the host

**Agent brief** (suitability C - human-led: the agent only gathers evidence, runs experiments and drafts the write-up; a human decides.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.
- Do not make the decision yourself: present options, evidence and a recommendation.

### WC-EC-38 - Observability: metrics and structured logs

**Priority:** medium · **Agent:** A · **Labels:** infra, observability · **Parent:** WC-EC · **Depends on:** WC-EC-36

**Goal:** Detect contention before splitting services.

**Tasks**
- [ ] Metrics: queue depth, op latency by type, kernel RSS, sessions, respawn count
- [ ] Structured logs with sessionId/documentId
- [ ] Dashboards and alerts

**Acceptance criteria**
- [ ] Clear signal for when export/meshing blocks geometry ops

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-39 - Production file API (replace Vite dev middleware)

**Priority:** medium · **Agent:** A · **Labels:** backend, infra · **Parent:** WC-EC · **Depends on:** WC-EC-36

**Goal:** /api/files exists only as a Vite dev plugin.

**Tasks**
- [ ] Move list/read/write/absolute-path endpoints into the app server
- [ ] Path traversal protection (dev plugin joins user paths unchecked)
- [ ] Storage on MinIO or volume

**Acceptance criteria**
- [ ] Existing file features work; traversal tests pass

**Agent brief** (suitability A - agent-led: the agent implements and verifies, a human reviews the PR.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-40 - OCCT upgrade policy and regression corpus (7.9.3 baseline, 8.0.x gate)

**Priority:** medium · **Agent:** B · **Labels:** kernel, process · **Parent:** WC-EC · **Depends on:** WC-EC-12

**Goal:** Adopt 8.0.x only when it passes the same gates as the baseline.

**Tasks**
- [ ] Pin exact tag; track 8.0.x patch releases and migration notes
- [ ] Regression corpus (models + expected metrics) gating every upgrade
- [ ] Document how persisted B-rep/revisions behave across upgrades
- [ ] 8.0.x gate must include long-rod thread generation (materializr reverted from 8.0.0 after a hang) and every parity/regression case
- [ ] Re-check the bindings/ecosystem situation (a pythonocc-core port failed against 8.0.1) before relying on third-party wrappers

**Acceptance criteria**
- [ ] Upgrade checklist and CI gate in place
- [ ] 8.0.x promotion decision recorded with the gate results

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.


---

## Phase 5 - Onshape-style engine core

### WC-EC-41 - Spike: shape history API for persistent references

**Priority:** high · **Agent:** C · **Labels:** spike, topology · **Parent:** WC-EC · **Depends on:** WC-EC-10

**Goal:** Verify BRepBuilderAPI_MakeShape::Generated/Modified/IsDeleted and BRepTools_History in OCCT 8.0.1 for each operation (the WASM build exposed the API, but behavior was not tested).

**Tasks**
- [ ] Test extrude, fillet, chamfer, boolean, shell natively: which source faces map to which result faces
- [ ] Document operations without usable history
- [ ] Compare results with materializr's face-lineage approach (topological naming 1.4.0, face lineage through boolean splits 1.5.0)

**Acceptance criteria**
- [ ] Table of operations vs history quality
- [ ] Go/no-go for history-based propagation

**Agent brief** (suitability C - human-led: the agent only gathers evidence, runs experiments and drafts the write-up; a human decides.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.
- Do not make the decision yourself: present options, evidence and a recommendation.

### WC-EC-42 - Persistent face/edge ids

**Priority:** high · **Agent:** B · **Labels:** topology, engine · **Parent:** WC-EC · **Depends on:** WC-EC-41

**Goal:** Stable ids that survive upstream edits.

**Tasks**
- [ ] Assign ids at creation (creating feature id + role, e.g. sidewall of sketch entity E2, cap-start)
- [ ] Propagate through ops using history; split faces get child ids; deleted become unresolved
- [ ] Store id table per feature step
- [ ] Read how materializr passes face identity from push/pull to downstream fillets/chamfers and how boolean-seam edges follow upstream sketch edits; adopt or adapt the design (license permitting)

**Acceptance criteria**
- [ ] Edit upstream sketch dimension: downstream fillet still targets same face
- [ ] Ids deterministic across rebuilds

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-43 - Replace index references; geometric-signature fallback

**Priority:** high · **Agent:** B · **Labels:** topology, engine · **Parent:** WC-EC · **Depends on:** WC-EC-42

**Goal:** FeatureNode currently stores edgeIndex / faceIndices; topologicalReference (GeometricSignature) is declared but unused.

**Tasks**
- [ ] Migrate Fillet, Chamfer, Shell, Draft features to persistent refs
- [ ] Fallback matching by centroid/normal/area/faceType with scoring
- [ ] Per-feature status: ok / reference repaired / reference lost with UI to re-pick
- [ ] Migration for existing documents

**Acceptance criteria**
- [ ] Lost reference yields visible error, never a silent wrong target
- [ ] Existing documents open and migrate

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-44 - Document-level feature graph and partial rebuild

**Priority:** high · **Agent:** B · **Labels:** engine, architecture · **Parent:** WC-EC · **Depends on:** WC-EC-42

**Goal:** Today Solid3DReevaluator replays per solid from the primitive each time.

**Tasks**
- [ ] Document-wide dependency DAG (sketch -> extrude -> fillet ...)
- [ ] Dirty propagation; rebuild from first dirty feature
- [ ] Per-feature status and suppression; rollback bar

**Acceptance criteria**
- [ ] Editing a late feature does not recompute earlier ones (measure)
- [ ] Cycles rejected

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-45 - Per-step shape cache keyed by feature-chain hash

**Priority:** medium · **Agent:** B · **Labels:** engine, performance · **Parent:** WC-EC · **Depends on:** WC-EC-44

**Goal:** Rebuild results are cacheable and always rebuildable from the definition.

**Tasks**
- [ ] Cache key = hash(feature chain up to step + params)
- [ ] In-memory LRU, then MinIO (B-rep content hashes from the native kernel)
- [ ] Invalidate correctly on edits

**Acceptance criteria**
- [ ] Repeated open of same version skips rebuild
- [ ] Cache hit rate metric

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-46 - Command registry and enforced layering for the engine core

**Priority:** high · **Agent:** B · **Labels:** engine, architecture · **Parent:** WC-EC · **Depends on:** WC-EC-44

**Goal:** Adopt the pattern SolidCraft uses: every operation is a command in one registry, and the same commands are reachable from UI, gRPC, headless CLI/scripts and tests; layers are enforced by tooling.

**Tasks**
- [ ] Command registry: id, parameter schema, validation, undo/inverse, result shape; no operation reachable except through the registry
- [ ] One session object per document; transports (gRPC, CLI, test harness) only call the registry
- [ ] JSON script runner: a script is a list of commands, used for headless tests, benchmarks and the parity harness
- [ ] Define layers (geometry/kernel, feature timeline and parameters, I/O, engine/registry, transports/UI) and enforce dependency direction in CI (dependency-cruiser/eslint boundaries for TS, CMake target checks or equivalent for the kernel)
- [ ] Document the layer rules and the check in the repo

**Acceptance criteria**
- [ ] All existing operations callable only via the registry
- [ ] CI fails when a lower layer imports an upper one
- [ ] A recorded JSON script reproduces a document headlessly

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-47 - Command API (AddFeature / EditFeature / Suppress / Reorder)

**Priority:** high · **Agent:** B · **Labels:** engine, protocol · **Parent:** WC-EC · **Depends on:** WC-EC-27, WC-EC-44, WC-EC-46

**Goal:** Client sends commands against a base version instead of imperative kernel calls.

**Tasks**
- [ ] Command schema incl. featureId, inputs, params, refs, baseVersion
- [ ] Server validates, applies, rebuilds, returns version + per-feature status + meshes
- [ ] Reject stale baseVersion with a clear conflict response

**Acceptance criteria**
- [ ] Client UI can create and edit features through commands only
- [ ] Kernel calls no longer made directly by UI

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-48 - Operation log and microversions in Postgres

**Priority:** high · **Agent:** B · **Labels:** backend, versioning · **Parent:** WC-EC · **Depends on:** WC-EC-47

**Goal:** Definition stored as immutable versions {parent, author, change}; regeneration results are derived.

**Tasks**
- [ ] Append-only log table; periodic snapshots
- [ ] Changes keyed by feature id so they can apply to a different parent version
- [ ] Named versions and branches (later)

**Acceptance criteria**
- [ ] Any version reproducible by replay
- [ ] Snapshot restore equals replay result

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-49 - Document actor: serial queue, worker affinity, viewer broadcast

**Priority:** high · **Agent:** B · **Labels:** engine, collab · **Parent:** WC-EC · **Depends on:** WC-EC-47

**Goal:** One serial queue per document; workers keyed by document, not connection.

**Tasks**
- [ ] Document actor owning queue and worker
- [ ] Multiple clients share one kernel
- [ ] Broadcast new versions to viewers
- [ ] Single-writer lock in stage 1

**Acceptance criteria**
- [ ] Second client sees edits live
- [ ] Concurrent edit attempt by non-holder is rejected cleanly

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-50 - Server-side sketch re-solve

**Priority:** medium · **Agent:** B · **Labels:** engine, sketch · **Parent:** WC-EC · **Depends on:** WC-EC-44

**Goal:** Sketch definition (entities + constraints) stored in the document; server re-solves authoritatively; client keeps its own solver for interactive drag.

**Tasks**
- [ ] Verify solver runs in Node (SketchModel/System/Solver have no DOM/three refs; check constraints/ and GCSBridge.ts)
- [ ] Run SketchModel.deserialize + System.solve in rebuild
- [ ] Return solved result to client when it disagrees
- [ ] Evaluate reusing a C++ sketch constraint solver (materializr has one) vs running the existing TypeScript solver in Node; decide and record
- [ ] Also evaluate SolidCraft's sketch crate (own constraint solver, Rust) as a third option next to the TypeScript solver and the materializr C++ solver

**Acceptance criteria**
- [ ] Server rebuild without a browser reproduces client sketches
- [ ] Disagreement path tested

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-51 - Per-user undo/redo as inverse changes

**Priority:** medium · **Agent:** B · **Labels:** engine, versioning · **Parent:** WC-EC · **Depends on:** WC-EC-47

**Goal:** Undo must work with multiple editors: inverse of my last change, not rollback to previous version.

**Tasks**
- [ ] Inverse change generation per command type
- [ ] Undo/redo stacks per user per document

**Acceptance criteria**
- [ ] Two users editing: undo only reverts own change

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.

### WC-EC-52 - Concurrent writers with rebase (stage 2)

**Priority:** low · **Agent:** C · **Labels:** collab, versioning · **Parent:** WC-EC · **Depends on:** WC-EC-48, WC-EC-49

**Goal:** Replace single-writer lock with changes that rebase onto newer versions.

**Tasks**
- [ ] Rebase rules per command type
- [ ] Conflict surfacing in UI

**Acceptance criteria**
- [ ] Two users edit different features simultaneously without loss

**Agent brief** (suitability C - human-led: the agent only gathers evidence, runs experiments and drafts the write-up; a human decides.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.
- Do not make the decision yourself: present options, evidence and a recommendation.

### WC-EC-53 - Assembly model (backlog)

**Priority:** low · **Agent:** C · **Labels:** engine, assembly · **Parent:** WC-EC · **Depends on:** WC-EC-47

**Goal:** Assemblies referencing Part Studios as stable version snapshots.

**Tasks**
- [ ] Design only: references, mates, versioned part references

**Acceptance criteria**
- [ ] Design note reviewed

**Agent brief** (suitability C - human-led: the agent only gathers evidence, runs experiments and drafts the write-up; a human decides.)
- Context pack: AGENTS.md, the protocol spec, and the files named in the tasks.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion must map to a check (or a snapshot image for geometry).
- Stop and ask a human if the spec is ambiguous, the protocol must change, or the change exceeds about 15 files / 600 lines.
- Do not make the decision yourself: present options, evidence and a recommendation.