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
  async createBox(x: number, y: number, z: number, dx: number, dy: number, dz: number, deflection?: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.createBox(x, y, z, dx, dy, dz, deflection);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Creates a basic 3D cylinder shape.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createCylinder(x: number, y: number, z: number, r: number, h: number, deflection?: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.createCylinder(x, y, z, r, h, deflection);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Creates a basic 3D sphere shape.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createSphere(x: number, y: number, z: number, r: number, deflection?: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.createSphere(x, y, z, r, deflection);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Creates a basic 3D cone shape.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createCone(x: number, y: number, z: number, r: number, h: number, deflection?: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.createCone(x, y, z, r, h, deflection);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Creates a basic 3D torus shape.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createTorus(x: number, y: number, z: number, r1: number, r2: number, deflection?: number): Promise<THREE.BufferGeometry> {
    const data = await this.client.createTorus(x, y, z, r1, r2, deflection);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Creates a extruded shape from points.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createExtrude(points: {x: number, y: number, z: number}[], height: number, thickness?: number, deflection?: number, isClosed?: boolean): Promise<THREE.BufferGeometry> {
    const data = await this.client.createExtrude(points, height, thickness, deflection, isClosed);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Creates a revolved shape from points.
   * Returns a Promise that resolves to THREE.BufferGeometry.
   */
  async createRevolve(points: {x: number, y: number, z: number}[], axisPoint: {x: number, y: number, z: number}, axisDir: {x: number, y: number, z: number}, angle: number, thickness?: number, deflection?: number, isClosed?: boolean): Promise<THREE.BufferGeometry> {
    const data = await this.client.createRevolve(points, axisPoint, axisDir, angle, thickness, deflection, isClosed);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    
    return geometry;
  }
}


