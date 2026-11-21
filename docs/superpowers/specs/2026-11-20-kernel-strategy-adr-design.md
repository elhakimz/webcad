# WC-EC-05 ADR: Kernel Strategy — Native OCCT 7.9.3 Behind a Language-Neutral Protocol

**Status:** Accepted; kernel skeleton gated on OCCT 7.9.3 baseline only.
**Agent:** C (human-led — agent gathers evidence and drafts; human decides)
**Phase:** Phase 1
**Parent:** WC-EC epic (docs/epics/WEBCAD-EPIC-EC-v5.md)
**ADR record:** docs/adr/NNNN-kernel-strategy.md (NNNN assigned at commit)
**Design spec:** docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md (this file)

---

## 1. Decision

Use **native OCCT 7.9.3** (C++17) as the baseline geometry kernel, running in one native worker process per session, accessed from the browser through a Node gateway over native gRPC (UDS, TCP + mTLS cross-host). The WASM worker remains in the browser as an offline/preview fallback — not removed.

Architectural inspiration: Onshape's geometry engine server (browser UI → application services → geometry engine servers → Parasolid kernel → cloud storage). WebCad follows the same split: browser UI (Three.js) → Node gateway → OCCT kernel workers → persistent document storage. Benefits match: no large local CAD install, consistent results regardless of hardware, real-time collaboration, centralized version control, easier scaling for complex assemblies.

## 2. Options considered

| Option | Kernel | Evidence | Verdict |
|---|---|---|---|
| **A** | Native OCCT 7.9.3 | Proven in production via materializr; C++17 acceptable; existing `OCCTransport`/`RemoteGrpcTransport` contract already targets this shape | **Selected (baseline)** |
| **B** | SolidCraft/solidcore | For inspiration only — not evaluated as a replacement kernel; OCCT 7.9.3 is the sole kernel | Not considered |
| **C** | Hybrid (OCCT primary + SolidCraft) | Not applicable — SolidCraft is for inspiration only | Not considered |

## 3. Version decision

- **7.9.3 is the hard baseline.** Evidence:
  - materializr reverted from OCCT 8.0.0 after a thread-generation hang.
  - pythonocc-core port failed against OCCT 8.0.1.
- **8.0.x is gated:** adopted only after it passes the parity and regression gate (WC-EC-12 / WC-EC-13). Not considered for the Phase 1 kernel skeleton.

## 4. Authoritative state (staged)

- **Stage 1 (initial):** client authoritative. The client holds `brepSnapshot` per entity with `include_brep=true`; the kernel is a rebuildable per-session cache (stateless compute). On kernel crash or restart, the client re-imports B-rep snapshots via `Restore` and replays aborted commands in order.
- **Stage 2 (future):** server-held document with B-rep revisions; the kernel caches server-authoritative state. Out of scope for Phase 1.

## 5. Architecture

### Components

| Component | Responsibility | Depends on |
|---|---|---|
| `Kernel` service (protobuf) | `Execute(ExecuteRequest) -> ExecuteResponse` | protobuf schema (WC-EC-09) |
| `OCCKernelWorker` (C++17) | OCCT 7.9.3 wrapper, gRPC server over UDS | OCCT 7.9.3 shared library, protobuf C++ |
| `GatewayKernelSupervisor` (Node) | Spawn/pool/respawn kernel processes, UDS framing | `Kernel` service client |
| `EngineGatewayService` (existing) | Connect endpoint for browser; relays to kernel | `RemoteGrpcTransport` |
| `RemoteGrpcTransport` (existing, unchanged) | Browser → Connect → `EngineGatewayService` | `@connectrpc/connect-web` |
| `OpenCascadeService` (existing, unchanged) | Public TS API; transport selection | `OCCTransport` |

### Data flow

```
Browser → OpenCascadeService.createBox(...)
  → RemoteGrpcTransport (Connect) → EngineGatewayService (relay)
    → Gateway → native gRPC over UDS → Kernel.Execute(ExecuteRequest)
      → [importBRep / Restore only: B-rep pre-validation] → OCCT 7.9.3
      → Kernel.ExecuteResponse (MeshData + opt-in BrepReference)
    → Gateway → EngineGatewayService response
  → RemoteGrpcTransport → THREE.BufferGeometry
```

### Protocol naming

- Kernel RPC: `Kernel.Execute(ExecuteRequest) -> ExecuteResponse`
- Response carries `MeshData` and an opt-in `BrepReference`
- Failures returned in-band via `ExecuteFailure` codes (covers non-exception failures too)
- No `EngineGatewayService.Execute` — the gateway relays; the kernel executes

### Fallback (length-prefixed protobuf over UDS)

If the C++ gRPC build exceeds the "too heavy" thresholds (Section 10), fall back to length-prefixed protobuf over UDS. Not a JSON-RPC phase; no stdio. Framing cost for streaming RPCs is noted as a caveat.

## 6. Error handling

- **B-rep pre-validation:** only on `importBRep` and `Restore` — size limits, truncation checks, section count validation before the OCCT reader.
- **No silent WASM fallback** (proposed default: show an explicit "update required" banner or user-visible fallback).
- **Kernel crash:** abort all in-flight commands → session enters `REHYDRATING` → client runs `Restore` from snapshots (stage 1: client-authoritative) → client replays aborted commands in order. No per-op idempotency classification.
- **OCCT exceptions:** caught in the kernel, returned as in-band `ExecuteFailureCode` (not a process crash).
- **Watchdog + deadline kills:** stalled kernel killed after timeout, respawned by supervisor.
- **Sandboxing:** kernel worker runs sandboxed (restricted filesystem and network access).

## 7. Benchmark evidence

- **Single-build:** ~2.35 s WASM vs ~0.17 s native (~14x). Double-build run: same ratio.
- **Double-Build flaw:** `Build()` is called twice — on both benchmark sides and in the production WASM worker. WC-EC-01 (quick win) addresses removing the duplicate `Build()`.
- **Caveats:** synthetic benchmark, one core, one run, older OCCT version in the WASM build. Results are indicative, not definitive.
- **Determinism:** same binary + same machine, parallel modes off; version matrix uses tolerances (not byte-identical across OCCT versions).

## 8. SolidCraft waiver

- **Status:** SolidCraft/solidcore is for inspiration only — not evaluated as a replacement kernel, no waiver needed, no approver required.
- **ADR status:** "Accepted; kernel skeleton gated on OCCT 7.9.3 baseline only."

## 9. Consequences

**Positive:**
- Native OCCT performance (~14x vs WASM single-build on synthetic benchmark).
- Proven, mature kernel (materializr baseline).
- C++17 acceptable; existing transport contract already fits.

**Negative:**
- Parity burden of maintaining WASM + native kernels (WC-EC-12 parity harness).
- C++/ops burden for building and shipping the kernel worker.
- WASM older-OCCT drift (WASM build uses an older OCCT; native uses 7.9.3).
- Process-per-session density limits (memory per kernel process, concurrent session cap — measure in WC-EC-33).

## 10. "Too heavy" gRPC build thresholds (proposed defaults)

| Threshold | Value |
|---|---|
| CI build time | > 15 min |
| Docker image size | > 2 GB |
| Kernel binary size | > 100 MB |
| C++ gRPC dependency availability | Unavailable in target distro |

If any threshold is exceeded, fall back to length-prefixed protobuf over UDS. These are proposed defaults — human decision required.

## 11. LGPL review

- OCCT is LGPL-2.1 + Open CASCADE exception (see `LICENSE_LGPL_21.txt` + `OCCT_LGPL_EXCEPTION.txt`).
- Kernel runs server-side (hosted); users never receive the OCCT binary → minimal LGPL obligation (no source code offer required for hosted use).
- Dynamic linking (shared library) is the default in CMakeLists.txt to minimize obligations.
- **Delivery model:** Hosted (server-side kernel) — decision confirmed.
- Flag for legal review before shipping to confirm hosted posture minimizes obligations.

## 12. Open risks

| Risk | Mitigation / status |
|---|---|
| Document.test.ts B-rep restore failure | **Resolved.** Root cause: `doc.undo()`/`doc.redo()` are async but not awaited in the redo test, so `redoStack` is empty when `redo()` runs (race condition). Fixed by adding `await` to both calls in `tests/.../Document.test.ts`. All 477 unit tests now pass. Recorded as ADR risk (mitigated). |
| C++ gRPC build exceeds "too heavy" thresholds | Fall back to length-prefixed protobuf over UDS (framing cost for streaming RPCs noted) |
| SolidCraft maturity unknown | Not applicable — SolidCraft is for inspiration only; OCCT 7.9.3 is the sole kernel |
| OCCT 8.0.x regressions (thread-generation hang, pythonocc-core port failure) | 8.0.x gated behind parity/regression gate |
| Process-per-session density limits | Measure in WC-EC-33; size pool accordingly |

## 13. Open questions (human decisions)

| # | Question | Proposed default | Status |
|---|---|---|---|
| 1 | Is the C++ gRPC build "too heavy"? | Try full gRPC first; fall back to length-prefixed protobuf over UDS only if thresholds exceeded (CI >15 min, image >2 GB, binary >100 MB, gRPC unavailable in distro) | Open — thresholds defined in Section 10; pending measurement when OCCT 7.9.3 kernel is built (Chunk 6 blocker) |
| 2 | SolidCraft waiver approver | N/A — SolidCraft is for inspiration only, not a replacement kernel | Resolved |
| 3 | LGPL delivery model: hosted or distributed? | Hosted (server-side kernel) — legal review needed before shipping | Resolved — hosted |
| 4 | Document.test.ts B-rep restore failure time-box? | 1 day | Resolved — investigated, root cause found (un-awaited async undo/redo in redo test), test fixed with `await`, all 477 tests pass |

## 14. Files

- **Design spec (this file):** docs/superpowers/specs/2026-11-20-kernel-strategy-adr-design.md
- **ADR record:** docs/adr/NNNN-kernel-strategy.md (NNNN assigned at commit)
- **Epic:** docs/epics/WEBCAD-EPIC-EC-v5.md (WC-EC-05 row)
- **Related tickets:** WC-EC-08 (OCCT build image), WC-EC-09 (protocol spec), WC-EC-10 (kernel worker skeleton), WC-EC-11 (gateway supervisor), WC-EC-12 (parity harness), WC-EC-13 (oracle suite), WC-EC-33 (density measurement)
