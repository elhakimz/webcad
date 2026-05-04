
import { Entity, BoundingBox } from "./Entity";
import { rotatePoint } from "../engine/MathUtils"

export class Solid extends Entity {
  vertices: { x: number; y: number }[];

  constructor(id: string, vertices: { x: number; y: number }[]) {
    super(id);
    this.vertices = vertices;
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

  getBoundingBox(): BoundingBox {
    if (this.vertices.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.vertices.forEach(v => {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    });
    return { minX, minY, maxX, maxY };
  }

  clone(newId: string): Solid {
    return new Solid(newId, this.vertices.map(v => ({ ...v })));
  }
}
