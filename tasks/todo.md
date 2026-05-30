# Goal: Parametric Features for Boolean & B-Rep Solids

## 1. Core Model & Timeline Support
- [x] Implement `baseBrepSnapshot` tracking and getter/setter for `brepSnapshot` in `src/core/model/Solid3D.ts`.
- [x] Automatically generate the base B-Rep node (`primitiveType: "brep"`) in `ensureFeaturesFromCreationParams` when `brepSnapshot` is set on a solid that lacks standard `creationParams`.

## 2. DB Serialization
- [x] Implement browser-safe Base64 conversion helpers in `src/core/persistence/EntitySerializer.ts`.
- [x] Serialize `baseBrepSnapshot` as Base64 JSON inside `serializeData`.
- [x] Deserialize `baseBrepSnapshot` from the payload in `deserialize` and re-assign it to loaded solids.

## 3. Re-evaluation Engine
- [x] Support importing `"brep"` primitive base feature shapes from `baseBrepSnapshot` inside `src/core/engine/Solid3DReevaluator.ts`.

## 4. DXF Import & Export Portability
- [x] Write `baseBrepSnapshot` as Base64 to DXF XDATA in `src/core/io/dxfExport.ts`.
- [x] Read and decode `baseBrepSnapshot` from DXF XDATA in `src/core/io/dxfImport.ts`.

## 5. Verification & Build
- [x] Run full Vitest unit tests (`npm test`) — 302/303 pass. 1 pre-existing GCS drag test unrelated to this feature.
- [x] Run production build (`npm run build`) — builds successfully.
- [ ] User to perform interactive browser tests: Boolean union/subtract, add fillet/chamfer to boolean result, save/reload from DXF, and verify the whole parametric pipeline.

## Known Pre-Existing Issues (Out of Scope)
- `GCS.test.ts` — `WhereDraggedConstraint` solver divergence (numerical, not wired to UI yet)
- `SvgImporter.test.ts` — Missing `jsdom` package in test env
