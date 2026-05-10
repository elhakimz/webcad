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
    const { x, y, z, dx, dy, dz } = payload;
    try {
      const pt = new oc.gp_Pnt_3(x, y, z);
      const box = new oc.BRepPrimAPI_MakeBox_2(pt, dx, dy, dz);
      const shape = box.Shape();

      // Tessellate and get geometry data
      const geometryData = shapeToBufferGeometryData(shape, oc);

      pt.delete();
      box.delete();

      self.postMessage({ type: 'createBox', success: true, payload: geometryData, id });
    } catch (error: any) {
      self.postMessage({ type: 'createBox', success: false, error: error.message, id });
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
