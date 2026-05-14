import * as THREE from "three";
import { OCCWorkerClient } from "./OCCWorkerClient";

export class OpenCascadeService {
  private static instance: OpenCascadeService;
  private workerClient: OCCWorkerClient | null = null;
  private loading: Promise<void> | null = null;

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
        console.error("Failed to initialize OpenCascade Worker:", error);
        throw error;
      }
    })();

    return this.loading;
  }

  get client() {
    if (!this.workerClient) throw new Error("OpenCascade not initialized. Call init() first.");
    return this.workerClient;
  }

  /**
   * Creates a basic 3D box shape.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createBox(x: number, y: number, z: number, dx: number, dy: number, dz: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createBox(x, y, z, dx, dy, dz, deflection, entityId);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines
    };
    
    return geometry;
  }

  async filletSolid(entityId: string, edgeIndex: number, radius: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.filletSolid(entityId, edgeIndex, radius);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines
    };
    
    return geometry;

  }

  /**
   * Creates a basic 3D cylinder shape.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createCylinder(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createCylinder(x, y, z, r, h, deflection, entityId);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines
    };
    
    return geometry;
  }

  /**
   * Creates a basic 3D sphere shape.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createSphere(x: number, y: number, z: number, r: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createSphere(x, y, z, r, deflection, entityId);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines
    };
    
    return geometry;
  }

  /**
   * Creates a basic 3D cone shape.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createCone(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createCone(x, y, z, r, h, deflection, entityId);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines
    };
    
    return geometry;
  }

  /**
   * Creates a basic 3D torus shape.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createTorus(x: number, y: number, z: number, r1: number, r2: number, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createTorus(x, y, z, r1, r2, deflection, entityId);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines
    };
    
    return geometry;
  }

  /**
   * Creates a extruded shape from points.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createExtrude(points: {x: number, y: number, z: number}[], height: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createExtrude(points, height, thickness, deflection, isClosed, entityId);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines
    };
    
    return geometry;
  }

  async createSweep(profilePoints: {x: number, y: number, z: number}[], spinePoints: {x: number, y: number, z: number}[], isSolid: boolean, deflection?: number, entityId?: string, profileCount?: number, cornerMode?: string, isEllipse?: boolean): Promise<THREE.BufferGeometry> {
    const data = await this.client.createSweep(profilePoints, spinePoints, isSolid, deflection, entityId, profileCount, cornerMode, isEllipse);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines
    };
    
    return geometry;
  }

  async createLoft(profiles: {id: string, points: {x: number, y: number, z: number}[], closed: boolean}[], isSolid: boolean, isRuled: boolean, deflection?: number, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await (this.client as any).createLoft(profiles, isSolid, isRuled, deflection, entityId);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines
    };
    
    return geometry;
  }

  /**
   * Creates a revolved shape from points.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createRevolve(points: {x: number, y: number, z: number}[], axisPoint: {x: number, y: number, z: number}, axisDir: {x: number, y: number, z: number}, angle: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string): Promise<THREE.BufferGeometry> {
    const data = await this.client.createRevolve(points, axisPoint, axisDir, angle, thickness, deflection, isClosed, entityId);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines
    };
    
    return geometry;
  }
  async createBoolean(operation: 'fuse' | 'cut' | 'common', idA: string, idB: string, entityId: string, deflection?: number, rotA?: {x:number, y:number, z:number}, rotB?: {x:number, y:number, z:number}, centerA?: {x:number, y:number, z:number}, centerB?: {x:number, y:number, z:number}): Promise<THREE.BufferGeometry> {
    const data = await (this.client as any).createBoolean(operation, idA, idB, entityId, deflection, rotA, rotB, centerA, centerB);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines
    };
    
    return geometry;
  }

  async transformShape(entityId: string, dx: number, dy: number, dz: number): Promise<void> {
    await this.client.transformShape(entityId, dx, dy, dz);
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
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines
    };
    
    return geometry;
  }

  async filletSolidFace(entityId: string, faceIndex: number, radius: number, deflection?: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.filletSolidFace(entityId, faceIndex, radius);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines
    };
    
    return geometry;
  }

  async chamferSolidFace(entityId: string, faceIndex: number, radius: number, deflection?: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.chamferSolidFace(entityId, faceIndex, radius);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    geometry.userData = {
      faceMapping: data.faceMapping,
      edgeLines: data.edgeLines
    };
    
    return geometry;
  }

  async rehydrate(doc: any): Promise<void> {
    if (!this.workerClient) return;
    
    console.log("[OCC] Re-hydrating worker with current solids...");
    for (const entity of doc.getEntities()) {
      if ((entity as any).type === "Solid3D") {
        const solid = entity as any;
        if (solid.brepSnapshot) {
          try {
            const deflection = 0.1 / (doc.facetres || 5.0);
            await this.workerClient.importBRep(solid.id, solid.brepSnapshot, deflection);
            console.log(`[OCC] Re-hydrated solid ${solid.id}`);
          } catch (e) {
            console.error(`[OCC] Failed to re-hydrate solid ${solid.id}:`, e);
          }
        }
      }
    }
  }
}


