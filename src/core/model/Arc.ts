
import { Entity, BoundingBox } from "./Entity";
import { rotatePoint } from "../engine/MathUtils"

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

  rotate(baseX: number, baseY: number, angleRad: number) {
    const p = rotatePoint(this.cx, this.cy, baseX, baseY, angleRad);
    this.cx = p.x;
    this.cy = p.y;
    this.startAngle += angleRad;
    this.endAngle += angleRad;
  }

  scale(baseX: number, baseY: number, factor: number) {
    this.cx = baseX + (this.cx - baseX) * factor;
    this.cy = baseY + (this.cy - baseY) * factor;
    this.r *= Math.abs(factor);
    if (factor < 0) {
        // Reflecting across base point: swap angles and CCW? 
        // For simple uniform scaling, negative factor is usually avoided or handled as mirror.
        // AutoCAD usually handles factor as absolute for radius.
        // We'll keep it simple: radius is absolute.
    }
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

