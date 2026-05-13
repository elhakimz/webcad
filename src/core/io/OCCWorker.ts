import { initOpenCascade } from "opencascade.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let oc: any = null;
const shapeCache = new Map<string, any>();

function cacheShape(entityId: string, shape: any) {
  if (shapeCache.has(entityId)) {
    shapeCache.get(entityId).delete();
  }
  shapeCache.set(entityId, shape);
}

function releaseShape(entityId: string) {
  if (shapeCache.has(entityId)) {
    shapeCache.get(entityId).delete();
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
  if (e instanceof Error)    return `[${label}] ${e.message}`;
  return `[${label}] Unknown error: ${String(e)}`;
}

function applyRotation(shape: any, rot: {x:number, y:number, z:number}, oc: any, center?: {x:number, y:number, z:number}) {
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
  const originPnt = new oc.gp_Pnt_3(0,0,0);
  const dirX = new oc.gp_Dir_4(1, 0, 0);
  const axX  = new oc.gp_Ax1_2(originPnt, dirX);
  rotX.SetRotation_1(axX, rot.x);
  axX.delete();
  dirX.delete();
  
  const rotY = new oc.gp_Trsf_1();
  const dirY = new oc.gp_Dir_4(0, 1, 0);
  const axY  = new oc.gp_Ax1_2(originPnt, dirY);
  rotY.SetRotation_1(axY, rot.y);
  axY.delete();
  dirY.delete();
  
  const rotZ = new oc.gp_Trsf_1();
  const dirZ = new oc.gp_Dir_4(0, 0, 1);
  const axZ  = new oc.gp_Ax1_2(originPnt, dirZ);
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

self.onmessage = async (e) => {
  const { type, payload, id } = e.data;

  if (type === 'init') {
    if (!oc) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        oc = await (initOpenCascade as any)();
        self.postMessage({ type: 'init', success: true, id });
      } catch (error: any) {
        self.postMessage({ type: 'init', success: false, error: error.message, id });
      }
    } else {
      self.postMessage({ type: 'init', success: true, id });
    }
  } else if (type === 'createBox') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { x, y, z, dx, dy, dz, deflection, entityId } = payload;
    try {
      const pt = new oc.gp_Pnt_3(x, y, z);
      const box = new oc.BRepPrimAPI_MakeBox_2(pt, dx, dy, dz);
      const shape = box.Shape();
      
      if (entityId) {
        cacheShape(entityId, shape);
      }

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(shape, oc, deflection);

      pt.delete();
      box.delete();

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      self.postMessage({ type: 'createBox', success: true, payload: geometryData, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'createBox', success: false, error: errorMessage, id });
    }
  } else if (type === 'createCylinder') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { x, y, z, r, h, deflection, entityId } = payload;
    try {
      // Use constructor with 3 parameters: Radius, Height, Angle
      const cylinder = new oc.BRepPrimAPI_MakeCylinder_2(r, h, 2 * Math.PI);
      let shape = cylinder.Shape();

      // Translate to (x, y, z)
      if (x !== 0 || y !== 0 || z !== 0) {
        const translation = new oc.gp_Vec_4(x, y, z);
        const transform = new oc.gp_Trsf_1();
        transform.SetTranslation_1(translation);
        const brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
        shape = brepTransform.Shape();
        translation.delete();
        transform.delete();
        brepTransform.delete();
      }

      if (entityId) {
        cacheShape(entityId, shape);
      }

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(shape, oc, deflection);

      cylinder.delete();

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      self.postMessage({ type: 'createCylinder', success: true, payload: geometryData, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'createCylinder', success: false, error: errorMessage, id });
    }
  } else if (type === 'createSphere') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { x, y, z, r, deflection, entityId } = payload;
    try {
      // Use constructor with 1 parameter: Radius (creates at origin)
      const sphere = new oc.BRepPrimAPI_MakeSphere_1(r);
      let shape = sphere.Shape();

      // Translate to (x, y, z)
      if (x !== 0 || y !== 0 || z !== 0) {
        const translation = new oc.gp_Vec_4(x, y, z);
        const transform = new oc.gp_Trsf_1();
        transform.SetTranslation_1(translation);
        const brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
        shape = brepTransform.Shape();
        translation.delete();
        transform.delete();
        brepTransform.delete();
      }

      if (entityId) {
        cacheShape(entityId, shape);
      }

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(shape, oc, deflection);

      sphere.delete();

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      self.postMessage({ type: 'createSphere', success: true, payload: geometryData, id });
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
      // Try BRepPrimAPI_MakeCone_1
      const cone = new oc.BRepPrimAPI_MakeCone_1(r, 0, h);
      let shape = cone.Shape();

      // Translate to (x, y, z)
      if (x !== 0 || y !== 0 || z !== 0) {
        const translation = new oc.gp_Vec_4(x, y, z);
        const transform = new oc.gp_Trsf_1();
        transform.SetTranslation_1(translation);
        const brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
        shape = brepTransform.Shape();
        translation.delete();
        transform.delete();
        brepTransform.delete();
      }

      if (entityId) {
        cacheShape(entityId, shape);
      }

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(shape, oc, deflection);

      cone.delete();

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      self.postMessage({ type: 'createCone', success: true, payload: geometryData, id });
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
      // Try BRepPrimAPI_MakeTorus_1
      const torus = new oc.BRepPrimAPI_MakeTorus_1(r1, r2);
      let shape = torus.Shape();

      // Translate to (x, y, z)
      if (x !== 0 || y !== 0 || z !== 0) {
        const translation = new oc.gp_Vec_4(x, y, z);
        const transform = new oc.gp_Trsf_1();
        transform.SetTranslation_1(translation);
        const brepTransform = new oc.BRepBuilderAPI_Transform_2(shape, transform, true);
        shape = brepTransform.Shape();
        translation.delete();
        transform.delete();
        brepTransform.delete();
      }

      if (entityId) {
        cacheShape(entityId, shape);
      }

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(shape, oc, deflection);

      torus.delete();

      if (geometryData.positions.length === 0) {
        throw new Error("No geometry generated from shape. Positions array is empty.");
      }

      self.postMessage({ type: 'createTorus', success: true, payload: geometryData, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'createTorus', success: false, error: errorMessage, id });
    }
  } else if (type === 'createExtrude') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { points, height, thickness, deflection, isClosed, entityId } = payload;
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
            new oc.gp_Pnt_3(p1.x - nx * thickness/2, p1.y - ny * thickness/2, p1.z),
            new oc.gp_Pnt_3(p2.x - nx * thickness/2, p2.y - ny * thickness/2, p2.z),
            new oc.gp_Pnt_3(p2.x + nx * thickness/2, p2.y + ny * thickness/2, p2.z),
            new oc.gp_Pnt_3(p1.x + nx * thickness/2, p1.y + ny * thickness/2, p1.z)
          ];
          
          const e0 = new oc.BRepBuilderAPI_MakeEdge_3(pts[0], pts[1]);
          const makeWire = new oc.BRepBuilderAPI_MakeWire_2(e0.Edge());
          e0.delete();
 
          for (let j = 1; j < 4; j++) {
            const e = new oc.BRepBuilderAPI_MakeEdge_3(pts[j], pts[(j+1)%4]);
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
          const pi  = new oc.gp_Pnt_3(points[i].x,   points[i].y,   points[i].z);
          const pi1 = new oc.gp_Pnt_3(points[i+1].x, points[i+1].y, points[i+1].z);
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
          const pLast  = new oc.gp_Pnt_3(points[points.length-1].x, points[points.length-1].y, points[points.length-1].z);
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
          builder.delete();
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
          sweepBuilder.delete();
        }
        
        makeWire.delete();
        dirVec.delete();




      }

      if (!resultShape) {
        throw new Error("Failed to create extrude shape.");
      }

      if (entityId) {
        cacheShape(entityId, resultShape);
      }

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(resultShape, oc, deflection);
      
      if (!entityId) {
        resultShape.delete();
      }

      self.postMessage({ type: 'createExtrude', success: true, payload: geometryData, id });
    } catch (error: any) {
      const errorMessage = decodeOCCError('createExtrude', error);
      self.postMessage({ type: 'createExtrude', success: false, error: errorMessage, id });
    }
  } else if (type === 'createSweep') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { profilePoints, spinePoints, isSolid, deflection, entityId, profileCount, cornerMode } = payload;
    try {
      let resultShape: any = null;

      // Build spine wire
      const spineWireMaker = new oc.BRepBuilderAPI_MakeWire_1();
      for (let i = 0; i < spinePoints.length - 1; i++) {
        const p1 = new oc.gp_Pnt_3(spinePoints[i].x, spinePoints[i].y, spinePoints[i].z);
        const p2 = new oc.gp_Pnt_3(spinePoints[i+1].x, spinePoints[i+1].y, spinePoints[i+1].z);
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

      if (count === 1) {
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
        const tangents: {x:number, y:number, z:number}[] = [];
        for (let i = 0; i < N; i++) {
          let tx = 0, ty = 0, tz = 0;
          if (i === 0) {
            tx = spinePoints[1].x - spinePoints[0].x;
            ty = spinePoints[1].y - spinePoints[0].y;
            tz = spinePoints[1].z - spinePoints[0].z;
          } else if (i === N - 1) {
            tx = spinePoints[N-1].x - spinePoints[N-2].x;
            ty = spinePoints[N-1].y - spinePoints[N-2].y;
            tz = spinePoints[N-1].z - spinePoints[N-2].z;
          } else {
            tx = spinePoints[i+1].x - spinePoints[i-1].x;
            ty = spinePoints[i+1].y - spinePoints[i-1].y;
            tz = spinePoints[i+1].z - spinePoints[i-1].z;
          }
          const len = Math.sqrt(tx*tx + ty*ty + tz*tz);
          tangents.push({ x: tx/len, y: ty/len, z: tz/len });
        }
        
        // Compute frames using Double Reflection Method (RMF)
        const frames: { T: {x:number,y:number,z:number}, X: {x:number,y:number,z:number}, Y: {x:number,y:number,z:number} }[] = [];
        
        // Initial frame at P0
        const T0 = tangents[0];
        let N0 = { x: 0, y: 0, z: 1 }; // Default up vector
        if (Math.abs(T0.z) > 0.99) {
          N0 = { x: 1, y: 0, z: 0 };
        }
        // X = cross(N0, T0)
        let xx = N0.y*T0.z - N0.z*T0.y;
        let xy = N0.z*T0.x - N0.x*T0.z;
        let xz = N0.x*T0.y - N0.y*T0.x;
        const xlen = Math.sqrt(xx*xx + xy*xy + xz*xz);
        xx /= xlen; xy /= xlen; xz /= xlen;
        
        // Y = cross(T0, X)
        const yx = T0.y*xz - T0.z*xy;
        const yy = T0.z*xx - T0.x*xz;
        const yz = T0.x*xy - T0.y*xx;
        
        frames.push({ T: T0, X: {x:xx, y:xy, z:xz}, Y: {x:yx, y:yy, z:yz} });

        for (let i = 1; i < N; i++) {
          const Pprev = spinePoints[i-1];
          const Pcurr = spinePoints[i];
          const Tprev = frames[i-1].T;
          const Tcurr = tangents[i];
          const Xprev = frames[i-1].X;
          const Yprev = frames[i-1].Y;
          
          // Step 1: v1 = Pcurr - Pprev
          const v1x = Pcurr.x - Pprev.x;
          const v1y = Pcurr.y - Pprev.y;
          const v1z = Pcurr.z - Pprev.z;
          const c1 = v1x*v1x + v1y*v1y + v1z*v1z;
          
          if (c1 < 1e-12) {
            frames.push({ T: Tcurr, X: Xprev, Y: Yprev });
            continue;
          }
          
          // Step 3: XprevL = Xprev - (2/c1) * (v1 . Xprev) * v1
          const dot1 = v1x*Xprev.x + v1y*Xprev.y + v1z*Xprev.z;
          const factor1 = 2 / c1 * dot1;
          const XprevLx = Xprev.x - factor1 * v1x;
          const XprevLy = Xprev.y - factor1 * v1y;
          const XprevLz = Xprev.z - factor1 * v1z;
          
          // Step 4: TprevL = Tprev - (2/c1) * (v1 . Tprev) * v1
          const dot2 = v1x*Tprev.x + v1y*Tprev.y + v1z*Tprev.z;
          const factor2 = 2 / c1 * dot2;
          const TprevLx = Tprev.x - factor2 * v1x;
          const TprevLy = Tprev.y - factor2 * v1y;
          const TprevLz = Tprev.z - factor2 * v1z;
          
          // Step 5: v2 = Tcurr - TprevL
          const v2x = Tcurr.x - TprevLx;
          const v2y = Tcurr.y - TprevLy;
          const v2z = Tcurr.z - TprevLz;
          const c2 = v2x*v2x + v2y*v2y + v2z*v2z;
          
          let Xcurr = { x: XprevLx, y: XprevLy, z: XprevLz };
          if (c2 > 1e-12) {
            // Step 7: Xcurr = XprevL - (2/c2) * (v2 . XprevL) * v2
            const dot3 = v2x*XprevLx + v2y*XprevLy + v2z*XprevLz;
            const factor3 = 2 / c2 * dot3;
            Xcurr.x -= factor3 * v2x;
            Xcurr.y -= factor3 * v2y;
            Xcurr.z -= factor3 * v2z;
          }
          
          // Normalize Xcurr
          const xlen2 = Math.sqrt(Xcurr.x*Xcurr.x + Xcurr.y*Xcurr.y + Xcurr.z*Xcurr.z);
          Xcurr.x /= xlen2; Xcurr.y /= xlen2; Xcurr.z /= xlen2;
          
          // Step 8: Ycurr = cross(Tcurr, Xcurr)
          const Ycurr = {
            x: Tcurr.y*Xcurr.z - Tcurr.z*Xcurr.y,
            y: Tcurr.z*Xcurr.x - Tcurr.x*Xcurr.z,
            z: Tcurr.x*Xcurr.y - Tcurr.y*Xcurr.x
          };
          
          frames.push({ T: Tcurr, X: Xcurr, Y: Ycurr });
        }
        
        // Generate vertices
        for (let i = 0; i < N; i++) {
          const frame = frames[i];
          const T = frame.T;
          const X = frame.X;
          const Y = frame.Y;
          
          for (let j = 0; j < M; j++) {
            const p = profilePoints[j];
            const x = p.x - cx;
            const y = p.y - cy;
            const z = p.z - cz;
            
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
          positions.push(spinePoints[N-1].x, spinePoints[N-1].y, spinePoints[N-1].z);
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
        
        self.postMessage({ type: 'createSweep', success: true, payload: geometryData, id });
        return;
      } else {
        // Use MakePipeShell for multiple profiles
        const sweepBuilder = new oc.BRepOffsetAPI_MakePipeShell(spineWire);
        
        // Try to set fixed binormal to Z axis to prevent twisting!
        try {
          const zDir = new oc.gp_Dir_4(0, 0, 1);
          // @ts-ignore
          sweepBuilder.SetMode_2(zDir);
          zDir.delete();
        } catch (e) {
          sweepBuilder.SetMode_1(false); // Corrected Frenet
        }

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
            const p2 = new oc.gp_Pnt_3(currentProfilePts[i+1].x, currentProfilePts[i+1].y, currentProfilePts[i+1].z);
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
        sweepBuilder.delete();
      }

      if (entityId) {
        cacheShape(entityId, resultShape);
      }

      const geometryData = shapeToBufferGeometryData(resultShape, oc, deflection);
      
      if (!entityId) {
        resultShape.delete();
      }

      spineWireMaker.delete();

      self.postMessage({ type: 'createSweep', success: true, payload: geometryData, id });
    } catch (error: any) {
      const errorMessage = decodeOCCError('createSweep', error);
      self.postMessage({ type: 'createSweep', success: false, error: errorMessage, id });
    }
  } else if (type === 'createRevolve') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { points, axisPoint, axisDir, angle, thickness, deflection, isClosed, entityId } = payload;
    try {
      let resultShape: any = null;
      const angleRad = angle * Math.PI / 180;
      const revAxis = new oc.gp_Ax1_2(new oc.gp_Pnt_3(axisPoint.x, axisPoint.y, axisPoint.z), new oc.gp_Dir_4(axisDir.x, axisDir.y, axisDir.z));

        // Build wire from all profile points
        const makeWire = new oc.BRepBuilderAPI_MakeWire_1();


        for (let i = 0; i < points.length - 1; i++) {

          const pi  = new oc.gp_Pnt_3(points[i].x,   points[i].y,   points[i].z);
          const pi1 = new oc.gp_Pnt_3(points[i+1].x, points[i+1].y, points[i+1].z);
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
          const pLast  = new oc.gp_Pnt_3(points[points.length-1].x, points[points.length-1].y, points[points.length-1].z);
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

        const builder = new oc.BRepPrimAPI_MakeRevol_1(isClosed ? faceMaker.Face() : profile, revAxis, angleRad, false);

        resultShape = builder.Shape();

        makeWire.delete();
        if (isClosed) {
          faceMaker.delete();
        } else {
          profile.delete();
        }
        builder.delete();


      revAxis.delete();


      if (entityId) {
        cacheShape(entityId, resultShape);
      }

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(resultShape, oc, deflection);
      
      if (!entityId) {
        resultShape.delete();
      }

      self.postMessage({ type: 'createRevolve', success: true, payload: geometryData, id });
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

      if (boolBuilder && boolBuilder.SetFuzzyValue) {
        boolBuilder.SetFuzzyValue(0.01);
      }
      boolBuilder.Build();

      if (!boolBuilder.IsDone()) {
        boolBuilder.delete();
        throw new Error(`Boolean ${operation} failed — shapes may not intersect or be invalid`);
      }

      const resultShape = boolBuilder.Shape();
      if (resultShape.IsNull()) {
        boolBuilder.delete();
        throw new Error(`Boolean ${operation} produced an empty result`);
      }
      // Fallback check: ensure the shape has faces
      const exp = new oc.TopExp_Explorer_2(resultShape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      const hasFaces = exp.More();
      exp.delete();
      if (!hasFaces) {
        boolBuilder.delete();
        throw new Error(`Boolean ${operation} produced a shape with no faces — shapes may not intersect`);
      }

      // Section 9: BRepCheck validation
      if (oc.BRepCheck_Analyzer) {
        const analyzer = new oc.BRepCheck_Analyzer(resultShape, true);
        try {
          // Check if method exists and is a function
          const isValidFn = analyzer.IsValid || (analyzer as any).isValid;
          if (typeof isValidFn === 'function') {
            if (!isValidFn.call(analyzer)) {
              analyzer.delete();
              boolBuilder.delete();
              throw new Error(`Boolean ${operation} produced an invalid/degenerate shape`);
            }
          } else {
            console.warn(`BRepCheck_Analyzer exists but IsValid is not a function. Methods:`, Object.getOwnPropertyNames(Object.getPrototypeOf(analyzer)));
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

      const geometryData = shapeToBufferGeometryData(resultShape, oc, deflection);
      
      if (!entityId) {
        resultShape.delete();
      }
      boolBuilder.delete();
      if (shapeA !== originalShapeA) shapeA.delete();
      if (shapeB !== originalShapeB) shapeB.delete();

      self.postMessage({ type: 'createBoolean', success: true, payload: geometryData, id });
    } catch (error: any) {
      const errorMessage = decodeOCCError('createBoolean', error);
      self.postMessage({ type: 'createBoolean', success: false, error: errorMessage, id });
    }
  } else if (type === 'transformShape') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { entityId, dx, dy, dz } = payload;
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
      
      cacheShape(entityId, newShape); // Update cache
      
      translation.delete();
      transform.delete();
      brepTransform.delete();
      
      self.postMessage({ type: 'transformShape', success: true, id });
    } catch (error: any) {
      const errorMessage = decodeOCCError('transformShape', error);
      self.postMessage({ type: 'transformShape', success: false, error: errorMessage, id });
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
      if (!shape) {
        const keys = Array.from(shapeCache.keys());
        self.postMessage({ type: 'exportBRep', success: false,
          error: `No cached shape for entityId: ${entityId}. Cached keys: ${keys.join(', ')}`, id });
        return;
      }
      const filename = `${entityId}.stp`;
      
      let stepError = null;
      if (typeof oc.STEPControl_Writer_1 === 'function' || typeof oc.STEPControl_Writer === 'function') {
        try {
          const writer = typeof oc.STEPControl_Writer_1 === 'function' 
            ? new oc.STEPControl_Writer_1() 
            : new oc.STEPControl_Writer();
            
          try {
            writer.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true);
          } catch(e) {
            writer.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, new oc.Message_ProgressRange_1());
          }
          
          writer.Write(filename);
          
          const stepBytes = oc.FS.readFile(filename);
          oc.FS.unlink(filename);
          
          (self as any).postMessage(
            { type: 'exportBRep', success: true, id, payload: stepBytes },
            [stepBytes.buffer]
          );
          return;
        } catch(e: any) {
          stepError = e.message || e.toString();
          console.log("[Worker] STEP export failed, falling back:", e);
        }
      }
      
      // Fallback to BinTools or BRepTools
      const brepFilename = `${entityId}.brep`;
      let success = false;
      if (oc.BinTools && typeof oc.BinTools.Write_2 === 'function') {
        try {
          oc.BinTools.Write_2(shape, brepFilename);
          success = true;
        } catch(e) { console.log("[Worker] BinTools.Write_2 failed:", e); }
      } else if (oc.BinTools && typeof oc.BinTools.Write === 'function') {
        try {
          oc.BinTools.Write(shape, brepFilename);
          success = true;
        } catch(e) { console.log("[Worker] BinTools.Write failed:", e); }
      }
      
      if (!success) {
        if (typeof oc.BRepTools.Write_3 === 'function') {
          success = oc.BRepTools.Write_3(shape, brepFilename);
        } else if (typeof oc.BRepTools.Write === 'function') {
          try { success = oc.BRepTools.Write(shape, brepFilename); } catch(e) { }
        }
      }
      
      if (!success) {
        const binKeys = oc.BinTools ? Object.keys(oc.BinTools).filter(k => k.startsWith('Write')) : [];
        const brepKeys = Object.keys(oc.BRepTools).filter(k => k.startsWith('Write'));
        const stepWriterExists = typeof oc.STEPControl_Writer_1 === 'function' || typeof oc.STEPControl_Writer === 'function';
        throw new Error(`Failed to export shape. STEP error: ${stepError}. BinTools keys: [${binKeys.join(', ')}]. BRepTools keys: [${brepKeys.join(', ')}]. STEPWriter exists: ${stepWriterExists}`);
      }
      
      const brepBytes = oc.FS.readFile(brepFilename);
      oc.FS.unlink(brepFilename);
      
      (self as any).postMessage(
        { type: 'exportBRep', success: true, id, payload: brepBytes },
        [brepBytes.buffer]
      );
    } catch (err: any) {
      self.postMessage({ type: 'exportBRep', success: false, error: err.message, id });
    }

  } else if (type === 'importBRep') {
    const { entityId, brepBytes, deflection } = payload;
    try {
      const filename = `${entityId}.stp`;
      oc.FS.writeFile(filename, new Uint8Array(brepBytes));
      
      let success = false;
      let loadedShape: any = null;
      
      if (typeof oc.STEPControl_Reader_1 === 'function' || typeof oc.STEPControl_Reader === 'function') {
        try {
          const reader = typeof oc.STEPControl_Reader_1 === 'function' 
            ? new oc.STEPControl_Reader_1() 
            : new oc.STEPControl_Reader();
            
          const status = reader.ReadFile(filename);
          if (status === oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
            reader.TransferRoots();
            loadedShape = reader.OneShape();
            success = true;
          }
        } catch(e) {
          console.log("[Worker] STEP import failed, falling back:", e);
        }
      }
      
      const shape = new oc.TopoDS_Shape();
      const builder = new oc.BRep_Builder();
      
      if (!success) {
        const brepFilename = `${entityId}.brep`;
        oc.FS.writeFile(brepFilename, new Uint8Array(brepBytes));
        
        if (oc.BinTools && typeof oc.BinTools.Read_2 === 'function') {
          try {
            oc.BinTools.Read_2(shape, brepFilename);
            success = true;
          } catch(e) { }
        } else if (oc.BinTools && typeof oc.BinTools.Read === 'function') {
          try {
            oc.BinTools.Read(shape, brepFilename);
            success = true;
          } catch(e) { }
        }
        
        if (!success) {
          if (typeof oc.BRepTools.Read === 'function') {
            success = oc.BRepTools.Read(shape, brepFilename, builder);
          } else if (typeof oc.BRepTools.Read_1 === 'function') {
            success = oc.BRepTools.Read_1(shape, brepFilename, builder);
          }
        }
        
        oc.FS.unlink(brepFilename);
        loadedShape = shape;
      }
      
      if (!success) {
        throw new Error("Failed to import shape using STEP, BinTools, or BRepTools.");
      }
      
      oc.FS.unlink(filename);
      
      cacheShape(entityId, loadedShape);    // now available for boolean ops
      
      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(loadedShape, oc, deflection || 0.01);
      
      self.postMessage({ type: 'importBRep', success: true, payload: geometryData, id });
    } catch (err: any) {
      self.postMessage({ type: 'importBRep', success: false, error: err.message, id });
    }
  }
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shapeToBufferGeometryData(shape: any, oc: any, linearDeflection: number = 0.01) {
  // Triangulate the shape
  new oc.BRepMesh_IncrementalMesh_2(shape, linearDeflection, false, 0.5, false);

  const positions: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  // Explore all faces
  const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  
  while (explorer.More()) {
    const faceShape = explorer.Current();

    // Guard: skip non-face shapes — can occur when the shape is a shell
    // rather than a solid. The OCC.js binding rejects TopoDS.Face_1() on a
    // plain TopoDS_Shape reference that isn't a proper TopoDS_Face subtype.
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
      }
      vertexOffset += nbNodes;
    }
    explorer.Next();
  }

  return { positions, indices };
}
