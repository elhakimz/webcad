# WC-EC Phase 1 Cross-Ticket Integration Test — Design

**Status:** Proposed (awaiting user review)  
**Date:** 2026-11-21  
**Tickets:** WC-EC-08 → WC-EC-11  
**Target test file:** `tests/harness/kernel-docker-phase1.integration.test.ts`

---

## 1. Problem / Gap

After completing WC-EC-08 (OCCT image), WC-EC-09 (codec/protocol golden tests), WC-EC-10 (kernel worker skeleton), and WC-EC-11 (gateway supervisor):

- `tests/gateway/supervisor.test.ts` exercises the KernelSupervisor but **mocks the kernel client** — no real OCCT kernel is involved.
- `tests/harness/docker-kernel-grpc.integration.test.ts` connects directly to a real Docker OCCT kernel but **bypasses the supervisor/gateway** and tests only a subset of operations.

**Gap:** No test connects a real OCCT kernel through the full Phase 1 protocol chain (header → op → response) end-to-end.

## 2. Constraints (why this design, not supervisor→live-kernel)

The `KernelSupervisor` **spawns** kernel processes (`spawn(this.config.binary, ...)`) connecting via unix socket (`uds`) or stdio — it does **not** connect to an already-running TCP endpoint. There is **no local `build/kernel_worker` binary** on the host; OCCT runs exclusively in Docker (`sha256:ab148457818b047e2c11a84616166975c3a5cbfe36f04c64e4e05f381e676aca`, container `ef253d77` / `webcad-kernel-test`, listening on `localhost:50051`).

Therefore a live supervisor→Docker-kernel integration would require modifying the supervisor to connect to a TCP gRPC endpoint — a protocol change that requires an ADR (forbidden without one) and is out of scope for Phase 1.

**Decision:** The integration test connects **directly** to the Docker OCCT kernel over gRPC (same pattern as the existing `docker-kernel-grpc.integration.test.ts`), exercising the protocol operations that WC-EC-09/10 define. WC-EC-11 supervisor behavior (crash recovery, ordering, pooling) remains covered by `supervisor.test.ts` (mocked kernel client, all 6 passing). This is the maximum achievable integration without an ADR.

## 3. Architecture / Components

| Component | Responsibility |
|-----------|---------------|
| Test file (`tests/harness/kernel-docker-phase1.integration.test.ts`) | gRPC client to `localhost:50051`; 6 tests; beforeAll/afterAll client lifecycle |
| `KernelService` (engine.proto) | Kernel RPC surface (Execute, Health, etc.) |
| Docker container `ef253d77` / image `sha256:ab1484...` | Real OCCT kernel under test |
| `proto/webcad/engine/v1/engine.proto` + `common.proto` | Message definitions (CommandHeader, ExecuteRequest/Response, CreateBoxOp, StepExportOp, ExecuteFailure, ExecutionFailureCode, etc.) |

## 4. Data Flow

```
beforeAll: docker start ef253d77   →   gRPC client (localhost:50051)
Test 1 health                      →   KernelService.Health   →   status SERVING
Test 2 hello / Execute round-trip   →   KernelService.Execute(InitOp)  →   ExecuteSuccess (result === 'success')
Test 3 create_box                  →   KernelService.Execute(CreateBoxOp)  →   ExecuteSuccess.shape_id
Test 4 step_export                 →   KernelService.Execute(StepExportOp)  →   ExecuteSuccess.brep_ref (STEP-214 bytes, FILE_NAME / END-ISO-10303-21)
Test 5 step_export missing entity  →   KernelService.Execute(StepExportOp)  →   ExecuteFailure code=EXECUTION_FAILURE_CODE_MISSING_ENTITY (1)
Test 6 second create_box           →   KernelService.Execute(CreateBoxOp)  →   ExecuteSuccess.shape_id (box_2)
afterAll: container left running   (caller owns container lifecycle)
```

Each request carries a `CommandHeader` (session_id, request_id, client_seq, document_id) matching the supervisor's sequencing contract.

## 5. Tests

| # | Test | Asserts | Ticket |
|---|------|---------|--------|
| 1 | `health check returns SERVING` | `response.status === 'SERVING_STATUS_SERVING'` | WC-EC-08/10 |
| 2 | `hello / Execute round-trip` | `Execute(InitOp)` returns `ExecuteSuccess` (result === 'success') | WC-EC-09/10 |
| 3 | `create_box returns a shape_id` | `result === 'success'`, `success.shape_id === 'box_1'` | WC-EC-09/10 |
| 4 | `step_export returns valid STEP-214 data` | `result === 'success'`, `brep_ref.format === 'FORMAT_STEP'`, data contains `FILE_NAME` and `END-ISO-10303-21;` | WC-EC-09/10 |
| 5 | `step_export on missing entity returns failure` | `result === 'failure'`, `failure.code === 1` (MISSING_ENTITY), `failure.message` contains 'Shape not found in cache' | WC-EC-09/10 |
| 6 | `second create_box returns second shape_id` | `result === 'success'`, `success.shape_id === 'box_2'` | WC-EC-09/10 |

Tests 3–6 share a `shapeId` variable across the describe block (create_box first, then step_export on that id; test 6 creates a separate `box_2`).

## 6. Lifecycle Management

- `beforeAll`: establish gRPC client to `localhost:50051`. **The caller pre-starts the Docker container** (`docker start ef253d77` if exited) before running tests — the test does not manage the container lifecycle. If the container is not running, the health check fails with a connection error.
- `afterAll`: close the gRPC client. **Do not stop/remove the container** — the caller owns the container lifecycle; tests are read-only against the kernel.
- Address configurable via `KERNEL_ADDRESS` env var (default `localhost:50051`), matching the existing docker-kernel-grpc test.

## 7. Error Handling

- gRPC transport errors (kernel unreachable) → test fails with connection error (clear signal the Docker container isn't running).
- `ExecuteFailure` in-band errors are asserted explicitly (test 5) — these are kernel-side problems, not transport errors.
- No retry logic; each operation is single-attempt.

## 8. What Is Out of Scope

- Live supervisor→kernel connection (requires TCP endpoint support + ADR).
- Ordering/dedupe/crash-recovery under load (covered by `supervisor.test.ts`).
- Streaming ops (ExecuteWithProgress, PutBlob, StreamResult) — not needed for Phase 1 acceptance.
- Gateway/EngineGatewayService — kernel-facing service only.

## 9. Success Criteria

- All 6 tests pass against the real Docker OCCT kernel.
- `npm run lint` ✅, `npm test` ✅ (new test included, 559/559), `npm run buf:lint` ✅, `npm run buf:breaking` ✅.
- `npm run typecheck` has 3 pre-existing unrelated errors in `codec.test.ts` ×2 and `KernelGrpcTransport.ts` ×1 (pre-WC-EC-11, not caused by this change); no new typecheck errors introduced.
- Test is self-contained: no local kernel binary required; works wherever Docker + the image are available.

---

**Please review this spec.** If approved, I'll invoke the writing-plans skill to create the implementation plan, then write the test file.
