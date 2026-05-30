
import { Entity, BoundingBox } from "./Entity"
import { rotatePoint, reflectPointAcrossLine } from "../engine/MathUtils"

export class Point extends Entity {
  x: number;
  y: number;

  constructor(id: string, x: number, y: number, elevation = 0, thickness = 0) {
    super(id);
    this.x = x;
    this.y = y;
    this.elevation = elevation;
    this.thickness = thickness;
  }

  move(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
  }

  rotate(baseX: number, baseY: number, angleRad: number) {
    const p = rotatePoint(this.x, this.y, baseX, baseY, angleRad);
    this.x = p.x;
    this.y = p.y;
  }

  scale(baseX: number, baseY: number, factor: number) {
    this.x = baseX + (this.x - baseX) * factor;
    this.y = baseY + (this.y - baseY) * factor;
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const reflected = reflectPointAcrossLine({ x: this.x, y: this.y }, p1, p2);
    this.x = reflected.x;
    this.y = reflected.y;
  }

  getBoundingBox(): BoundingBox {
    const size = 0.1; // Small size for selection tolerance
    return {
      minX: this.x - size,
      minY: this.y - size,
      maxX: this.x + size,
      maxY: this.y + size
    };
  }

  clone(newId: string): Point {
    const copy = new Point(newId, this.x, this.y, this.elevation, this.thickness);
    copy.layer = this.layer;
    copy.color = this.color;
    copy.linetype = this.linetype;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    return copy;
  }
}

