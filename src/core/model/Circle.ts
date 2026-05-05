
import { Entity, BoundingBox } from "./Entity"
import { rotatePoint, reflectPointAcrossLine } from "../engine/MathUtils"

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

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const reflected = reflectPointAcrossLine({ x: this.cx, y: this.cy }, p1, p2);
    this.cx = reflected.x;
    this.cy = reflected.y;
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
    const copy = new Circle(newId, this.cx, this.cy, this.r);
    copy.layer = this.layer;
    copy.properties = { ...this.properties };
    return copy;
  }
}

