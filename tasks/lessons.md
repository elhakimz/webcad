# Lessons Learned: WebCAD 3D Stabilization

## 1. OpenCascade Memory Safety: The "Maker" Trap
**Pattern**: Any shape returned by a Maker (e.g., `BRepPrimAPI_MakeBox`) is a reference owned by that Maker. Deleting the Maker invalidates the shape immediately.
**Correction**: Always use a `detachShape` helper to create an independent copy BEFORE deleting the Maker.
```typescript
function detachShape(oc, shape) {
  const loc = new oc.TopLoc_Location_1();
  const copy = shape.Located(loc); // identity copy is high-performance
  loc.delete();
  return copy;
}
```

## 2. WebWorker Persistence: STEP vs BRep
**Pattern**: `BRepTools` can be unstable in some Emscripten builds due to string/binary encoding issues.
**Correction**: Use `STEPControl_Writer` and `STEPControl_Reader`. They are more robust and provide better interoperability. 

## 3. WASM Filesystem: Lazy Loading
**Pattern**: `reader.ReadFile(path)` only parses the file structure. The actual geometric data is streamed from the FS during `TransferRoots`.
**Correction**: NEVER `unlink` the temporary file immediately after `ReadFile`. Wait until the entire `TransferRoots` and `OneShape` sequence is complete.

## 4. Persistence Integrity Guards
**Pattern**: Failed exports often produce valid STEP headers but zero geometric data (approx 20-40 bytes).
**Correction**: Implement a minimum byte-length guard (e.g., `bytes.length > 50`) before saving to IndexedDB. This prevents a "corrupted session" from overwriting healthy historical data in the database.

## 5. Diagnostic Introspection
**Pattern**: WASM handles appear as `{}` in `console.log`.
**Correction**: Use specialized introspection helpers to log meaningful metadata:
```typescript
function shapeInfo(oc, shape) {
  const type = shape.ShapeType(); // Returns Enum value
  const isNull = shape.IsNull();
  // Count faces via TopExp_Explorer
  return `Type=${type} IsNull=${isNull} ...`;
}
```

## 6. Path Sensitivity in Emscripten FS
**Pattern**: Long or special-character paths in the virtual filesystem can cause silent failures in some OCC bindings.
**Correction**: Use simple, hardcoded paths for temporary operations (e.g., `/exp.step`, `/imp.step`) and clear them immediately after use.
