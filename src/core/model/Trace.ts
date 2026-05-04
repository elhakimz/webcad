import { Entity, BoundingBox } from "./Entity"
import { rotatePoint, reflectPointAcrossLine } from "../engine/MathUtils"

export class Trace extends Entity {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;

  constructor(id: string, x1: number, y1: number, x2: number, y2: number, width: number) {
    super(id);
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.width = width;
  }

  move(dx: number, dy: number) {
    this.x1 += dx;
    this.y1 += dy;
    this.x2 += dx;
    this.y2 += dy;
  }

  rotate(baseX: number, baseY: number, angleRad: number) {
    const p1 = rotatePoint(this.x1, this.y1, baseX, baseY, angleRad);
    const p2 = rotatePoint(this.x2, this.y2, baseX, baseY, angleRad);
    this.x1 = p1.x;
    this.y1 = p1.y;
    this.x2 = p2.x;
    this.y2 = p2.y;
  }

  scale(baseX: number, baseY: number, factor: number) {
    this.x1 = baseX + (this.x1 - baseX) * factor;
    this.y1 = baseY + (this.y1 - baseY) * factor;
    this.x2 = baseX + (this.x2 - baseX) * factor;
    this.y2 = baseY + (this.y2 - baseY) * factor;
    this.width *= Math.abs(factor);
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const reflected1 = reflectPointAcrossLine({ x: this.x1, y: this.y1 }, p1, p2);
    const reflected2 = reflectPointAcrossLine({ x: this.x2, y: this.y2 }, p1, p2);
    this.x1 = reflected1.x;
    this.y1 = reflected1.y;
    this.x2 = reflected2.x;
    this.y2 = reflected2.y;
  }

  getBoundingBox(): BoundingBox {
    const halfWidth = this.width / 2;
    return {
      minX: Math.min(this.x1, this.x2) - halfWidth,
      minY: Math.min(this.y1, this.y2) - halfWidth,
      maxX: Math.max(this.x1, this.x2) + halfWidth,
      maxY: Math.max(this.y1, this.y2) + halfWidth
    };
  }

  clone(newId: string): Trace {
    return new Trace(newId, this.x1, this.y1, this.x2, this.y2, this.width);
  }
}