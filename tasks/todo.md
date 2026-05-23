# Goal: Parametric Features for Boolean & B-Rep Solids

## 1. Core Model & Timeline Support
- [ ] Implement `baseBrepSnapshot` tracking and getter/setter for `brepSnapshot` in `src/core/model/Solid3D.ts`.
- [ ] Automatically generate the base B-Rep node (`primitiveType: "brep"`) in `ensureFeaturesFromCreationParams` when `brepSnapshot` is set on a solid that lacks standard `creationParams`.

## 2. DB Serialization
- [ ] Implement browser-safe Base64 conversion helpers in `src/core/persistence/EntitySerializer.ts`.
- [ ] Serialize `baseBrepSnapshot` as Base64 JSON inside `serializeData`.
- [ ] Deserialize `baseBrepSnapshot` from the payload in `deserialize` and re-assign it to loaded solids.

## 3. Re-evaluation Engine
- [ ] Support importing `"brep"` primitive base feature shapes from `baseBrepSnapshot` inside `src/core/engine/Solid3DReevaluator.ts`.

## 4. DXF Import & Export Portability
- [ ] Write `baseBrepSnapshot` as Base64 to DXF XDATA in `src/core/io/dxfExport.ts`.
- [ ] Read and decode `baseBrepSnapshot` from DXF XDATA in `src/core/io/dxfImport.ts`.

## 5. Verification & Build
- [ ] Run full Vitest unit tests (`npm test`) to guarantee zero syntax or import regressions.
- [ ] Run production build (`npm run build`) to ensure successful compilation.
- [ ] Instruct the user to perform interactive browser tests: Boolean union/subtract, add fillet/chamfer to boolean result, save/reload from DXF, and verify that the whole parametric pipeline performs flawlessly.
