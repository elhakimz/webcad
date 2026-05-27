import { Entity, BoundingBox } from "./Entity";

export interface BoxCreationParams {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

export interface CylinderCreationParams {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
}

export interface SphereCreationParams {
  x: number;
  y: number;
  z: number;
  r: number;
}

export interface ConeCreationParams {
  x: number;
  y: number;
  z: number;
  r1: number;
  r2: number;
  h: number;
}

export interface TorusCreationParams {
  x: number;
  y: number;
  z: number;
  r1: number;
  r2: number;
}

export interface WedgeCreationParams {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  ltx: number;
}

export interface PyramidCreationParams {
  x: number;
  y: number;
  z: number;
  sides: number;
  radius: number;
  height: number;
}

export interface PolyhedronCreationParams {
  points: [number, number, number][];
  faces: number[][];
}

export interface HullCreationParams {
  points: [number, number, number][];
  shapeIds: string[];
}

export interface ExtrudeCreationParams {
  points: { x: number; y: number }[];
  height: number;
  thickness: number;
  isClosed: boolean;
}

export interface RevolveCreationParams {
  points: { x: number; y: number }[];
  axisPoint: [number, number, number];
  axisDir: [number, number, number];
  angle: number;
  thickness: number;
  isClosed: boolean;
}

export interface SweepCreationParams {
  profileId: string;
  spineId: string;
  isSolid: boolean;
  cornerMode?: string;
}

export type Solid3DCreationParams =
  | { type: "box"; params: BoxCreationParams }
  | { type: "cylinder"; params: CylinderCreationParams }
  | { type: "sphere"; params: SphereCreationParams }
  | { type: "cone"; params: ConeCreationParams }
  | { type: "torus"; params: TorusCreationParams }
  | { type: "wedge"; params: WedgeCreationParams }
  | { type: "pyramid"; params: PyramidCreationParams }
  | { type: "polyhedron"; params: PolyhedronCreationParams }
  | { type: "hull"; params: HullCreationParams }
  | { type: "extrude"; params: ExtrudeCreationParams }
  | { type: "revolve"; params: RevolveCreationParams }
  | { type: "sweep"; params: SweepCreationParams };


export interface GeometricSignature {
  centroid?: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
  area?: number;
  faceType?: string;
  faceIndex?: number;
}

export interface FeatureNode {
  id: string;
  type: "Extrude" | "Cut" | "Fillet" | "Scale" | "Sketch" | "Chamfer" | "Shell";
  // The data needed to rebuild this specific step
  parameters: Record<string, any>; 
  // If this feature depends on a specific face (Topological Naming)
  topologicalReference?: GeometricSignature; 
  isActive: boolean;
}


export class Solid3D extends Entity {
  positions: number[];
  indices: number[];
  faceMapping?: number[];
  edgeLines?: number[][];
  position: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  rotation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private _creationParams?: Solid3DCreationParams;
  private _brepSnapshot?: Uint8Array;
  baseBrepSnapshot?: Uint8Array;
  features: FeatureNode[] = [];

  get brepSnapshot(): Uint8Array | undefined {
    return this._brepSnapshot;
  }

  set brepSnapshot(value: Uint8Array | undefined) {
    this._brepSnapshot = value;
    if (value && !this.baseBrepSnapshot) {
      this.baseBrepSnapshot = value;
    }
    this.ensureFeaturesFromCreationParams();
  }

  get creationParams(): Solid3DCreationParams | undefined {
    return this._creationParams;
  }

  set creationParams(value: Solid3DCreationParams | undefined) {
    this._creationParams = value;
    this.ensureFeaturesFromCreationParams();
  }

  get type(): string {
    return "Solid3D";
  }

  constructor(id: string, positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][]) {
    super(id);
    this.positions = positions;
    this.indices = indices;
    this.faceMapping = faceMapping;
    this.edgeLines = edgeLines;
    this.updateAbsolutePosition();
    this.ensureFeaturesFromCreationParams();
  }

  ensureFeaturesFromCreationParams() {
    if (this.features.length === 0) {
      if (this.creationParams) {
        this.features.push({
          id: this.id + "_base",
          type: this.creationParams.type === "extrude" ? "Extrude" : "Sketch",
          parameters: { ...this.creationParams.params, primitiveType: this.creationParams.type },
          isActive: true
        });
      } else if (this.brepSnapshot) {
        this.features.push({
          id: this.id + "_base",
          type: "Sketch",
          parameters: { primitiveType: "brep" },
          isActive: true
        });
      }
    }
  }


  updateAbsolutePosition() {
    if (this.positions && this.positions.length > 0) {
      const bbox = this.getBoundingBox3D();
      this.position = {
        x: (bbox.minX + bbox.maxX) / 2,
        y: (bbox.minY + bbox.maxY) / 2,
        z: (bbox.minZ + bbox.maxZ) / 2
      };
    } else {
      this.position = { x: 0, y: 0, z: 0 };
    }
  }

  move(dx: number, dy: number) {
    const pos = this.positions;
    const len = pos.length;
    for (let i = 0; i < len; i += 3) {
      pos[i] += dx;
      pos[i + 1] += dy;
    }
    const edgeLines = this.edgeLines;
    if (edgeLines) {
      const numEdges = edgeLines.length;
      for (let e = 0; e < numEdges; e++) {
        const edge = edgeLines[e];
        const edgeLen = edge.length;
        for (let i = 0; i < edgeLen; i += 3) {
          edge[i] += dx;
          edge[i + 1] += dy;
        }
      }
    }
    this.updateAbsolutePosition();
  }

  move3D(dx: number, dy: number, dz: number) {
    const pos = this.positions;
    const len = pos.length;
    for (let i = 0; i < len; i += 3) {
      pos[i] += dx;
      pos[i + 1] += dy;
      pos[i + 2] += dz;
    }
    const edgeLines = this.edgeLines;
    if (edgeLines) {
      const numEdges = edgeLines.length;
      for (let e = 0; e < numEdges; e++) {
        const edge = edgeLines[e];
        const edgeLen = edge.length;
        for (let i = 0; i < edgeLen; i += 3) {
          edge[i] += dx;
          edge[i + 1] += dy;
          edge[i + 2] += dz;
        }
      }
    }
    this.updateAbsolutePosition();
  }

  rotate(baseX: number, baseY: number, angleRad: number) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const pos = this.positions;
    const len = pos.length;
    for (let i = 0; i < len; i += 3) {
      const x = pos[i] - baseX;
      const y = pos[i + 1] - baseY;
      pos[i] = baseX + (x * cos - y * sin);
      pos[i + 1] = baseY + (x * sin + y * cos);
    }
    this.updateAbsolutePosition();
  }

  scale(baseX: number, baseY: number, factor: number) {
    const pos = this.positions;
    const len = pos.length;
    for (let i = 0; i < len; i += 3) {
      pos[i] = baseX + (pos[i] - baseX) * factor;
      pos[i + 1] = baseY + (pos[i + 1] - baseY) * factor;
      pos[i + 2] *= factor; // Scale Z as well
    }
    this.updateAbsolutePosition();
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return;
    const len = Math.sqrt(lenSq);
    const ux = dx / len;
    const uy = dy / len;

    const pos = this.positions;
    const totalLen = pos.length;
    for (let i = 0; i < totalLen; i += 3) {
      const x = pos[i] - p1.x;
      const y = pos[i + 1] - p1.y;
      // Project onto line
      const dot = x * ux + y * uy;
      const projX = dot * ux;
      const projY = dot * uy;
      // Reflect
      pos[i] = p1.x + (2 * projX - x);
      pos[i + 1] = p1.y + (2 * projY - y);
    }
    this.updateAbsolutePosition();
  }

  getBoundingBox(): BoundingBox {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const pos = this.positions;
    const len = pos.length;
    for (let i = 0; i < len; i += 3) {
      const x = pos[i];
      const y = pos[i + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    return { minX, minY, maxX, maxY };
  }

  getBoundingBox3D() {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const pos = this.positions;
    const len = pos.length;
    for (let i = 0; i < len; i += 3) {
      const x = pos[i];
      const y = pos[i + 1];
      const z = pos[i + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    return { minX, minY, minZ, maxX, maxY, maxZ };
  }

  getSnapPoints(): any[] {
    const snaps: any[] = [];
    
    // Use dynamic strings for snap types to avoid direct circular dependency on SnapEngine enum
    const ENDPOINT = 'Endpoint';
    const MIDPOINT = 'Midpoint';
    
    // 1. Endpoints from vertices
    const vertexMap = new Set<string>();
    for (let i = 0; i < this.positions.length; i += 3) {
      const x = this.positions[i];
      const y = this.positions[i + 1];
      const z = this.positions[i + 2];
      const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
      if (!vertexMap.has(key)) {
        snaps.push({ x, y, z, type: ENDPOINT });
        vertexMap.add(key);
      }
    }

    // 2. Midpoints from edges
    if (this.edgeLines) {
      for (const edgeIndices of this.edgeLines) {
        for (let i = 0; i < edgeIndices.length - 1; i++) {
          const idx1 = edgeIndices[i];
          const idx2 = edgeIndices[i + 1];
          
          const x1 = this.positions[idx1 * 3];
          const y1 = this.positions[idx1 * 3 + 1];
          const z1 = this.positions[idx1 * 3 + 2];
          
          const x2 = this.positions[idx2 * 3];
          const y2 = this.positions[idx2 * 3 + 1];
          const z2 = this.positions[idx2 * 3 + 2];

          snaps.push({
            x: (x1 + x2) / 2,
            y: (y1 + y2) / 2,
            z: (z1 + z2) / 2,
            type: MIDPOINT
          });
        }
      }
    }

    return snaps;
  }

  clone(newId: string): Solid3D {
    const copy = new Solid3D(
      newId, 
      [...this.positions], 
      [...this.indices], 
      this.faceMapping ? [...this.faceMapping] : undefined,
      this.edgeLines ? this.edgeLines.map(arr => [...arr]) : undefined
    );
    copy.layer = this.layer;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    copy.position = { ...this.position };
    copy.rotation = { ...this.rotation };
    if (this.creationParams) {
      copy.creationParams = JSON.parse(JSON.stringify(this.creationParams));
    }
    if (this.brepSnapshot) {
      copy.brepSnapshot = new Uint8Array(this.brepSnapshot);
    }
    if (this.baseBrepSnapshot) {
      copy.baseBrepSnapshot = new Uint8Array(this.baseBrepSnapshot);
    }
    if (this.features) {
      copy.features = JSON.parse(JSON.stringify(this.features));
    }
    return copy;
  }
}
