
import { Entity, BoundingBox } from "./Entity";

export class Arc extends Entity {
  cx: number;
  cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
  ccw: boolean;

  constructor(id: string, cx: number, cy: number, r: number, startAngle: number, endAngle: number, ccw: boolean) {
    super(id);
    this.cx = cx;
    this.cy = cy;
    this.r = r;
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.ccw = ccw;
  }

  move(dx: number, dy: number) {
    this.cx += dx;
    this.cy += dy;
  }

  getBoundingBox(): BoundingBox {
    // For broad-phase, using the full circle bounding box is sufficient.
    return {
      minX: this.cx - this.r,
      minY: this.cy - this.r,
      maxX: this.cx + this.r,
      maxY: this.cy + this.r
    };
  }

  clone(newId: string): Arc {
    return new Arc(newId, this.cx, this.cy, this.r, this.startAngle, this.endAngle, this.ccw);
  }
}

