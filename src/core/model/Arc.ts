
import { Entity, BoundingBox } from "./Entity";
import { rotatePoint, reflectPointAcrossLine } from "../engine/MathUtils"

export class Arc extends Entity {
  cx: number;
  cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
  ccw: boolean;

  constructor(id: string, cx: number, cy: number, r: number, startAngle: number, endAngle: number, ccw: boolean, elevation = 0, thickness = 0) {
    super(id);
    this.cx = cx;
    this.cy = cy;
    this.r = r;
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.ccw = ccw;
    this.elevation = elevation;
    this.thickness = thickness;
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
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const pStart = {
      x: this.cx + this.r * Math.cos(this.startAngle),
      y: this.cy + this.r * Math.sin(this.startAngle)
    };
    const pEnd = {
      x: this.cx + this.r * Math.cos(this.endAngle),
      y: this.cy + this.r * Math.sin(this.endAngle)
    };

    const reflectedCenter = reflectPointAcrossLine({ x: this.cx, y: this.cy }, p1, p2);
    const reflectedStart = reflectPointAcrossLine(pStart, p1, p2);
    const reflectedEnd = reflectPointAcrossLine(pEnd, p1, p2);

    this.cx = reflectedCenter.x;
    this.cy = reflectedCenter.y;
    this.startAngle = Math.atan2(reflectedStart.y - this.cy, reflectedStart.x - this.cx);
    this.endAngle = Math.atan2(reflectedEnd.y - this.cy, reflectedEnd.x - this.cx);
    this.ccw = !this.ccw;
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
    const copy = new Arc(newId, this.cx, this.cy, this.r, this.startAngle, this.endAngle, this.ccw, this.elevation, this.thickness);
    copy.layer = this.layer;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    return copy;
  }

  getGrips(): import("./Entity").Grip[] {
    const startPt = {
      x: this.cx + this.r * Math.cos(this.startAngle),
      y: this.cy + this.r * Math.sin(this.startAngle)
    };
    const endPt = {
      x: this.cx + this.r * Math.cos(this.endAngle),
      y: this.cy + this.r * Math.sin(this.endAngle)
    };
    return [
      { id: 'center', point: { x: this.cx, y: this.cy }, type: 'center' },
      { id: 'start', point: startPt, type: 'endpoint' },
      { id: 'end', point: endPt, type: 'endpoint' }
    ];
  }

  moveGrip(gripId: string, newPosition: { x: number; y: number }): void {
    if (gripId === 'center') {
      this.cx = newPosition.x;
      this.cy = newPosition.y;
    } else if (gripId === 'start') {
      const dx = newPosition.x - this.cx;
      const dy = newPosition.y - this.cy;
      this.startAngle = Math.atan2(dy, dx);
      this.r = Math.sqrt(dx * dx + dy * dy);
    } else if (gripId === 'end') {
      const dx = newPosition.x - this.cx;
      const dy = newPosition.y - this.cy;
      this.endAngle = Math.atan2(dy, dx);
      this.r = Math.sqrt(dx * dx + dy * dy);
    }
  }
}

