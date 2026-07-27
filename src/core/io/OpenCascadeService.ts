import * as THREE from "three";
import { OCCWorkerClient } from "./OCCWorkerClient";

export type Vec3Like = { x: number; y: number; z: number } | [number, number, number];

function toVec3(v: Vec3Like): { x: number; y: number; z: number } {
  return Array.isArray(v) ? { x: v[0], y: v[1], z: v[2] } : v;
}

export class OpenCascadeService {
  private static instance: OpenCascadeService;
  private workerClient: OCCWorkerClient | null = null;
  private loading: Promise<void> | null = null;
  private errorCallback: ((msg: string) => void) | null = null;

  public onError(callback: (msg: string) => void) {
    this.errorCallback = callback;
  }

  private reportError(msg: string) {
    console.error(msg);
    if (this.errorCallback) this.errorCallback(msg);
  }

  private constructor() {}

  static getInstance(): OpenCascadeService {
    if (!OpenCascadeService.instance) {
      OpenCascadeService.instance = new OpenCascadeService();
    }
    return OpenCascadeService.instance;
  }

  async init(): Promise<void> {
    if (this.workerClient) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      try {
        this.workerClient = new OCCWorkerClient();
        await this.workerClient.init();
        console.log("OpenCascade Worker initialized successfully");
      } catch (error) {
        this.reportError(`Failed to initialize OpenCascade Worker: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    })();

    return this.loading;
  }

  get client() {
    if (!this.workerClient) throw new Error("OpenCascade not initialized. Call init() first.");
    return this.workerClient;
  }

  /** True once the worker has finished booting. Read-only probe — unlike `client`, never throws. */
  get isInitialized(): boolean {
    return this.workerClient !== null;
  }

  /** Kernel requests still in flight. 0 means the kernel is idle. */
  get pendingCount(): number {
    return this.workerClient ? this.workerClient.pendingCount : 0;
  }

  async clearCache(): Promise<{ success: boolean }> {
    return this.client.clearCache();
  }

  /**
   * Helper to build THREE.BufferGeometry from worker response.
   * Eliminates redundancy and incorporates inline BRep snapshots.
   */
  private buildGeometry(data: any): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    if (data.indices instanceof Uint32Array || data.indices instanceof Uint16Array) {
      geometry.setIndex(new THREE.Uint32BufferAttribute(data.indices, 1));
    } else {
      geometry.setIndex(data.indices);
    }
    geometry.computeVertexNormals();
    
    // FIX: Guarantee valid Uint8Array regardless of worker transfer mechanics
    let validBrep = data.brepBytes ?? data.brepSnapshot;
    if (validBrep instanceof ArrayBuffer) {
      validBrep = new Uint8Array(validBrep);
    } else if (validBrep && typeof validBrep === 'object' && !(validBrep instanceof Uint8Array)) {
      // Handles cases where the worker wrapper serialized the buffer to JSON
      validBrep = new Uint8Array(Object.values(validBrep));
    }

    if(validBrep==undefined){
       console.error("[ERROR] [buildGeometry] NO validBrep ",validBrep);
  
    }
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines,
      brepSnapshot: validBrep,
      brepBytes: validBrep
    };
    
    return geometry;
  }

  /**
   * Creates a basic 3D box shape.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createBox(x: number, y: number, z: number, dx: number, dy: number, dz: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createBox(x, y, z, dx, dy, dz, deflection, entityId);
    return this.buildGeometry(data);
  }

  /**
   * Creates a basic 3D cylinder shape.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createCylinder(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createCylinder(x, y, z, r, h, deflection, entityId);
    return this.buildGeometry(data);
  }

  /**
   * Creates a basic 3D sphere shape.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createSphere(x: number, y: number, z: number, r: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createSphere(x, y, z, r, deflection, entityId);
    return this.buildGeometry(data);
  }

  /**
   * Creates a basic 3D cone shape.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createCone(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createCone(x, y, z, r, h, deflection, entityId);
    return this.buildGeometry(data);
  }

  /**
   * Creates a variable-radius frustum/cone/cylinder shape.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createFrustum(x: number, y: number, z: number, r1: number, r2: number, h: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createFrustum(x, y, z, r1, r2, h, deflection, entityId);
    return this.buildGeometry(data);
  }

  /**
   * Creates a polyhedron shape from points and face indices.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createPolyhedron(points: any[], faces: number[][], deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createPolyhedron(points, faces, deflection, entityId);
    const geom = this.buildGeometry(data);
    geom.userData.nakedLines = data.nakedLines;
    geom.userData.isSolid = data.isSolid;
    return geom;
  }

  /**
   * Creates a convex hull shape from points and/or child shape ids.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createConvexHull(points?: any[], shapeIds?: string[], deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createConvexHull(points, shapeIds, deflection, entityId);
    const geom = this.buildGeometry(data);
    geom.userData.isSolid = data.isSolid;
    return geom;
  }

  async createTorus(x: number, y: number, z: number, r1: number, r2: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createTorus(x, y, z, r1, r2, deflection, entityId);
    return this.buildGeometry(data);
  }

  async createWedge(x1: number, y1: number, z1: number, x2: number, y2: number, height: number, ltx: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createWedge(x1, y1, z1, x2, y2, height, ltx, deflection, entityId);
    return this.buildGeometry(data);
  }

  async createPyramid(x: number, y: number, z: number, sides: number, radius: number, h: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createPyramid(x, y, z, sides, radius, h, deflection, entityId);
    return this.buildGeometry(data);
  }

  /**
   * Creates a extruded shape from points.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createExtrude(points: any[], height: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string, vector?: number[]): Promise<THREE.BufferGeometry> {
    const data = await this.client.createExtrude(points, height, thickness, deflection, isClosed, entityId, vector);
    return this.buildGeometry(data);
  }

  async createSweep(profilePoints: {x: number, y: number, z: number}[], spinePoints: {x: number, y: number, z: number}[], isSolid: boolean, deflection?: number, entityId?: string, profileCount?: number, cornerMode?: string, isEllipse?: boolean): Promise<THREE.BufferGeometry> {
    const data = await this.client.createSweep(profilePoints, spinePoints, isSolid, deflection, entityId, profileCount, cornerMode, isEllipse);
    return this.buildGeometry(data);
  }

  async createLoft(profiles: {id: string, points: {x: number, y: number, z: number}[], closed: boolean}[], isSolid: boolean, isRuled: boolean, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    console.log("OpenCascadeService.createLoft", profiles);
    const data = await (this.client as any).createLoft(profiles, isSolid, isRuled, deflection, entityId);
    return this.buildGeometry(data);
  }

  /**
   * Creates a revolved shape from points.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createRevolve(points: any[], axisPoint: Vec3Like, axisDir: Vec3Like, angle: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string): Promise<THREE.BufferGeometry> {
    const ap = toVec3(axisPoint);
    const ad = toVec3(axisDir);
    const data = await this.client.createRevolve(points, ap, ad, angle, thickness, deflection, isClosed, entityId);
    return this.buildGeometry(data);
  }

  async createCompound(childrenIds: string[], entityId: string, deflection?: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.createCompound(childrenIds, entityId, deflection);
    return this.buildGeometry(data);
  }

  async createBoolean(operation: 'fuse' | 'cut' | 'common', idA: string, idB: string, entityId: string, deflection?: number, rotA?: {x:number, y:number, z:number}, rotB?: {x:number, y:number, z:number}, centerA?: {x:number, y:number, z:number}, centerB?: {x:number, y:number, z:number}): Promise<THREE.BufferGeometry> {
    const data = await (this.client as any).createBoolean(operation, idA, idB, entityId, deflection, rotA, rotB, centerA, centerB);
    return this.buildGeometry(data);
  }

  async transformShape(entityId: string, dx: number, dy: number, dz: number, targetEntityId?: string, deflection?: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.transformShape(entityId, dx, dy, dz, targetEntityId, deflection);
    return this.buildGeometry(data);
  }

  async rotateShape(entityId: string, rx: number, ry: number, rz: number, cx: number, cy: number, cz: number, targetEntityId?: string, deflection?: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.rotateShape(entityId, rx, ry, rz, cx, cy, cz, targetEntityId, deflection);
    return this.buildGeometry(data);
  }

  async mirrorShape(entityId: string, p1: { x: number, y: number, z?: number } | undefined, p2: { x: number, y: number, z?: number } | undefined, targetEntityId?: string, deflection?: number, normal?: { x: number, y: number, z?: number }): Promise<THREE.BufferGeometry> {
    const data = await this.client.mirrorShape(entityId, p1, p2, targetEntityId, deflection, normal);
    return this.buildGeometry(data);
  }

  async scaleShape(entityId: string, factor: number | undefined, cx: number, cy: number, cz: number, targetEntityId?: string, deflection?: number, factorX?: number, factorY?: number, factorZ?: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.scaleShape(entityId, factor, cx, cy, cz, targetEntityId, deflection, factorX, factorY, factorZ);
    return this.buildGeometry(data);
  }

  async multMatrixShape(entityId: string, m: number[], targetEntityId?: string, deflection?: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.multMatrixShape(entityId, m, targetEntityId, deflection);
    return this.buildGeometry(data);
  }

  async releaseShapes(entityIds: string[]): Promise<void> {
    await this.client.releaseShapes(entityIds);
  }

  async exportBRep(entityId: string): Promise<Uint8Array> {
    return this.client.exportBRep(entityId);
  }

  async importBRep(entityId: string, brepBytes: Uint8Array, deflection?: number): Promise<any> {
    return await this.workerClient!.importBRep(entityId, brepBytes, deflection);
  }

  async filletSolid(entityId: string, edgeIndex: number, radius: number, deflection: number = 0.1, visualP1?: any, visualP2?: any): Promise<THREE.BufferGeometry> {
    const data = await this.client.filletSolid(entityId, edgeIndex, radius, deflection, visualP1, visualP2);
    return this.buildGeometry(data);
  }

  async chamferSolid(entityId: string, edgeIndex: number, radius: number, deflection: number = 0.1, visualP1?: any, visualP2?: any): Promise<THREE.BufferGeometry> {
    const data = await this.client.chamferSolid(entityId, edgeIndex, radius, deflection, visualP1, visualP2);
    return this.buildGeometry(data);
  }

  async filletSolidFace(entityId: string, faceIndex: number, radius: number, deflection: number = 0.1): Promise<THREE.BufferGeometry> {
    const data = await this.client.filletSolidFace(entityId, faceIndex, radius);
    return this.buildGeometry(data);
  }

  async chamferSolidFace(entityId: string, faceIndex: number, radius: number, deflection: number = 0.1): Promise<THREE.BufferGeometry> {
    const data = await this.client.chamferSolidFace(entityId, faceIndex, radius);
    return this.buildGeometry(data);
  }

  async makeThickSolid(entityId: string, faceIndices: number[], thickness: number, deflection: number = 0.1, removeFaces: boolean = true): Promise<THREE.BufferGeometry> {
    const data = await this.client.makeThickSolid(entityId, faceIndices, thickness, removeFaces);
    return this.buildGeometry(data);
  }

  async draftSolidFaces(entityId: string, faceIndices: number[], neutralFaceIndex: number, angleRad: number, deflection: number = 0.1): Promise<THREE.BufferGeometry> {
    const data = await this.client.draftSolidFaces(entityId, faceIndices, neutralFaceIndex, angleRad);
    return this.buildGeometry(data);
  }

  async checkValidity(entityId: string): Promise<{ isValid: boolean, faceCount: number, errorMsg: string }> {
    return this.client.checkValidity(entityId);
  }

  async extractFaceProfile(entityId: string, faceIndex: number, deflection: number = 0.1): Promise<{ x: number, y: number, bulge: number }[][]> {
    const data = await this.client.extractFaceProfile(entityId, faceIndex, deflection);
    return data.loops;
  }

  async rehydrate(doc: any): Promise<void> {
    if (!this.workerClient) return;
    
    console.log("[OCC] Re-hydrating worker with current solids...");
    const entities = doc.getEntities ? doc.getEntities() : (doc.entities ? Array.from(doc.entities.values()) : []);
    for (const entity of entities) {
      if ((entity as any).type === "Solid3D") {
        const solid = entity as any;
        if (solid.brepSnapshot) {
          try {
            const deflection = 0.1 / (doc.facetres || 5.0);
            const data = await this.workerClient.importBRep(solid.id, solid.brepSnapshot, deflection);
            if (data && data.positions) {
                solid.positions = data.positions;
                solid.indices = data.indices;
                solid.faceMapping = data.faceMapping;
                solid.edgeLines = data.edgeLines;
                console.log(`[OCC] Re-hydrated and re-tessellated solid ${solid.id} (Facetres: ${doc.facetres})`);
            }
          } catch (e) {
            this.reportError(`[OCC] Failed to re-hydrate solid ${solid.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
    }
  }
}


