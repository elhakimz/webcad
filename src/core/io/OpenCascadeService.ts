import { initOpenCascade } from "opencascade.js";
import * as THREE from "three";

export class OpenCascadeService {
  private static instance: OpenCascadeService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private oc: any = null;
  private loading: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): OpenCascadeService {
    if (!OpenCascadeService.instance) {
      OpenCascadeService.instance = new OpenCascadeService();
    }
    return OpenCascadeService.instance;
  }

  async init(): Promise<void> {
    if (this.oc) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      try {
        // initOpenCascade from opencascade.js returns a promise that resolves to the OCCT instance
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.oc = await (initOpenCascade as any)();
        console.log("OpenCascade.js initialized successfully");
      } catch (error) {
        console.error("Failed to initialize OpenCascade.js:", error);
        throw error;
      }
    })();

    return this.loading;
  }

  get OC() {
    if (!this.oc) throw new Error("OpenCascade not initialized. Call init() first.");
    return this.oc;
  }

  /**
   * Creates a basic 3D box shape.
   */
  createBox(x: number, y: number, z: number, dx: number, dy: number, dz: number): any {
    const oc = this.OC;
    const pt = new oc.gp_Pnt_3(x, y, z);
    const box = new oc.BRepPrimAPI_MakeBox_2(pt, dx, dy, dz);
    const shape = box.Shape();
    // Cleanup temporary objects
    pt.delete();
    box.delete();
    return shape;
  }

  /**
   * Converts an OCCT Shape to Three.js BufferGeometry via triangulation.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shapeToBufferGeometry(shape: any, linearDeflection: number = 0.1): THREE.BufferGeometry {
    const oc = this.OC;

    // 1. Triangulate the shape
    // BRepMesh_IncrementalMesh(shape, deflection, isRelative, angularDeflection)
    new oc.BRepMesh_IncrementalMesh_2(shape, linearDeflection, false, 0.5, false);

    const positions: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    // 2. Explore all faces
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

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}
