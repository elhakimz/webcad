import { Entity, BoundingBox } from "./Entity";

export class Solid3D extends Entity {
  positions: number[];
  indices: number[];
  faceMapping?: number[];
  edgeLines?: number[][];
  position: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  rotation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  creationParams?: { type: string; params: any };
  brepSnapshot?: Uint8Array;

  get type(): string {
    return "Solid3D";
  }

  constructor(id: string, positions: number[], indices: number[], faceMapping?: number[], edgeLines?: number[][]) {
    super(id);
    this.positions = positions;
    this.indices = indices;
    this.faceMapping = faceMapping;
    this.edgeLines = edgeLines;
  }

  move(dx: number, dy: number) {
    for (let i = 0; i < this.positions.length; i += 3) {
      this.positions[i] += dx;
      this.positions[i + 1] += dy;
    }
    if (this.edgeLines) {
      for (const edge of this.edgeLines) {
        for (let i = 0; i < edge.length; i += 3) {
          edge[i] += dx;
          edge[i + 1] += dy;
        }
      }
    }
  }

  move3D(dx: number, dy: number, dz: number) {
    for (let i = 0; i < this.positions.length; i += 3) {
      this.positions[i] += dx;
      this.positions[i + 1] += dy;
      this.positions[i + 2] += dz;
    }
    if (this.edgeLines) {
      for (const edge of this.edgeLines) {
        for (let i = 0; i < edge.length; i += 3) {
          edge[i] += dx;
          edge[i + 1] += dy;
          edge[i + 2] += dz;
        }
      }
    }
  }

  rotate(baseX: number, baseY: number, angleRad: number) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    for (let i = 0; i < this.positions.length; i += 3) {
      const x = this.positions[i] - baseX;
      const y = this.positions[i + 1] - baseY;
      this.positions[i] = baseX + (x * cos - y * sin);
      this.positions[i + 1] = baseY + (x * sin + y * cos);
    }
  }

  scale(baseX: number, baseY: number, factor: number) {
    for (let i = 0; i < this.positions.length; i += 3) {
      this.positions[i] = baseX + (this.positions[i] - baseX) * factor;
      this.positions[i + 1] = baseY + (this.positions[i + 1] - baseY) * factor;
      this.positions[i + 2] *= factor; // Scale Z as well
    }
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const ux = dx / len;
    const uy = dy / len;

    for (let i = 0; i < this.positions.length; i += 3) {
      const x = this.positions[i] - p1.x;
      const y = this.positions[i + 1] - p1.y;
      // Project onto line
      const dot = x * ux + y * uy;
      const projX = dot * ux;
      const projY = dot * uy;
      // Reflect
      this.positions[i] = p1.x + (2 * projX - x);
      this.positions[i + 1] = p1.y + (2 * projY - y);
    }
  }

  getBoundingBox(): BoundingBox {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < this.positions.length; i += 3) {
      const x = this.positions[i];
      const y = this.positions[i + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    return { minX, minY, maxX, maxY };
  }

  hitTest(px: number, py: number, tolerance: number): boolean {
    return false; // Signal: use 3D raycaster, not 2D geometric test
  }

  getBoundingBox3D() {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.positions.length; i += 3) {
      const x = this.positions[i];
      const y = this.positions[i + 1];
      const z = this.positions[i + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    return { minX, minY, minZ, maxX, maxY, maxZ };
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
    return copy;
  }
}
