
import { Entity, BoundingBox } from "./Entity";

export interface PolylineVertex {
  x: number;
  y: number;
  bulge: number;
}

export class Polyline extends Entity {
  vertices: PolylineVertex[];
  closed: boolean;

  constructor(id: string, vertices: PolylineVertex[], closed: boolean = false) {
    super(id);
    this.vertices = vertices;
    this.closed = closed;
  }

  move(dx: number, dy: number) {
    this.vertices.forEach(v => {
      v.x += dx;
      v.y += dy;
    });
  }

  getBoundingBox(): BoundingBox {
    if (this.vertices.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.vertices.forEach(v => {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    });
    // Note: This doesn't account for arc segments (bulges) yet, 
    // but for broad-phase AABB, vertex extents are often enough 
    // unless the arc goes far beyond the chord.
    return { minX, minY, maxX, maxY };
  }

  clone(newId: string): Polyline {
    return new Polyline(newId, this.vertices.map(v => ({ ...v })), this.closed);
  }
}

