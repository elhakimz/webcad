
import { Entity, BoundingBox } from "./Entity"

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

