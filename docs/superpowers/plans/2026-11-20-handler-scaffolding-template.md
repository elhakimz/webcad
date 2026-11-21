# Handler Scaffolding Template — Kernel Build Speed Phase B, Item 5.5

**Spec:** docs/superpowers/specs/2026-11-20-kernel-build-speed-design.md, section 5.5 "Handler scaffolding"  
**Date:** 2026-11-20  
**Status:** Draft — template only; no proto, ADR, or operation-semantics changes  
**Ticket:** WC-EC-?? (assign before first port PR)

## 1. Purpose

Every new kernel handler must follow one exact pattern so that each handler contains only OCCT logic:

- The proto oneof `ExecuteRequest.op` (fields 3–37) already defines all 35 ops; implementing a handler means wiring up an op that already exists in `proto/webcad/engine/v1/engine.proto` — **no proto change is required**.
- Payload decoding (proto accessors) and gRPC plumbing live in `KernelServiceImpl::HandleXxx`.
- Pure OCCT logic lives in a free function `OpXxx` returning `OpResult`.
- Business failures are reported in-band via `ExecuteFailure` + `ExecutionFailureCode` with `grpc::Status::OK`; only transport-level errors use gRPC status codes.
- A JSON-over-stdio CLI branch (`kernel-worker --cli`) mirrors each op so it can be developed and parity-tested without the gateway/gRPC stack.

This document is the scaffolding template. Copy it per handler, fill in the `/// TODO:` markers, and check every checkbox below before the PR is reviewable.

## 2. Existing handlers (reference examples)

All four live in `src/core/gateway/kernel-worker.cpp`:

| Op (proto field) | `op_case` switch label | `Handle*` method | `Op*` function | CLI op name | Status |
|---|---|---|---|---|---|
| `export_brep = 7` | `ExecuteRequest::kExportBrep` | `HandleExportBRep` | `OpExportBRep` | `export_brep` | ✅ implemented |
| `import_brep = 8` | `ExecuteRequest::kImportBrep` | `HandleImportBRep` | `OpImportBRep` | `import_brep` | ✅ implemented |
| `create_box = 10` | `ExecuteRequest::kCreateBox` | `HandleCreateBox` | `OpCreateBox` | `create_box` | ✅ implemented |
| `step_export = 37` | `ExecuteRequest::kStepExport` | `HandleStepExport` | `OpStepExport` | `step_export` | ✅ implemented |

Study `kernel-worker.cpp` before writing a new handler; each section below quotes the exact pattern from those four.

## 3. Handler template (concrete C++)

Copy this block into `src/core/gateway/kernel-worker.cpp` for each new op. `create_cylinder` (proto field 11) is used as the running example; replace `CreateCylinder` / `create_cylinder` / `kCreateCylinder` / `11` with the target op everywhere.

### 3.1 OCCT operation function — OCCT logic only

```cpp
// ---------------------------------------------------------------------------
// OpCreateCylinder — pure OCCT logic, no proto/gRPC knowledge.
// ---------------------------------------------------------------------------
static OpResult OpCreateCylinder(double x, double y, double z, double r, double h,
                                 double deflection,
                                 const std::string& entityId) {
  OpResult r;
  // ---- inputs validated ---------------------------------------------------
  if (r <= 0.0) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    r.message = "cylinder radius must be > 0";
    return r;
  }
  if (h <= 0.0) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    r.message = "cylinder height must be > 0";
    return r;
  }
  // ---- OCCT logic only ----------------------------------------------------
  gp_Pnt location(x, y, z);
  gp_Dir axis(0, 0, 1);
  BRepPrimAPI_MakeCylinder cyl(location, axis, r, h);
  if (!cyl.IsDone()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    r.message = "BRepPrimAPI_MakeCylinder failed";
    return r;
  }
  TopoDS_Shape shape = cyl.Shape();
  if (shape.IsNull()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_GEOMETRY_EMPTY);
    r.message = "Resulting cylinder shape is null";
    return r;
  }
  BRepMesh_IncrementalMesh mesh(shape, deflection);
  if (!mesh.IsDone()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    r.message = "BRepMesh_IncrementalMesh failed";
    return r;
  }
  // ---- entityId lifecycle: cache store -----------------------------------
  std::string shapeId =
      entityId.empty() ? "shape_" + std::to_string(g_shapeCache.size()) : entityId;
  g_shapeCache[shapeId] = shape;
  r.ok = true;
  r.shapeId = shapeId;
  return r;
}
```

Rules for `OpXxx`:

- `static`, returns `OpResult` by value.
- **OCCT logic only**: no `request->`, no `response->`, no `SetFailure`, no gRPC types.
- Validate every input before touching OCCT; map invalid input to the most specific `ExecutionFailureCode` (see §5).
- On store, use `entityId` when non-empty, otherwise mint `shape_<N>` from cache size; write `g_shapeCache[shapeId] = shape`.
- Never release a shape here — release happens only via `release_shapes` (see §4 step 8).

### 3.2 gRPC handler — payload decoding + in-band error mapping

```cpp
  Status HandleCreateCylinder(const ExecuteRequest* request,
                              ExecuteResponse* response) {
    const auto& op = request->create_cylinder();
    double x = op.x(), y = op.y(), z = op.z();
    double r = op.r(), h = op.h();
    double deflection = op.deflection();

    auto r = OpCreateCylinder(x, y, z, r, h, deflection, op.entity_id());
    if (!r.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(r.shapeId);
    auto* cylResult = success->mutable_cylinder();
    cylResult->set_shape_id(r.shapeId);

    return Status::OK;  // gRPC OK; business failures carried in-band
  }
```

Rules for `HandleXxx`:

- Decode scalars from `op.<field>()`; decode oneof sources with `op.<source>_case()` (see `HandleImportBRep` for `brep_source_case()`).
- Forward `op.entity_id()` unchanged to `OpXxx`.
- On `!r.ok`, `return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);` — never a gRPC error status for business failures.
- On success, fill `ExecuteSuccess` + the op-specific result message (`success->mutable_cylinder()`), then `return Status::OK;`.
- Do not add mesh/brep population unless the op's spec requires it (see existing TODO in `HandleCreateBox`).

### 3.3 oneof dispatch — add the switch case

In `KernelServiceImpl::Execute`, add one case before `default`:

```cpp
    switch (request->op_case()) {
      case ExecuteRequest::kCreateBox:
        return HandleCreateBox(request, response);
      case ExecuteRequest::kImportBrep:
        return HandleImportBRep(request, response);
      case ExecuteRequest::kExportBrep:
        return HandleExportBRep(request, response);
      case ExecuteRequest::kStepExport:
        return HandleStepExport(request, response);
      case ExecuteRequest::kCreateCylinder:   // <-- NEW
        return HandleCreateCylinder(request, response);
      default:
        return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER,
                          "Unknown or missing operation");
    }
```

The surrounding `try / catch (Standard_Failure) / catch (std::exception) / catch (...)` already maps unexpected exceptions to `EXECUTION_FAILURE_CODE_UNSPECIFIED` — do not duplicate it inside `HandleXxx`.

### 3.4 CLI mode — JSON-over-stdio mirror

Add one `else if (op == "create_cylinder")` branch in `RunCliMode()` (see the four existing branches for exact JSON shape: `{"ok": true, "shape_id": ...}` / `{"ok": false, "code": N, "message": ...}`).

## 4. Step-by-step: adding a new handler (createCylinder example)

1. **Confirm the op exists in the proto.** Open `proto/webcad/engine/v1/engine.proto`, verify `create_cylinder = 11` with message `CreateCylinderOp` is in the `op` oneof, and note the result field `cylinder = 3` in `ExecuteSuccess.op_result`. All 35 ops are already defined — if the op is missing, stop: that requires a proto change + ADR, not this template.
2. **Add OCCT includes** at the top of `kernel-worker.cpp` (alphabetical, `opencascade/...` paths, matching the existing block).
3. **Add `OpCreateCylinder`** after `OpStepExport` (pure OCCT logic, §3.1).
4. **Add `HandleCreateCylinder`** as a private method of `KernelServiceImpl` after `HandleStepExport` (§3.2).
5. **Add the switch case** in `Execute` before `default` (§3.3).
6. **Add the CLI branch** in `RunCliMode` (§3.4).
7. **Add the using-declaration** if a new proto message type is referenced (match the existing `using webcad::engine::v1::...` block).
8. **Run the per-handler checklist** (§5) — all boxes must be ticked.
9. **Build + unit test + lint + typecheck** (`npm run verify` covers TS/lint/tests/buf; rebuild the kernel CMake target for the C++ change).
10. **Open the PR** — keep each port PR under ~15 files / ~600 lines (spec §5.6 port workflow).

## 5. Per-handler checklist

Tick every box before review. Copy into the PR description.

- [ ] Inputs validated: every numeric field range-checked (positive lengths/radii, valid indices, non-empty strings where required) before any OCCT call; invalid input → specific `ExecutionFailureCode`, never an OCCT exception.
- [ ] entityId lifecycle (cache store/release): store uses `entityId.empty() ? "shape_<N>" : entityId` and `g_shapeCache[shapeId] = shape`; lookup uses `g_shapeCache.find(entityId)` → `EXECUTION_FAILURE_CODE_MISSING_ENTITY` when absent; no dangling references after `std::remove` of temp files; `release_shapes` handler covers cache release (already implemented separately).
- [ ] In-band failure codes (ExecutionFailureCode): every `!r.ok` path returns `SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message)` with `Status::OK`; uncaught exceptions fall through the `Execute` try/catch to `EXECUTION_FAILURE_CODE_UNSPECIFIED`.
- [ ] Unit tests: C++ unit test for `OpXxx` covering happy path, invalid input, missing entity, and OCCT failure; CLI-mode test via `kernel-worker --cli` JSON stdin/stdout for the op.
- [ ] Parity script: a JSON command script (one line per op) runnable through `kernel-worker --cli` that the parity harness and oracle suite can diff against the WASM/reference-kernel output.

## 6. Error handling rules (from kernel-worker.cpp)

```cpp
  Status SetFailure(ExecuteResponse* response, ExecutionFailureCode code,
                    const std::string& message) {
    auto* failure = response->mutable_failure();
    failure->set_operation("Execute");
    failure->set_code(static_cast<uint32_t>(code));
    failure->set_message(message);
    return Status::OK;  // gRPC OK; failure carried in-band
  }
```

- gRPC `Status::OK` on every application-level response; business failures live in `ExecuteResponse.failure`.
- `Execute` switch is wrapped in `try { ... } catch (const Standard_Failure&) ... catch (const std::exception&) ... catch (...)` mapping to `EXECUTION_FAILURE_CODE_UNSPECIFIED`.
- `default:` case returns `EXECUTION_FAILURE_CODE_INVALID_PARAMETER` ("Unknown or missing operation").
- Temp files: `mkstemp` + `std::remove` in all paths (including catch blocks); validate size/terminator before OCCT reads (see `OpImportBRep`: 64 MiB cap, trailing `0x1a` check).

## 7. Code conventions

- C++17 only (spec constraint: no language switch, stays C++17).
- Match `kernel-worker.cpp` style: 2-space indent, `OpResult` out-param pattern, `static` free functions for OCCT logic, `HandleXxx` private methods on `KernelServiceImpl`.
- Named exports / no `any` / strict TS conventions apply to any TypeScript side of a handler (e.g. `OpenCascadeService.ts` wrapper) — the kernel itself is C++ and has no TS.
- Proto is the source of truth; do not hand-edit `src/generated/`. Field numbers and oneof names come from `engine.proto`.
- Keep each port PR under ~15 files / ~600 lines (spec §5.6).

## 8. Open questions (human decisions)

None for this template — §5.5 is scaffolding only. Protocol additions (new ops), package manager (vcpkg vs conda-forge), and CLI transport (JSON-over-stdio vs length-prefixed protobuf) are tracked in the spec's open-questions table and are out of scope here.
