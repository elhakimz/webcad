export class OCCWorkerClient {
  private worker: Worker;
  private messageId = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private resolvers = new Map<number, (value: any) => void>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rejecters = new Map<number, (reason: any) => void>();

  constructor() {
    // Vite specific way to load worker
    this.worker = new Worker(new URL('./OCCWorker.ts', import.meta.url), { type: 'module' });
    
    this.worker.onmessage = (e) => {
      const { id, type, success, payload, error, message } = e.data;
      
      // Handle generic logs from worker
      if (type === 'log') {
        console.log(`[WorkerLog] ${message}`);
        return;
      }
      if (type === 'error' && id === undefined) {
        console.error(`[WorkerError] ${error}`);
        return;
      }

      const resolver = this.resolvers.get(id);
      const rejecter = this.rejecters.get(id);
      
      if (resolver && rejecter) {
        this.resolvers.delete(id);
        this.rejecters.delete(id);
        
        if (success) {
          resolver(payload);
        } else {
          rejecter(new Error(error || 'Unknown error'));
        }
      }
    };
  }

  init(): Promise<void> {
    return this.send('init', {});
  }

  clearCache(): Promise<{ success: boolean }> {
    return this.send('clearCache', {});
  }

  createBox(x: number, y: number, z: number, dx: number, dy: number, dz: number, deflection?: number, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('createBox', { x, y, z, dx, dy, dz, deflection, entityId });
  }

  createCylinder(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('createCylinder', { x, y, z, r, h, deflection, entityId });
  }

  createSphere(x: number, y: number, z: number, r: number, deflection?: number, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('createSphere', { x, y, z, r, deflection, entityId });
  }

  createCone(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('createCone', { x, y, z, r, h, deflection, entityId });
  }

  createFrustum(x: number, y: number, z: number, r1: number, r2: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('createFrustum', { x, y, z, r1, r2, h, deflection, entityId });
  }

  createPolyhedron(points: any[], faces: number[][], deflection?: number, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array, nakedLines?: number[][], isSolid?: boolean }> {
    return this.send('createPolyhedron', { points, faces, deflection, entityId });
  }

  createConvexHull(points?: any[], shapeIds?: string[], deflection?: number, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array, isSolid?: boolean }> {
    return this.send('createConvexHull', { points, shapeIds, deflection, entityId });
  }

  filletSolid(entityId: string, edgeIndex: number, radius: number): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('filletSolid', { entityId, edgeIndex, radius });
  }

  chamferSolid(entityId: string, edgeIndex: number, radius: number): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('chamferSolid', { entityId, edgeIndex, radius });
  }

  filletSolidFace(entityId: string, faceIndex: number, radius: number): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('filletSolidFace', { entityId, faceIndex, radius });
  }

  chamferSolidFace(entityId: string, faceIndex: number, radius: number): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('chamferSolidFace', { entityId, faceIndex, radius });
  }

  makeThickSolid(entityId: string, faceIndices: number[], thickness: number, removeFaces?: boolean): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('makeThickSolid', { entityId, faceIndices, thickness, removeFaces });
  }

  createTorus(x: number, y: number, z: number, r1: number, r2: number, deflection?: number, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('createTorus', { x, y, z, r1, r2, deflection, entityId });
  }

  createExtrude(points: {x: number, y: number, z: number}[], height: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('createExtrude', { points, height, thickness, deflection, isClosed, entityId });
  }

  createSweep(profilePoints: {x: number, y: number, z: number}[], spinePoints: {x: number, y: number, z: number}[], isSolid: boolean, deflection?: number, entityId?: string, profileCount?: number, cornerMode?: string, isEllipse?: boolean): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('createSweep', { profilePoints, spinePoints, isSolid, deflection, entityId, profileCount, cornerMode, isEllipse });
  }

  createLoft(profiles: {id: string, points: {x: number, y: number, z: number}[], closed: boolean}[], isSolid: boolean, isRuled: boolean, deflection?: number, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('createLoft', { profiles, isSolid, isRuled, deflection, entityId });
  }

  createRevolve(points: {x: number, y: number, z: number}[], axisPoint: {x: number, y: number, z: number}, axisDir: {x: number, y: number, z: number}, angle: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('createRevolve', { points, axisPoint, axisDir, angle, thickness, deflection, isClosed, entityId });
  }

  createBoolean(operation: 'fuse' | 'cut' | 'common', idA: string, idB: string, entityId: string, deflection?: number, rotA?: {x:number, y:number, z:number}, rotB?: {x:number, y:number, z:number}, centerA?: {x:number, y:number, z:number}, centerB?: {x:number, y:number, z:number}): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('createBoolean', { operation, idA, idB, entityId, deflection, rotA, rotB, centerA, centerB });
  }

  transformShape(entityId: string, dx: number, dy: number, dz: number, targetEntityId?: string, deflection?: number): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('transformShape', { entityId, dx, dy, dz, targetEntityId, deflection });
  }

  rotateShape(entityId: string, rx: number, ry: number, rz: number, cx: number, cy: number, cz: number, targetEntityId?: string, deflection?: number): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('rotateShape', { entityId, rx, ry, rz, cx, cy, cz, targetEntityId, deflection });
  }

  mirrorShape(entityId: string, p1: { x: number, y: number, z?: number } | undefined, p2: { x: number, y: number, z?: number } | undefined, targetEntityId?: string, deflection?: number, normal?: { x: number, y: number, z?: number }): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('mirrorShape', { entityId, p1, p2, targetEntityId, deflection, normal });
  }

  scaleShape(entityId: string, factor: number | undefined, cx: number, cy: number, cz: number, targetEntityId?: string, deflection?: number, factorX?: number, factorY?: number, factorZ?: number): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('scaleShape', { entityId, factor, cx, cy, cz, targetEntityId, deflection, factorX, factorY, factorZ });
  }

  multMatrixShape(entityId: string, m: number[], targetEntityId?: string, deflection?: number): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][], brepBytes?: Uint8Array }> {
    return this.send('multMatrixShape', { entityId, m, targetEntityId, deflection });
  }

  releaseShapes(entityIds: string[]): Promise<void> {
    return this.send('releaseShapes', { entityIds });
  }

  exportBRep(entityId: string): Promise<Uint8Array> {
    return this.send('exportBRep', { entityId });
  }

  importBRep(entityId: string, brepBytes: Uint8Array, deflection?: number): Promise<any> {
    return this.send('importBRep', { entityId, brepBytes, deflection });
  }


  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private send(type: string, payload: any): Promise<any> {
    const id = this.messageId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.resolvers.has(id)) {
          this.resolvers.delete(id);
          this.rejecters.delete(id);
          reject(new Error(`Worker request timed out after 15s: ${type}`));
        }
      }, 15000);

      this.resolvers.set(id, (val) => {
        clearTimeout(timeout);
        resolve(val);
      });
      this.rejecters.set(id, (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      this.worker.postMessage({ type, payload, id });
    });
  }
}
