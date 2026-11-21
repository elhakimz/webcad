# Regeneration Engine and Kernel Contracts (WC-RGN)

Make the feature tree the source of truth and the kernel a geometry processor: ordered feature rebuilds in one call, topology history returned with every result, per-feature failure containment, a decided worker model and job path for non-interactive work, and an OCCT knowledge pack so the coding agent uses version-correct APIs.

Why now: the proto and generated code already exist, so the Rebuild and topology-history messages should be agreed before more code depends on the current messages. Adding fields is additive in protobuf, but the semantics (ids, ordering, caching) are not. Builds on WC-EC (kernel, gRPC/Connect, command registry, feature graph); it does not replace any WC-EC ticket, but several WC-EC tickets need edits (see Impact).

Design stance (see ADR ticket): stateful per-session kernel with a warm shape cache stays the default; stateless worker pools are evaluated after the benchmark. A message broker is used only for non-interactive jobs.

**Priority:** high · **Labels:** webcad, engine, regeneration

## Tickets overview

| ID | Title | Priority | Agent |
|---|---|---|---|
| WC-RGN-01 | ADR: kernel worker model (stateful per-session vs pooled vs hybrid) | high | C |
| WC-RGN-02 | Proto: topology history and persistent ids in kernel responses | high | B |
| WC-RGN-03 | Proto: Rebuild RPC (ordered feature batch, streamed per-feature status) | high | B |
| WC-RGN-04 | Kernel: execute a feature chain against the local shape cache | high | B |
| WC-RGN-05 | Per-feature failure containment and dependents policy | high | B |
| WC-RGN-06 | Gateway rebuild orchestration | high | B |
| WC-RGN-07 | Client integration: feature status, changed-body updates, selection stability | medium | B |
| WC-RGN-08 | Decision and spike: job queue and async job API for non-interactive work | medium | C |
| WC-RGN-09 | Rebuild correctness suite | high | A |
| WC-RGN-10 | Rebuild performance benchmarks | medium | A |
| WC-RGN-11 | OCCT knowledge pack for the coding agent | high | A |

## Impact on existing WC-EC tickets (edits needed)

| WC-EC ticket | Edit |
|---|---|
| WC-EC-09 (Language-neutral kernel protocol) | Specify Rebuild and topology-history messages (see WC-RGN-03, WC-RGN-02). |
| WC-EC-05 (ADR: kernel strategy) | Link the worker-model ADR (WC-RGN-01) and state per-session stateful kernels as the stage-1 model. |
| WC-EC-41 (Spike: shape history API) | Test the native history behavior needed by WC-RGN-02. |
| WC-EC-42 (Persistent face/edge ids) | Use the id and history format from WC-RGN-02. |
| WC-EC-44 (Document-level feature graph) | Expose the dirty-set computation to the gateway (WC-RGN-06). |
| WC-EC-45 (Per-step shape cache) | Use the same chain-hash definition as the kernel cache key in WC-RGN-04. |
| WC-EC-47 (Command API) | Add Rebuild as a sequenced command. |
| WC-EC-49 (Document actor) | Rebuild runs through the serial queue and broadcasts events to viewers. |
| WC-EC-02 (Agent harness) | Add the OCCT citation rule and link the knowledge pack (WC-RGN-11). |

### WC-RGN-01 - ADR: kernel worker model (stateful per-session vs pooled vs hybrid)

**Priority:** high · **Agent:** C · **Labels:** adr, architecture · **Parent:** WC-RGN · **Depends on:** WC-EC-33, WC-EC-05

**Goal:** Record which worker model WebCad uses for regeneration and why, with a measured trigger for revisiting.

**Tasks**
- [ ] Options: (A) stateful per-session kernel with warm shape cache (current), (B) stateless pool where every operation loads inputs from storage, (C) hybrid: per-session kernel plus a content-addressed shape cache used for recovery and migration
- [ ] Criteria: latency, memory per session, density, crash-recovery cost, multi-user documents (several sessions on one document), operational complexity
- [ ] Use benchmark data from the real-model benchmark; define the density/latency threshold that would trigger evaluating (B)
- [ ] State how a message queue relates: not on the interactive path

**Acceptance criteria**
- [ ] ADR merged with measurements or explicit 'pending benchmark' status
- [ ] Revisit trigger written down

**Agent brief** (suitability C - human-led; the agent gathers evidence and drafts, a human decides)
- Context pack: AGENTS.md, the protocol spec, the gRPC/Connect design doc, and the files named in the tasks; for OCCT calls use the knowledge pack and cite header path and line.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion maps to a check.
- Stop and ask a human if the spec is ambiguous, the protocol must change beyond this ticket, or the change exceeds about 15 files / 600 lines.
- Do not make the decision yourself: present options, evidence and a recommendation.

### WC-RGN-02 - Proto: topology history and persistent ids in kernel responses

**Priority:** high · **Agent:** B · **Labels:** protocol, topology · **Parent:** WC-RGN · **Depends on:** WC-EC-09, WC-EC-41, WC-EC-42

**Goal:** Every operation result carries enough information to keep downstream references stable. Today MeshData has only a triangle-to-face index.

**Tasks**
- [ ] Add per-face and per-edge persistent id arrays aligned with mesh face/edge indices
- [ ] Add a TopologyHistory table per operation: old id -> new ids, with kind (modified, generated, deleted); derived from OCCT Generated/Modified/IsDeleted (API presence was confirmed in the WASM build; behavior is covered by the shape-history spike)
- [ ] Id assignment rule: creating feature id plus a role (e.g. sidewall of sketch entity, cap); child ids for split faces
- [ ] Opt-in request flag include_history; size limits and compression; additive proto changes only (buf breaking must pass)
- [ ] Golden test vectors and a mock-kernel implementation

**Acceptance criteria**
- [ ] buf lint/breaking pass
- [ ] History for extrude, boolean and fillet is correct on reference parts
- [ ] Payload cost measured with and without history

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely)
- Context pack: AGENTS.md, the protocol spec, the gRPC/Connect design doc, and the files named in the tasks; for OCCT calls use the knowledge pack and cite header path and line.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion maps to a check.
- Stop and ask a human if the spec is ambiguous, the protocol must change beyond this ticket, or the change exceeds about 15 files / 600 lines.

### WC-RGN-03 - Proto: Rebuild RPC (ordered feature batch, streamed per-feature status)

**Priority:** high · **Agent:** B · **Labels:** protocol, regeneration · **Parent:** WC-RGN · **Depends on:** WC-RGN-02, WC-EC-09, WC-EC-47

**Goal:** Replaying a feature tree as N separate calls pays N round trips; send an ordered batch and stream results.

**Tasks**
- [ ] EngineGateway.Rebuild (server-streaming, browser-safe) and Kernel.Rebuild (server-streaming): request = ordered feature commands (reusing the command envelope), base_version, start index (first dirty feature), known cache revisions, rebuild_id
- [ ] Events per feature: started, progress, completed (status, mesh delta reference, topology history), failed (ExecuteFailure code/operation), plus a final summary
- [ ] Rebuild is a sequenced command: client_seq ordering, dedupe by rebuild_id, cancel via the existing Cancel by id
- [ ] Limits: max features per request, message size, BlobRef for large parameters
- [ ] Keep Execute for single interactive operations; document when each is used

**Acceptance criteria**
- [ ] Proto reviewed against the gRPC/Connect design (no client or bidirectional streaming on the browser-facing service)
- [ ] buf lint/breaking pass; mock kernel implements Rebuild

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely)
- Context pack: AGENTS.md, the protocol spec, the gRPC/Connect design doc, and the files named in the tasks; for OCCT calls use the knowledge pack and cite header path and line.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion maps to a check.
- Stop and ask a human if the spec is ambiguous, the protocol must change beyond this ticket, or the change exceeds about 15 files / 600 lines.

### WC-RGN-04 - Kernel: execute a feature chain against the local shape cache

**Priority:** high · **Agent:** B · **Labels:** kernel, regeneration · **Parent:** WC-RGN · **Depends on:** WC-RGN-03, WC-EC-10, WC-EC-12, WC-EC-45

**Goal:** The kernel runs the chain in order, skipping steps whose result is already cached.

**Tasks**
- [ ] Cache key = hash(chain prefix + parameters); LRU eviction and memory cap; release shapes on eviction
- [ ] Same handler code path as Execute (no duplicated operation logic)
- [ ] Deterministic ordering; stream per-feature events as they finish
- [ ] Respect per-feature deadlines and the process-kill cancellation model

**Acceptance criteria**
- [ ] Result equals executing the same commands one at a time (parity harness)
- [ ] Cache hit skips recomputation; counters exposed in metrics

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely)
- Context pack: AGENTS.md, the protocol spec, the gRPC/Connect design doc, and the files named in the tasks; for OCCT calls use the knowledge pack and cite header path and line.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion maps to a check.
- Stop and ask a human if the spec is ambiguous, the protocol must change beyond this ticket, or the change exceeds about 15 files / 600 lines.

### WC-RGN-05 - Per-feature failure containment and dependents policy

**Priority:** high · **Agent:** B · **Labels:** engine, regeneration · **Parent:** WC-RGN · **Depends on:** WC-RGN-04, WC-EC-44

**Goal:** A failed feature must not abort the whole rebuild or hide what still works.

**Tasks**
- [ ] Per-feature status: ok, failed, skipped (depends on a failed feature), suppressed
- [ ] Independent branches keep rebuilding; dependents of a failed feature are skipped and marked
- [ ] Rollback bar: rebuild up to feature k; resume from the failed feature after a fix
- [ ] Decision for a human: show last-good geometry (greyed, flagged) or nothing for a failed body. Proposed default: show last-good, clearly marked
- [ ] Failure details use the in-band ExecuteFailure model

**Acceptance criteria**
- [ ] Matrix of failure cases tested (single failure, chain failure, independent branches)
- [ ] Resume after fix rebuilds only the affected suffix

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely)
- Context pack: AGENTS.md, the protocol spec, the gRPC/Connect design doc, and the files named in the tasks; for OCCT calls use the knowledge pack and cite header path and line.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion maps to a check.
- Stop and ask a human if the spec is ambiguous, the protocol must change beyond this ticket, or the change exceeds about 15 files / 600 lines.

### WC-RGN-06 - Gateway rebuild orchestration

**Priority:** high · **Agent:** B · **Labels:** server, regeneration · **Parent:** WC-RGN · **Depends on:** WC-RGN-03, WC-RGN-05, WC-EC-49, WC-EC-44, WC-EC-31

**Goal:** Turn an edit into the smallest valid rebuild.

**Tasks**
- [ ] Compute the dirty set from the feature graph; start from the first dirty feature
- [ ] Call Kernel.Rebuild and relay events to the browser; version-stamp results
- [ ] Rebuild runs through the document actor's serial queue; per-rebuild and per-feature deadlines
- [ ] Cancellation and reconnect: resume from the event stream, rehydrate if the kernel restarted

**Acceptance criteria**
- [ ] Editing a late feature in a long chain rebuilds only the suffix (measured)
- [ ] Cancel mid-rebuild leaves the session recoverable

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely)
- Context pack: AGENTS.md, the protocol spec, the gRPC/Connect design doc, and the files named in the tasks; for OCCT calls use the knowledge pack and cite header path and line.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion maps to a check.
- Stop and ask a human if the spec is ambiguous, the protocol must change beyond this ticket, or the change exceeds about 15 files / 600 lines.

### WC-RGN-07 - Client integration: feature status, changed-body updates, selection stability

**Priority:** medium · **Agent:** B · **Labels:** client, regeneration · **Parent:** WC-RGN · **Depends on:** WC-RGN-06, WC-RGN-02

**Goal:** Show rebuild results in the UI without redrawing everything.

**Tasks**
- [ ] Feature tree statuses (ok, failed, skipped, suppressed) with error text
- [ ] Update only changed bodies' meshes; keep selection by persistent id
- [ ] Undo/redo triggers a rebuild through the inverse command
- [ ] Progress and cancel controls

**Acceptance criteria**
- [ ] E2E: edit a sketch dimension; affected bodies update, a failing feature shows a badge, selection survives

**Agent brief** (suitability B - agent drafts, a human owns design decisions and reviews closely)
- Context pack: AGENTS.md, the protocol spec, the gRPC/Connect design doc, and the files named in the tasks; for OCCT calls use the knowledge pack and cite header path and line.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion maps to a check.
- Stop and ask a human if the spec is ambiguous, the protocol must change beyond this ticket, or the change exceeds about 15 files / 600 lines.

### WC-RGN-08 - Decision and spike: job queue and async job API for non-interactive work

**Priority:** medium · **Agent:** C · **Labels:** decision, jobs · **Parent:** WC-RGN · **Depends on:** WC-EC-09, WC-EC-34

**Goal:** Imports, exports, healing, thumbnails and LOD should not block interactive operations.

**Tasks**
- [ ] Define job types versus interactive operations
- [ ] Compare a Postgres-based queue (SKIP LOCKED), NATS JetStream, RabbitMQ and Kafka on operations burden, retries, priorities, visibility and fit with the compose-stage deployment (Kafka is an event log, not an obvious work queue)
- [ ] Job API: submit, get, subscribe, cancel; inputs via BlobRef, outputs via StreamResult or an object-store link; idempotency by job_id; quotas
- [ ] Spike with three job types; the interactive path must not change

**Acceptance criteria**
- [ ] Decision memo with recommendation
- [ ] Spike results for import, export and thumbnail jobs

**Agent brief** (suitability C - human-led; the agent gathers evidence and drafts, a human decides)
- Context pack: AGENTS.md, the protocol spec, the gRPC/Connect design doc, and the files named in the tasks; for OCCT calls use the knowledge pack and cite header path and line.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion maps to a check.
- Stop and ask a human if the spec is ambiguous, the protocol must change beyond this ticket, or the change exceeds about 15 files / 600 lines.
- Do not make the decision yourself: present options, evidence and a recommendation.

### WC-RGN-09 - Rebuild correctness suite

**Priority:** high · **Agent:** A · **Labels:** testing, regeneration · **Parent:** WC-RGN · **Depends on:** WC-RGN-04, WC-RGN-05, WC-RGN-06, WC-EC-13, WC-EC-12

**Goal:** Prove rebuilds are right, not just fast.

**Tasks**
- [ ] Replay equals incremental equals cold rebuild (metrics and hashes where deterministic)
- [ ] Cache hit equals cold result
- [ ] Failure containment matrix
- [ ] Topology stability: edit an upstream sketch dimension; downstream fillet or hole keeps its target by persistent id
- [ ] Run through the JSON script runner and the oracle reference parts

**Acceptance criteria**
- [ ] Suite runs in CI
- [ ] Failures print the metric and delta

**Agent brief** (suitability A - agent-led, a human reviews the PR)
- Context pack: AGENTS.md, the protocol spec, the gRPC/Connect design doc, and the files named in the tasks; for OCCT calls use the knowledge pack and cite header path and line.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion maps to a check.
- Stop and ask a human if the spec is ambiguous, the protocol must change beyond this ticket, or the change exceeds about 15 files / 600 lines.

### WC-RGN-10 - Rebuild performance benchmarks

**Priority:** medium · **Agent:** A · **Labels:** performance, regeneration · **Parent:** WC-RGN · **Depends on:** WC-RGN-04, WC-RGN-06, WC-EC-33

**Goal:** Measure what the batch RPC and partial rebuild actually buy.

**Tasks**
- [ ] Chains of 10, 50 and 200 features on reference models
- [ ] Compare per-feature Execute round trips vs Rebuild; full vs partial; cache hit effect; memory growth
- [ ] Define targets after measuring (proposed, not fixed)

**Acceptance criteria**
- [ ] Report with numbers and proposed targets

**Agent brief** (suitability A - agent-led, a human reviews the PR)
- Context pack: AGENTS.md, the protocol spec, the gRPC/Connect design doc, and the files named in the tasks; for OCCT calls use the knowledge pack and cite header path and line.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion maps to a check.
- Stop and ask a human if the spec is ambiguous, the protocol must change beyond this ticket, or the change exceeds about 15 files / 600 lines.

### WC-RGN-11 - OCCT knowledge pack for the coding agent

**Priority:** high · **Agent:** A · **Labels:** agent, docs · **Parent:** WC-RGN · **Depends on:** WC-EC-02

**Goal:** Version-correct OCCT API information so the agent stops guessing signatures. OCCT's documentation sources are Markdown with Doxygen markup in the dox directory, and headers carry most API documentation.

**Tasks**
- [ ] Authority for signatures: headers from the pinned package (7.9.3), separately for the gated 8.0.x
- [ ] Sparse checkout (or documented download script) of the OCCT repo at the pinned tag: dox/ user guides (Modeling Data, Modeling Algorithms, Mesh, Shape Healing, STEP, XDE) and the Draw demo scripts as working call sequences; prefer a script or submodule over copying; check documentation licence terms
- [ ] occt-api helper: prints a class's documentation comments and method signatures from the headers, per version
- [ ] Optionally generate HTML for only the modules in use (gendoc supports a module list)
- [ ] AGENTS.md and PR template rule: cite the header path and line for every OCCT API used; add a CI or review check where practical

**Acceptance criteria**
- [ ] Agent can answer signature questions from the pack for both versions
- [ ] helper has tests
- [ ] PR template updated

**Agent brief** (suitability A - agent-led, a human reviews the PR)
- Context pack: AGENTS.md, the protocol spec, the gRPC/Connect design doc, and the files named in the tasks; for OCCT calls use the knowledge pack and cite header path and line.
- Verify: run the verify command from AGENTS.md and attach the output; every acceptance criterion maps to a check.
- Stop and ask a human if the spec is ambiguous, the protocol must change beyond this ticket, or the change exceeds about 15 files / 600 lines.
