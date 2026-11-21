# Port Workflow — Kernel Build Speed Phase B, Item 5.6

**Spec:** docs/superpowers/specs/2026-11-20-kernel-build-speed-design.md, section 5.6 "Port workflow"  
**Date:** 2026-11-20  
**Status:** Draft — workflow document only; no proto, ADR, or operation-semantics changes  
**Ticket:** WC-EC-?? (assign before first port PR)

## 1. Purpose

Describe the end-to-end workflow for porting one OCCT operation from prototype to merged C++ kernel handler:

1. Explore the OCCT API in Python (OCP) — fast iteration, no C++ rebuild.
2. Port the proven call sequence into `kernel-worker.cpp` as `OpXxx` + `HandleXxx`.
3. Verify against the parity harness on the real C++ kernel — **Python results never decide correctness.**

Each port PR must stay under ~15 files / ~600 lines (spec §5.6, spec §6 guardrails, spec §5.5 handler scaffolding template).

## 2. Golden rule: the oracle is always the parity harness on the real C++ kernel

- Python (OCP) is a **scratchpad only**. Use it to discover the OCCT call sequence, argument order, and failure modes. Python output is never compared against the C++ kernel as a source of truth, and a Python/C++ mismatch is investigated, not silently resolved in favor of Python.
- The oracle is the parity harness (`docs/superpowers/plans/2026-11-19-parity-harness.md`) replaying the same JSON operation script against the native C++ kernel (`kernel-worker`) and the reference/WASM kernel, comparing volume, surface area, bounding box, face/edge/vertex counts, and validity per step.
- A port is "done" only when the parity script passes against `kernel-worker --cli` (C++) and the C++ unit tests pass. Python matching C++ is a nice-to-have signal, never a gate.

## 3. PR size constraint

- Keep each port PR under about **15 files / 600 lines** total (spec §5.6, §6).
- One op per PR. Do not bundle helper refactors, proto changes, or unrelated handler work into a port PR.
- If a port would exceed the budget, split it: e.g. PR A = `OpXxx` + switch case + CLI branch; PR B = unit tests + parity script. The op must still be end-to-end verifiable before merge (tests + parity script required in the same PR or the immediately preceding one).

## 4. Port workflow steps (in order)

```
proto op exists → Python OCP prototype → C++ OpXxx → HandleXxx → switch case
→ CLI branch → unit tests → parity script → PR
```

| Step | Action | File(s) | Exit criterion |
|------|--------|---------|----------------|
| 1 | Confirm the op already exists in `proto/webcad/engine/v1/engine.proto` (oneof `ExecuteRequest.op`, field 3–37). All 35 ops are pre-defined; a missing op needs a proto change + ADR, not this workflow. | engine.proto | Op field number and `op_case` label (`kCreateCylinder`, …) noted. |
| 2 | Prototype the OCCT call sequence in Python with OCP (OCCT Python bindings). Validate inputs, build the shape, mesh it, cache/release semantics, export B-rep for inspection. | `scripts/port-prototypes/*.py` (scratch) | Python script produces a valid shape and matching metrics (volume/bbox/counts). |
| 3 | Write the pure-OCCT C++ function `OpXxx` returning `OpResult` in `kernel-worker.cpp`. OCCT logic only — no proto/gRPC types. | kernel-worker.cpp | Compiles; happy path + invalid input + OCCT failure return correct `ExecutionFailureCode`. |
| 4 | Write the gRPC handler `HandleXxx` on `KernelServiceImpl`: decode `request->op fields`, call `OpXxx`, map `!r.ok` via `SetFailure` (in-band, `Status::OK`), fill `ExecuteSuccess` + op-specific result message. | kernel-worker.cpp | Handler decodes payload and wires result into the response. |
| 5 | Add `case ExecuteRequest::kXxx: return HandleXxx(request, response);` before `default:` in `KernelServiceImpl::Execute`. | kernel-worker.cpp | `op_case()` dispatch reaches the new handler; `default:` still returns `EXECUTION_FAILURE_CODE_INVALID_PARAMETER`. |
| 6 | Add one `else if (op == "xxx")` branch in `RunCliMode()` (JSON-over-stdio), mirroring the op so it can be exercised without the gateway/gRPC stack. | kernel-worker.cpp | `echo '{...}' | kernel-worker --cli` returns `{"ok": true, "shape_id": ...}` or `{"ok": false, ...}`. |
| 7 | Add C++ unit tests for `OpXxx` (happy path, invalid input, missing entity, OCCT failure) and a CLI-mode test via JSON stdin/stdout. Follow `tests/unit/kernel/*` conventions (vitest, named exports, no `any`, TS strict mode where TS is involved). | tests/unit/kernel/*.test.ts / new C++ test file | `npm test` passes for the new suite; kernel C++ build + tests pass. |
| 8 | Add a parity script: one JSON line per op in a `.parity.json` script file, runnable through `kernel-worker --cli`, that the parity harness diffs against the reference kernel output. | tests/parity/scripts/*.parity.json | Harness report shows metrics within tolerance for both kernels. |
| 9 | Open the PR — one op, ~15 files / ~600 lines max, checklist from §8 ticked, parity report attached. | — | PR reviewable; merge only after parity + CI green. |

## 5. Step-by-step Python OCP prototype workflow

This is the exploration phase. Every OCCT call made here is later reimplemented identically in `OpXxx`; Python is throwaway scratchpad code.

### 5.1 Setup

```bash
# OCP (occt-python) in an isolated env; OCCT 7.9.3 to match the C++ kernel.
pip install ocp  # or conda-forge occt-python; version must match kernel OCCT 7.9.3
python --version  # 3.x
```

Verify the binding matches the kernel: `python -c "import OCP; print(OCP.VERSION)"` should report 7.9.3-equivalent. Mismatched OCCT versions produce different geometry — record the version in the port PR.

### 5.2 Prototype skeleton (create_cylinder example)

```python
from OCP.gp import gp_Pnt, gp_Dir
from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.TopoDS import TopoDS_Shape
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.BinTools import BinTools
import tempfile, os

def make_cylinder(x, y, z, r, h, deflection):
    # --- inputs validated before touching OCCT ---
    if r <= 0: raise ValueError("cylinder radius must be > 0")
    if h <= 0: raise ValueError("cylinder height must be > 0")

    # --- OCCT call sequence (this is what gets ported to C++) ---
    location = gp_Pnt(x, y, z)
    axis = gp_Dir(0, 0, 1)
    cyl = BRepPrimAPI_MakeCylinder(location, axis, r, h)
    if not cyl.IsDone():
        raise RuntimeError("BRepPrimAPI_MakeCylinder failed")
    shape = cyl.Shape()
    if shape.IsNull():
        raise RuntimeError("Resulting cylinder shape is null")
    mesh = BRepMesh_IncrementalMesh(shape, deflection)
    if not mesh.IsDone():
        raise RuntimeError("BRepMesh_IncrementalMesh failed")

    # --- metrics for the parity comparison (volume, bbox, counts) ---
    props = GProp_GProps()
    BRepGProp.VolumeProperties(shape, props)
    volume = props.Mass()

    # --- B-rep export for visual inspection ---
    fd, tmp = tempfile.mkstemp(suffix=".brep"); os.close(fd)
    BinTools.Write(shape, tmp)
    with open(tmp, "rb") as f: brep = f.read()
    os.remove(tmp)

    return {"volume": volume, "shape": shape, "brep": brep}

result = make_cylinder(0, 0, 0, 5, 10, 0.1)
print(f"volume={result['volume']} brep_bytes={len(result['brep'])}")
```

### 5.3 What to capture from the Python run

- The exact OCCT classes and call order (e.g. `gp_Pnt` → `gp_Dir` → `BRepPrimAPI_MakeCylinder` → `Shape()` → `BRepMesh_IncrementalMesh`).
- Input validation boundaries (r <= 0, h <= 0) and their error messages.
- Expected metrics: volume, surface area, bounding box, face/edge/vertex counts, validity (`shape.IsNull()`, `IsDone()`).
- B-rep bytes (for round-trip inspection in the C++ kernel via `import_brep`/`export_brep`).

### 5.4 What NOT to do in the Python phase

- Do not assert Python == C++ as a pass criterion. Python is a hint; the C++ kernel under the parity harness decides.
- Do not add Python code to the repo beyond a throwaway scratch file (kept out of the port PR).
- Do not prototype protocol or session semantics — the op already exists in the proto (step 1).

## 6. Example: porting `create_cylinder` end to end

Proto (already defined, `engine.proto` field 11):

```proto
message CreateCylinderOp {
  double x = 1; double y = 2; double z = 3;
  double r = 4; double h = 5;
  double deflection = 6;
  string entity_id = 7;
}
message CylinderResult { string shape_id = 1; }
// ExecuteSuccess.op_result: cylinder = 3
// ExecuteRequest.op oneof: create_cylinder = 11 → op_case label kCreateCylinder
```

### 6.1 Python OCP prototype (scratch)

See §5.2 `make_cylinder`. Captured: `gp_Pnt(x,y,z)`, `gp_Dir(0,0,1)`, `BRepPrimAPI_MakeCylinder(loc, axis, r, h)`, `IsDone()`, `Shape()`, `BRepMesh_IncrementalMesh(shape, deflection)`, volume metric, B-rep bytes.

### 6.2 C++ `OpCreateCylinder` (kernel-worker.cpp)

Add after `OpStepExport` (alphabetical OCCT include block at top: `opencascade/BRepPrimAPI_MakeCylinder.hxx`, `opencascade/gp_Pnt.hxx`, `opencascade/gp_Dir.hxx`):

```cpp
static OpResult OpCreateCylinder(double x, double y, double z, double r, double h,
                                 double deflection,
                                 const std::string& entityId) {
  OpResult result;
  if (r <= 0.0) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    result.message = "cylinder radius must be > 0";
    return result;
  }
  if (h <= 0.0) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
    result.message = "cylinder height must be > 0";
    return result;
  }
  gp_Pnt location(x, y, z);
  gp_Dir axis(0, 0, 1);
  BRepPrimAPI_MakeCylinder cyl(location, axis, r, h);
  if (!cyl.IsDone()) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    result.message = "BRepPrimAPI_MakeCylinder failed";
    return result;
  }
  TopoDS_Shape shape = cyl.Shape();
  if (shape.IsNull()) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_GEOMETRY_EMPTY);
    result.message = "Resulting cylinder shape is null";
    return result;
  }
  BRepMesh_IncrementalMesh mesh(shape, deflection);
  if (!mesh.IsDone()) {
    result.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    result.message = "BRepMesh_IncrementalMesh failed";
    return result;
  }
  std::string shapeId =
      entityId.empty() ? "shape_" + std::to_string(g_shapeCache.size()) : entityId;
  g_shapeCache[shapeId] = shape;
  result.ok = true;
  result.shapeId = shapeId;
  return result;
}
```

### 6.3 gRPC handler `HandleCreateCylinder` (kernel-worker.cpp)

```cpp
  Status HandleCreateCylinder(const ExecuteRequest* request,
                              ExecuteResponse* response) {
    const auto& op = request->create_cylinder();
    double x = op.x(), y = op.y(), z = op.z();
    double r = op.r(), h = op.h();
    double deflection = op.deflection();

    auto result = OpCreateCylinder(x, y, z, r, h, deflection, op.entity_id());
    if (!result.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(result.code), result.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(result.shapeId);
    auto* cylResult = success->mutable_cylinder();
    cylResult->set_shape_id(result.shapeId);

    return Status::OK;
  }
```

Add `using webcad::engine::v1::CreateCylinderOp;` if needed (message type referenced), matching the existing `using` block.

### 6.4 Switch case (kernel-worker.cpp, `KernelServiceImpl::Execute`)

```cpp
    switch (request->op_case()) {
      case ExecuteRequest::kCreateBox:
        return HandleCreateBox(request, response);
      case ExecuteRequest::kCreateCylinder:   // <-- NEW
        return HandleCreateCylinder(request, response);
      case ExecuteRequest::kImportBrep:
        return HandleImportBRep(request, response);
      case ExecuteRequest::kExportBrep:
        return HandleExportBRep(request, response);
      case ExecuteRequest::kStepExport:
        return HandleStepExport(request, response);
      default:
        return SetFailure(response, ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER,
                          "Unknown or missing operation");
    }
```

The existing `try / catch (Standard_Failure) / catch (std::exception) / catch (...)` covers unexpected exceptions — do not duplicate inside `HandleXxx`.

### 6.5 CLI branch (`RunCliMode`, kernel-worker.cpp)

Add one `else if (op == "create_cylinder")` branch mirroring the existing branches (create_box, import_brep, export_brep, step_export). Request shape:

```json
{"op": "create_cylinder", "x": 0, "y": 0, "z": 0, "r": 5, "h": 10, "deflection": 0.1, "entity_id": "cyl_1"}
```

Response shape (match existing JSON envelope):

```json
{"ok": true, "shape_id": "cyl_1"}
```

or on failure:

```json
{"ok": false, "code": 2, "message": "cylinder radius must be > 0"}
```

Verify: `echo '{"op":"create_cylinder","x":0,"y":0,"z":0,"r":5,"h":10,"deflection":0.1,"entity_id":"cyl_1"}' | kernel-worker --cli`.

### 6.6 Unit tests

C++ test for `OpCreateCylinder` covering: happy path (valid cylinder, non-null shape, cached under `entity_id`), invalid input (r <= 0 → INVALID_PARAMETER, h <= 0 → INVALID_PARAMETER), missing entity lookup → MISSING_ENTITY (for lookup-based ops), OCCT failure path. CLI-mode test: spawn `kernel-worker --cli`, send JSON lines on stdin, assert `{"ok": true, ...}` / `{"ok": false, ...}` on stdout.

TypeScript side (if a matching `OpenCascadeService.ts` wrapper method is added in the same PR): strict mode, named exports, no `any`; see existing `tests/unit/kernel/brep-export.test.ts` style:

```ts
import { describe, it, expect } from 'vitest';

describe('createCylinder parity', () => {
  it('round-trips through the CLI with expected metrics', () => {
    // ...
  });
});
```

### 6.7 Parity script

Create `tests/parity/scripts/create_cylinder.parity.json` — one JSON command per line:

```json
{"op": "create_cylinder", "x": 0, "y": 0, "z": 0, "r": 5, "h": 10, "deflection": 0.1, "entity_id": "cyl_1"}
{"op": "export_brep", "entity_id": "cyl_1"}
```

Run the harness against the C++ kernel:

```bash
# Build the kernel (CMake), then:
kernel-worker --cli < tests/parity/scripts/create_cylinder.parity.json > cpp.out.json
# Harness compares cpp.out.json metrics vs reference/WASM kernel metrics:
npx vitest run tests/harness/parity-harness.integration.test.ts \
  --kernel=unix:/tmp/webcad-kernel.sock --script=tests/parity/scripts/create_cylinder.parity.json
```

Python results are used only to predict expected metrics; the harness report on the real C++ kernel is the pass/fail signal.

## 7. Running the parity harness against Python and C++ results

The harness (`docs/superpowers/plans/2026-11-19-parity-harness.md`) replays a JSON operation script against two kernels and emits a JSON diff report: volume, surface area, bounding box, face/edge/vertex counts, validity per step, with tolerances.

### 7.1 Against the C++ kernel (the oracle)

```bash
# 1. Build the kernel.
cmake -S . -B build && cmake --build build -j4   # kernel_worker binary

# 2. Start in CLI mode (JSON-over-stdio, no gateway/gRPC).
./build/kernel-worker --cli &   # listens on stdio; or unix socket per kernel-worker main()

# 3. Run the parity script.
./build/kernel-worker --cli < tests/parity/scripts/create_cylinder.parity.json > /tmp/cpp-results.json

# 4. Harness diffs C++ vs reference kernel output.
npx vitest run tests/harness/parity-harness.integration.test.ts \
  --script=tests/parity/scripts/create_cylinder.parity.json \
  --kernel=unix:/tmp/webcad-kernel.sock
```

Pass criterion: every metric within tolerance vs the oracle kernel; `ok: true` for every op in the script; B-rep round-trip (create → export → import) byte-compatible where applicable.

### 7.2 Against Python results (exploration only)

Run the same script logic in Python (OCP), capture the same metrics, and compare informally:

```bash
python scripts/port-prototypes/create_cylinder.py > /tmp/python-results.json
diff /tmp/python-results.json /tmp/cpp-results.json   # informational only
```

A Python/C++ mismatch is expected to happen (tessellation, float formatting, cache IDs). Investigate the cause; if the C++ kernel is wrong per OCCT semantics, fix the C++ port. **Never change C++ to match Python when Python deviates from OCCT docs.**

### 7.3 Parity report artifacts

Attach the harness JSON report to the port PR. The report is the evidence the oracle was checked; PRs without a parity report for the new op are not reviewable.

## 8. Referenced files

- `proto/webcad/engine/v1/engine.proto` — source of truth for all 35 ops; `create_cylinder = 11`, `CreateCylinderOp`, `cylinder = 3` result field. No proto change needed for a port.
- `src/core/gateway/kernel-worker.cpp` — `OpResult`, `OpXxx` free functions, `KernelServiceImpl::HandleXxx`, `Execute` switch, `RunCliMode()` JSON-over-stdio, `g_shapeCache`, `SetFailure`. All port work lives here.
- `tests/unit/kernel/` — existing kernel unit tests (brep-export, brep-import, step-export); new op tests follow this style.
- `docs/superpowers/plans/2026-11-19-parity-harness.md` — parity harness design; the oracle for port verification.
- `docs/superpowers/plans/2026-11-20-handler-scaffolding-template.md` — per-op C++ scaffolding template (spec §5.5) used by steps 3–6.

## 9. Code conventions

- C++17 only (spec constraint); match `kernel-worker.cpp` style: 2-space indent, `static` free `OpXxx` functions returning `OpResult`, `HandleXxx` private methods on `KernelServiceImpl`, in-band `ExecuteFailure` + `Status::OK`.
- TypeScript (tests/wrappers): strict mode, named exports, no `any`; explicit types, `unknown` + type guards preferred.
- Proto is the source of truth; never hand-edit `src/generated/`.
- One op per PR; ~15 files / ~600 lines max.

## 10. Per-op PR checklist (copy into PR description)

- [ ] Op confirmed in `engine.proto` oneof; field number and `kXxx` label noted; no proto change needed.
- [ ] Python OCP prototype captured the OCCT call sequence and expected metrics (scratch, not in PR).
- [ ] `OpXxx` added: input validation, OCCT call sequence, `IsDone()`/`IsNull()` checks, cache store, `OpResult` returned.
- [ ] `HandleXxx` added: payload decode, `SetFailure` on `!ok`, `ExecuteSuccess` + op result message, `Status::OK`.
- [ ] Switch case added before `default:` in `Execute`.
- [ ] CLI branch added in `RunCliMode`; verified with `echo '{...}' | kernel-worker --cli`.
- [ ] Unit tests pass: happy path, invalid input, missing entity, OCCT failure; CLI stdin/stdout test.
- [ ] Parity script added; harness report attached showing metrics within tolerance on the C++ kernel.
- [ ] PR under ~15 files / ~600 lines; `npm run verify` green; kernel C++ build + tests green.
- [ ] Python results used for exploration only; parity harness on the real C++ kernel is the oracle.
