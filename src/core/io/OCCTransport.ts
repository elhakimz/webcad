export interface OCCTransport {
  init(): Promise<void>;
  clearCache(): Promise<{ success: boolean }>;
  releaseShapes(entityIds: string[]): Promise<void>;
  checkValidity(entityId: string): Promise<{ isValid: boolean; faceCount: number; errorMsg: string }>;
  exportBRep(entityId: string): Promise<Uint8Array>;
  importBRep(entityId: string, brepBytes: Uint8Array, deflection?: number): Promise<any>;
  extractFaceProfile(entityId: string, faceIndex: number, deflection?: number): Promise<{ loops: { x: number; y: number; bulge: number }[][] }>;
  createBox(x: number, y: number, z: number, dx: number, dy: number, dz: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createCylinder(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createSphere(x: number, y: number, z: number, r: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createCone(x: number, y: number, z: number, r: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createFrustum(x: number, y: number, z: number, r1: number, r2: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createTorus(x: number, y: number, z: number, r1: number, r2: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createWedge(x1: number, y1: number, z1: number, x2: number, y2: number, height: number, ltx: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createPyramid(x: number, y: number, z: number, sides: number, radius: number, h: number, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createPolyhedron(points: any[], faces: number[][], deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array; nakedLines?: number[][]; isSolid?: boolean }>;
  createConvexHull(points?: any[], shapeIds?: string[], deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array; isSolid?: boolean }>;
  createExtrude(points: any[], height: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string, vector?: number[]): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createRevolve(points: any[], axisPoint: { x: number; y: number; z: number }, axisDir: { x: number; y: number; z: number }, angle: number, thickness?: number, deflection?: number, isClosed?: boolean, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createCompound(childrenIds: string[], entityId: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createSweep(profilePoints: { x: number; y: number; z: number }[], spinePoints: { x: number; y: number; z: number }[], isSolid: boolean, deflection?: number, entityId?: string, profileCount?: number, cornerMode?: string, isEllipse?: boolean): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createLoft(profiles: { id: string; points: { x: number; y: number; z: number }[]; closed: boolean }[], isSolid: boolean, isRuled: boolean, deflection?: number, entityId?: string): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  createBoolean(operation: 'fuse' | 'cut' | 'common', idA: string, idB: string, entityId: string, deflection?: number, rotA?: { x: number; y: number; z: number }, rotB?: { x: number; y: number; z: number }, centerA?: { x: number; y: number; z: number }, centerB?: { x: number; y: number; z: number }): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  multMatrixShape(entityId: string, m: number[], targetEntityId?: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  transformShape(entityId: string, dx: number, dy: number, dz: number, targetEntityId?: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  rotateShape(entityId: string, rx: number, ry: number, rz: number, cx: number, cy: number, cz: number, targetEntityId?: string, deflection?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  mirrorShape(entityId: string, p1: { x: number; y: number; z?: number } | undefined, p2: { x: number; y: number; z?: number } | undefined, targetEntityId?: string, deflection?: number, normal?: { x: number; y: number; z?: number }): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  scaleShape(entityId: string, factor: number | undefined, cx: number, cy: number, cz: number, targetEntityId?: string, deflection?: number, factorX?: number, factorY?: number, factorZ?: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  filletSolid(entityId: string, edgeIndex: number, radius: number, deflection?: number, visualP1?: any, visualP2?: any): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  chamferSolid(entityId: string, edgeIndex: number, radius: number, deflection?: number, visualP1?: any, visualP2?: any): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  filletSolidFace(entityId: string, faceIndex: number, radius: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  chamferSolidFace(entityId: string, faceIndex: number, radius: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  makeThickSolid(entityId: string, faceIndices: number[], thickness: number, removeFaces?: boolean): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  draftSolidFaces(entityId: string, faceIndices: number[], neutralFaceIndex: number, angleRad: number): Promise<{ positions: number[]; indices: number[]; faceMapping?: number[]; edgeLines?: number[][]; brepBytes?: Uint8Array }>;
  /** Cancel an in-flight operation by request id. Resolves even if the request was already complete or not found. */
  cancel(requestId: string): Promise<void>;

  /** Kernel requests still in flight. 0 means the kernel is idle. Used by the test bridge's idle signal. */
  get pendingCount(): number;
}
