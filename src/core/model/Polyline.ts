
import { Entity, BoundingBox } from "./Entity";
import { rotatePoint, reflectPointAcrossLine } from "../engine/MathUtils"

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

  rotate(baseX: number, baseY: number, angleRad: number) {
    this.vertices.forEach(v => {
      const p = rotatePoint(v.x, v.y, baseX, baseY, angleRad);
      v.x = p.x;
      v.y = p.y;
    });
  }

  scale(baseX: number, baseY: number, factor: number) {
    this.vertices.forEach(v => {
      v.x = baseX + (v.x - baseX) * factor;
      v.y = baseY + (v.y - baseY) * factor;
    });
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    this.vertices.forEach(v => {
      const reflected = reflectPointAcrossLine({ x: v.x, y: v.y }, p1, p2);
      v.x = reflected.x;
      v.y = reflected.y;
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
    const copy = new Polyline(newId, this.vertices.map(v => ({ ...v })), this.closed);
    copy.layer = this.layer;
    copy.properties = { ...this.properties };
    return copy;
  }
}

