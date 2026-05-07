# WebCAD Tasks

## Todo (Phase 7 — Engineering Drafting & Annotation)

### Phase A (Critical Engineering Foundation)
- [ ] Implement DIMLINEAR command (Linear dimensions) <!-- id: 21 -->
- [ ] Implement DIMALIGNED command (Aligned dimensions) <!-- id: 22 -->
- [ ] Implement Intersection and Perpendicular snaps <!-- id: 25 -->
- [ ] Support unit suffixes in coordinate parser (e.g., "10mm", "5'") <!-- id: 26 -->

### Phase B (Advanced Drafting & Refinement)
- [ ] Implement CHAMFER command <!-- id: 20 -->
- [x] Implement DIMRADIUS and DIMANGULAR commands <!-- id: 27 -->
- [ ] Implement RECTANG command (wrapper for Polyline) <!-- id: 28 -->
- [ ] Implement DONUT command <!-- id: 23 -->
- [ ] Implement BREAK and JOIN commands <!-- id: 29 -->

### Phase C (Polish & Specialized Tools)
- [ ] Implement Annotation Styles (DimStyle) <!-- id: 30 -->
- [ ] Implement ELLIPSE command <!-- id: 24 -->
- [ ] Implement LENGTHEN command <!-- id: 31 -->
- [ ] Implement Tangent and Nearest snaps <!-- id: 32 -->

## Ongoing
- [ ] Phase 7: Functional parity with AutoCAD 2.6 drafting capabilities.


## Done
- [x] Implement GRID snap and toggle (F7) <!-- id: 11 -->
- [x] Implement ORTHO mode and toggle (F8) <!-- id: 12 -->
- [x] Implement TRIM and EXTEND commands <!-- id: 10 -->
- [x] Implement OFFSET command <!-- id: 4 -->
- [x] Implement ARRAY command <!-- id: 5 -->
- [x] Implement ASCII DXF R12 Export <!-- id: 2 -->
- [x] Implement DXF Import parser <!-- id: 13 -->
- [x] Implement LineType (LTYPE) support for layers and rendering <!-- id: 17 -->
- [x] Add direct layer management commands (New, Set, On/Off, etc.) to the `LAYERS` side menu <!-- id: 16 -->
- [x] Implement Snap Engine (Endpoint, Midpoint, Center) <!-- id: 1 -->
- [x] Restore solid technical text rendering with `osifont` <!-- id: 14 -->
- [x] Use `osifont.ttf` (ISO 3098) as default technical font <!-- id: 15 -->
- [x] Fix failing `PolylineCommand` test (AssertionError in `getPreview`) <!-- id: 0 -->
- [x] Fix "always green" entity bug by correcting `setHighlight` and `aciToRgb` mapping <!-- id: 8 -->
- [x] Constrain EDIT commands to current layer in `App.ts` <!-- id: 9 -->
- [x] Implement ROTATE and SCALE commands <!-- id: 6 -->
- [x] Standardize dynamic prompts <!-- id: 7 -->
- [x] Implement MIRROR command <!-- id: 3 -->
- [x] Implement DIMRADIUS and DIMANGULAR commands <!-- id: 27 -->
