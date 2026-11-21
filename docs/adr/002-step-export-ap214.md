# ADR-002: STEP export via STEPControl_Writer AP214 in native kernel

**Status:** Draft - pending human review  
**Date:** 2026-11-20  
**Epic:** WebCad Engine Container (WC-EC)  
**Author:** [pending]  
**Ticket:** WC-EC-25  

## Context

WebCAD's native OCCT 7.9.3 kernel (behind gRPC/Connect gateway) needs to export B-Rep shapes to STEP format for downstream CAD interoperability. The kernel currently supports B-Rep binary import/export via `BinTools::Read`/`BinTools::Write` (TKBin). STEP export requires `STEPControl_Writer` with AP214 schema (mechanical design).

Materializr (reference project, GPLv3 — source not copied) implements STEP export via `STEPControl_Writer`/`STEPControl_Reader` with `Interface_Static::SetCVal("write.step.schema", "AP214")` in `src/io/StepIO.cpp:453`. WebCAD uses upstream OCCT directly under OCCT's LGPL-2.1 + Open CASCADE Exception license.

## Decision

Add a `StepExportOp` to `ExecuteRequest`'s `oneof op` in `engine.proto`. The kernel worker implements `HandleStepExport` using OCCT `STEPControl_Writer`:

- `Interface_Static::SetCVal("write.step.schema", "AP214")` for mechanical design schema
- `STEPControl_Writer::Transfer()` + `STEPControl_Writer::Write()` to produce `.stp` bytes
- Large STEP output (> 16 MiB inline limit) delivered via `StreamResult` or object-store link
- `BrepReference.format = FORMAT_STEP` in the response

Y-up → Z-up rotation (if needed) handled via `BRepBuilderAPI_Transform`, consistent with materializr's approach.

## Proto Change

Add to `engine.proto` `ExecuteRequest.oneof op`:
```proto
StepExportOp step_export = 37;
```

New message:
```proto
message StepExportOp {
  string entity_id = 1;
}
```

The response carries `BrepReference` with `format = FORMAT_STEP` and `data` containing the STEP bytes (when `include_brep=true`).

## Rejected Alternatives

### Extend ExportBRepOp with format field
Rejected. STEP export is semantically distinct from B-rep binary export: different OCCT writer class, different file extension (`.stp` vs `.brep`), different delivery path (StreamResult for large files). Mixing concerns into one operation reduces clarity.

### Use StlAPI_Writer for STEP
Rejected. `StlAPI_Writer` writes STL, not STEP. STEP requires `STEPControl_Writer`.

### Skip proto change; hardcode STEP in ExportBRepOp
Rejected. Violates the principle that proto is the single source of truth; gRPC clients need explicit operation discovery via `supported_operations` in `OpenSessionResponse`.

## Trade-offs and Revisit Triggers

- STEP export adds `TKDESTEP` (already linked) and `TKSTEP`/`TKSTEPAttr` dependencies to the kernel build image
- Large STEP files may exceed the 16 MiB gRPC message cap; `StreamResult` chunking or object-store link required
- AP214 schema includes color/layer metadata; verify browser-side consumers handle it gracefully
- Revisit if STEP import is also required (would add `STEPControl_Reader` + `StepExportOp` counterpart `StepImportOp`)

## Open Questions

- Large STEP delivery: StreamResult chunks vs object-store presigned URL (tied to WC-EC-33 benchmark)
- AP214 vs AP203 vs AP242 schema selection — AP214 chosen for mechanical design; revisit if architectural/MEP use cases arise

## Review Resolution

(None yet — initial draft)