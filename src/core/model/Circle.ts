
import { Entity, BoundingBox } from "./Entity"
import { rotatePoint } from "../engine/MathUtils"

export class Circle extends Entity {
  cx: number;
  cy: number;
  r: number;

  constructor(id: string, cx: number, cy: number, r: number) {
    super(id)
    this.cx = cx;
    this.cy = cy;
    this.r = r;
  }

  move(dx: number, dy: number) {
    this.cx += dx;
    this.cy += dy;
  }

  rotate(baseX: number, baseY: number, angleRad: number) {
    const p = rotatePoint(this.cx, this.cy, baseX, baseY, angleRad);
    this.cx = p.x;
    this.cy = p.y;
  }

  scale(baseX: number, baseY: number, factor: number) {
    this.cx = baseX + (this.cx - baseX) * factor;
    this.cy = baseY + (this.cy - baseY) * factor;
    this.r *= Math.abs(factor);
  }

  getBoundingBox(): BoundingBox {
    return {
      minX: this.cx - this.r,
      minY: this.cy - this.r,
      maxX: this.cx + this.r,
      maxY: this.cy + this.r
    };
  }

  clone(newId: string): Circle {
    return new Circle(newId, this.cx, this.cy, this.r);
  }
}

