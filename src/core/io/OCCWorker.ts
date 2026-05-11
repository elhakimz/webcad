import { initOpenCascade } from "opencascade.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let oc: any = null;

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
    const { x, y, z, dx, dy, dz, deflection } = payload;
    try {
      const pt = new oc.gp_Pnt_3(x, y, z);
      const box = new oc.BRepPrimAPI_MakeBox_2(pt, dx, dy, dz);
      const shape = box.Shape();

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
    const { x, y, z, r, h, deflection } = payload;
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
    const { x, y, z, r, deflection } = payload;
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
    const { x, y, z, r, h, deflection } = payload;
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
    const { x, y, z, r1, r2, deflection } = payload;
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
    const { points, height, thickness, deflection, isClosed } = payload;
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
            const fuse = new oc.BRepAlgoAPI_Fuse_4(resultShape, shapes[i]);


            fuse.Build();
            if (fuse.IsDone()) {
              resultShape = fuse.Shape();
            }
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

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(resultShape, oc, deflection);
      resultShape.delete();

      self.postMessage({ type: 'createExtrude', success: true, payload: geometryData, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'createExtrude', success: false, error: errorMessage, id });
    }
  } else if (type === 'createRevolve') {
    if (!oc) {
      self.postMessage({ type: 'error', error: 'Not initialized', id });
      return;
    }
    const { points, axisPoint, axisDir, angle, thickness, deflection, isClosed } = payload;
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


      if (!resultShape) {
        throw new Error("Failed to create revolve shape.");
      }

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(resultShape, oc, deflection);
      resultShape.delete();

      self.postMessage({ type: 'createRevolve', success: true, payload: geometryData, id });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      self.postMessage({ type: 'createRevolve', success: false, error: errorMessage, id });
    }
  }
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shapeToBufferGeometryData(shape: any, oc: any, linearDeflection: number = 0.1) {
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
