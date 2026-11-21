# WC-EC-18: Port booleans (createBoolean with fuse/cut/common)

**Status:** Approved  
**Ticket:** WC-EC-18 | Port: booleans (createBoolean, scad CSG temp ids) | high | A | Phase 2  
**Date:** 2026-11-21  
**Branch:** dev

## 1. Overview

Port boolean operations (fuse, cut, common) from the WASM `OCCWorker.ts` reference to the native OCCT C++ kernel (`kernel-worker.cpp`). The proto `CreateBooleanOp` (field 25) and `BooleanResult` (field 17) already exist — no proto change required.

SCAD CSG temp ids are handled at the SCAD executor layer (`CsgExecutor.ts`), not in the kernel. The kernel simply performs fuse/cut/common on two cached shapes and returns a new `shape_id`.

## 2. Scope

**In scope:**
- C++ `OpCreateBoolean` function in `kernel-worker.cpp`
- `HandleCreateBoolean` handler + `switch` case `kCreateBoolean`
- `native-kernel-adapter.ts` opMap entry + parameter normalization
- Oracle fixtures: `boolean_fuse.json`, `boolean_cut.json`, `boolean_common.json`
- Integration test cases in `native-oracle.integration.test.ts`
- Epic tracking update in `WEBCAD-EPIC-EC-v5.md`

**Out of scope:**
- SCAD CSG temp id lifecycle management (handled by `CsgExecutor.ts`)
- `rot_a`/`rot_b`/`center_a`/`center_b` proto fields (user decision: minimal, no rotation)
- Multi-operand booleans (OCCT binary ops only; SCAD unions multiple children before calling)

## 3. Design

### 3.1 Kernel — `OpCreateBoolean`

```cpp
OpResult OpCreateBoolean(
    TopoDS_Shape shapeA,
    TopoDS_Shape shapeB,
    const std::string& operation,  // "fuse" | "cut" | "common"
    double deflection,
    const std::string& entityId
);
```

**Behavior:**
1. Map `operation` → `BRepAlgoAPI_Fuse_1` / `BRepAlgoAPI_Cut_1` / `BRepAlgoAPI_Common_1`
2. Configure via `configureBooleanOp` (mirrors WASM):
   - `SetFuzzyValue(1e-6)`
   - `SetRunParallel(false)`
   - `SetCheckInverted(true)`
   - `SetNonDestructive(false)`
3. `Build()`; on failure return `OpResult` with `KERNEL_ERROR`
4. `OpCreateAndCache` the result shape, return `shape_id`

**Memory safety (C++ leak prevention principles):**
- OCCT `Handle_*` types are ref-counted — no manual `delete`
- `BRepAlgoAPI_*` objects are stack-allocated — destroyed at scope exit
- `TopoDS_Shape` values are handles — copied by reference, no ownership transfer
- `OpResult` cleaned on all error paths (existing pattern from WC-EC-14/15/16/17)

### 3.2 Handler — `HandleCreateBoolean`

```cpp
Status HandleCreateBoolean(const ExecuteRequest* request, ExecuteResponse* response);
```

**Behavior:**
1. Read `create_boolean()` op: `operation()`, `id_a()`, `id_b()`, `entity_id()`, `deflection()`
2. Fetch `g_shapeCache[id_a]` and `g_shapeCache[id_b]`; `NOT_FOUND` if missing
3. Call `OpCreateBoolean(shapeA, shapeB, operation, deflection, entityId)`
4. On success: `success->set_shape_id(r.shapeId)`, `success->mutable_boolean()->set_shape_id(r.shapeId)`, compute metrics if shape in cache
5. On failure: `SetFailure` with appropriate `ExecutionFailureCode`

### 3.3 Adapter — `native-kernel-adapter.ts`

**opMap entry:**
```typescript
create_boolean: 'create_boolean',
```

**Parameter normalization in `buildExecuteRequest`:**
- `id_a`, `id_b`, `entity_id`: passthrough strings
- `operation`: passthrough string ("fuse" | "cut" | "common")
- `deflection`: passthrough number

### 3.4 Data Flow

```
Client create_boolean request
  → native-kernel-adapter.buildExecuteRequest()
    → CreateBooleanOp proto (operation, id_a, id_b, entity_id, deflection)
    → Connect/gRPC Execute RPC
    → kernel-worker.cpp switch → HandleCreateBoolean
      → g_shapeCache[id_a], g_shapeCache[id_b]
      → OpCreateBoolean: BRepAlgoAPI_Fuse/Cut/Common
      → OpCreateAndCache → new shape_id
      → response.success.boolean.shape_id + metrics
    → gateway → client
```

## 4. Error Handling

| Condition | Code | Message |
|---|---|---|
| `id_a` not in cache | `NOT_FOUND` | "shape id_a not found: {id}" |
| `id_b` not in cache | `NOT_FOUND` | "shape id_b not found: {id}" |
| Invalid operation string | `INVALID_ARGUMENT` | "unknown boolean operation: {op}" |
| `Build()` returns null shape | `KERNEL_ERROR` | OCCT exception message |
| Any OCCT exception | `KERNEL_ERROR` | caught `Standard_Failure` message |

## 5. Testing

### 5.1 Oracle fixtures (`tests/fixtures/oracle/`)

| Fixture | Operand A | Operand B | Operation | Expected metrics |
|---|---|---|---|---|
| `boolean_fuse.json` | unit cube | unit cube (offset) | fuse | volume, surfaceArea, faceCount, edgeCount, vertexCount |
| `boolean_cut.json` | unit cube | smaller cube inside | cut | volume, surfaceArea, faceCount, edgeCount, vertexCount |
| `boolean_common.json` | two overlapping boxes | — | common | volume, surfaceArea, faceCount, edgeCount, vertexCount |

`totalParts` increases from 16 to 19.

### 5.2 Integration test

Add cases to `native-oracle.integration.test.ts` for fuse, cut, common — each asserting `valid: true` and expected metric values.

## 6. Files Changed

- `src/core/gateway/kernel-worker.cpp` — `OpCreateBoolean`, `HandleCreateBoolean`, switch case
- `src/core/harness/native-kernel-adapter.ts` — opMap entry + param normalization
- `tests/fixtures/oracle/boolean_fuse.json` — new fixture
- `tests/fixtures/oracle/boolean_cut.json` — new fixture
- `tests/fixtures/oracle/boolean_common.json` — new fixture
- `tests/oracle/native-oracle.integration.test.ts` — boolean test cases + totalParts=19
- `docs/epics/WEBCAD-EPIC-EC-v5.md` — mark WC-EC-18 done

## 7. Self-Review

- [x] No proto change needed (fields already exist)
- [x] No ADR required (no proto change)
- [x] Follows existing WC-EC-14/15/16/17 handler pattern
- [x] Memory safety: OCCT handles ref-counted, BRepAlgoAPI stack-allocated
- [x] Minimal diff — no rot/center, no multi-operand, no ShapeFix
- [x] Error handling covers all failure modes
- [x] Tests: 3 oracle fixtures + integration test cases
