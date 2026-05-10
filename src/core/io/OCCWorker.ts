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
  }
};

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
