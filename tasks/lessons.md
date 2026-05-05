# WebCAD Lessons

- **Layer Constraints:** Constrain EDIT commands to the current layer by filtering selectable entities in the orchestration layer (`App.ts`). This prevents accidental modifications across layers.
- **Centralizing Logic:** Centralizing command classification (e.g., `isEditCommand` helper) in `App.ts` makes it easier to implement cross-cutting concerns like selection filters.
- **Highlighting Logic:** Never use a hardcoded fallback color (like `0x00ff00`) for non-highlighted objects in `setHighlight`. Only modify objects that are being highlighted or restored from a cached original color.
- **ACI Mapping:** Ensure all standard ACI colors (1-9) are mapped to RGB. Missing mappings for default colors (like ACI 7 White) can cause runtime crashes or incorrect rendering.
- **Preview Types:** `getPreview` return types must match test expectations and `Viewer` capabilities (e.g., returning a `Polyline` entity instead of a point list).
- **Interaction Consistency:** Standardized interaction flow for ROTATE and SCALE (Base Point -> Angle/Factor) improves UX consistency.
