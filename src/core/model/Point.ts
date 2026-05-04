
import { Entity, BoundingBox } from "./Entity"
import { rotatePoint } from "../engine/MathUtils"

export class Point extends Entity {
  x: number;
  y: number;

  constructor(id: string, x: number, y: number) {
    super(id);
    this.x = x;
    this.y = y;
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

  getBoundingBox(): BoundingBox {
    return {
      minX: this.x,
      minY: this.y,
      maxX: this.x,
      maxY: this.y
    };
  }

  clone(newId: string): Point {
    return new Point(newId, this.x, this.y);
  }
}

