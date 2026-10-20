## Gap Analysis: `gcs_sketcher_p1.md` Plan vs. Current Implementation

### ✅ Completed (Phases 1–3 fully, Phase 4 partially)

| Plan Phase | Component | Status |
|---|---|---|
| Phase 1 | `Param.ts` (ParamStore) | ✅ Complete |
| Phase 1 | `SketchPoint.ts` (hEntity, px/py handles) | ✅ Complete |
| Phase 1 | `SketchEntity.ts` (type definitions) | ✅ Complete |
| Phase 1 | `SketchModel.ts` (SketchDocument equivalent) | ✅ Complete |
| Phase 1 | Serialization/deserialization | ✅ Complete (with minor `as any` hack for `nextId`) |
| Phase 2 | `Expr.ts` (symbolic algebra + autodiff) | ✅ Complete |
| Phase 2 | `ExprVector` helper | ✅ Complete |
| Phase 3 | `Constraint.ts` (ConstraintBase, Equation) | ✅ Complete |
| Phase 3 | Constraints: Coincident, Horizontal, Vertical, Distance, Parallel, Perpendicular, Tangent, Angle, Concentric, ArcPointsOnCircle | ✅ Complete |
| Phase 4 | `System.ts` — Stage 1 (Substitution) | ✅ Complete |
| Phase 4 | `System.ts` — Stage 3 (Rank test + Newton-LM) | ✅ Complete |
| Phase 4 | `Solver.ts` (SolveResult, SolveOutput) | ✅ Complete |
| Phase 4 | `SketchStyle.ts` (STYLE constants) | ✅ Complete |

### ❌ Critical Gaps

**1. Stage 2 (Single-Equation Pre-Solve) is MISSING from `System.ts`**
- The plan explicitly defines Stage 2 as a separate phase that solves equations referencing exactly one free param before the full Newton loop
- Current `System.ts` jumps directly from substitution to full Jacobian build
- This is a **performance and correctness issue**: H/V constraints should be eliminated before the rank test, not processed in the full Newton loop
- Plan reference: lines 883–898 in `gcs_sketcher_p1.md`

**2. `findRedundant()` is a STUB**
- `System.ts` line 302: `private findRedundant(): ConstraintBase[] { return []; }`
- Plan requires bisection approach: remove each constraint, re-check rank, identify conflicts
- Without this, `SINGULAR_JACOBIAN` returns empty `redundant` array — no user guidance on what to remove

**3. Missing Constraint Types (from Plan Section 3.2)**
| Constraint | Plan Spec | Implemented |
|---|---|---|
| `ArcLineTangent` | Lines 620–649 | ❌ Missing |
| `EqualLength` | Lines 651–662 | ❌ Missing |
| `EqualRadius` | Lines 664–675 | ❌ Missing (Radius.ts exists but is for dimensioning, not equal-radius constraint) |
| `Symmetric` | Lines 677–712 | ❌ Missing |
| `Midpoint` | Lines 714–733 | ❌ Missing |
| `WhereDragged` | Lines 735–750 | ❌ Missing (drag helper, not persistent) |

**4. `GCSBridge.ts` has broken import**
- Line 3: `import { ..., getPointCoords } from "../engine/SketchSolver";`
- `getPointCoords` was removed from `SketchSolver.ts` (all Viewer.ts references show "Cannot find name 'getPointCoords'")
- This means the bridge **cannot build the SketchModel from legacy document constraints** — it's dead code until fixed

**5. No Unit Tests for Solver Correctness**
- Plan requires: `PartialWrt` vs numerical gradient, `eval()≈0` for satisfying geometry, `SOLVED_OKAY` for fully-constrained rectangle, `dof=4` for free line, `SINGULAR_JACOBIAN` for redundant H+H
- Current `Sketcher.test.ts` has 12 tests but doesn't cover these critical solver milestones

### ⚠️ Partial Gaps

**6. `ParamStore` serialization hack**
- `SketchModel.serialize()` uses `(this.params as any).nextId` to access private field
- Plan specifies `nextId` as a public property of `ParamStore`

**7. No `WORKPLANE` entity type**
- Plan's `SketchEntityType` includes `'WORKPLANE'` but `SketchModel` only handles `LINE_SEGMENT`, `CIRCLE`, `ARC_OF_CIRCLE`

**8. No `SketchMode.ts` (Phase 7)**
- Plan requires: enter/exit sub-mode, handleClick, solveAndRedraw, undo with snapshots, commit/cancel
- Not started

**9. No `SmartPick.ts` (Phase 6)**
- Plan requires: inference computation (horizontal/vertical/parallel/perpendicular/tangent/midpoint), dashed hint rendering
- Not started

**10. No DoF Visualization (Phase 5)**
- `applyDoFColors()` function not implemented
- Constraint badge rendering not implemented
- `Viewer.updateSketchGeometry()` and `Viewer.updateConstraintBadges()` don't exist

**11. No DAG Integration (Phase 8)**
- `FeatureNode` with sketch type, workplane, `execute()` not implemented
- Parametric re-solve on upstream changes not implemented

### 📋 Exact Next Steps (Priority Order)

1. **Fix `getPointCoords` import in `GCSBridge.ts`** — either restore the function in `SketchSolver.ts` or inline the coordinate extraction logic. Without this, the bridge is non-functional.

2. **Implement Stage 2 (Single-Equation Pre-Solve) in `System.ts`** — add the `referencedSingleParam` check and `writeAndSolveJacobian` loop before the full Newton solve. This is the highest-impact correctness fix.

3. **Implement missing constraint types**: `EqualLength`, `EqualRadius`, `Symmetric`, `Midpoint`, `ArcLineTangent`. Each is 10–30 lines per the plan.

4. **Implement `findRedundant()` with bisection approach** — track equation ownership per constraint, test removal, recover rank.

5. **Write solver correctness tests**:
    - Rectangle with 4 sides + 4 corners → `SOLVED_OKAY, dof=0`
    - Free-floating line → `dof=4`
    - Horizontal + duplicate horizontal → `SINGULAR_JACOBIAN` with non-empty `redundant`
    - `PartialWrt` on distance formula vs numerical gradient

6. **Implement `applyDoFColors()` and constraint badge rendering** (Phase 5).

7. **Implement `SmartPick.ts`** (Phase 6).

8. **Implement `SketcherMode.ts`** (Phase 7) — enter/exit, click handling, undo snapshots.

9. **Implement DAG `FeatureNode` integration** (Phase 8).

10. **Fix `ParamStore` serialization** — expose `nextId` properly instead of `as any` cast.