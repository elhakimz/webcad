# OpenCASCADE.js — Error Code Reference

Errors appear in three distinct forms in opencascade.js:

| Form | What you see | How to read |
|---|---|---|
| **Integer (WASM address)** | `catch(e)` where `e` is a large number like `66599912` | C++ exception object address — decode with `oc.getExceptionMessage(e)` |
| **Builder `.Error()` int** | `faceMaker.Error()` returns `0..N` | Enum integer from the table below — check `IsDone()` first |
| **JS string** | `"Expected null or instance of TopoDS_Face"` | Emscripten binding type mismatch — wrong type passed to a function |

---

## Part 1 — C++ Exceptions (WASM integer address)

These are thrown by OCC internally and cross the WASM→JS boundary as a raw integer.
Decode with:
```typescript
const [type, message] = oc.getExceptionMessage(e)
// e.g. ["Standard_ConstructionError", "gp_Dir"]
```

| Exception class | `what()` message | Cause |
|---|---|---|
| `StdFail_NotDone` | `BRep_API: command not done` | Calling `.Shape()` / `.Face()` / `.Wire()` / `.Edge()` when `IsDone() == false` |
| `Standard_ConstructionError` | `gp_Dir` | Creating a direction from a zero-length vector (axis with identical start/end points) |
| `Standard_ConstructionError` | `gp_Ax1` | Null axis definition |
| `Standard_ConstructionError` | `BRep_API: command not done` | Same as StdFail_NotDone — builder result accessed before build completes |
| `Standard_ConstructionError` | `BRepBuilderAPI_MakePolygon` | Polygon closed on a single point |
| `Standard_NullObject` | *(empty)* | Using a `.delete()`d object, a null Handle, or a never-initialized shape |
| `Standard_OutOfRange` | `Array Index out of range` | Triangle / node index exceeds `NbTriangles()` or `NbNodes()` in tessellation loop |
| `Standard_OutOfRange` | `Index out of range` | Edge or face index out of bounds in a topology explorer |
| `Standard_DomainError` | `gp_Vec` | Cross product of two parallel or anti-parallel vectors |
| `Standard_DomainError` | `math_GaussLeastSquare` | Singular matrix during curve fitting (degenerate spline control points) |
| `Standard_TypeMismatch` | *(class names)* | Wrong shape type passed to a downcast (`TopoDS::Face`, `TopoDS::Wire`, etc.) |
| `Standard_ProgramError` | *(varies)* | Algorithm called in wrong order — e.g. `Build()` not called before `Shape()` |
| `Standard_NoSuchObject` | *(varies)* | Accessing a map/list element that doesn't exist |
| `Standard_Failure` | *(varies)* | Base OCC exception — catch-all for unrecognised failures |

---

## Part 2 — Builder Error Enums (`.Error()` integer return values)

These are read from a builder after `IsDone()` returns `false`. They are **not** thrown.

---

### `BRepBuilderAPI_EdgeError` — from `MakeEdge.Error()`

| Value | Name | Meaning |
|---|---|---|
| `0` | `BRepBuilderAPI_EdgeDone` | ✅ No error |
| `1` | `BRepBuilderAPI_PointProjectionFailed` | 3D point could not be projected onto the curve — point is too far from curve (beyond precision) |
| `2` | `BRepBuilderAPI_ParameterOutOfRange` | Given parameter is outside `[C.FirstParameter(), C.LastParameter()]` |
| `3` | `BRepBuilderAPI_DifferentPointsOnClosedCurve` | Two vertices have different locations but are both extremities of a closed curve |
| `4` | `BRepBuilderAPI_PointWithInfiniteParameter` | A finite point was mapped to an infinite parameter |
| `5` | `BRepBuilderAPI_DifferentsPointAndParameter` | Distance between the 3D point and the curve-evaluated point at the given parameter exceeds precision |
| `6` | `BRepBuilderAPI_LineThroughIdenticPoints` | Both points are identical — zero-length edge |

---

### `BRepBuilderAPI_WireError` — from `MakeWire.Error()`

| Value | Name | Meaning |
|---|---|---|
| `0` | `BRepBuilderAPI_WireDone` | ✅ No error |
| `1` | `BRepBuilderAPI_EmptyWire` | Wire has no edges — no edges were added, or all were degenerate |
| `2` | `BRepBuilderAPI_DisconnectedWire` | Last added edge was not connected to the wire (gap > tolerance) |
| `3` | `BRepBuilderAPI_NonManifoldWire` | Wire contains a singularity — more than 2 edges share a vertex |

---

### `BRepBuilderAPI_FaceError` — from `MakeFace.Error()`

| Value | Name | Meaning |
|---|---|---|
| `0` | `BRepBuilderAPI_FaceDone` | ✅ No error |
| `1` | `BRepBuilderAPI_NoFace` | No initialisation — empty constructor used |
| `2` | `BRepBuilderAPI_NotPlanar` | No surface given and the wire is not planar — cannot auto-create plane |
| `3` | `BRepBuilderAPI_CurveProjectionFailed` | No 2D parametric curve found on the surface for an edge |
| `4` | `BRepBuilderAPI_ParametersOutOfRange` | Given umin/umax/vmin/vmax are outside the surface bounds |

---

### `BRepBuilderAPI_ShellError` — from `MakeShell.Error()`

| Value | Name | Meaning |
|---|---|---|
| `0` | `BRepBuilderAPI_ShellDone` | ✅ No error |
| `1` | `BRepBuilderAPI_EmptyShell` | No faces added to the shell |
| `2` | `BRepBuilderAPI_DisconnectedShell` | Shell faces are not connected — gap between faces |
| `3` | `BRepBuilderAPI_ShellParametersOutOfRange` | Surface parameters out of range during shell construction |

---

### `BRepBuilderAPI_PipeError` — from `MakePipe.Error()`

| Value | Name | Meaning |
|---|---|---|
| `0` | `BRepBuilderAPI_PipeDone` | ✅ No error |
| `1` | `BRepBuilderAPI_PipeNotDone` | General pipe failure — profile or spine degenerate |
| `2` | `BRepBuilderAPI_PlaneNotIntersectingPipe` | Cutting plane does not intersect the pipe |
| `3` | `BRepBuilderAPI_SweepFaceMakingFailure` | Face building failed during sweep |

---

### `BRepOffset_Error` — from `MakeThickSolid.Error()`

| Value | Name | Meaning |
|---|---|---|
| `0` | `BRepOffset_NoError` | ✅ No error |
| `1` | `BRepOffset_UnknownError` | Unclassified failure |
| `2` | `BRepOffset_BadNormalsOnGeometry` | Surface normals are undefined or inconsistent |
| `3` | `BRepOffset_C0Geometry` | Input geometry has C0 continuity (not smooth enough) — offset requires C1 minimum |
| `4` | `BRepOffset_NullOffset` | Offset value is zero |
| `5` | `BRepOffset_NotConnectedShell` | The shell faces are not connected — open or disconnected shell |

---

## Part 3 — `BRepCheck_Status` — Shape Validation Codes

Returned by `BRepCheck_Analyzer` when checking topology validity.
Read via `analyzer.Result(shape).StatusOnShape()`.

| Value | Name | Meaning |
|---|---|---|
| `0` | `BRepCheck_NoError` | ✅ Shape is valid |
| `1` | `BRepCheck_InvalidPointOnCurve` | Vertex location does not lie on the edge curve |
| `2` | `BRepCheck_InvalidPointOnCurveOnSurface` | 2D curve point doesn't map to 3D correctly on the surface |
| `3` | `BRepCheck_InvalidPointOnSurface` | Vertex location does not lie on the face surface |
| `4` | `BRepCheck_No3DCurve` | Edge has no 3D curve |
| `5` | `BRepCheck_Multiple3DCurve` | Edge has more than one 3D curve |
| `6` | `BRepCheck_Invalid3DCurve` | 3D curve range is invalid |
| `7` | `BRepCheck_NoCurveOnSurface` | Edge has no 2D (pcurve) on the adjacent face |
| `8` | `BRepCheck_InvalidCurveOnSurface` | 2D curve doesn't correctly represent the 3D edge on the surface |
| `9` | `BRepCheck_InvalidCurveOnClosedSurface` | 2D curve on a closed surface has incorrect seam handling |
| `10` | `BRepCheck_InvalidSameRangeFlag` | SameRange flag set but 2D/3D curve ranges differ |
| `11` | `BRepCheck_InvalidSameParameterFlag` | SameParameter flag set but 3D point and curve-point differ |
| `12` | `BRepCheck_InvalidDegeneratedFlag` | Degenerated flag inconsistency |
| `13` | `BRepCheck_FreeEdge` | Edge is shared by only one face (open shell boundary — may be valid or invalid depending on context) |
| `14` | `BRepCheck_InvalidMultiConnexity` | Edge is shared by more than 2 faces (non-manifold) |
| `15` | `BRepCheck_InvalidRange` | Parameter range of an edge is invalid (first >= last) |
| `16` | `BRepCheck_EmptyWire` | Wire has no edges — most commonly caused by all edges being degenerate |
| `17` | `BRepCheck_RedundantEdge` | Wire contains the same edge more than once |
| `18` | `BRepCheck_SelfIntersectingWire` | Wire edges cross each other in 2D |
| `19` | `BRepCheck_NoSurface` | Face has no surface |
| `20` | `BRepCheck_InvalidWire` | Face's outer wire is invalid |
| `21` | `BRepCheck_RedundantWire` | Face has more than one outer wire |
| `22` | `BRepCheck_EnclosedRegion` | Inner wire encloses region that is outside the face |
| `23` | `BRepCheck_CheckFail` | The check algorithm itself failed (internal error) |
| `24` | `BRepCheck_BadOrientationOfSubshape` | Sub-shape has orientation inconsistent with parent |
| `25` | `BRepCheck_InvalidPolygonOnTriangulation` | Triangulation polygon doesn't match the edge |
| `26` | `BRepCheck_InvalidToleranceValue` | Tolerance value is negative or extremely large |
| `27` | `BRepCheck_EncryptedShape` | Shape type is unrecognised |

---

## Part 4 — BOPAlgo Alerts (Boolean Operations)

Returned by `boolBuilder.HasErrors()` / `boolBuilder.HasWarnings()` after `Build()`.
The human-readable key is returned by `GetReport().GetAlerts()`.

### Error alerts (operation failed)

| Alert key | Meaning |
|---|---|
| `BOPAlgo_AlertNullInputShapes` | One or both input shapes are null |
| `BOPAlgo_AlertTooFewArguments` | Fewer than 2 shapes provided |
| `BOPAlgo_AlertNoFiller` | PaveFiller not set before calling `BuildWithFiller` |
| `BOPAlgo_AlertIntersectionFailed` | Sub-shape intersection computation failed — often coplanar or nearly-touching faces |
| `BOPAlgo_AlertBuilderFailed` | General builder failure after intersection succeeded |
| `BOPAlgo_AlertBOPIsNotSet` | Boolean operation type not set |
| `BOPAlgo_AlertBOPNotAllowed` | Operation type not allowed for given input shape types |
| `BOPAlgo_AlertSolidBuilderFailed` | `BuilderSolid` algorithm could not produce a closed solid from the result faces |
| `BOPAlgo_AlertEmptyShape` | An input shape contains no sub-shapes |
| `BOPAlgo_AlertNotSplittableEdge` | An edge is too short to split — tolerance issue |
| `BOPAlgo_AlertBadPositioning` | Input positioning causes near-degenerate intersections |

### Warning alerts (operation completed but possibly incorrect)

| Alert key | Meaning |
|---|---|
| `BOPAlgo_AlertSelfInterferingShape` | One of the input shapes self-intersects |
| `BOPAlgo_AlertTooSmallEdge` | An edge has a valid range near zero — may be removed |
| `BOPAlgo_AlertBuildingPCurveFailed` | 2D parametric curve on a face could not be built for a split edge |
| `BOPAlgo_AlertAcquiredSelfIntersection` | Sub-shapes became connected through other shapes during the operation |
| `BOPAlgo_AlertIntersectionOfPairOfShapesFailed` | A specific pair of sub-shapes failed intersection — result may be incomplete |

---

## Part 5 — opencascade.js Binding Errors (JS strings)

These are JavaScript-layer errors from Emscripten's Embind — not C++ exceptions.

| Error string | Cause |
|---|---|
| `Expected null or instance of TopoDS_Face, got an instance of TopoDS_Shape` | Passed a `TopoDS_Shape` base type to a function expecting `TopoDS_Face` — use `oc.TopoDS.Face_1(shape)` downcast |
| `Expected null or instance of TopoDS_Wire, got an instance of TopoDS_Shape` | Same — use `oc.TopoDS.Wire_1(shape)` |
| `Cannot call X due to unbound types: Y` | A class or dependency was not included in the custom opencascade.js build |
| `null function or function signature mismatch` | Wrong constructor overload number — e.g. `MakeEdge_1` vs `MakeEdge_3` |
| `Runtime error: index out of bounds` | Emscripten WASM memory access violation — usually a deleted object being accessed |
| `Aborted(OOM)` | WASM heap out of memory — shapes accumulating without `.delete()` calls |

---

## Part 6 — Quick Diagnostic Code for OCCWorker.ts

```typescript
// Paste this into OCCWorker.ts — wraps any OCC call and returns a readable error

function safeOCC<T>(oc: any, label: string, fn: () => T): T {
  try {
    return fn()
  } catch (e: unknown) {
    throw new Error(decodeOCCError(oc, label, e))
  }
}

function decodeOCCError(oc: any, label: string, e: unknown): string {
  // Case 1: C++ exception — large integer is WASM heap address
  if (typeof e === 'number') {
    try {
      const [type, msg] = oc.getExceptionMessage(e)
      return `[${label}] ${type}${msg ? ': ' + msg : ''}`
    } catch {
      return `[${label}] WASM C++ exception at address 0x${e.toString(16)} (${e})`
    }
  }
  // Case 2: JS / Embind string error
  if (typeof e === 'string') return `[${label}] Binding error: ${e}`
  if (e instanceof Error)    return `[${label}] ${e.message}`
  return `[${label}] Unknown error: ${String(e)}`
}

// Usage:
const face = safeOCC(oc, 'MakeFace', () => {
  const maker = new oc.BRepBuilderAPI_MakeFace_2(wire)
  if (!maker.IsDone()) {
    const code = maker.Error()   // BRepBuilderAPI_FaceError integer
    const names = ['FaceDone','NoFace','NotPlanar','CurveProjectionFailed','ParametersOutOfRange']
    maker.delete()
    throw new Error(`MakeFace failed: ${names[code] ?? code}`)
  }
  return maker.Face()
})
```

---

## Summary: Which error to check for each operation

| Operation | Check | Error enum |
|---|---|---|
| `BRepBuilderAPI_MakeEdge` | `.IsDone()` then `.Error()` | `BRepBuilderAPI_EdgeError` (0–6) |
| `BRepBuilderAPI_MakeWire` | `.IsDone()` then `.Error()` | `BRepBuilderAPI_WireError` (0–3) |
| `BRepBuilderAPI_MakeFace` | `.IsDone()` then `.Error()` | `BRepBuilderAPI_FaceError` (0–4) |
| `BRepBuilderAPI_MakeShell` | `.IsDone()` then `.Error()` | `BRepBuilderAPI_ShellError` (0–3) |
| `BRepOffsetAPI_MakePipe` | `.IsDone()` then `.ErrorOnSurface()` | `BRepBuilderAPI_PipeError` (0–3) |
| `BRepOffsetAPI_MakeThickSolid` | `.IsDone()` then `.Error()` | `BRepOffset_Error` (0–5) |
| `BRepPrimAPI_MakePrism` | `.IsDone()` | throws `StdFail_NotDone` if false |
| `BRepPrimAPI_MakeRevol` | `.IsDone()` | throws `StdFail_NotDone` if false |
| `BRepFilletAPI_MakeFillet` | `.IsDone()` + `NbFaultyContours()` | throws on `.Build()` — wrap in try/catch |
| `BRepFilletAPI_MakeChamfer` | `.IsDone()` + `NbFaultyContours()` | throws on `.Build()` — wrap in try/catch |
| `BRepAlgoAPI_Fuse/Cut/Common` | `.HasErrors()` then `.GetReport()` | `BOPAlgo_Alert*` string keys |
| Any shape validation | `BRepCheck_Analyzer.IsValid()` | `BRepCheck_Status` (0–27) |
