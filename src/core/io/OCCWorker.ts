import { initOpenCascade } from "opencascade.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let oc: any = null;
const shapeCache = new Map<string, any>();

function cacheShape(entityId: string, shape: any) {
  if (shapeCache.has(entityId)) {
    const oldShape = shapeCache.get(entityId);
    if (oldShape && !oldShape.IsNull()) {
      oldShape.delete();
    }
  }

  // Use the robust detachShape helper to ensure the cached shape is independent
  const copy = detachShape(oc, shape);
  shapeCache.set(entityId, copy);
}

function releaseShape(entityId: string) {
  if (shapeCache.has(entityId)) {
    const shape = shapeCache.get(entityId);
    if (shape && !shape.IsNull()) {
      try { shape.delete(); } catch (_) { }
    }
    shapeCache.delete(entityId);
  }
}

function decodeOCCError(label: string, e: unknown): string {
  if (typeof e === 'number') {
    try {
      const [type, msg] = oc.getExceptionMessage(e);
      return `[${label}] ${type}${msg ? ': ' + msg : ''}`;
    } catch {
      return `[${label}] WASM C++ exception at address 0x${e.toString(16)} (${e})`;
    }
  }
  if (typeof e === 'string') return `[${label}] Binding error: ${e}`;
  if (e instanceof Error) return `[${label}] ${e.message}`;
  return `[${label}] Unknown error: ${String(e)}`;
}

function applyRotation(shape: any, rot: { x: number, y: number, z: number }, oc: any, center?: { x: number, y: number, z: number }) {
  if (!rot || (rot.x === 0 && rot.y === 0 && rot.z === 0)) return shape;

  const transform = new oc.gp_Trsf_1();

  // 1. Translate to origin
  const toOrigin = new oc.gp_Trsf_1();
  const centerPt = center ? center : { x: 0, y: 0, z: 0 };
  const vecToOrigin = new oc.gp_Vec_4(-centerPt.x, -centerPt.y, -centerPt.z);
  toOrigin.SetTranslation_1(vecToOrigin);

  // 2. Rotate around origin
  const rotTrsf = new oc.gp_Trsf_1();

  const rotX = new oc.gp_Trsf_1();
  const originPnt = new oc.gp_Pnt_3(0, 0, 0);
  const dirX = new oc.gp_Dir_4(1, 0, 0);
  const axX = new oc.gp_Ax1_2(originPnt, dirX);
  rotX.SetRotation_1(axX, rot.x);
  axX.delete();
  dirX.delete();

  const rotY = new oc.gp_Trsf_1();
  const dirY = new oc.gp_Dir_4(0, 1, 0);
  const axY = new oc.gp_Ax1_2(originPnt, dirY);
  rotY.SetRotation_1(axY, rot.y);
  axY.delete();
  dirY.delete();

  const rotZ = new oc.gp_Trsf_1();
  const dirZ = new oc.gp_Dir_4(0, 0, 1);
  const axZ = new oc.gp_Ax1_2(originPnt, dirZ);
  rotZ.SetRotation_1(axZ, rot.z);
  axZ.delete();
  dirZ.delete();

  rotTrsf.Multiply(rotZ);
  rotTrsf.Multiply(rotY);
  rotTrsf.Multiply(rotX);

  // 3. Translate back
  const toBack = new oc.gp_Trsf_1();
  const vecToBack = new oc.gp_Vec_4(centerPt.x, centerPt.y, centerPt.z);
  toBack.SetTranslation_1(vecToBack);

  // Combine: toBack * rotTrsf * toOrigin
  transform.Multiply(toBack);
  transform.Multiply(rotTrsf);
  transform.Multiply(toOrigin);

  const brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
  const newShape = brepTransform.Shape();

  // Cleanup
  vecToOrigin.delete();
  toOrigin.delete();
  originPnt.delete();
  rotX.delete();
  rotY.delete();
  rotZ.delete();
  rotTrsf.delete();
  vecToBack.delete();
  toBack.delete();
  transform.delete();
  brepTransform.delete();

  return newShape;
}

function createSewing(oc: any, tolerance: number = 1e-4): any {
  if (oc.BRepBuilderAPI_Sewing) {
    try {
      return new oc.BRepBuilderAPI_Sewing(tolerance, true, true, false, true);
    } catch (_) {}
    try {
      return new oc.BRepBuilderAPI_Sewing(tolerance, true, true, false);
    } catch (_) {}
    try {
      return new oc.BRepBuilderAPI_Sewing(tolerance);
    } catch (_) {}
    try {
      return new oc.BRepBuilderAPI_Sewing();
    } catch (_) {}
  }
  if (oc.BRepOffsetAPI_Sewing_2) {
    return new oc.BRepOffsetAPI_Sewing_2(tolerance);
  }
  if (oc.BRepOffsetAPI_Sewing_1) {
    const s = new oc.BRepOffsetAPI_Sewing_1();
    if (s.SetTolerance) {
      s.SetTolerance(tolerance);
    }
    return s;
  }
  if (oc.BRepBuilderAPI_Sewing_2) {
    return new oc.BRepBuilderAPI_Sewing_2(tolerance);
  }
  if (oc.BRepBuilderAPI_Sewing_1) {
    const s = new oc.BRepBuilderAPI_Sewing_1();
    if (s.SetTolerance) {
      s.SetTolerance(tolerance);
    }
    return s;
  }
  throw new Error("No accessible sewing constructor found in OpenCascade bindings.");
}

function configureBooleanOp(op: any) {
  if (!op) return;

  if (op.SetFuzzyValue) {
    op.SetFuzzyValue(1e-6);
  }
  if (op.SetRunParallel) {
    op.SetRunParallel(false);
  }
  if (op.SetCheckInverted) {
    op.SetCheckInverted(true);
  }
  if (op.SetNonDestructive) {
    op.SetNonDestructive(false);
  }
}

let STEP_Writer_Ctor: any = null;
let STEP_Reader_Ctor: any = null;

function findStepConstructors(oc: any) {
  // Find Writer
  for (const k of ['STEPControl_Writer_1', 'STEPControl_Writer', 'STEPControl_Writer_2']) {
    if (typeof oc[k] !== 'function') continue;
    try {
      const t = new oc[k]();
      t.delete();
      STEP_Writer_Ctor = oc[k];
      self.postMessage({ type: 'log', message: `[Worker] Found working Writer: ${k}` });
      break;
    } catch (_) { }
  }

  // Find Reader
  for (const k of ['STEPControl_Reader_1', 'STEPControl_Reader', 'STEPControl_Reader_2']) {
    if (typeof oc[k] !== 'function') continue;
    try {
      const t = new oc[k]();
      t.delete();
      STEP_Reader_Ctor = oc[k];
      self.postMessage({ type: 'log', message: `[Worker] Found working Reader: ${k}` });
      break;
    } catch (_) { }
  }

  if (!STEP_Writer_Ctor || !STEP_Reader_Ctor) {
    self.postMessage({ type: 'log', message: '[Worker] WARNING: Could not find working STEP constructors.' });
  }
}

// ─── shape copy helper — call this on every maker.Shape() result ──────────
function detachShape(oc: any, shape: any): any {
  // Primary: Located(identity)
  try {
    const loc = new (oc.TopLoc_Location_1 || oc.TopLoc_Location)();
    const copy = shape.Located(loc);
    loc.delete();
    return copy;
  } catch (_) { }

  // Fallback A: BRepBuilderAPI_Copy
  try {
    const copier = new (oc.BRepBuilderAPI_Copy_2 || oc.BRepBuilderAPI_Copy_1 || oc.BRepBuilderAPI_Copy)(shape, true, false);
    const copy = copier.Shape();
    copier.delete();
    return copy;
  } catch (_) { }

  // Fallback B: wrap in a compound
  try {
    const builder = new oc.BRep_Builder();
    const compound = new oc.TopoDS_Compound();
    builder.MakeCompound(compound);
    builder.Add(compound, shape);
    builder.delete();
    return compound;
  } catch (_) { }

  // Fallback C: original reference
  console.warn('[Worker] detachShape: all copy strategies failed, using original reference');
  return shape;
}

function shapeInfo(oc: any, shape: any): string {
  if (!shape) return 'null';
  try {
    const TYPE_NAMES = [
      'COMPOUND', 'COMPSOLID', 'SOLID', 'SHELL',
      'FACE', 'WIRE', 'EDGE', 'VERTEX', 'SHAPE'
    ];
    const isNull = shape.IsNull();
    const typeVal = shape.ShapeType()?.value ?? shape.ShapeType();
    const typeName = TYPE_NAMES[typeVal] ?? `unknown(${typeVal})`;

    // Count faces via explorer
    let faceCount = 0;
    try {
      const exp = new oc.TopExp_Explorer_2(
        shape,
        oc.TopAbs_ShapeEnum.TopAbs_FACE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
      );
      while (exp.More()) { faceCount++; exp.Next(); }
      exp.delete();
    } catch (_) { faceCount = -1; }

    return `ShapeType=${typeName} IsNull=${isNull} faces=${faceCount}`;
  } catch (e: any) {
    return `[shapeInfo error]`;
  }
}


function exportShapeToBytes(oc: any, shape: any, entityId: string): Uint8Array | undefined {
  if (!oc || !shape || shape.IsNull()) return undefined;

  const path = `/exp.step`;

  try {
    const WriterCtor = STEP_Writer_Ctor || oc.STEPControl_Writer_1 || oc.STEPControl_Writer;
    if (!WriterCtor) {
      throw new Error("No STEPControl_Writer constructor found");
    }

    const writer = new WriterCtor();

    const transferStatus = writer.Transfer(shape, 0, true);
    const writeResult = writer.Write(path);
    writer.delete();

    if (!oc.FS.analyzePath(path).exists) {
      throw new Error(`STEP write produced no file (Transfer=${transferStatus?.value ?? transferStatus}, Write=${writeResult?.value ?? writeResult})`);
    }

    const bytes = oc.FS.readFile(path) as Uint8Array;
    try { oc.FS.unlink(path); } catch (_) { }

    self.postMessage({ type: 'log', message: `[Worker] Export SUCCESS for ${entityId}: ${shapeInfo(oc, shape)} (${bytes.length} bytes)` });
    return bytes;
  } catch (e: any) {
    self.postMessage({ type: 'log', message: `[Worker] STEP export failed for ${entityId}: ${e.message}` });
  }

  return undefined;
}

function importShapeFromBytes(oc: any, entityId: string, bytes: Uint8Array): any {
  const path = `/imp.step`;
  try { oc.FS.unlink(path); } catch (_) { }
  oc.FS.writeFile(path, new Uint8Array(bytes));

  try {
    const ReaderCtor = STEP_Reader_Ctor || oc.STEPControl_Reader_1 || oc.STEPControl_Reader;
    if (!ReaderCtor) throw new Error('No STEPControl_Reader constructor found');

    const reader = new ReaderCtor();
    const readStatus = reader.ReadFile(path);
    const readVal = readStatus?.value ?? readStatus;

    const nbRoots = reader.NbRootsForTransfer();

    if (nbRoots === 0) {
      try { oc.FS.unlink(path); } catch (_) { }
      reader.delete();
      throw new Error(`STEP file has no transferable roots for ${entityId} (ReadStatus=${readVal}, bytes=${bytes.length})`);
    }

    // TransferRoots may or may not accept args depending on build
    try {
      reader.TransferRoots();
    } catch (_) {
      for (let i = 1; i <= nbRoots; i++) {
        try { reader.TransferRoot(i); } catch (e2) { }
      }
    }

    const shape = reader.OneShape();
    reader.delete();
    try { oc.FS.unlink(path); } catch (_) { }

    if (!shape || (shape.IsNull && shape.IsNull())) {
      throw new Error(`STEP import produced null shape for ${entityId}`);
    }

    return shape;
  } catch (e: any) {
    try { oc.FS.unlink(path); } catch (_) { }
    throw e;
  }
}

self.onmessage = async (e) => {
  const { type, payload, id } = e.data;

  if (type === 'init') {
    if (!oc) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        oc = await (initOpenCascade as any)();
        (self as any).oc = oc;

        // Discover working STEP constructors
        findStepConstructors(oc);

        try {
          // 1. Sanity Check for oc.FS
          if (oc && oc.FS) {
            const testFile = "/fs_test.txt";
            const testData = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
            oc.FS.writeFile(testFile, testData);
            const readData = oc.FS.readFile(testFile);
            oc.FS.unlink(testFile);
            if (readData[0] === 72) {
              self.postMessage({ type: 'log', message: '[Worker] Virtual FS (oc.FS) is functional.' });
            }
          }

          self.postMessage({ type: 'init', success: true, id });
        } catch (error: any) {
          self.postMessage({ type: 'init', success: false, error: error.message, id });
        }
      } catch (error: any) {
        self.postMessage({ type: 'init', success: false, error: error.message, id });
      }
    } else {
      self.postMessage({ type: 'init', success: true, id });
    }
  } else if (type === 'clearCache') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    try {
      for (const shape of shapeCache.values()) {
        shape.delete();
      }
      shapeCache.clear();
      self.postMessage({ type: 'clearCache', success: true, id });
    } catch (error: any) {
      self.postMessage({ type: 'clearCache', success: false, error: error.message, id });
    }
  } else if (type === 'createBox') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { x, y, z, dx, dy, dz, deflection, entityId } = payload;
    try {
      // ✅ Use robust "create at origin then translate" approach
      const maker = new oc.BRepPrimAPI_MakeBox_1(dx, dy, dz);
      let shape = maker.Shape();

      let translation: any = null;
      let transform: any = null;
      let brepTransform: any = null;

      if (x !== 0 || y !== 0 || z !== 0) {
        translation = new oc.gp_Vec_4(x, y, z);
        transform = new oc.gp_Trsf_1();
        transform.SetTranslation_1(translation);
        brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
        const transformedShape = brepTransform.Shape();
        shape = detachShape(oc, transformedShape);
      } else {
        shape = detachShape(oc, shape);
      }

      // Update cache
      cacheShape(entityId, shape);

      // Export BRep Bytes inline
      const brepBytes = exportShapeToBytes(oc, shape, entityId);

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(shape, oc, deflection || 0.1);

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      // Cleanup
      if (translation) translation.delete();
      if (transform) transform.delete();
      if (brepTransform) brepTransform.delete();
      maker.delete();

      self.postMessage({ type: 'createBox', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = decodeOCCError('createBox', error);
      self.postMessage({ type: 'createBox', success: false, error: errorMessage, id });
    }
  } else if (type === 'filletSolid') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { entityId, edgeIndex, radius, deflection } = payload;
    try {
      if (!shapeCache.has(entityId)) {
        throw new Error(`Shape not found for entity: ${entityId}`);
      }
      const shape = shapeCache.get(entityId);

      // Find the edge by index
      let foundEdge: any = null;
      let currentIndex = 0;
      const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      while (explorer.More()) {
        if (currentIndex === edgeIndex) {
          foundEdge = oc.TopoDS.Edge_1(explorer.Current());
          break;
        }
        currentIndex++;
        explorer.Next();
      }
      explorer.delete();

      if (!foundEdge) {
        throw new Error(`Edge index ${edgeIndex} not found in shape.`);
      }

      // Perform fillet
      const fillet = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
      fillet.Add_2(radius, foundEdge);
      const newShape = detachShape(oc, fillet.Shape());

      foundEdge.delete();

      // Update cache
      cacheShape(entityId, newShape);

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(newShape, oc, deflection);

      // Export BRep Bytes
      const brepBytes = exportShapeToBytes(oc, newShape, entityId);

      fillet.delete();

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      self.postMessage({ type: 'filletSolid', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'filletSolid', success: false, error: errorMessage, id });
    }
  } else if (type === 'chamferSolid') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { entityId, edgeIndex, radius: distance, deflection } = payload;
    try {
      if (!shapeCache.has(entityId)) {
        throw new Error(`Shape not found for entity: ${entityId}`);
      }
      const shape = shapeCache.get(entityId);

      // Find the edge by index
      let foundEdge: any = null;
      let currentIndex = 0;
      const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      while (explorer.More()) {
        if (currentIndex === edgeIndex) {
          foundEdge = oc.TopoDS.Edge_1(explorer.Current());
          break;
        }
        currentIndex++;
        explorer.Next();
      }
      explorer.delete();

      if (!foundEdge) {
        throw new Error(`Edge index ${edgeIndex} not found in shape.`);
      }

      // Perform chamfer
      const chamfer = new oc.BRepFilletAPI_MakeChamfer(shape);
      // Try Add_2 first, or Add if it fails. In OpenCascade.js, overloads are often numbered.
      try {
        chamfer.Add_2(distance, foundEdge);
      } catch (e) {
        chamfer.Add(distance, foundEdge);
      }
      const newShape = detachShape(oc, chamfer.Shape());

      foundEdge.delete();

      // Update cache
      cacheShape(entityId, newShape);

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(newShape, oc, deflection);

      // Export BRep Bytes
      const brepBytes = exportShapeToBytes(oc, newShape, entityId);

      chamfer.delete();

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      self.postMessage({ type: 'chamferSolid', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'chamferSolid', success: false, error: errorMessage, id });
    }
  } else if (type === 'filletSolidFace') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { entityId, faceIndex, radius, deflection } = payload;
    try {
      if (!shapeCache.has(entityId)) {
        throw new Error(`Shape not found for entity: ${entityId}`);
      }
      const shape = shapeCache.get(entityId);

      // Find the face by index
      let foundFace: any = null;
      let currentIndex = 0;
      const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      while (explorer.More()) {
        if (currentIndex === faceIndex) {
          foundFace = oc.TopoDS.Face_1(explorer.Current());
          break;
        }
        currentIndex++;
        explorer.Next();
      }
      explorer.delete();

      if (!foundFace) {
        throw new Error(`Face index ${faceIndex} not found in shape.`);
      }

      const fillet = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);

      // Explore edges of the face
      const edgeExplorer = new oc.TopExp_Explorer_2(foundFace, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      let edgesAdded = 0;
      while (edgeExplorer.More()) {
        const edge = oc.TopoDS.Edge_1(edgeExplorer.Current());
        fillet.Add_2(radius, edge);
        edge.delete();
        edgesAdded++;
        edgeExplorer.Next();
      }
      edgeExplorer.delete();
      foundFace.delete();

      if (edgesAdded === 0) {
        throw new Error(`No edges found for face ${faceIndex}.`);
      }

      const newShape = detachShape(oc, fillet.Shape());

      // Update cache
      cacheShape(entityId, newShape);

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(newShape, oc, deflection);

      // Export BRep Bytes
      const brepBytes = exportShapeToBytes(oc, newShape, entityId);

      fillet.delete();

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      self.postMessage({ type: 'filletSolidFace', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'filletSolidFace', success: false, error: errorMessage, id });
    }
  } else if (type === 'makeThickSolid') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { entityId, faceIndices, thickness, deflection, removeFaces } = payload;
    try {
      if (!shapeCache.has(entityId)) {
        throw new Error(`Shape not found for entity: ${entityId}`);
      }
      const shape = shapeCache.get(entityId);

      let newShape: any = null;
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      let sumX = 0, sumY = 0, sumZ = 0;
      let nodeCount = 0;

      // Ensure the shape is triangulated so we can find mesh nodes (required for analytical shapes like cylinders)
      const linearDeflection = deflection || 0.1;
      const mesher = new oc.BRepMesh_IncrementalMesh_2(shape, linearDeflection, false, 0.5, false);

      const progress = (oc.Message_ProgressRange_1 && typeof oc.Message_ProgressRange_1 === 'function') ? new oc.Message_ProgressRange_1() : null;
      if (progress) {
        mesher.Perform(progress);
      } else {
        (mesher as any).Perform();
      }

      if (mesher.IsDone && !mesher.IsDone()) {
        console.warn("[OCC] Meshing for center calculation might be incomplete.");
      }

      if (progress) progress.delete();
      mesher.delete();

      // Iterate over faces to find center and bounding box via triangulation
      const faceExplorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      while (faceExplorer.More()) {
        const face = oc.TopoDS.Face_1(faceExplorer.Current());
        const loc = new oc.TopLoc_Location_1();
        const triangulation = oc.BRep_Tool.Triangulation(face, loc);
        if (!triangulation.IsNull()) {
          const tri = triangulation.get();
          const nbNodes = tri.NbNodes();
          for (let i = 1; i <= nbNodes; i++) {
            const p = tri.Node(i);
            const x = p.X();
            const y = p.Y();
            const z = p.Z();

            sumX += x; sumY += y; sumZ += z;
            nodeCount++;

            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
            p.delete();
          }
        }
        loc.delete();
        face.delete();
        faceExplorer.Next();
      }
      faceExplorer.delete();

      if (nodeCount === 0) {
        throw new Error("Could not compute shape center for hollowing (no mesh nodes found).");
      }

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const centerZ = (minZ + maxZ) / 2;

      const sizeX = maxX - minX;
      const sizeY = maxY - minY;
      const sizeZ = maxZ - minZ;
      const maxSize = Math.max(sizeX, sizeY, sizeZ);

      // Calculate scale factor: (size - 2*thickness) / size
      const targetThickness = Math.abs(thickness);
      let scaleFactor = (maxSize - 2 * targetThickness) / maxSize;
      if (scaleFactor <= 0.1) scaleFactor = 0.95; // Fallback to 5% shell if thickness is too large

      // Create scaled clone
      const trsf = new oc.gp_Trsf_1();
      const centerPnt = new oc.gp_Pnt_3(centerX, centerY, centerZ);
      trsf.SetScale(centerPnt, scaleFactor);

      const transformer = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
      const scaledShape = transformer.Shape();

      // Perform Boolean Cut
      const cutter = new oc.BRepAlgoAPI_Cut_3(shape, scaledShape);
      configureBooleanOp(cutter);
      cutter.Build();

      if (!cutter.IsDone()) {
        cutter.delete();
        throw new Error(`Boolean cut failed for shell`);
      }

      newShape = cutter.Shape();
      const initialShellShape = newShape;

      // [SIGNED PORTION: DO NOT CHANGE WITHOUT REQUEST]
      // Stable face removal for shell (Supports Box, Cylinder, Polylines, and Polygons).
      // NO CHANGES ALLOWED UNLESS EXPLICITLY ASKED.
      if (removeFaces && faceIndices && faceIndices.length > 0) {
        const indicesSet = new Set(faceIndices);
        let currentIndex = 0;

        let nbFaces = 0;
        const countExp = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
        while (countExp.More()) { nbFaces++; countExp.Next(); }
        countExp.delete();

        const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);

        while (explorer.More()) {
          if (indicesSet.has(currentIndex)) {
            const face = oc.TopoDS.Face_1(explorer.Current());

            // Calculate face center and bounding box
            let fSumX = 0, fSumY = 0, fSumZ = 0;
            let fNodeCount = 0;
            let fMinX = Infinity, fMinY = Infinity, fMinZ = Infinity;
            let fMaxX = -Infinity, fMaxY = -Infinity, fMaxZ = -Infinity;

            const innerLoc = new oc.TopLoc_Location_1();
            const triangulation = oc.BRep_Tool.Triangulation(face, innerLoc);

            if (!triangulation.IsNull()) {
              const tri = triangulation.get();
              const nbNodes = tri.NbNodes();
              for (let i = 1; i <= nbNodes; i++) {
                const p = tri.Node(i);
                const x = p.X(), y = p.Y(), z = p.Z();
                fSumX += x; fSumY += y; fSumZ += z;
                fMinX = Math.min(fMinX, x); fMaxX = Math.max(fMaxX, x);
                fMinY = Math.min(fMinY, y); fMaxY = Math.max(fMaxY, y);
                fMinZ = Math.min(fMinZ, z); fMaxZ = Math.max(fMaxZ, z);
                fNodeCount++;
                p.delete();
              }

              const fCenterX = fSumX / fNodeCount;
              const fCenterY = fSumY / fNodeCount;
              const fCenterZ = fSumZ / fNodeCount;

              // Vector from shape center to face center
              const dx = fCenterX - centerX;
              const dy = fCenterY - centerY;
              const dz = fCenterZ - centerZ;
              const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
              let nx = 0, ny = 0, nz = 1;
              if (len > 0.001) {
                nx = dx / len; ny = dy / len; nz = dz / len;
              }

              // Vector points INWARD (opposite to normal)
              // Make it VERY LONG (e.g., 20 times thickness) to ensure it reaches the cavity!
              const vec = new oc.gp_Vec_4(-nx * targetThickness * 20, -ny * targetThickness * 20, -nz * targetThickness * 20);

              let faceToExtrude = face;
              let faceTransformer: any = null;
              let faceTrsf: any = null;

              // For complex shapes like extruded polylines (more than 6 faces),
              // we scale the face DOWN slightly so the prism doesn't remove the side walls!
              if (nbFaces > 6) {
                const faceMaxSize = Math.max(fMaxX - fMinX, fMaxY - fMinY);
                let faceScale = (faceMaxSize - 2 * targetThickness) / faceMaxSize;
                if (faceScale <= 0.1) faceScale = 0.9;

                faceTrsf = new oc.gp_Trsf_1();
                const fCenterPnt = new oc.gp_Pnt_3(fCenterX, fCenterY, fCenterZ);
                faceTrsf.SetScale(fCenterPnt, faceScale);
                faceTransformer = new oc.BRepBuilderAPI_Transform_2(face, faceTrsf, true);
                faceToExtrude = faceTransformer.Shape();
                fCenterPnt.delete();
              }

              // Create prism from the face (scaled or unscaled)
              const prismBuilder = new oc.BRepPrimAPI_MakePrism_1(faceToExtrude, vec, false, true);
              if (prismBuilder.IsDone()) {
                const cuttingShape = prismBuilder.Shape();
                const faceCutter = new oc.BRepAlgoAPI_Cut_3(newShape, cuttingShape);
                configureBooleanOp(faceCutter);
                faceCutter.Build();

                if (faceCutter.IsDone()) {
                  const oldShape = newShape;
                  newShape = faceCutter.Shape();
                  // Delete intermediate shapes, but not the first one which is from the initial cutter
                  if (oldShape && oldShape !== initialShellShape) {
                    oldShape.delete();
                  }
                }
                faceCutter.delete();
                cuttingShape.delete();
              }
              prismBuilder.delete();
              if (faceTransformer) faceTransformer.delete();
              if (faceTrsf) faceTrsf.delete();
              vec.delete();
            }
            innerLoc.delete();
            face.delete();
          }
          currentIndex++;
          explorer.Next();
        }
        explorer.delete();
      }

      // Cleanup
      cutter.delete();
      transformer.delete();
      if (initialShellShape && initialShellShape !== newShape) {
        initialShellShape.delete();
      }
      scaledShape.delete();
      trsf.delete();
      centerPnt.delete();

      // Final detach
      const detached = detachShape(oc, newShape);
      newShape.delete();
      newShape = detached;

      // Update cache
      cacheShape(entityId, newShape);

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(newShape, oc, deflection);

      // Export BRep Bytes
      const brepBytes = exportShapeToBytes(oc, newShape, entityId);

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      self.postMessage({ type: 'makeThickSolid', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'makeThickSolid', success: false, error: errorMessage, id });
    }
  } else if (type === 'chamferSolidFace') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { entityId, faceIndex, radius: distance, deflection } = payload;
    try {
      if (!shapeCache.has(entityId)) {
        throw new Error(`Shape not found for entity: ${entityId}`);
      }
      const shape = shapeCache.get(entityId);

      // Find the face by index
      let foundFace: any = null;
      let currentIndex = 0;
      const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      while (explorer.More()) {
        if (currentIndex === faceIndex) {
          foundFace = oc.TopoDS.Face_1(explorer.Current());
          break;
        }
        currentIndex++;
        explorer.Next();
      }
      explorer.delete();

      if (!foundFace) {
        throw new Error(`Face index ${faceIndex} not found in shape.`);
      }

      const chamfer = new oc.BRepFilletAPI_MakeChamfer(shape);

      // Explore edges of the face
      const edgeExplorer = new oc.TopExp_Explorer_2(foundFace, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      let edgesAdded = 0;
      while (edgeExplorer.More()) {
        const edge = oc.TopoDS.Edge_1(edgeExplorer.Current());
        try {
          chamfer.Add_2(distance, edge);
        } catch (e) {
          chamfer.Add(distance, edge);
        }
        edge.delete();
        edgesAdded++;
        edgeExplorer.Next();
      }
      edgeExplorer.delete();
      foundFace.delete();

      if (edgesAdded === 0) {
        throw new Error(`No edges found for face ${faceIndex}.`);
      }

      const newShape = detachShape(oc, chamfer.Shape());

      // Update cache
      cacheShape(entityId, newShape);

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(newShape, oc, deflection);

      // Export BRep Bytes
      const brepBytes = exportShapeToBytes(oc, newShape, entityId);

      chamfer.delete();

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      self.postMessage({ type: 'chamferSolidFace', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'chamferSolidFace', success: false, error: errorMessage, id });
    }
  } else if (type === 'createCylinder') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { x, y, z, r, h, deflection, entityId } = payload;
    try {
      // Use constructor with radius and height and translate (most reliable overload)
      const cylinder = new oc.BRepPrimAPI_MakeCylinder_2(r, h, 2 * Math.PI);
      let shape = cylinder.Shape();

      let translation: any = null;
      let transform: any = null;
      let brepTransform: any = null;

      if (x !== 0 || y !== 0 || z !== 0) {
        translation = new oc.gp_Vec_4(x, y, z);
        transform = new oc.gp_Trsf_1();
        transform.SetTranslation_1(translation);
        brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
        shape = brepTransform.Shape();
      }

      shape = detachShape(oc, shape);

      if (entityId) {
        cacheShape(entityId, shape);
      }

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(shape, oc, deflection);
      const brepBytes = exportShapeToBytes(oc, shape, entityId);

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      // Cleanup at the very end
      if (translation) translation.delete();
      if (transform) transform.delete();
      if (brepTransform) brepTransform.delete();
      cylinder.delete();

      self.postMessage({ type: 'createCylinder', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'createCylinder', success: false, error: errorMessage, id });
    }
  } else if (type === 'createFrustum') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { x, y, z, r1, r2, h, deflection, entityId } = payload;
    try {
      let shape: any = null;
      let frustum: any = null;
      let cylinder: any = null;

      const R1 = Math.max(0, r1);
      const R2 = Math.max(0, r2);

      if (Math.abs(R1 - R2) < 1e-6) {
        // Equal radii -> Create standard cylinder to avoid MakeCone C++ domain exception
        cylinder = new oc.BRepPrimAPI_MakeCylinder_2(R1, h, 2 * Math.PI);
        shape = cylinder.Shape();
      } else {
        // Different radii -> Create cone frustum
        frustum = new oc.BRepPrimAPI_MakeCone_1(R1, R2, h);
        shape = frustum.Shape();
      }

      let translation: any = null;
      let transform: any = null;
      let brepTransform: any = null;

      if (x !== 0 || y !== 0 || z !== 0) {
        translation = new oc.gp_Vec_4(x, y, z);
        transform = new oc.gp_Trsf_1();
        transform.SetTranslation_1(translation);
        brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
        shape = brepTransform.Shape();
      }

      shape = detachShape(oc, shape);

      if (entityId) {
        cacheShape(entityId, shape);
      }

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(shape, oc, deflection);
      const brepBytes = exportShapeToBytes(oc, shape, entityId);

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      // Cleanup
      if (translation) translation.delete();
      if (transform) transform.delete();
      if (brepTransform) brepTransform.delete();
      if (frustum) frustum.delete();
      if (cylinder) cylinder.delete();

      self.postMessage({ type: 'createFrustum', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'createFrustum', success: false, error: errorMessage, id });
    }
  } else if (type === 'createSphere') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { x, y, z, r, deflection, entityId } = payload;
    try {
      // Use constructor with radius and translate (most reliable overload)
      const sphere = new oc.BRepPrimAPI_MakeSphere_1(r);
      let shape = sphere.Shape();

      let translation: any = null;
      let transform: any = null;
      let brepTransform: any = null;

      if (x !== 0 || y !== 0 || z !== 0) {
        translation = new oc.gp_Vec_4(x, y, z);
        transform = new oc.gp_Trsf_1();
        transform.SetTranslation_1(translation);
        brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
        shape = brepTransform.Shape();
      }

      shape = detachShape(oc, shape);

      if (entityId) {
        cacheShape(entityId, shape);
      }

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(shape, oc, deflection);
      const brepBytes = exportShapeToBytes(oc, shape, entityId);

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      // Cleanup at the very end
      if (translation) translation.delete();
      if (transform) transform.delete();
      if (brepTransform) brepTransform.delete();
      sphere.delete();

      self.postMessage({ type: 'createSphere', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'createSphere', success: false, error: errorMessage, id });
    }
  } else if (type === 'createCone') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { x, y, z, r, h, deflection, entityId } = payload;
    try {
      // Use constructor with radii and height and translate (most reliable overload)
      const cone = new oc.BRepPrimAPI_MakeCone_1(r, 0, h);
      let shape = cone.Shape();

      let translation: any = null;
      let transform: any = null;
      let brepTransform: any = null;

      if (x !== 0 || y !== 0 || z !== 0) {
        translation = new oc.gp_Vec_4(x, y, z);
        transform = new oc.gp_Trsf_1();
        transform.SetTranslation_1(translation);
        brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
        shape = brepTransform.Shape();
      }

      shape = detachShape(oc, shape);

      if (entityId) {
        cacheShape(entityId, shape);
      }

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(shape, oc, deflection);
      const brepBytes = exportShapeToBytes(oc, shape, entityId);

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      // Cleanup at the very end
      if (translation) translation.delete();
      if (transform) transform.delete();
      if (brepTransform) brepTransform.delete();
      cone.delete();

      self.postMessage({ type: 'createCone', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'createCone', success: false, error: errorMessage, id });
    }
  } else if (type === 'createTorus') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { x, y, z, r1, r2, deflection, entityId } = payload;
    try {
      // Use constructor with radii and translate (most reliable overload)
      const torus = new oc.BRepPrimAPI_MakeTorus_1(r1, r2);
      let shape = torus.Shape();

      let translation: any = null;
      let transform: any = null;
      let brepTransform: any = null;

      if (x !== 0 || y !== 0 || z !== 0) {
        translation = new oc.gp_Vec_4(x, y, z);
        transform = new oc.gp_Trsf_1();
        transform.SetTranslation_1(translation);
        brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
        shape = brepTransform.Shape();
      }

      shape = detachShape(oc, shape);

      if (entityId) {
        cacheShape(entityId, shape);
      }

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(shape, oc, deflection);
      const brepBytes = exportShapeToBytes(oc, shape, entityId);

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      // Cleanup at the very end
      if (translation) translation.delete();
      if (transform) transform.delete();
      if (brepTransform) brepTransform.delete();
      torus.delete();

      self.postMessage({ type: 'createTorus', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'createTorus', success: false, error: errorMessage, id });
    }
  } else if (type === 'createPolyhedron') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { points, faces, deflection, entityId } = payload;
    try {
      const gpPoints: any[] = [];
      const vertices: any[] = [];
      for (const pt of points) {
        const x = pt.x !== undefined ? pt.x : (pt[0] ?? 0);
        const y = pt.y !== undefined ? pt.y : (pt[1] ?? 0);
        const z = pt.z !== undefined ? pt.z : (pt[2] ?? 0);
        const gpPnt = new oc.gp_Pnt_3(x, y, z);
        gpPoints.push(gpPnt);
        const makeVertex = new oc.BRepBuilderAPI_MakeVertex(gpPnt);
        vertices.push(detachShape(oc, makeVertex.Vertex()));
        makeVertex.delete();
      }

      const faceShapes: any[] = [];
      for (const faceIndices of faces) {
        if (faceIndices.length < 3) continue;
        const makeWire = new oc.BRepBuilderAPI_MakeWire_1();
        let wireDone = true;
        for (let j = 0; j < faceIndices.length; j++) {
          const idx1 = faceIndices[j];
          const idx2 = faceIndices[(j + 1) % faceIndices.length];
          const p1 = gpPoints[idx1];
          const p2 = gpPoints[idx2];
          if (!p1 || !p2) {
            wireDone = false;
            break;
          }
          const makeEdge = new oc.BRepBuilderAPI_MakeEdge_3(p1, p2);
          if (makeEdge.IsDone()) {
            makeWire.Add_1(makeEdge.Edge());
          } else {
            wireDone = false;
          }
          makeEdge.delete();
        }

        if (wireDone && makeWire.IsDone()) {
          const makeFace = new oc.BRepBuilderAPI_MakeFace_15(makeWire.Wire(), true);
          if (makeFace.IsDone()) {
            faceShapes.push(detachShape(oc, makeFace.Face()));
          }
          makeFace.delete();
        }
        makeWire.delete();
      }

      // Clean up gpPoints as they are no longer needed
      for (const gpPnt of gpPoints) {
        gpPnt.delete();
      }

      if (faceShapes.length === 0) {
        throw new Error("No valid faces could be created from the polyhedron specification.");
      }
      const sewing = createSewing(oc, 1e-4);
      for (const face of faceShapes) {
        sewing.Add(face);
      }
      if (oc.Handle_Message_ProgressIndicator_1) {
        const range = new oc.Handle_Message_ProgressIndicator_1();
        sewing.Perform(range);
        range.delete();
      } else if (oc.Handle_Message_ProgressIndicator) {
        const range = new oc.Handle_Message_ProgressIndicator();
        sewing.Perform(range);
        range.delete();
      } else if (oc.Message_ProgressRange) {
        const range = new oc.Message_ProgressRange();
        sewing.Perform(range);
        range.delete();
      } else {
        sewing.Perform();
      }
      let shape = sewing.SewedShape();

      const nakedLines: number[][] = [];
      try {
        const edgeFaceMap = new oc.TopTools_IndexedDataMapOfShapeListOfShape();
        oc.TopExp.MapShapesAndAncestors(
          shape, 
          oc.TopAbs_ShapeEnum.TopAbs_EDGE, 
          oc.TopAbs_ShapeEnum.TopAbs_FACE, 
          edgeFaceMap
        );
        const nbEdges = edgeFaceMap.Extent();
        for (let i = 1; i <= nbEdges; i++) {
          const faceList = edgeFaceMap.FindFromIndex(i);
          if (faceList.Extent() === 1) {
            const edge = oc.TopoDS.Edge_1(edgeFaceMap.FindKey(i));
            const firstVertex = oc.TopExp.FirstVertex(edge);
            const lastVertex = oc.TopExp.LastVertex(edge);
            if (!firstVertex.IsNull() && !lastVertex.IsNull()) {
              const p1 = oc.BRep_Tool.Pnt(firstVertex);
              const p2 = oc.BRep_Tool.Pnt(lastVertex);
              nakedLines.push([p1.X(), p1.Y(), p1.Z(), p2.X(), p2.Y(), p2.Z()]);
              p1.delete();
              p2.delete();
            }
            firstVertex.delete();
            lastVertex.delete();
            edge.delete();
          }
          faceList.delete();
        }
        edgeFaceMap.delete();
      } catch (e) {
        console.warn("Error finding naked edges:", e);
      }

      let isSolid = false;
      if (nakedLines.length === 0) {
        const makeSolid = new oc.BRepBuilderAPI_MakeSolid_1();
        try {
          if (shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_SHELL) {
            const shell = oc.TopoDS.Shell_1(shape);
            makeSolid.Add(shell);
            if (makeSolid.IsDone()) {
              shape = makeSolid.Solid();
              isSolid = true;
            }
          } else {
            const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
            let shellCount = 0;
            while (explorer.More()) {
              const shell = oc.TopoDS.Shell_1(explorer.Current());
              makeSolid.Add(shell);
              shellCount++;
              explorer.Next();
            }
            explorer.delete();
            if (shellCount > 0 && makeSolid.IsDone()) {
              shape = makeSolid.Solid();
              isSolid = true;
            }
          }
        } catch (e) {
          console.warn("Failed to solidify shell:", e);
        }
        makeSolid.delete();
      }

      shape = detachShape(oc, shape);

      if (entityId) {
        cacheShape(entityId, shape);
      }

      const geometryData = shapeToBufferGeometryData(shape, oc, deflection);
      const brepBytes = exportShapeToBytes(oc, shape, entityId);

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      sewing.delete();
      for (const v of vertices) v.delete();
      for (const f of faceShapes) f.delete();

      self.postMessage({ type: 'createPolyhedron', success: true, payload: { ...geometryData, brepBytes, nakedLines, isSolid }, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'createPolyhedron', success: false, error: errorMessage, id });
    }
  } else if (type === 'createConvexHull') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { points: inputPoints, shapeIds, deflection, entityId } = payload;
    try {
      const points: { x: number, y: number, z: number }[] = [];
      // 1. Extract input points
      if (inputPoints) {
        for (const pt of inputPoints) {
          const px = pt.x !== undefined ? pt.x : (pt[0] ?? 0);
          const py = pt.y !== undefined ? pt.y : (pt[1] ?? 0);
          const pz = pt.z !== undefined ? pt.z : (pt[2] ?? 0);
          points.push({ x: px, y: py, z: pz });
        }
      }
      // 2. Extract points from shapes
      if (shapeIds) {
        for (const sId of shapeIds) {
          const shape = shapeCache.get(sId);
          if (shape && !shape.IsNull()) {
            let mesh: any;
            if (oc.BRepMesh_IncrementalMesh_2) {
              mesh = new oc.BRepMesh_IncrementalMesh_2(shape, deflection || 0.5, false, 0.5, false);
            } else if (oc.BRepMesh_IncrementalMesh_1) {
              mesh = new oc.BRepMesh_IncrementalMesh_1(shape, deflection || 0.5, false, 0.5, false);
            } else {
              mesh = new oc.BRepMesh_IncrementalMesh(shape, deflection || 0.5, false, 0.5, false);
            }
            mesh.delete();

            const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
            while (explorer.More()) {
              const face = oc.TopoDS.Face_1(explorer.Current());
              const loc = new oc.TopLoc_Location_1();
              const triangulation = oc.BRep_Tool.Triangulation(face, loc);
              if (triangulation && !triangulation.IsNull()) {
                const trans = loc.Transformation();
                const tri = triangulation.get();
                const nbNodes = tri.NbNodes();
                for (let i = 1; i <= nbNodes; i++) {
                  const node = tri.Node(i);
                  const pnt = node.Transformed(trans);
                  points.push({ x: pnt.X(), y: pnt.Y(), z: pnt.Z() });
                  pnt.delete();
                  node.delete();
                }
                triangulation.delete();
              }
              loc.delete();
              face.delete();
              explorer.Next();
            }
            explorer.delete();
          }
        }
      }

      // Deduplicate points that are extremely close
      const uniquePoints: { x: number, y: number, z: number }[] = [];
      const seen = new Set<string>();
      for (const p of points) {
        const key = `${Math.round(p.x * 10000)},${Math.round(p.y * 10000)},${Math.round(p.z * 10000)}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniquePoints.push(p);
        }
      }

      if (uniquePoints.length < 4) {
        throw new Error("Convex hull requires at least 4 unique points.");
      }

      // Compute convex hull faces
      const faces = computeConvexHull3D(uniquePoints);

      // Build B-Rep solid from the points and faces
      const gpPoints: any[] = [];
      const vertices: any[] = [];
      for (const pt of uniquePoints) {
        const gpPnt = new oc.gp_Pnt_3(pt.x, pt.y, pt.z);
        gpPoints.push(gpPnt);
        const makeVertex = new oc.BRepBuilderAPI_MakeVertex(gpPnt);
        vertices.push(detachShape(oc, makeVertex.Vertex()));
        makeVertex.delete();
      }

      const faceShapes: any[] = [];
      for (const faceIndices of faces) {
        const makeWire = new oc.BRepBuilderAPI_MakeWire_1();
        let wireDone = true;
        for (let j = 0; j < 3; j++) {
          const idx1 = faceIndices[j];
          const idx2 = faceIndices[(j + 1) % 3];
          const p1 = gpPoints[idx1];
          const p2 = gpPoints[idx2];
          if (!p1 || !p2) {
            wireDone = false;
            break;
          }
          const makeEdge = new oc.BRepBuilderAPI_MakeEdge_3(p1, p2);
          if (makeEdge.IsDone()) {
            makeWire.Add_1(makeEdge.Edge());
          } else {
            wireDone = false;
          }
          makeEdge.delete();
        }

        if (wireDone && makeWire.IsDone()) {
          const makeFace = new oc.BRepBuilderAPI_MakeFace_15(makeWire.Wire(), true);
          if (makeFace.IsDone()) {
            faceShapes.push(detachShape(oc, makeFace.Face()));
          }
          makeFace.delete();
        }
        makeWire.delete();
      }

      // Clean up gpPoints as they are no longer needed
      for (const gpPnt of gpPoints) {
        gpPnt.delete();
      }

      if (faceShapes.length === 0) {
        throw new Error("No BRep faces could be built from the convex hull triangulation.");
      }

      const sewing = createSewing(oc, 1e-4);
      for (const face of faceShapes) {
        sewing.Add(face);
      }
      if (oc.Handle_Message_ProgressIndicator_1) {
        const range = new oc.Handle_Message_ProgressIndicator_1();
        sewing.Perform(range);
        range.delete();
      } else if (oc.Handle_Message_ProgressIndicator) {
        const range = new oc.Handle_Message_ProgressIndicator();
        sewing.Perform(range);
        range.delete();
      } else if (oc.Message_ProgressRange) {
        const range = new oc.Message_ProgressRange();
        sewing.Perform(range);
        range.delete();
      } else {
        sewing.Perform();
      }
      let shape = sewing.SewedShape();

      // Solidify
      let isSolid = false;
      const makeSolid = new oc.BRepBuilderAPI_MakeSolid_1();
      try {
        if (shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_SHELL) {
          const shell = oc.TopoDS.Shell_1(shape);
          makeSolid.Add(shell);
          if (makeSolid.IsDone()) {
            shape = makeSolid.Solid();
            isSolid = true;
          }
        } else {
          const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
          let shellCount = 0;
          while (explorer.More()) {
            const shell = oc.TopoDS.Shell_1(explorer.Current());
            makeSolid.Add(shell);
            shellCount++;
            explorer.Next();
          }
          explorer.delete();
          if (shellCount > 0 && makeSolid.IsDone()) {
            shape = makeSolid.Solid();
            isSolid = true;
          }
        }
      } catch (e) {
        console.warn("Failed to solidify convex hull shell:", e);
      }
      makeSolid.delete();

      shape = detachShape(oc, shape);

      if (entityId) {
        cacheShape(entityId, shape);
      }

      const geometryData = shapeToBufferGeometryData(shape, oc, deflection);
      const brepBytes = exportShapeToBytes(oc, shape, entityId);

      sewing.delete();
      for (const v of vertices) v.delete();
      for (const f of faceShapes) f.delete();

      self.postMessage({ type: 'createConvexHull', success: true, payload: { ...geometryData, brepBytes, isSolid }, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'createConvexHull', success: false, error: errorMessage, id });
    }
  } else if (type === 'createExtrude') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { points, height, thickness, deflection, isClosed, entityId } = payload;
    const buildersToCleanup: any[] = [];
    try {
      let resultShape: any = null;

      if (thickness > 0 && isClosed) {

        // Sheet-based design: create thick face for each segment and extrude
        const shapes: any[] = [];
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < 1e-6) continue;

          const nx = -dy / len;
          const ny = dx / len;

          const pts = [
            new oc.gp_Pnt_3(p1.x - nx * thickness / 2, p1.y - ny * thickness / 2, p1.z),
            new oc.gp_Pnt_3(p2.x - nx * thickness / 2, p2.y - ny * thickness / 2, p2.z),
            new oc.gp_Pnt_3(p2.x + nx * thickness / 2, p2.y + ny * thickness / 2, p2.z),
            new oc.gp_Pnt_3(p1.x + nx * thickness / 2, p1.y + ny * thickness / 2, p1.z)
          ];

          const e0 = new oc.BRepBuilderAPI_MakeEdge_3(pts[0], pts[1]);
          const makeWire = new oc.BRepBuilderAPI_MakeWire_2(e0.Edge());
          e0.delete();

          for (let j = 1; j < 4; j++) {
            const e = new oc.BRepBuilderAPI_MakeEdge_3(pts[j], pts[(j + 1) % 4]);
            makeWire.Add_1(e.Edge());
            e.delete();
          }

          const wire = makeWire.Wire();
          const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, false);
          if (!faceMaker.IsDone()) {
            faceMaker.delete();
            makeWire.delete();
            throw new Error("Failed to create face for segment.");
          }
          const realFace = faceMaker.Face();


          const dirVec = new oc.gp_Vec_4(0, 0, height);
          const builder = new oc.BRepPrimAPI_MakePrism_1(realFace, dirVec, false, true);
          shapes.push(builder.Shape());

          pts.forEach(p => p.delete());
          makeWire.delete();
          wire.delete();
          faceMaker.delete();
          dirVec.delete();
          builder.delete();
        }



        if (shapes.length > 0) {
          resultShape = shapes[0];
          for (let i = 1; i < shapes.length; i++) {
            const prevResult = resultShape;
            const fuse = new oc.BRepAlgoAPI_Fuse_3(resultShape, shapes[i]);
            configureBooleanOp(fuse);
            fuse.Build();
            if (fuse.IsDone()) {
              resultShape = fuse.Shape();
              prevResult.delete();
            }
            shapes[i].delete();
            fuse.delete();
          }
        }



      } else {
        // Build wire from all profile points
        const makeWire = new oc.BRepBuilderAPI_MakeWire_1();

        for (let i = 0; i < points.length - 1; i++) {
          const pi = new oc.gp_Pnt_3(points[i].x, points[i].y, points[i].z);
          const pi1 = new oc.gp_Pnt_3(points[i + 1].x, points[i + 1].y, points[i + 1].z);
          const makeEdge = new oc.BRepBuilderAPI_MakeEdge_3(pi, pi1);
          if (makeEdge.IsDone()) {
            makeWire.Add_1(makeEdge.Edge());
          }
          pi.delete();
          pi1.delete();
          makeEdge.delete();
        }

        // For closed profiles: add the closing edge from last point back to first
        if (isClosed) {
          const pLast = new oc.gp_Pnt_3(points[points.length - 1].x, points[points.length - 1].y, points[points.length - 1].z);
          const pFirst = new oc.gp_Pnt_3(points[0].x, points[0].y, points[0].z);
          const closeEdge = new oc.BRepBuilderAPI_MakeEdge_3(pLast, pFirst);
          if (closeEdge.IsDone()) {
            makeWire.Add_1(closeEdge.Edge());
          }
          pLast.delete();
          pFirst.delete();
          closeEdge.delete();
        }

        if (!makeWire.IsDone()) {
          makeWire.delete();
          throw new Error("Failed to build wire from profile points.");
        }

        const dirVec = new oc.gp_Vec_4(0, 0, height);

        if (isClosed) {
          const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(makeWire.Wire(), false);
          if (!faceMaker.IsDone()) {
            faceMaker.delete();
            makeWire.delete();
            dirVec.delete();
            throw new Error("Failed to create face from closed profile.");
          }
          const face = faceMaker.Face();
          const builder = new oc.BRepPrimAPI_MakePrism_1(face, dirVec, false, true);
          resultShape = builder.Shape();

          faceMaker.delete();
          // builder.delete() moved to cleanup section
          buildersToCleanup.push(builder);
        } else {
          // Open profile: sweep along a line to create a shell
          const p1 = new oc.gp_Pnt_3(0, 0, 0);
          const p2 = new oc.gp_Pnt_3(0, 0, height);
          const makeEdge = new oc.BRepBuilderAPI_MakeEdge_3(p1, p2);
          const makeSpine = new oc.BRepBuilderAPI_MakeWire_2(makeEdge.Edge());
          const spine = makeSpine.Wire();

          const sweepBuilder = new oc.BRepOffsetAPI_MakePipeShell(spine);
          sweepBuilder.Add_1(makeWire.Wire(), false, false);
          sweepBuilder.Build();

          resultShape = sweepBuilder.Shape();

          p1.delete();
          p2.delete();
          makeEdge.delete();
          makeSpine.delete();
          // sweepBuilder.delete() moved to cleanup section
          buildersToCleanup.push(sweepBuilder);
        }

        makeWire.delete();
        dirVec.delete();




      }

      if (!resultShape) {
        throw new Error("Failed to create extrude shape.");
      }

      resultShape = detachShape(oc, resultShape);

      if (entityId) {
        cacheShape(entityId, resultShape);
      }

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(resultShape, oc, deflection);
      const brepBytes = exportShapeToBytes(oc, resultShape, entityId || "temp");

      if (!entityId) {
        resultShape.delete();
      }

      // Final cleanup
      buildersToCleanup.forEach(b => b.delete());

      self.postMessage({ type: 'createExtrude', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      buildersToCleanup.forEach(b => b.delete());
      const errorMessage = decodeOCCError('createExtrude', error);
      self.postMessage({ type: 'createExtrude', success: false, error: errorMessage, id });
    }
  } else if (type === 'createSweep') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { profilePoints, spinePoints, isSolid, deflection, entityId, profileCount, cornerMode, isEllipse } = payload;
    let sweepBuilder: any = undefined;
    try {
      let resultShape: any = null;

      // Build spine wire
      const spineWireMaker = new oc.BRepBuilderAPI_MakeWire_1();
      for (let i = 0; i < spinePoints.length - 1; i++) {
        const p1 = new oc.gp_Pnt_3(spinePoints[i].x, spinePoints[i].y, spinePoints[i].z);
        const p2 = new oc.gp_Pnt_3(spinePoints[i + 1].x, spinePoints[i + 1].y, spinePoints[i + 1].z);
        const makeEdge = new oc.BRepBuilderAPI_MakeEdge_3(p1, p2);
        if (makeEdge.IsDone()) {
          spineWireMaker.Add_1(makeEdge.Edge());
        }
        p1.delete();
        p2.delete();
        makeEdge.delete();
      }
      const spineWire = spineWireMaker.Wire();

      // Build profile wire(s)
      const count = profileCount || 1;
      const ptsPerProfile = Math.floor(profilePoints.length / count);

      // Detect if the spine is flat in the XY plane
      let isFlat = true;
      const firstZ = spinePoints[0]?.z || 0;
      for (let i = 1; i < spinePoints.length; i++) {
        if (Math.abs(spinePoints[i].z - firstZ) > 1e-4) {
          isFlat = false;
          break;
        }
      }

      let transformedProfilePts = profilePoints;

      if (profilePoints.length >= 3 && spinePoints.length >= 2) {
        // Find centroid of profile points
        let cx = 0, cy = 0, cz = 0;
        for (const p of profilePoints) {
          cx += p.x; cy += p.y; cz += p.z;
        }
        cx /= profilePoints.length;
        cy /= profilePoints.length;
        cz /= profilePoints.length;

        // Spine start tangent
        const tx = spinePoints[1].x - spinePoints[0].x;
        const ty = spinePoints[1].y - spinePoints[0].y;
        const len = Math.sqrt(tx * tx + ty * ty);

        if (len > 1e-6) {
          transformedProfilePts = profilePoints.map((p: any) => {
            const x = p.x - cx;
            const y = p.y - cy;
            const z = p.z - cz;

            // Map to frame: X' = (-ty, tx, 0), Y' = (0, 0, 1), Z' = (tx, ty, 0)
            const rx = -(ty / len) * x + (tx / len) * z;
            const ry = (tx / len) * x + (ty / len) * z;
            const rz = y;

            return {
              x: rx + spinePoints[0].x,
              y: ry + spinePoints[0].y,
              z: rz + spinePoints[0].z
            };
          });
        }
      }

      if (count === 1 && (!cornerMode || cornerMode === 'DEFAULT' || (isEllipse && cornerMode === 'MITER'))) {
        // STABLE: Custom JS generator using RMF (Double Reflection) to prevent twisting. Do not change unless allowed.
        // Find centroid of RAW profile points for mapping
        let cx = 0, cy = 0, cz = 0;
        for (const p of profilePoints) {
          cx += p.x; cy += p.y; cz += p.z;
        }
        cx /= profilePoints.length;
        cy /= profilePoints.length;
        cz /= profilePoints.length;

        const M = profilePoints.length;
        const N = spinePoints.length;

        const positions: number[] = [];
        const indices: number[] = [];

        // Compute tangents at spine points
        const tangents: { x: number, y: number, z: number }[] = [];
        for (let i = 0; i < N; i++) {
          let tx = 0, ty = 0, tz = 0;
          if (i === 0) {
            tx = spinePoints[1].x - spinePoints[0].x;
            ty = spinePoints[1].y - spinePoints[0].y;
            tz = spinePoints[1].z - spinePoints[0].z;
          } else if (i === N - 1) {
            tx = spinePoints[N - 1].x - spinePoints[N - 2].x;
            ty = spinePoints[N - 1].y - spinePoints[N - 2].y;
            tz = spinePoints[N - 1].z - spinePoints[N - 2].z;
          } else {
            tx = spinePoints[i + 1].x - spinePoints[i - 1].x;
            ty = spinePoints[i + 1].y - spinePoints[i - 1].y;
            tz = spinePoints[i + 1].z - spinePoints[i - 1].z;
          }
          const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
          tangents.push({ x: tx / len, y: ty / len, z: tz / len });
        }

        // Compute frames using Double Reflection Method (RMF)
        const frames: { T: { x: number, y: number, z: number }, X: { x: number, y: number, z: number }, Y: { x: number, y: number, z: number } }[] = [];

        // Initial frame at P0
        const T0 = tangents[0];
        let N0 = { x: 0, y: 0, z: 1 }; // Default up vector
        if (Math.abs(T0.z) > 0.99) {
          N0 = { x: 1, y: 0, z: 0 };
        }
        // X = cross(N0, T0)
        let xx = N0.y * T0.z - N0.z * T0.y;
        let xy = N0.z * T0.x - N0.x * T0.z;
        let xz = N0.x * T0.y - N0.y * T0.x;
        const xlen = Math.sqrt(xx * xx + xy * xy + xz * xz);
        xx /= xlen; xy /= xlen; xz /= xlen;

        // Y = cross(T0, X)
        const yx = T0.y * xz - T0.z * xy;
        const yy = T0.z * xx - T0.x * xz;
        const yz = T0.x * xy - T0.y * xx;

        frames.push({ T: T0, X: { x: xx, y: xy, z: xz }, Y: { x: yx, y: yy, z: yz } });

        for (let i = 1; i < N; i++) {
          const Pprev = spinePoints[i - 1];
          const Pcurr = spinePoints[i];
          const Tprev = frames[i - 1].T;
          const Tcurr = tangents[i];
          const Xprev = frames[i - 1].X;
          const Yprev = frames[i - 1].Y;

          // Step 1: v1 = Pcurr - Pprev
          const v1x = Pcurr.x - Pprev.x;
          const v1y = Pcurr.y - Pprev.y;
          const v1z = Pcurr.z - Pprev.z;
          const c1 = v1x * v1x + v1y * v1y + v1z * v1z;

          if (c1 < 1e-12) {
            frames.push({ T: Tcurr, X: Xprev, Y: Yprev });
            continue;
          }

          // Step 3: XprevL = Xprev - (2/c1) * (v1 . Xprev) * v1
          const dot1 = v1x * Xprev.x + v1y * Xprev.y + v1z * Xprev.z;
          const factor1 = 2 / c1 * dot1;
          const XprevLx = Xprev.x - factor1 * v1x;
          const XprevLy = Xprev.y - factor1 * v1y;
          const XprevLz = Xprev.z - factor1 * v1z;

          // Step 4: TprevL = Tprev - (2/c1) * (v1 . Tprev) * v1
          const dot2 = v1x * Tprev.x + v1y * Tprev.y + v1z * Tprev.z;
          const factor2 = 2 / c1 * dot2;
          const TprevLx = Tprev.x - factor2 * v1x;
          const TprevLy = Tprev.y - factor2 * v1y;
          const TprevLz = Tprev.z - factor2 * v1z;

          // Step 5: v2 = Tcurr - TprevL
          const v2x = Tcurr.x - TprevLx;
          const v2y = Tcurr.y - TprevLy;
          const v2z = Tcurr.z - TprevLz;
          const c2 = v2x * v2x + v2y * v2y + v2z * v2z;

          const Xcurr = { x: XprevLx, y: XprevLy, z: XprevLz };
          if (c2 > 1e-12) {
            // Step 7: Xcurr = XprevL - (2/c2) * (v2 . XprevL) * v2
            const dot3 = v2x * XprevLx + v2y * XprevLy + v2z * XprevLz;
            const factor3 = 2 / c2 * dot3;
            Xcurr.x -= factor3 * v2x;
            Xcurr.y -= factor3 * v2y;
            Xcurr.z -= factor3 * v2z;
          }

          // Normalize Xcurr
          const xlen2 = Math.sqrt(Xcurr.x * Xcurr.x + Xcurr.y * Xcurr.y + Xcurr.z * Xcurr.z);
          Xcurr.x /= xlen2; Xcurr.y /= xlen2; Xcurr.z /= xlen2;

          // Step 8: Ycurr = cross(Tcurr, Xcurr)
          const Ycurr = {
            x: Tcurr.y * Xcurr.z - Tcurr.z * Xcurr.y,
            y: Tcurr.z * Xcurr.x - Tcurr.x * Xcurr.z,
            z: Tcurr.x * Xcurr.y - Tcurr.y * Xcurr.x
          };

          frames.push({ T: Tcurr, X: Xcurr, Y: Ycurr });
        }

        // Generate vertices
        for (let i = 0; i < N; i++) {
          const frame = frames[i];
          const T = frame.T;
          const X = frame.X;
          const Y = frame.Y;

          let nx = 0, ny = 0, scaleFactor = 1.0;
          let applyMiter = false;

          // STABLE: Pure JS Bisector Scaling Miter for Ellipse. Do not change unless allowed.
          if (isEllipse && cornerMode === 'MITER' && i > 0 && i < N - 1) {
            const T1 = { x: spinePoints[i].x - spinePoints[i - 1].x, y: spinePoints[i].y - spinePoints[i - 1].y, z: spinePoints[i].z - spinePoints[i - 1].z };
            const T2 = { x: spinePoints[i + 1].x - spinePoints[i].x, y: spinePoints[i + 1].y - spinePoints[i].y, z: spinePoints[i + 1].z - spinePoints[i].z };
            const l1 = Math.sqrt(T1.x * T1.x + T1.y * T1.y + T1.z * T1.z);
            const l2 = Math.sqrt(T2.x * T2.x + T2.y * T2.y + T2.z * T2.z);
            if (l1 > 1e-6 && l2 > 1e-6) {
              T1.x /= l1; T1.y /= l1; T1.z /= l1;
              T2.x /= l2; T2.y /= l2; T2.z /= l2;

              const dot = T1.x * T2.x + T1.y * T2.y + T1.z * T2.z;
              if (dot < 0.999 && dot > -0.999) { // Only if it's a real corner
                const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
                const halfAngle = angle / 2;
                scaleFactor = 1 / Math.cos(halfAngle);

                const B = { x: T2.x - T1.x, y: T2.y - T1.y, z: T2.z - T1.z };
                const bx = B.x * X.x + B.y * X.y + B.z * X.z;
                const by = B.x * Y.x + B.y * Y.y + B.z * Y.z;
                const blen = Math.sqrt(bx * bx + by * by);
                if (blen > 1e-6) {
                  nx = bx / blen;
                  ny = by / blen;
                  applyMiter = true;
                }
              }
            }
          }

          for (let j = 0; j < M; j++) {
            const p = profilePoints[j];
            let x = p.x - cx;
            let y = p.y - cy;
            const z = p.z - cz;

            if (applyMiter) {
              const proj = x * nx + y * ny;
              const scaledProj = proj * scaleFactor;
              x = x + (scaledProj - proj) * nx;
              y = y + (scaledProj - proj) * ny;
            }

            const px = spinePoints[i].x + x * X.x + y * Y.x + z * T.x;
            const py = spinePoints[i].y + x * X.y + y * Y.y + z * T.y;
            const pz = spinePoints[i].z + x * X.z + y * Y.z + z * T.z;

            positions.push(px, py, pz);
          }
        }

        // Generate indices for faces
        for (let i = 0; i < N - 1; i++) {
          for (let j = 0; j < M; j++) {
            const next_j = (j + 1) % M;

            const v1 = i * M + j;
            const v2 = (i + 1) * M + j;
            const v3 = (i + 1) * M + next_j;
            const v4 = i * M + next_j;

            indices.push(v1, v2, v3);
            indices.push(v1, v3, v4);
          }
        }

        // Add caps if solid is requested
        if (isSolid) {
          // Start cap
          const startCenterIdx = positions.length / 3;
          positions.push(spinePoints[0].x, spinePoints[0].y, spinePoints[0].z);
          for (let j = 0; j < M; j++) {
            indices.push(startCenterIdx, (j + 1) % M, j); // Counter-clockwise
          }

          // End cap
          const endCenterIdx = positions.length / 3;
          positions.push(spinePoints[N - 1].x, spinePoints[N - 1].y, spinePoints[N - 1].z);
          for (let j = 0; j < M; j++) {
            const v1 = (N - 1) * M + j;
            const v2 = (N - 1) * M + (j + 1) % M;
            indices.push(endCenterIdx, v1, v2); // Counter-clockwise
          }
        }

        const geometryData = {
          positions: positions,
          indices: indices,
          normal: [] // Three.js can compute normals
        };

        // Cache DUMMY shape for persistence!
        if (entityId) {
          const p1 = new oc.gp_Pnt_3(0, 0, 0);
          const p2 = new oc.gp_Pnt_3(1, 1, 1);
          const makeEdge = new oc.BRepBuilderAPI_MakeEdge_3(p1, p2);
          const dummyShape = makeEdge.Edge();
          cacheShape(entityId, dummyShape);
          p1.delete();
          p2.delete();
          makeEdge.delete();
        }

        // Note: No BRep available for this specific path
        self.postMessage({ type: 'createSweep', success: true, payload: { ...geometryData, brepBytes: null }, id });
        return;
      } else {
        // Use MakePipeShell for multiple profiles
        sweepBuilder = new oc.BRepOffsetAPI_MakePipeShell(spineWire);

        // Set mode to Frenet to make profile rotate with spine
        sweepBuilder.SetMode_1(true); // true = Frenet mode

        if (cornerMode === 'MITER') {
          sweepBuilder.SetTransitionMode(oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RightCorner);
        } else if (cornerMode === 'ROUND') {
          sweepBuilder.SetTransitionMode(oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RoundCorner);
        } else {
          sweepBuilder.SetTransitionMode(oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_Transformed);
        }

        for (let j = 0; j < count; j++) {
          const startIdx = j * ptsPerProfile;
          const endIdx = (j === count - 1) ? transformedProfilePts.length : (j + 1) * ptsPerProfile;
          const currentProfilePts = transformedProfilePts.slice(startIdx, endIdx);

          const profileWireMaker = new oc.BRepBuilderAPI_MakeWire_1();
          for (let i = 0; i < currentProfilePts.length - 1; i++) {
            const p1 = new oc.gp_Pnt_3(currentProfilePts[i].x, currentProfilePts[i].y, currentProfilePts[i].z);
            const p2 = new oc.gp_Pnt_3(currentProfilePts[i + 1].x, currentProfilePts[i + 1].y, currentProfilePts[i + 1].z);
            const makeEdge = new oc.BRepBuilderAPI_MakeEdge_3(p1, p2);
            if (makeEdge.IsDone()) {
              profileWireMaker.Add_1(makeEdge.Edge());
            }
            p1.delete();
            p2.delete();
            makeEdge.delete();
          }
          const profileWire = profileWireMaker.Wire();

          sweepBuilder.Add_1(profileWire, false, false);

          profileWireMaker.delete();
        }

        sweepBuilder.Build();

        if (!sweepBuilder.IsDone()) {
          sweepBuilder.delete();
          throw new Error("Failed to build sweep.");
        }

        if (isSolid) {
          const success = sweepBuilder.MakeSolid();
          if (!success) {
            console.warn("MakeSolid returned false, might still be a shell.");
          }
        }

        resultShape = sweepBuilder.Shape();
        // sweepBuilder.delete(); // Moved to end
      }

      resultShape = detachShape(oc, resultShape);

      if (entityId) {
        cacheShape(entityId, resultShape);
      }

      const geometryData = shapeToBufferGeometryData(resultShape, oc, deflection);
      const brepBytes = exportShapeToBytes(oc, resultShape, entityId || "temp");

      if (!entityId) {
        resultShape.delete();
      }

      spineWireMaker.delete();
      if (typeof sweepBuilder !== 'undefined' && sweepBuilder.delete) {
        sweepBuilder.delete();
      }

      self.postMessage({ type: 'createSweep', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = decodeOCCError('createSweep', error);
      self.postMessage({ type: 'createSweep', success: false, error: errorMessage, id });
    }
  } else if (type === 'createLoft') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { profiles, isSolid, isRuled, deflection, entityId } = payload;
    try {
      const loftBuilder = new oc.BRepOffsetAPI_ThruSections(isSolid, isRuled, 1e-6);

      const profilesArray = profiles || [];

      for (const profile of profilesArray) {
        let shape: any = null;

        if (shapeCache.has(profile.id)) {
          shape = shapeCache.get(profile.id);
        } else if (profile.points && profile.points.length === 1) {
          // Create vertex on the fly!
          const p = profile.points[0];
          const gpPnt = new oc.gp_Pnt_3(p.x, p.y, p.z);
          const makeVertex = new oc.BRepBuilderAPI_MakeVertex_1(gpPnt);
          shape = makeVertex.Vertex();
          cacheShape(profile.id, shape);
          makeVertex.delete();
          gpPnt.delete();
        } else if (profile.points && profile.points.length > 1) {
          // Create wire from points on the fly!
          const pts = profile.points.map((p: any) => new oc.gp_Pnt_3(p.x, p.y, p.z));

          const e0 = new oc.BRepBuilderAPI_MakeEdge_3(pts[0], pts[1]);
          const makeWire = new oc.BRepBuilderAPI_MakeWire_2(e0.Edge());
          e0.delete();

          for (let i = 1; i < pts.length - 1; i++) {
            const e = new oc.BRepBuilderAPI_MakeEdge_3(pts[i], pts[i + 1]);
            makeWire.Add_1(e.Edge());
            e.delete();
          }

          if (profile.closed) {
            const e = new oc.BRepBuilderAPI_MakeEdge_3(pts[pts.length - 1], pts[0]);
            makeWire.Add_1(e.Edge());
            e.delete();
          }

          shape = makeWire.Wire();
          // Cache it so it's available next time!
          cacheShape(profile.id, shape);

          makeWire.delete();
          pts.forEach((p: any) => p.delete());
        }

        if (!shape) {
          throw new Error(`Shape not cached and no points provided for profile (id: ${profile.id}).`);
        }

        const shapeType = shape.ShapeType();

        if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_WIRE) {
          loftBuilder.AddWire(shape);
        } else if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_FACE) {
          const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
          if (explorer.More()) {
            const wire = oc.TopoDS.Wire_1(explorer.Current());
            loftBuilder.AddWire(wire);
            wire.delete();
          }
          explorer.delete();
        } else if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_VERTEX) {
          loftBuilder.AddVertex(shape);
        } else {
          throw new Error(`Unsupported shape type for loft: ${shapeType}`);
        }
      }

      loftBuilder.Build();

      if (!loftBuilder.IsDone()) {
        loftBuilder.delete();
        throw new Error("Failed to build loft.");
      }

      let resultShape = loftBuilder.Shape();

      // If user requested a solid but the result is not a solid, try to close it!
      if (isSolid && resultShape.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_SOLID) {
        const shapes: any[] = [];
        for (const profile of profilesArray) {
          if (shapeCache.has(profile.id)) {
            shapes.push(shapeCache.get(profile.id));
          }
        }

        if (shapes.length >= 2) {
          const firstShape = shapes[0];
          const lastShape = shapes[shapes.length - 1];

          if (firstShape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_WIRE &&
            lastShape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_WIRE) {

            const makeFace1 = new oc.BRepBuilderAPI_MakeFace_15(firstShape, false);
            const makeFace2 = new oc.BRepBuilderAPI_MakeFace_15(lastShape, false);

            if (makeFace1.IsDone() && makeFace2.IsDone()) {
              const face1 = makeFace1.Face();
              const face2 = makeFace2.Face();

              const builder = new oc.BRep_Builder();
              const newShell = new oc.TopoDS_Shell();
              builder.MakeShell(newShell);

              // Add faces from the loft result
              const explorer = new oc.TopExp_Explorer_2(resultShape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
              while (explorer.More()) {
                const face = oc.TopoDS.Face_1(explorer.Current());
                builder.Add(newShell, face);
                explorer.Next();
              }
              explorer.delete();

              // Add end caps
              builder.Add(newShell, face1);
              builder.Add(newShell, face2);

              const makeSolid = new oc.BRepBuilderAPI_MakeSolid_1();
              makeSolid.Add(newShell);

              if (makeSolid.IsDone()) {
                resultShape = makeSolid.Solid();
                console.log("[Worker] Successfully closed loft end caps to create a solid.");
              } else {
                console.warn("[Worker] Failed to make solid from closed shell.");
              }

              newShell.delete();
              face1.delete();
              face2.delete();
              makeSolid.delete();
            }
            makeFace1.delete();
            makeFace2.delete();
          }
        }
      }

      if (entityId) {
        cacheShape(entityId, resultShape);
      }

      const geometryData = shapeToBufferGeometryData(resultShape, oc, deflection);
      const brepBytes = exportShapeToBytes(oc, resultShape, entityId || "temp");

      if (!entityId) {
        resultShape.delete();
      }

      loftBuilder.delete();

      self.postMessage({ type: 'createLoft', success: true, payload: { ...geometryData, brepBytes }, id });

    } catch (error: any) {
      const errorMessage = decodeOCCError('createLoft', error);
      self.postMessage({ type: 'createLoft', success: false, error: errorMessage, id });
    }
  } else if (type === 'createRevolve') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { points, axisPoint, axisDir, angle, thickness, deflection, isClosed, entityId } = payload;
    try {
      let resultShape: any = null;
      let builder: any = undefined;
      const angleRad = angle * Math.PI / 180;
      const revAxis = new oc.gp_Ax1_2(new oc.gp_Pnt_3(axisPoint.x, axisPoint.y, axisPoint.z), new oc.gp_Dir_4(axisDir.x, axisDir.y, axisDir.z));

      // Build wire from all profile points
      const makeWire = new oc.BRepBuilderAPI_MakeWire_1();


      for (let i = 0; i < points.length - 1; i++) {

        const pi = new oc.gp_Pnt_3(points[i].x, points[i].y, points[i].z);
        const pi1 = new oc.gp_Pnt_3(points[i + 1].x, points[i + 1].y, points[i + 1].z);
        const makeEdge = new oc.BRepBuilderAPI_MakeEdge_3(pi, pi1);
        if (makeEdge.IsDone()) {
          makeWire.Add_1(makeEdge.Edge());
        }
        pi.delete();
        pi1.delete();
        makeEdge.delete();
      }

      // For closed profiles: add the closing edge from last point back to first if not already closed
      if (isClosed) {
        const p0 = points[0];
        const pN = points[points.length - 1];
        const dist = Math.sqrt((p0.x - pN.x) ** 2 + (p0.y - pN.y) ** 2 + (p0.z - pN.z) ** 2);

        if (dist >= 1e-5) {
          const pLast = new oc.gp_Pnt_3(pN.x, pN.y, pN.z);
          const pFirst = new oc.gp_Pnt_3(p0.x, p0.y, p0.z);
          const closeEdge = new oc.BRepBuilderAPI_MakeEdge_3(pLast, pFirst);
          if (closeEdge.IsDone()) {
            makeWire.Add_1(closeEdge.Edge());
          }
          pLast.delete();
          pFirst.delete();
          closeEdge.delete();
        }
      }

      if (!makeWire.IsDone()) {
        makeWire.delete();
        throw new Error("Failed to build wire from profile points.");
      }

      let profile: any;
      let faceMaker: any;
      if (isClosed) {
        faceMaker = new oc.BRepBuilderAPI_MakeFace_15(makeWire.Wire(), false);
        if (!faceMaker.IsDone()) {
          faceMaker.delete();
          makeWire.delete();
          throw new Error("Failed to create face from closed profile.");
        }
      } else {
        profile = makeWire.Wire();
      }

      builder = new oc.BRepPrimAPI_MakeRevol_1(isClosed ? faceMaker.Face() : profile, revAxis, angleRad, false);

      resultShape = builder.Shape();

      makeWire.delete();
      if (isClosed) {
        faceMaker.delete();
      } else {
        profile.delete();
      }
      // builder.delete(); // Moved to end


      revAxis.delete();


      if (entityId) {
        cacheShape(entityId, resultShape);
      }

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(resultShape, oc, deflection);
      const brepBytes = exportShapeToBytes(oc, resultShape, entityId || "temp");

      resultShape.delete();
      builder.delete();

      self.postMessage({ type: 'createRevolve', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = decodeOCCError('createRevolve', error);
      self.postMessage({ type: 'createRevolve', success: false, error: errorMessage, id });
    }
  } else if (type === 'createBoolean') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { operation, idA, idB, entityId, deflection, rotA, rotB, centerA, centerB } = payload;
    try {
      if (!shapeCache.has(idA)) {
        throw new Error(`Shape not cached for solid A (id: ${idA}). Ensure solid was created in this session.`);
      }
      if (!shapeCache.has(idB)) {
        throw new Error(`Shape not cached for solid B (id: ${idB}).`);
      }

      const originalShapeA = shapeCache.get(idA);
      const originalShapeB = shapeCache.get(idB);

      const shapeA = applyRotation(originalShapeA, rotA, oc, centerA);
      const shapeB = applyRotation(originalShapeB, rotB, oc, centerB);

      let boolBuilder: any;
      if (operation === 'fuse') {
        boolBuilder = new oc.BRepAlgoAPI_Fuse_3(shapeA, shapeB);
      } else if (operation === 'cut') {
        boolBuilder = new oc.BRepAlgoAPI_Cut_3(shapeA, shapeB);
      } else if (operation === 'common') {
        boolBuilder = new oc.BRepAlgoAPI_Common_3(shapeA, shapeB);
      } else {
        throw new Error(`Unknown boolean operation: ${operation}`);
      }

      if (boolBuilder) {
        configureBooleanOp(boolBuilder);
      }
      boolBuilder.Build();

      if (!boolBuilder.IsDone()) {
        boolBuilder.delete();
        throw new Error(`Boolean ${operation} failed — shapes may not intersect or be invalid`);
      }

      const resultShape = detachShape(oc, boolBuilder.Shape());
      if (resultShape.IsNull()) {
        boolBuilder.delete();
        resultShape.delete();
        throw new Error(`Boolean ${operation} produced an empty result`);
      }

      // Fallback check: ensure the shape has faces
      const exp = new oc.TopExp_Explorer_2(resultShape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      const hasFaces = exp.More();
      exp.delete();
      if (!hasFaces) {
        resultShape.delete();
        boolBuilder.delete();
        throw new Error(`Boolean ${operation} produced a shape with no faces — shapes may not intersect`);
      }

      // Section 9: BRepCheck validation
      if (oc.BRepCheck_Analyzer) {
        const analyzer = new oc.BRepCheck_Analyzer(resultShape, true);
        try {
          const isValidFn = analyzer.IsValid || (analyzer as any).isValid;
          if (typeof isValidFn === 'function') {
            if (!isValidFn.call(analyzer)) {
              analyzer.delete();
              resultShape.delete();
              boolBuilder.delete();
              throw new Error(`Boolean ${operation} produced an invalid/degenerate shape`);
            }
          }
        } catch (e: any) {
          console.warn(`BRepCheck validation skipped due to error:`, e.message);
        } finally {
          analyzer.delete();
        }
      }

      if (entityId) {
        cacheShape(entityId, resultShape);
      }

      // ✅ Use the cached (deep-copied) shape for everything from here on.
      // This ensures stability and avoids issues with builder-owned handles.
      const stableShape = entityId ? shapeCache.get(entityId) : resultShape;

      console.log(`[Worker] Boolean ${operation} success. ${shapeInfo(oc, stableShape)}`);

      const geometryData = shapeToBufferGeometryData(stableShape, oc, deflection);
      const brepBytes = exportShapeToBytes(oc, stableShape, entityId);

      if (brepBytes) {
        self.postMessage({ type: 'log', message: `[Worker] Boolean snapshot generated: ${brepBytes.length} bytes.` });
      } else {
        self.postMessage({ type: 'log', message: '[Worker] Boolean snapshot generation FAILED (result is undefined).' });
      }

      if (!entityId) {
        resultShape.delete();
      }
      boolBuilder.delete();
      if (shapeA !== originalShapeA) shapeA.delete();
      if (shapeB !== originalShapeB) shapeB.delete();

      self.postMessage({ type: 'createBoolean', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = decodeOCCError('createBoolean', error);
      self.postMessage({ type: 'createBoolean', success: false, error: errorMessage, id });
    }
  } else if (type === 'transformShape') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { entityId, dx, dy, dz, targetEntityId, deflection } = payload;
    try {
      if (!shapeCache.has(entityId)) {
        throw new Error(`Shape not cached for entity ${entityId}`);
      }
      const shape = shapeCache.get(entityId);

      const translation = new oc.gp_Vec_4(dx, dy, dz);
      const transform = new oc.gp_Trsf_1();
      transform.SetTranslation_1(translation);
      const brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
      const newShape = brepTransform.Shape();

      const resultId = targetEntityId || entityId;
      cacheShape(resultId, newShape);

      const geometryData = shapeToBufferGeometryData(newShape, oc, deflection || 0.1);
      const brepBytes = exportShapeToBytes(oc, newShape, resultId);

      translation.delete();
      transform.delete();
      brepTransform.delete();

      self.postMessage({ type: 'transformShape', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = decodeOCCError('transformShape', error);
      self.postMessage({ type: 'transformShape', success: false, error: errorMessage, id });
    }
  } else if (type === 'rotateShape') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { entityId, rx, ry, rz, cx, cy, cz, targetEntityId, deflection } = payload;
    try {
      if (!shapeCache.has(entityId)) {
        throw new Error(`Shape not cached for entity ${entityId}`);
      }
      const shape = shapeCache.get(entityId);

      const newShape = applyRotation(shape, { x: rx, y: ry, z: rz }, oc, { x: cx, y: cy, z: cz });

      const resultId = targetEntityId || entityId;
      cacheShape(resultId, newShape);

      const geometryData = shapeToBufferGeometryData(newShape, oc, deflection || 0.1);
      const brepBytes = exportShapeToBytes(oc, newShape, resultId);

      self.postMessage({ type: 'rotateShape', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = decodeOCCError('rotateShape', error);
      self.postMessage({ type: 'rotateShape', success: false, error: errorMessage, id });
    }
  } else if (type === 'mirrorShape') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { entityId, p1, p2, targetEntityId, deflection } = payload;
    try {
      if (!shapeCache.has(entityId)) {
        throw new Error(`Shape not cached for entity ${entityId}`);
      }
      const shape = shapeCache.get(entityId);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-6) {
        throw new Error("Mirror line points are too close.");
      }

      const nx = -dy / len;
      const ny = dx / len;

      const gpPnt = new oc.gp_Pnt_3(p1.x, p1.y, p1.z || 0);
      const gpDir = new oc.gp_Dir_4(nx, ny, 0);
      const gpAx2 = new oc.gp_Ax2_2(gpPnt, gpDir);

      const transform = new oc.gp_Trsf_1();
      transform.SetMirror_3(gpAx2);

      const brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
      const newShape = brepTransform.Shape();

      const resultId = targetEntityId || entityId;
      cacheShape(resultId, newShape);

      const geometryData = shapeToBufferGeometryData(newShape, oc, deflection || 0.1);
      const brepBytes = exportShapeToBytes(oc, newShape, resultId);

      gpPnt.delete();
      gpDir.delete();
      gpAx2.delete();
      transform.delete();
      brepTransform.delete();

      self.postMessage({ type: 'mirrorShape', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = decodeOCCError('mirrorShape', error);
      self.postMessage({ type: 'mirrorShape', success: false, error: errorMessage, id });
    }
  } else if (type === 'scaleShape') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { entityId, factor, cx, cy, cz, targetEntityId, deflection } = payload;
    try {
      if (!shapeCache.has(entityId)) {
        throw new Error(`Shape not cached for entity ${entityId}`);
      }
      const shape = shapeCache.get(entityId);

      const gpPnt = new oc.gp_Pnt_3(cx, cy, cz);
      const transform = new oc.gp_Trsf_1();
      transform.SetScale(gpPnt, factor);

      const brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
      const newShape = brepTransform.Shape();

      const resultId = targetEntityId || entityId;
      cacheShape(resultId, newShape);

      const geometryData = shapeToBufferGeometryData(newShape, oc, deflection || 0.1);
      const brepBytes = exportShapeToBytes(oc, newShape, resultId);

      gpPnt.delete();
      transform.delete();
      brepTransform.delete();

      self.postMessage({ type: 'scaleShape', success: true, payload: { ...geometryData, brepBytes }, id });
    } catch (error: any) {
      const errorMessage = decodeOCCError('scaleShape', error);
      self.postMessage({ type: 'scaleShape', success: false, error: errorMessage, id });
    }
  } else if (type === 'releaseShapes') {
    const { entityIds } = payload;
    for (const eid of entityIds) {
      releaseShape(eid);
    }
    self.postMessage({ type: 'releaseShapes', success: true, id });
  } else if (type === 'exportBRep') {
    const { entityId } = payload;
    try {
      const shape = shapeCache.get(entityId);
      if (!shape || shape.IsNull()) {
        throw new Error(`No valid cached shape for entityId: ${entityId}`);
      }

      const bytes = exportShapeToBytes(oc, shape, entityId); // STEP bytes
      if (bytes) {
        (self as any).postMessage({ type: 'exportBRepResult', success: true, id, payload: bytes }, [bytes.buffer]);
      } else {
        throw new Error(`Export failed for ${entityId}`);
      }
    } catch (err: any) {
      self.postMessage({ type: 'exportBRepResult', success: false, error: err.message, id });
    }
  } else if (type === 'importBRep') {
    const { entityId, brepBytes, deflection } = payload;
    try {
      const shape = importShapeFromBytes(oc, entityId, brepBytes); // reads STEP bytes

      // Re-mesh after import
      if (oc.BRepTools && oc.BRepTools.Clean) oc.BRepTools.Clean(shape);
      cacheShape(entityId, shape);

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(shape, oc, deflection || 0.01);

      self.postMessage({ type: 'importBRepResult', success: true, payload: geometryData, id });
    } catch (err: any) {
      self.postMessage({ type: 'importBRepResult', success: false, error: err.message, id });
    }
  }
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shapeToBufferGeometryData(shape: any, oc: any, linearDeflection: number = 0.01) {
  // Clean existing triangulation to force re-tessellation at new deflection
  if (oc.BRepTools && oc.BRepTools.Clean) {
    oc.BRepTools.Clean(shape);
  }
  // Triangulate the shape
  const mesher = new oc.BRepMesh_IncrementalMesh_2(shape, linearDeflection, false, 0.5, false);

  const progress = (oc.Message_ProgressRange_1 && typeof oc.Message_ProgressRange_1 === 'function') ? new oc.Message_ProgressRange_1() : null;
  if (progress) {
    mesher.Perform(progress);
  } else {
    (mesher as any).Perform();
  }

  if (mesher.IsDone && !mesher.IsDone()) {
    console.warn("[OCC] Meshing for geometry extraction might be incomplete.");
  }

  if (progress) progress.delete();
  mesher.delete();

  const positions: number[] = [];
  const indices: number[] = [];
  const faceMapping: number[] = []; // Maps triangle index to face index
  let vertexOffset = 0;
  let faceCounter = 0;

  // Explore all faces
  const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);

  while (explorer.More()) {
    const faceShape = explorer.Current();

    if (faceShape.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_FACE) {
      explorer.Next();
      continue;
    }

    const face = oc.TopoDS.Face_1(faceShape);
    const location = new oc.TopLoc_Location_1();
    const triangulation = oc.BRep_Tool.Triangulation(face, location);

    if (!triangulation.IsNull()) {
      const trsf = location.Transformation();
      const tri = triangulation.get();

      // Extract Nodes (Vertices)
      const nbNodes = tri.NbNodes();
      for (let i = 1; i <= nbNodes; i++) {
        const pnt = tri.Node(i);
        pnt.Transform(trsf); // Apply face transformation
        positions.push(pnt.X(), pnt.Y(), pnt.Z());
        pnt.delete();
      }

      // Extract Triangles
      const nbTriangles = tri.NbTriangles();
      const orientation = face.Orientation_1();

      for (let i = 1; i <= nbTriangles; i++) {
        const triangle = tri.Triangle(i);
        const n1 = triangle.Value(1);
        let n2 = triangle.Value(2);
        let n3 = triangle.Value(3);

        // Handle face orientation for backface culling
        if (orientation !== oc.TopAbs_Orientation.TopAbs_FORWARD) {
          [n2, n3] = [n3, n2];
        }

        indices.push(n1 + vertexOffset - 1, n2 + vertexOffset - 1, n3 + vertexOffset - 1);
        faceMapping.push(faceCounter); // Tag this triangle with the current face index
      }
      vertexOffset += nbNodes;
      faceCounter++;
    }
    location.delete();
    face.delete();
    explorer.Next();
  }
  explorer.delete();

  // Extract edges
  // Extract edges using pre-existing mesh (BRep_Tool.Polygon3D)
  const edgeLines: number[][] = [];
  const edgeExplorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);

  while (edgeExplorer.More()) {
    const edgeShape = edgeExplorer.Current();
    if (edgeShape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_EDGE) {
      const edge = oc.TopoDS.Edge_1(edgeShape);
      const loc = new oc.TopLoc_Location_1();
      const poly = oc.BRep_Tool.Polygon3D(edge, loc);

      if (!poly.IsNull()) {
        const nodes = poly.get().Nodes();
        const edgePoints: number[] = [];
        const trsf = loc.Transformation();

        for (let i = nodes.Lower(); i <= nodes.Upper(); i++) {
          const pnt = nodes.Value(i);
          pnt.Transform(trsf); // Apply transformation
          edgePoints.push(pnt.X(), pnt.Y(), pnt.Z());
          pnt.delete();
        }
        edgeLines.push(edgePoints);
      } else {
        // Fallback to adaptor if polygon is null
        try {
          const adaptor = new oc.BRepAdaptor_Curve_2(edge);
          const first = adaptor.FirstParameter();
          const last = adaptor.LastParameter();
          const numSamples = 10;
          const edgePoints: number[] = [];

          const pnt = new oc.gp_Pnt_1();
          for (let i = 0; i <= numSamples; i++) {
            const u = first + (last - first) * (i / numSamples);
            adaptor.D0(u, pnt);
            edgePoints.push(pnt.X(), pnt.Y(), pnt.Z());
          }
          pnt.delete();
          adaptor.delete();

          edgeLines.push(edgePoints);
        } catch (e) {
          console.warn("Failed to extract curve points for edge.", e);
        }
      }
      loc.delete();
    }
    edgeExplorer.Next();
  }
  edgeExplorer.delete();

  return { positions, indices, faceMapping, edgeLines };
}

interface Plane3D {
  normal: { x: number, y: number, z: number };
  offset: number;
}

function computeConvexHull3D(pts: { x: number, y: number, z: number }[]): number[][] {
  if (pts.length < 4) {
    throw new Error("Convex hull requires at least 4 points.");
  }

  // Jitter points slightly to prevent coplanar/collinear degeneracies
  const points = pts.map(p => ({
    x: p.x + (Math.random() - 0.5) * 1e-7,
    y: p.y + (Math.random() - 0.5) * 1e-7,
    z: p.z + (Math.random() - 0.5) * 1e-7
  }));

  const getSignedDistance = (plane: Plane3D, p: { x: number, y: number, z: number }) => {
    return plane.normal.x * p.x + plane.normal.y * p.y + plane.normal.z * p.z - plane.offset;
  };

  const makePlane = (i0: number, i1: number, i2: number): Plane3D => {
    const p0 = points[i0];
    const p1 = points[i1];
    const p2 = points[i2];
    
    const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
    const vx = p2.x - p0.x, vy = p2.y - p0.y, vz = p2.z - p0.z;
    
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx /= len; ny /= len; nz /= len;
    
    return {
      normal: { x: nx, y: ny, z: nz },
      offset: nx * p0.x + ny * p0.y + nz * p0.z
    };
  };

  let i0 = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].x < points[i0].x) i0 = i;
  }

  let i1 = 0;
  let maxDistSq = -1;
  for (let i = 0; i < points.length; i++) {
    if (i === i0) continue;
    const dx = points[i].x - points[i0].x;
    const dy = points[i].y - points[i0].y;
    const dz = points[i].z - points[i0].z;
    const dSq = dx * dx + dy * dy + dz * dz;
    if (dSq > maxDistSq) {
      maxDistSq = dSq;
      i1 = i;
    }
  }

  let i2 = -1;
  let maxLineDistSq = -1;
  const p0 = points[i0], p1 = points[i1];
  const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
  const uLenSq = ux * ux + uy * uy + uz * uz;
  for (let i = 0; i < points.length; i++) {
    if (i === i0 || i === i1) continue;
    const px = points[i].x - p0.x, py = points[i].y - p0.y, pz = points[i].z - p0.z;
    const t = (px * ux + py * uy + pz * uz) / uLenSq;
    const dx = px - t * ux;
    const dy = py - t * uy;
    const dz = pz - t * uz;
    const dSq = dx * dx + dy * dy + dz * dz;
    if (dSq > maxLineDistSq) {
      maxLineDistSq = dSq;
      i2 = i;
    }
  }

  let i3 = -1;
  let maxPlaneDist = -1;
  const basePlane = makePlane(i0, i1, i2);
  for (let i = 0; i < points.length; i++) {
    if (i === i0 || i === i1 || i === i2) continue;
    const dist = Math.abs(getSignedDistance(basePlane, points[i]));
    if (dist > maxPlaneDist) {
      maxPlaneDist = dist;
      i3 = i;
    }
  }

  if (i2 === -1 || i3 === -1 || maxPlaneDist < 1e-9) {
    throw new Error("Points are collinear or coplanar; cannot build 3D hull.");
  }

  const cx = (points[i0].x + points[i1].x + points[i2].x + points[i3].x) / 4;
  const cy = (points[i0].y + points[i1].y + points[i2].y + points[i3].y) / 4;
  const cz = (points[i0].z + points[i1].z + points[i2].z + points[i3].z) / 4;
  const center = { x: cx, y: cy, z: cz };

  interface Face {
    v: [number, number, number];
    plane: Plane3D;
  }

  let faces: Face[] = [];
  const createFace = (v0: number, v1: number, v2: number) => {
    const plane = makePlane(v0, v1, v2);
    if (getSignedDistance(plane, center) > 0) {
      plane.normal.x *= -1;
      plane.normal.y *= -1;
      plane.normal.z *= -1;
      plane.offset *= -1;
      return { v: [v2, v1, v0] as [number, number, number], plane };
    }
    return { v: [v0, v1, v2] as [number, number, number], plane };
  };

  faces.push(createFace(i0, i1, i2));
  faces.push(createFace(i0, i2, i3));
  faces.push(createFace(i0, i3, i1));
  faces.push(createFace(i1, i3, i2));

  const processed = new Set<number>([i0, i1, i2, i3]);
  for (let i = 0; i < points.length; i++) {
    if (processed.has(i)) continue;
    const pt = points[i];

    const visible: number[] = [];
    for (let f = 0; f < faces.length; f++) {
      if (getSignedDistance(faces[f].plane, pt) > 1e-9) {
        visible.push(f);
      }
    }

    if (visible.length === 0) continue;

    const edgeCounts = new Map<string, { v1: number, v2: number, count: number }>();
    for (const fIdx of visible) {
      const f = faces[fIdx];
      for (let j = 0; j < 3; j++) {
        const v1 = f.v[j];
        const v2 = f.v[(j + 1) % 3];
        const key = `${v1}-${v2}`;
        const keyRev = `${v2}-${v1}`;
        if (edgeCounts.has(keyRev)) {
          edgeCounts.get(keyRev)!.count++;
        } else if (edgeCounts.has(key)) {
          edgeCounts.get(key)!.count++;
        } else {
          edgeCounts.set(key, { v1, v2, count: 1 });
        }
      }
    }

    const horizon: { v1: number, v2: number }[] = [];
    for (const edge of edgeCounts.values()) {
      if (edge.count === 1) {
        horizon.push(edge);
      }
    }

    faces = faces.filter((_, idx) => !visible.includes(idx));

    for (const edge of horizon) {
      faces.push(createFace(edge.v1, edge.v2, i));
    }
  }

  return faces.map(f => f.v);
}
