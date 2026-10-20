# GCS Sketcher Review

## Overview

The `src/core/sketcher` directory contains a **Geometric Constraint Solver (GCS)** implementation following the SolveSpace architecture. This is a significant architectural addition to WebCAD, providing parametric sketch solving capabilities.

## Architecture Analysis

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Sketcher Architecture                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │   Param.ts   │    │ SketchPoint  │    │  SketchEntity    │   │
│  │              │    │              │    │                  │   │
│  │ hParam type  │    │ hEntity type │    │ Entity types     │   │
│  │ Param class  │    │ px, py       │    │ point[] handles  │   │
│  │ ParamStore   │    │ getNum()     │    │ distance (r)     │   │
│  └──────────────┘    └──────────────┘    └──────────────────┘   │
│           │                   │                   │             │
│           └───────────────────┼───────────────────┘             │
│                               │                                 │
│                    ┌──────────▼──────────┐                     │
│                    │   SketchModel.ts    │                     │
│                    │                     │                     │
│                    │ params, points,     │                     │
│                    │ entities,           │                     │
│                    │ constraints         │                     │
│                    │ addPoint(),         │                     │
│                    │ addLine(),          │                     │
│                    │ addCircle()         │                     │
│                    └─────────────────────┘                     │
│                               │                                │
│                    ┌──────────▼──────────┐                     │
│                    │     Expr.ts         │                     │
│                    │                     │                     │
│                    │ Symbolic expression │                     │
│                    │ tree with auto-     │                     │
│                    │ matic differentiation│                     │
│                    └─────────────────────┘                     │
│                               │                                │
│                    ┌──────────▼──────────┐                     │
│                    │   Constraint.ts     │                     │
│                    │                     │                     │
│                    │ Equation interface  │                     │
│                    │ ConstraintBase      │                     │
│                    └─────────────────────┘                     │
│                               │                                │
│                    ┌──────────▼──────────┐                     │
│                    │    System.ts        │                     │
│                    │                     │                     │
│                    │ Newton-Raphson      │                     │
│                    │ solver with         │                     │
│                    │ substitution        │                     │
│                    └─────────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Status

### Completed (Phase 1-3 from roadmap)

| File | Status | Notes |
|------|--------|-------|
| [`Param.ts`](src/core/sketcher/Param.ts) | ✅ Complete | Parameter store with handle-based system |
| [`SketchPoint.ts`](src/core/sketcher/SketchPoint.ts) | ✅ Complete | Point with px/py param handles |
| [`SketchEntity.ts`](src/core/sketcher/SketchEntity.ts) | ✅ Complete | Entity types: LINE_SEGMENT, CIRCLE, ARC_OF_CIRCLE, CUBIC, WORKPLANE |
| [`SketchModel.ts`](src/core/sketcher/SketchModel.ts) | ✅ Complete | Model with addPoint, addLine, addCircle, connectAt, serialization, deserialization |
| [`Expr.ts`](src/core/sketcher/Expr.ts) | ✅ Complete | Symbolic expression with automatic differentiation |
| [`Constraint.ts`](src/core/sketcher/Constraint.ts) | ✅ Complete | Base class with `type` discriminator |
| [`Solver.ts`](src/core/sketcher/Solver.ts) | ✅ Complete | SolveResult enum and SolveOutput interface |
| [`System.ts`](src/core/sketcher/System.ts) | ✅ Complete | Newton-Raphson solver with substitution |
| [`SketchStyle.ts`](src/core/sketcher/SketchStyle.ts) | ✅ Complete | Style constants for DoF visualization |
| [`Sketcher.test.ts`](src/core/sketcher/Sketcher.test.ts) | ✅ Complete | Tests for Expr and constraint solving |

### Concrete Constraints (Phase 3)

| Constraint | File | Status |
|------------|------|--------|
| Coincident | [`constraints/Coincident.ts`](src/core/sketcher/constraints/Coincident.ts) | ✅ Complete |
| Horizontal | [`constraints/Horizontal.ts`](src/core/sketcher/constraints/Horizontal.ts) | ✅ Complete |
| Vertical | [`constraints/Vertical.ts`](src/core/sketcher/constraints/Vertical.ts) | ✅ Complete |
| Distance | [`constraints/Distance.ts`](src/core/sketcher/constraints/Distance.ts) | ✅ Complete |
| Radius | [`constraints/Radius.ts`](src/core/sketcher/constraints/Radius.ts) | ✅ Complete |
| ConstraintFactory | [`constraints/ConstraintFactory.ts`](src/core/sketcher/constraints/ConstraintFactory.ts) | ✅ Complete |

## Key Design Decisions

### 1. Handle-Based Parametric Entities
- **Correct**: Uses `hParam` and `hEntity` handles instead of direct values
- **Benefit**: Stable references for constraints; geometry changes don't break constraint bindings
- **Reference**: Matches SolveSpace's `Entity` / `Param` architecture

### 2. Shared Point Handles (Structural Coincidence)
- **Correct**: `connectAt()` method allows entities to share point handles
- **Benefit**: Eliminates coincident constraint equations entirely
- **Reference**: Core SolveSpace optimization

### 3. Symbolic Expression System
- **Correct**: Full `Expr` class with automatic differentiation
- **Benefit**: Jacobian computed automatically; no manual derivatives needed
- **Note**: `paramsUsed()` uses full `BigInt` (not modulo 61 as in roadmap)

### 4. Newton-Raphson Solver
- **Correct**: Implements substitution, rank test, and Newton iteration
- **Benefit**: Robust convergence for non-linear constraints
- **Note**: Uses least-squares for over-determined systems

### 5. Constraint Type Discriminator
- **Correct**: `ConstraintBase` now has `abstract readonly type: string`
- **Benefit**: Enables serialization/deserialization via `ConstraintFactory`

## Integration with 3D Reevaluator

### [`Solid3DReevaluator.ts`](src/core/engine/Solid3DReevaluator.ts)

**Key Finding**: The GCS sketcher is **already integrated** with the 3D reevaluator:

```typescript
// Lines 6-8: Imports
import { SketchModel } from "../sketcher/SketchModel";
import { System } from "../sketcher/System";
import { SolveResult } from "../sketcher/Solver";

// Lines 22-46: Sketch solving in reevaluation pipeline
const sketchFeatures = solid.features.filter(f => f.type === "Sketch" && f.isActive);
for (const sketchFeat of sketchFeatures) {
  if (!sketchFeat.parameters.sketchData) continue;
  const model = SketchModel.deserialize(sketchFeat.parameters.sketchData);
  const result = System.solve(model);
  // ... uses solved profile for extrusion
}
```

This is a **critical integration point** - sketches are solved before 3D features are regenerated, enabling parametric updates.

## Comparison with Existing PBD Solver

| Aspect | PBD Solver (`engine/SketchSolver.ts`) | GCS Solver (`sketcher/`) |
|--------|-------------------------------------|--------------------------|
| Algorithm | Position Based Dynamics (iterative relaxation) | Newton-Raphson (symbolic) |
| Convergence | Approximate, iteration count dependent | Exact, with tolerance |
| DoF Analysis | No | Yes (dof, redundant, freeParams) |
| Constraint Types | 12 types implemented | 5 types implemented |
| Performance | Fast for real-time dragging | Better for final solve |
| Use Case | Interactive manipulation | Parametric solving |

## Test Coverage

The tests in [`Sketcher.test.ts`](src/core/sketcher/Sketcher.test.ts) cover:
- ✅ Basic expression evaluation
- ✅ Parameter resolution
- ✅ Automatic differentiation
- ✅ Distance constraint solving
- ✅ Horizontal constraint solving
- ✅ Vertical constraint solving
- ✅ Circle radius constraint solving
- ✅ Over-constraint detection (singular Jacobian)

**Missing tests:**
- Coincident constraint solving
- Multi-constraint systems
- Drag simulation
- Arc constraints
- Tangent constraints

## Issues and Recommendations

### Minor Issues

1. **Missing Constraint Types**
   - No `Tangent`, `Perpendicular`, `Parallel`, `Angle`, `Concentric` constraints
   - **Impact**: Limited constraint solving capabilities

2. **No Integration with SketchCommand**
   - `SketchCommand.ts` still uses the PBD solver
   - The GCS sketcher is not connected to the interactive sketch command
   - **Impact**: Feature is isolated, not usable in the UI

3. **Arc Entity Support**
   - `ARC_OF_CIRCLE` entity type defined but no constraints for it
   - **Impact**: Cannot create constrained arcs

### Recommendations

1. **Add Missing Constraints** (Priority: High)
   - `Tangent` - line/circle tangent
   - `Perpendicular` - two lines perpendicular
   - `Parallel` - two lines parallel
   - `Angle` - angle between two lines
   - `Concentric` - two circles share center

2. **Integrate with SketchCommand**
   - Replace PBD solver calls with GCS `System.solve()`
   - Add DoF color feedback to UI
   - Connect `connectAt()` to entity creation

3. **Add Arc Constraints**
   - `Radius` for arcs
   - `Start/End point` constraints
   - `Center` constraints

4. **Performance Optimization**
   - Consider caching `paramsUsed()` results
   - Add early-exit for trivial equations

## Summary

The GCS sketcher is **substantially complete** (Phases 1-3) and **already integrated** with the 3D reevaluator pipeline. The core architecture is sound, with:
- Handle-based parametric entities
- Symbolic expression system with automatic differentiation
- Working Newton-Raphson solver
- Concrete constraint implementations (Coincident, Horizontal, Vertical, Distance, Radius)
- Serialization/deserialization support

The main remaining work is **integration with the interactive command system** and **adding more constraint types** for full functionality.