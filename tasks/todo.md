# WebCAD Tasks

## Ongoing

## Todo (Phase 2 & 3 Refinement)
- [ ] Implement TRIM and EXTEND commands <!-- id: 10 -->
- [ ] Implement GRID snap and toggle (F7) <!-- id: 11 -->
- [ ] Implement ORTHO mode and toggle (F8) <!-- id: 12 -->

## Todo (Phase 4 — File System)
- [ ] Implement ASCII DXF R12 Export <!-- id: 2 -->
- [ ] Implement DXF Import parser <!-- id: 13 -->

## Todo (General Commands)
- [ ] Implement OFFSET command <!-- id: 4 -->
- [ ] Implement ARRAY command <!-- id: 5 -->

## Done
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
