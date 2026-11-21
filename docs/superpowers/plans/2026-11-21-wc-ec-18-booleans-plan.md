# WC-EC-18 Booleans Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port createBoolean (fuse/cut/common) operations to the native OCCT C++ kernel, with oracle fixtures and integration tests.

**Architecture:** Direct OCCT port mirroring WASM `OCCWorker.ts` `makeBooleanBuilder`. `OpCreateBoolean` creates a `BRepAlgoAPI_Fuse`/`Cut`/`Common` builder, configures it (FuzzyValue, RunParallel, CheckInverted, NonDestructive), builds, and caches via `OpCreateAndCache`. `HandleCreateBoolean` reads `CreateBooleanOp` fields (operation, id_a, id_b, entity_id, deflection), fetches shapes from `g_shapeCache`, calls `OpCreateBoolean`, and returns `ExecuteSuccess.boolean`.

**Tech Stack:** OCCT 7.9.3 C++, protobuf, TypeScript, Vitest

---

## Chunk 1: Implementation Plan Document

### Task 1: Write the implementation plan document

**Files:**
- Create: `docs/superpowers/plans/2026-11-21-wc-ec-18-booleans-plan.md`

- [ ] **Step 1: Write plan document**

  This document. Saves to `docs/superpowers/plans/2026-11-21-wc-ec-18-booleans-plan.md`.

- [ ] **Step 2: Commit plan document**

  ```bash
  git add docs/superpowers/plans/2026-11-21-wc-ec-18-booleans-plan.md
  git commit -m "plan(wc-ec-18): booleans implementation plan"
  ```

---

## Chunk 2: C++ Kernel Implementation

### Task 2: Implement OpCreateBoolean in kernel-worker.cpp

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp`

- [ ] **Step 1: Add OpCreateBoolean function** (after OpCreateCompound, before HandleCreateCompound)

  ```cpp
  static OpResult OpCreateBoolean(const std::string& operation,
                                  const std::string& idA,
                                  const std::string& idB,
                                  double deflection,
                                  const std::string& entityId) {
    OpResult r;

    auto itA = g_shapeCache.find(idA);
    if (itA == g_shapeCache.end()) {
      r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_MISSING_ENTITY);
      r.message = "Shape not found in cache: " + idA;
      return r;
    }
    auto itB = g_shapeCache.find(idB);
    if (itB == g_shapeCache.end()) {
      r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_MISSING_ENTITY);
      r.message = "Shape not found in cache: " + idB;
      return r;
    }

    const TopoDS_Shape& shapeA = itA->second;
    const TopoDS_Shape& shapeB = itB->second;

    if (shapeA.IsNull() || shapeB.IsNull()) {
      r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_GEOMETRY_EMPTY);
      r.message = "Input shape is null";
      return r;
    }

    try {
      if (operation == "fuse") {
        BRepAlgoAPI_Fuse builder(shapeA, shapeB);
        builder.SetFuzzyValue(1e-6);
        builder.RunParallel(false);
        builder.CheckInverted(true);
        builder.NonDestructive(false);
        builder.Build();
        if (!builder.IsDone()) {
          r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
          r.message = "Boolean fuse failed: builder not done";
          return r;
        }
        return OpCreateAndCache(builder.Shape(), deflection, entityId);
      } else if (operation == "cut") {
        BRepAlgoAPI_Cut builder(shapeA, shapeB);
        builder.SetFuzzyValue(1e-6);
        builder.RunParallel(false);
        builder.CheckInverted(true);
        builder.NonDestructive(false);
        builder.Build();
        if (!builder.IsDone()) {
          r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
          r.message = "Boolean cut failed: builder not done";
          return r;
        }
        return OpCreateAndCache(builder.Shape(), deflection, entityId);
      } else if (operation == "common") {
        BRepAlgoAPI_Common builder(shapeA, shapeB);
        builder.SetFuzzyValue(1e-6);
        builder.RunParallel(false);
        builder.CheckInverted(true);
        builder.NonDestructive(false);
        builder.Build();
        if (!builder.IsDone()) {
          r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
          r.message = "Boolean common failed: builder not done";
          return r;
        }
        return OpCreateAndCache(builder.Shape(), deflection, entityId);
      } else {
        r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_INVALID_PARAMETER);
        r.message = "Unknown boolean operation: " + operation + " (expected 'fuse', 'cut', or 'common')";
        return r;
      }
    } catch (const Standard_Failure& e) {
      r.code = static_cast<uint32_t>(ExecutionFailureCode::EXECUTION_FAILURE_CODE_OPERATION_FAILED);
      r.message = "OCCT boolean failed: " + std::string(e.GetMessageString());
      return r;
    }
  }
  ```

- [ ] **Step 2: Run test to verify compile** (partial — build kernel later in Chunk 5)

---

### Task 3: Add HandleCreateBoolean handler + switch case kCreateBoolean

**Files:**
- Modify: `src/core/gateway/kernel-worker.cpp`

- [ ] **Step 1: Add HandleCreateBoolean handler** (after HandleCreateCompound, before HandleExtractFaceProfile)

  ```cpp
  Status HandleCreateBoolean(const ExecuteRequest* request, ExecuteResponse* response) {
    const auto& op = request->create_boolean();
    std::string operation = op.operation();
    std::string idA = op.id_a();
    std::string idB = op.id_b();
    std::string entityId = op.entity_id();
    double deflection = op.deflection();

    auto r = OpCreateBoolean(operation, idA, idB, deflection, entityId);
    if (!r.ok) {
      return SetFailure(response, static_cast<ExecutionFailureCode>(r.code), r.message);
    }

    auto* success = response->mutable_success();
    success->set_shape_id(r.shapeId);
    auto* boolResult = success->mutable_boolean();
    boolResult->set_shape_id(r.shapeId);

    auto it = g_shapeCache.find(r.shapeId);
    if (it != g_shapeCache.end()) {
      ComputeShapeMetrics(it->second, response->mutable_metrics());
    }

    return Status::OK;
  }
  ```

- [ ] **Step 2: Add switch case** (after `case ExecuteRequest::kCreateCompound:`)

  ```cpp
        case ExecuteRequest::kCreateBoolean:
          return HandleCreateBoolean(request, response);
  ```

---

### Task 4: Add create_boolean to native-kernel-adapter.ts opMap

**Files:**
- Modify: `src/core/harness/native-kernel-adapter.ts`

- [ ] **Step 1: Add opMap entry** (after `create_compound`)

  ```typescript
  create_boolean: 'create_boolean',
  ```

- [ ] **Step 2: Add parameter normalization** (optional — boolean params are already snake_case in proto: operation, id_a, id_b, entity_id, deflection). No normalization needed beyond what opMap does.

  Note: The `id_a`/`id_b` proto fields use snake_case which matches protobuf JS serialization. No special handling needed unless callers pass `idA`/`idB` camelCase. The existing `buildExecuteRequest` spreads `params` directly into `request[opField]`, so snake_case params will work as-is.

---

## Chunk 3: Test Fixtures

### Task 5: Create oracle fixtures for booleans

**Files:**
- Create: `tests/fixtures/oracle/boolean_fuse.json`
- Create: `tests/fixtures/oracle/boolean_cut.json`
- Create: `tests/fixtures/oracle/boolean_common.json`

- [ ] **Step 1: Create boolean_fuse.json**

  Fuse two overlapping boxes (0,0,0)-(2,2,2) and (1,1,1)-(3,3,3). Union volume = 2*8 - 1 = 15.

  ```json
  {
    "id": "boolean_fuse",
    "name": "Boolean Fuse",
    "description": "Fuse two overlapping 2x2x2 boxes",
    "script": {
      "name": "boolean_fuse_test",
      "steps": [
        {
          "name": "create_box",
          "parameters": { "x": 0, "y": 0, "z": 0, "dx": 2, "dy": 2, "dz": 2, "deflection": 0.1, "entity_id": "box_a" }
        },
        {
          "name": "create_box",
          "parameters": { "x": 1, "y": 1, "z": 1, "dx": 2, "dy": 2, "dz": 2, "deflection": 0.1, "entity_id": "box_b" }
        },
        {
          "name": "create_boolean",
          "parameters": { "operation": "fuse", "id_a": "box_a", "id_b": "box_b", "deflection": 0.1, "entity_id": "fuse_result" }
        }
      ]
    },
    "expected": {
      "volume": 15.0,
      "surfaceArea": 72.0,
      "bbox": { "min": [0.0, 0.0, 0.0], "max": [3.0, 3.0, 3.0] },
      "faceCount": 12,
      "edgeCount": 24,
      "vertexCount": 16,
      "isValid": true
    },
    "tolerances": {
      "volume": 1e-4,
      "surfaceArea": 1e-4,
      "bbox": 1e-3,
      "counts": 0
    }
  }
  ```

- [ ] **Step 2: Create boolean_cut.json**

  Cut box_b from box_a. Result = box_a minus intersection (1,1,1)-(2,2,2). Volume = 8 - 1 = 7.

  ```json
  {
    "id": "boolean_cut",
    "name": "Boolean Cut",
    "description": "Cut box_b from box_a (2x2x2 minus 1x1x1 overlap)",
    "script": {
      "name": "boolean_cut_test",
      "steps": [
        {
          "name": "create_box",
          "parameters": { "x": 0, "y": 0, "z": 0, "dx": 2, "dy": 2, "dz": 2, "deflection": 0.1, "entity_id": "box_a" }
        },
        {
          "name": "create_box",
          "parameters": { "x": 1, "y": 1, "z": 1, "dx": 2, "dy": 2, "dz": 2, "deflection": 0.1, "entity_id": "box_b" }
        },
        {
          "name": "create_boolean",
          "parameters": { "operation": "cut", "id_a": "box_a", "id_b": "box_b", "deflection": 0.1, "entity_id": "cut_result" }
        }
      ]
    },
    "expected": {
      "volume": 7.0,
      "surfaceArea": 30.0,
      "bbox": { "min": [0.0, 0.0, 0.0], "max": [2.0, 2.0, 2.0] },
      "faceCount": 12,
      "edgeCount": 24,
      "vertexCount": 16,
      "isValid": true
    },
    "tolerances": {
      "volume": 1e-4,
      "surfaceArea": 1e-4,
      "bbox": 1e-3,
      "counts": 0
    }
  }
  ```

- [ ] **Step 3: Create boolean_common.json**

  Common (intersection) of box_a (0,0,0)-(2,2,2) and box_b (1,1,1)-(3,3,3). Intersection = (1,1,1)-(2,2,2) = 1x1x1. Volume = 1.

  ```json
  {
    "id": "boolean_common",
    "name": "Boolean Common",
    "description": "Common/intersection of two overlapping boxes",
    "script": {
      "name": "boolean_common_test",
      "steps": [
        {
          "name": "create_box",
          "parameters": { "x": 0, "y": 0, "z": 0, "dx": 2, "dy": 2, "dz": 2, "deflection": 0.1, "entity_id": "box_a" }
        },
        {
          "name": "create_box",
          "parameters": { "x": 1, "y": 1, "z": 1, "dx": 2, "dy": 2, "dz": 2, "deflection": 0.1, "entity_id": "box_b" }
        },
        {
          "name": "create_boolean",
          "parameters": { "operation": "common", "id_a": "box_a", "id_b": "box_b", "deflection": 0.1, "entity_id": "common_result" }
        }
      ]
    },
    "expected": {
      "volume": 1.0,
      "surfaceArea": 6.0,
      "bbox": { "min": [1.0, 1.0, 1.0], "max": [2.0, 2.0, 2.0] },
      "faceCount": 6,
      "edgeCount": 12,
      "vertexCount": 8,
      "isValid": true
    },
    "tolerances": {
      "volume": 1e-4,
      "surfaceArea": 1e-4,
      "bbox": 1e-3,
      "counts": 0
    }
  }
  ```

---

## Chunk 4: Integration Tests

### Task 6: Update integration test for booleans

**Files:**
- Modify: `tests/oracle/native-oracle.integration.test.ts`

- [ ] **Step 1: Update totalParts** from 16 to 19

- [ ] **Step 2: Add individual boolean test cases** (optional — the fixture-based test covers all 3 via totalParts)

  The existing test `it('all reference parts pass against native kernel')` iterates all fixtures and checks `totalParts`. No new `it()` blocks needed unless we want dedicated boolean assertions. The fixture test already covers fuse/cut/common.

---

## Chunk 5: Build & Deploy

### Task 7: Build kernel in container, swap binary, restart

**Files:** None (container operations)

- [ ] **Step 1: Build kernel** (in container `webcad-kernel-test`, build dir `/kernel/build`)

  ```bash
  # From host, copy kernel-worker.cpp to container
  docker cp C:\Dev\webcad\src\core\gateway\kernel-worker.cpp webcad-kernel-test:/kernel/src/kernel-worker.cpp
  # In container:
  cd /kernel/build && ninja
  # Atomic swap
  cp /kernel/build/kernel_worker /kernel/kernel_worker.new && mv /kernel/kernel_worker.new /kernel/kernel_worker
  docker restart webcad-kernel-test
  ```

- [ ] **Step 2: Verify container is healthy** — `curl localhost:50051/health` or run a simple execute

---

## Chunk 6: Verification

### Task 8: Run full verification suite

**Files:** None

- [ ] **Step 1: Run oracle + harness tests**

  ```bash
  npx vitest run tests/oracle tests/harness
  ```

  Expected: 48/48 tests passed (45 existing + 3 new boolean fixtures)

- [ ] **Step 2: Run typecheck**

  ```bash
  npm run typecheck
  ```

- [ ] **Step 3: Run lint**

  ```bash
  npm run lint
  ```

- [ ] **Step 4: Run buf lint**

  ```bash
  npm run buf:lint
  ```

- [ ] **Step 5: Run full verify**

  ```bash
  npm run verify
  ```

---

## Chunk 7: Documentation & Commit

### Task 9: Mark WC-EC-18 done in epic doc

**Files:**
- Modify: `docs/epics/WEBCAD-EPIC-EC-v5.md`

- [ ] **Step 1: Mark WC-EC-18 as done** `[x]` in the epic checklist

### Task 10: Commit and push

**Files:** None

- [ ] **Step 1: Commit all changes**

  ```bash
  git add -A
  git commit -m "feat(wc-ec-18): port booleans (fuse/cut/common) to native OCCT kernel"
  ```

- [ ] **Step 2: Push to origin/dev**

  ```bash
  git push origin dev
  ```

---

## Memory Leak Prevention (C++)

Applied to `kernel-worker.cpp` boolean port:

- **RAII**: `BRepAlgoAPI_Fuse`/`Cut`/`Common` builders are stack-allocated (automatic cleanup). No `new`/`delete`.
- **No naked pointers**: `TopoDS_Shape` is a lightweight handle (ref-counted internally by OCCT). Stored by value in `g_shapeCache`.
- **Exception safety**: All OCCT calls wrapped in `try/catch (Standard_Failure)`. Failures return `OpResult` with error code, never leak.
- **Resource cleanup**: `OpCreateAndCache` meshes and caches — no temporary files or handles left behind.
- **Const correctness**: Input shapes accessed via `const TopoDS_Shape&` references — no copies, no ownership transfer.

---

## Success Criteria

- [ ] `npm run typecheck` passes (0 errors)
- [ ] `npm run lint` passes (0 warnings/errors)
- [ ] `npm test` passes (0 failures) — oracle + harness, totalParts = 19
- [ ] `npm run buf:lint` passes
- [ ] `npm run buf:breaking` passes (no proto changes needed)
- [ ] Native kernel built, swapped, and container restarted successfully
- [ ] All 3 boolean fixtures pass against live container
- [ ] WC-EC-18 marked `[x]` in `docs/epics/WEBCAD-EPIC-EC-v5.md`
- [ ] Committed and pushed to `origin/dev`
