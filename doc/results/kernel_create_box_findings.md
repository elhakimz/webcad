# Part A Findings — Kernel `create_box` P0 Failure (OCCT 7.9.3 Docker Image)

**Status:** Findings only — no code changes implemented  
**Bug id:** `P0-WEBCAD-KERNEL-CREATE_BOX` (to be filed in Plane)  
**Linked integration test ticket:** TBC (user to confirm Plane ticket id)  
**Image:** `kernel:occt-7.9.3`  
**OCCT version policy:** 7.9.3 baseline, 8.0.x gated  

---

## 1. Symptom

`BRepPrimAPI_MakeBox(10,10,10)` → `Build()` → `IsDone() == false`, so `OpCreateBox` returns
`EXECUTION_FAILURE_CODE_OPERATION_FAILED` (code 5).

A prior explanation blamed locale/data files. This is unlikely: box construction is pure geometric kernel code
and needs no data files.

---

## 2. Standalone Reproduction (Verified inside `kernel:occt-7.9.3`)

A standalone C++ program compiled and run inside the same Docker image:

```cpp
#include <opencascade/BRepPrimAPI_MakeBox.hxx>
#include <opencascade/gp_Pnt.hxx>
#include <iostream>

int main() {
  BRepPrimAPI_MakeBox box(gp_Pnt(0, 0, 0), 10, 10, 10);
  std::cout << "IsDone before Build: " << box.IsDone() << "\n";
  box.Build();
  std::cout << "IsDone after Build:  " << box.IsDone() << "\n";
  auto s = box.Shape();
  std::cout << "Shape is null:       " << s.IsNull() << "\n";
  return box.IsDone() ? 0 : 1;
}
```

**Confirmed results:**

| Check | Expected (known-good) | Actual (7.9.3 image) |
|-------|----------------------|----------------------|
| `IsDone()` before `Build()` | `false` (0) | `false` (0) |
| `IsDone()` after `Build()` | `true` (1) | `true` (1) |
| `Shape().IsNull()` | `false` | `false` |
| Program exit code | `0` | `0` |

OCCT 7.9.3 itself works correctly inside the image. `MakeBox` → `Build()` → `IsDone()` returns `true`, and
`Shape()` is non-null. The failure is **not** an OCCT defect.

Also tested `Shape()` called *before* `Build()`: returns null shape (expected OCCT behavior — `Shape()` before
`Build()` is undefined; `Build()` must be called first).

---

## 3. Investigation Checks (in order)

### 3a. Header/library mismatch — RULED OUT

**What was checked inside the image:**

| Check | Result |
|-------|--------|
| Compile-time OCCT headers | `/usr/local/include/opencascade/`, `Standard_Version.hxx` reports `OCC_VERSION_MAJOR=7`, `OCC_VERSION_MINOR=9`, `OCC_VERSION_MAINTENANCE=3` → **7.9.3** |
| Runtime libs loaded (`ldd kernel-worker`) | `libTKernel.so.7.9` → `/usr/local/lib/libTKernel.so.7.9` (symlink → `libTKernel.so.7.9.3`), same for `TKMath`, `TKBRep`, `TKTopAlgo`, `TKPrim`, etc. |
| `readelf -d kernel-worker` | `RUNPATH: /usr/local/lib` — no `LD_LIBRARY_PATH` override |
| Symlink chain | `libTKernel.so` → `libTKernel.so.7.9` → `libTKernel.so.7.9.3` |
| Image build | Dockerfile `ARG OCCT_VERSION=V7_9_3`, clones `V7_9_3` branch, builds and installs to `/usr/local` |

**Conclusion:** Compile-time headers (7.9.3) match runtime libraries (7.9.3). No header/library layout mismatch.
`IsDone()` inline offset reads the correct member — `IsDone()` returning `false` after `Build()` in `kernel-worker`
cannot be explained by header/lib mismatch.

**Root cause status:** Unconfirmed. Since standalone MakeBox works and headers/libs match, the failure must come
from either (a) the `kernel-worker` binary inside the image being built from different/stale source than the
current `kernel-worker.cpp`, or (b) incorrect `dx`/`dy`/`dz` values arriving from the client via the proto.
Further investigation needed: rebuild `kernel-worker` from current source inside the image and re-test via gRPC.

### 3b. Exact `OpCreateBox` call sequence

Source: `src/core/gateway/kernel-worker.cpp`, lines 282–315:

```cpp
static OpResult OpCreateBox(double x, double y, double z, double dx, double dy,
                            double dz, double deflection,
                            const std::string& entityId) {
  OpResult r;
  BRepPrimAPI_MakeBox box(gp_Pnt(x, y, z), dx, dy, dz);
  box.Build();
  if (!box.IsDone()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    r.message = "BRepPrimAPI_MakeBox failed: IsDone=0 dx=" + std::to_string(dx) + " dy=" + std::to_string(dy) + " dz=" + std::to_string(dz);
    return r;
  }
  TopoDS_Shape shape = box.Shape();
  if (shape.IsNull()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_GEOMETRY_EMPTY);
    r.message = "Resulting shape is null";
    return r;
  }
  BRepMesh_IncrementalMesh mesh(shape, deflection);
  if (!mesh.IsDone()) {
    r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
    r.message = "BRepMesh_IncrementalMesh failed";
    return r;
  }
  r.shapeId = CacheShape(shape, entityId);
  r.ok = true;
  return r;
}
```

Handler (`HandleCreateBox`, lines 2933–2939):

```cpp
Status HandleCreateBox(const ExecuteRequest* request, ExecuteResponse* response) {
  const auto& op = request->create_box();
  double x = op.x(), y = op.y(), z = op.z();
  double dx = op.dx(), dy = op.dy(), dz = op.dz();

  auto r = OpCreateBox(x, y, z, dx, dy, dz, op.deflection(), op.entity_id());
  if (!r.ok) {
    return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
  }
  ...
}
```

**Findings:**
- Call sequence is correct: `MakeBox` → `Build()` → `IsDone()` → `Shape()`.
- No temporary-copy or double-`Build()` issue.
- `dx`, `dy`, `dz` arrive as `double` from proto `CreateBoxOp` (fields 4, 5, 6 are `double`) — no type truncation.
- `BRepMesh_IncrementalMesh` is called after `Shape()` — if this fails, it returns `OPERATION_FAILED` with a
  different message ("BRepMesh_IncrementalMesh failed"), not the reported "BRepPrimAPI_MakeBox failed".

### 3c. Swallowed exceptions

`Execute()` wraps the `switch` in:

```cpp
try {
  switch (request->op_case()) { ... }
} catch (const Standard_Failure& e) {
  return SetFailure(response, EXECUTION_FAILURE_CODE_UNSPECIFIED, e.GetMessageString());
} catch (const std::exception& e) {
  return SetFailure(response, EXECUTION_FAILURE_CODE_UNSPECIFIED, e.what());
} catch (...) {
  return SetFailure(response, EXECUTION_FAILURE_CODE_UNSPECIFIED, "Unknown exception");
}
```

- `BRepPrimAPI_MakeBox` does not throw on failure — it sets `IsDone() == false`. No exception is swallowed here.
- If `Build()` throws `Standard_Failure`, it is caught and reported as `UNSPECIFIED`, not `OPERATION_FAILED`.
  The reported symptom (`IsDone()==false` after `Build()`) indicates no throw occurred.

**Proposed fix:** Map unexpected exceptions to `INTERNAL`, not `UNSPECIFIED`:
- `catch (const Standard_Failure& e)` → `EXECUTION_FAILURE_CODE_UNSPECIFIED` (OCCT-specific, expected)
- `catch (const std::exception& e)` → **`EXECUTION_FAILURE_CODE_INTERNAL`** (unexpected C++ exception)
- `catch (...)` → **`EXECUTION_FAILURE_CODE_INTERNAL`** (truly unknown)

This requires adding `EXECUTION_FAILURE_CODE_INTERNAL = 9` to the `ExecutionFailureCode` enum in
`proto/webcad/engine/v1/common.proto`.

---

## 4. Dispatcher Operations — Ported vs Unported

The proto `oneof op` in `engine.proto` declares **35 operations** (fields 3 through 37):

| Field | Operation | In switch? |
|-------|-----------|------------|
| 3 | `init` | Yes (no-op handshake) |
| 4 | `clear_cache` | Yes |
| 5 | `release_shapes` | Yes |
| 6 | `check_validity` | **No** — unported → default → `INVALID_PARAMETER` |
| 7 | `export_brep` | Yes |
| 8 | `import_brep` | Yes |
| 9 | `extract_face_profile` | Yes |
| 10 | `create_box` | Yes |
| 11–23 | `create_cylinder` … `create_sweep` | Yes |
| 24 | `create_loft` | **No** — unported → default → `INVALID_PARAMETER` |
| 25–37 | `create_boolean` … `step_export` | Yes |

**Handled:** 33 of 35 cases in the `switch(request->op_case())` at line 2781.
**Unported (2):** `check_validity` (field 6) and `create_loft` (field 24) — fall through to `default:` which returns
`EXECUTION_FAILURE_CODE_INVALID_PARAMETER` ("Unknown or missing operation").

This resolves the earlier contradictory reports ("5 vs 28 ops"): the actual count is **33 handled, 2 unported**.

### 4.1 `init` operation

`HandleInit` (line 2893) is a no-op:

```cpp
Status HandleInit(const ExecuteRequest* /*request*/, ExecuteResponse* response) {
  auto* success = response->mutable_success();
  success->set_shape_id("");
  return Status::OK;
}
```

It exists in the proto only because of the WASM worker. Currently returns OK with empty `shape_id` — no version
handshake, no capability advertisement.

**Proposal (default):** Make `init` a no-op handshake returning kernel/OCCT version:
```
"kernel ready; OCCT 7.9.3; ported_ops: 33/35"
```

**Alternative:** Mark `init` as `reserved` in the proto (requires buf breaking change check — verify compatibility).

**Decision needed:** User to confirm handshake vs reserved.

---

## 5. Contract Gap Proposals

### 5.1 Unimplemented-but-valid operations

**Problem:** `default:` returns `EXECUTION_FAILURE_CODE_INVALID_PARAMETER` ("Unknown or missing operation").
For unimplemented-but-valid ops like `create_loft`, this misleads clients — the operation is valid per proto,
just not ported yet.

**Proposal:** Return `EXECUTION_FAILURE_CODE_UNSUPPORTED` (already defined in `common.proto` = 4) with message
listing the unimplemented operation name:

```
"Operation create_loft is not yet ported to the native kernel; use WASM worker fallback"
```

### 5.2 `init` operation

See Section 4.1 above.

---

## 6. Recommended Test Changes (Do Not Implement Yet)

Until the fix lands and is approved:

1. **Mark current failing assertions as expected-failure** linked to bug id `P0-WEBCAD-KERNEL-CREATE_BOX`.
2. **Add a positive canary test** `create_box must succeed` marked expected-failure — it flips to passing when
   the fix lands.
3. **Add a kernel health smoke test** covering: box, boolean (fuse/cut/common), mesh. All marked expected-failure
   until fix lands.

**Test file:** `tests/kernel_worker_test.cpp` (existing pattern — includes `kernel-worker.cpp` with
`#define SKIP_MAIN`).

---

## 7. Proposed Fix (Not Yet Implemented)

**Root cause (unconfirmed):** Since standalone MakeBox works and headers/libs match 7.9.3, the failure is likely
either a stale `kernel-worker` binary inside the image, or incorrect `dx`/`dy`/`dz` values from the client.

**Fix candidates (investigation order):**
1. Rebuild `kernel-worker` from current source inside the image and re-test via gRPC — if the rebuilt binary
   works, the shipped binary was stale.
2. Add logging of `dx`/`dy`/`dz` values received from the proto to confirm they match client intent.
3. If `IsDone()` remains false but `Shape()` is non-null in the rebuilt binary, investigate further — do NOT
   treat `IsDone()==false` + non-null `Shape()` as success (removed from risks; this is not an acceptable
   workaround).

---

## 8. Open Questions

| # | Question | Proposed default |
|---|----------|-----------------|
| 1 | Is the `kernel-worker` binary inside the image built from current `kernel-worker.cpp` source? | Rebuild and compare |
| 2 | Are `dx`/`dy`/`dz` values arriving from the client correct (10, 10, 10)? | Add logging to confirm |
| 3 | Should `init` return version handshake or be `reserved` in proto? | Handshake (default) |
| 4 | Plane ticket id for linking Part A bug | User to provide |
| 5 | How should Plane secret be handled? | Env var, git-ignored, never logged (see Section 9) |

---

## 9. Plane Secret Handling

The Plane API secret is stored in `plane-secret-key.csv`, which is **git-ignored**. Handling rules:

- **Never** commit `plane-secret-key.csv` to git (already git-ignored — verify `.gitignore`).
- **Never** log the secret value in any error message, debug output, or test output.
- **Read from environment variable** (e.g. `PLANE_API_KEY`) at runtime, not from the CSV file directly.
- The CSV file is a local convenience; the production path uses the env var.
- Any script or tool that reads the CSV must mask the secret in all output.

---

## 10. Risks

- **Stale kernel-worker binary:** The binary inside `kernel:occt-7.9.3` may be built from older source than the
  current `kernel-worker.cpp`. Rebuilding from current source may resolve the issue without code changes.
- **Parameter mismatch:** If `dx`/`dy`/`dz` arrive as 0 or incorrect values from the client, `MakeBox(0,0,0)` would
  produce a degenerate box with `IsDone()==false`.
- **`INVALID_PARAMETER` → `UNSUPPORTED` for unported ops:** Behavioral change clients may depend on.
- **Adding `EXECUTION_FAILURE_CODE_INTERNAL` to enum:** Proto change requires buf breaking check; may affect
  client switch statements on error codes.
- **PutBlob UNIMPLEMENTED:** B-reps > 4 MiB cannot currently be transferred; unrelated to create_box but relevant
  to overall kernel capability.