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
      const { id, success, payload, error } = e.data;
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

  createBox(x: number, y: number, z: number, dx: number, dy: number, dz: number, deflection?: number, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][] }> {
    return this.send('createBox', { x, y, z, dx, dy, dz, deflection, entityId });
  }

  createCylinder(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][] }> {
    return this.send('createCylinder', { x, y, z, r, h, deflection, entityId });
  }

  createSphere(x: number, y: number, z: number, r: number, deflection?: number, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][] }> {
    return this.send('createSphere', { x, y, z, r, deflection, entityId });
  }

  createCone(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][] }> {
    return this.send('createCone', { x, y, z, r, h, deflection, entityId });
  }

  createTorus(x: number, y: number, z: number, r1: number, r2: number, deflection?: number, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][] }> {
    return this.send('createTorus', { x, y, z, r1, r2, deflection, entityId });
  }

  createExtrude(points: {x: number, y: number, z: number}[], height: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][] }> {
    return this.send('createExtrude', { points, height, thickness, deflection, isClosed, entityId });
  }

  createSweep(profilePoints: {x: number, y: number, z: number}[], spinePoints: {x: number, y: number, z: number}[], isSolid: boolean, deflection?: number, entityId?: string, profileCount?: number, cornerMode?: string, isEllipse?: boolean): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][] }> {
    return this.send('createSweep', { profilePoints, spinePoints, isSolid, deflection, entityId, profileCount, cornerMode, isEllipse });
  }

  createLoft(profiles: {id: string, points: {x: number, y: number, z: number}[], closed: boolean}[], isSolid: boolean, isRuled: boolean, deflection?: number, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][] }> {
    return this.send('createLoft', { profiles, isSolid, isRuled, deflection, entityId });
  }

  createRevolve(points: {x: number, y: number, z: number}[], axisPoint: {x: number, y: number, z: number}, axisDir: {x: number, y: number, z: number}, angle: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][] }> {
    return this.send('createRevolve', { points, axisPoint, axisDir, angle, thickness, deflection, isClosed, entityId });
  }

  createBoolean(operation: 'fuse' | 'cut' | 'common', idA: string, idB: string, entityId: string, deflection?: number, rotA?: {x:number, y:number, z:number}, rotB?: {x:number, y:number, z:number}, centerA?: {x:number, y:number, z:number}, centerB?: {x:number, y:number, z:number}): Promise<{ positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][] }> {
    return this.send('createBoolean', { operation, idA, idB, entityId, deflection, rotA, rotB, centerA, centerB });
  }

  transformShape(entityId: string, dx: number, dy: number, dz: number): Promise<void> {
    return this.send('transformShape', { entityId, dx, dy, dz });
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
      this.resolvers.set(id, resolve);
      this.rejecters.set(id, reject);
      this.worker.postMessage({ type, payload, id });
    });
  }
}
