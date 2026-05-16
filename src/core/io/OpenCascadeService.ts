import * as THREE from "three";
import { OCCWorkerClient } from "./OCCWorkerClient";

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
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines,
      brepSnapshot: data.brepBytes ?? undefined
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

  async filletSolid(entityId: string, edgeIndex: number, radius: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.filletSolid(entityId, edgeIndex, radius);
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
   * Creates a basic 3D torus shape.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createTorus(x: number, y: number, z: number, r1: number, r2: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createTorus(x, y, z, r1, r2, deflection, entityId);
    return this.buildGeometry(data);
  }

  /**
   * Creates a extruded shape from points.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createExtrude(points: {x: number, y: number, z: number}[], height: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createExtrude(points, height, thickness, deflection, isClosed, entityId);
    return this.buildGeometry(data);
  }

  async createSweep(profilePoints: {x: number, y: number, z: number}[], spinePoints: {x: number, y: number, z: number}[], isSolid: boolean, deflection?: number, entityId?: string, profileCount?: number, cornerMode?: string, isEllipse?: boolean): Promise<THREE.BufferGeometry> {
    const data = await this.client.createSweep(profilePoints, spinePoints, isSolid, deflection, entityId, profileCount, cornerMode, isEllipse);
    return this.buildGeometry(data);
  }

  async createLoft(profiles: {id: string, points: {x: number, y: number, z: number}[], closed: boolean}[], isSolid: boolean, isRuled: boolean, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await (this.client as any).createLoft(profiles, isSolid, isRuled, deflection, entityId);
    return this.buildGeometry(data);
  }

  /**
   * Creates a revolved shape from points.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createRevolve(points: {x: number, y: number, z: number}[], axisPoint: {x: number, y: number, z: number}, axisDir: {x: number, y: number, z: number}, angle: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createRevolve(points, axisPoint, axisDir, angle, thickness, deflection, isClosed, entityId);
    return this.buildGeometry(data);
  }

  async createBoolean(operation: 'fuse' | 'cut' | 'common', idA: string, idB: string, entityId: string, deflection?: number, rotA?: {x:number, y:number, z:number}, rotB?: {x:number, y:number, z:number}, centerA?: {x:number, y:number, z:number}, centerB?: {x:number, y:number, z:number}): Promise<THREE.BufferGeometry> {
    const data = await (this.client as any).createBoolean(operation, idA, idB, entityId, deflection, rotA, rotB, centerA, centerB);
    return this.buildGeometry(data);
  }

  async transformShape(entityId: string, dx: number, dy: number, dz: number): Promise<void> {
    await this.client.transformShape(entityId, dx, dy, dz);
  }

  async rotateShape(entityId: string, rx: number, ry: number, rz: number, cx: number, cy: number, cz: number): Promise<void> {
    await this.client.rotateShape(entityId, rx, ry, rz, cx, cy, cz);
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

  async chamferSolid(entityId: string, edgeIndex: number, distance: number, deflection?: number): Promise<THREE.BufferGeometry> {
    const data = await (this.client as any).chamferSolid(entityId, edgeIndex, distance, deflection);
    return this.buildGeometry(data);
  }

  async filletSolidFace(entityId: string, faceIndex: number, radius: number, deflection?: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.filletSolidFace(entityId, faceIndex, radius);
    return this.buildGeometry(data);
  }

  async chamferSolidFace(entityId: string, faceIndex: number, radius: number, deflection?: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.chamferSolidFace(entityId, faceIndex, radius);
    return this.buildGeometry(data);
  }

  async makeThickSolid(entityId: string, faceIndices: number[], thickness: number, removeFaces?: boolean): Promise<THREE.BufferGeometry> {
    const data = await (this.client as any).makeThickSolid(entityId, faceIndices, thickness, removeFaces);
    return this.buildGeometry(data);
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


