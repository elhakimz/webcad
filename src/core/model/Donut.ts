import { Entity, BoundingBox } from "./Entity";
import { rotatePoint, reflectPointAcrossLine } from "../engine/MathUtils"

export class Donut extends Entity {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;

  constructor(id: string, cx: number, cy: number, innerRadius: number, outerRadius: number, elevation = 0, thickness = 0) {
    super(id);
    this.cx = cx;
    this.cy = cy;
    this.innerRadius = innerRadius;
    this.outerRadius = outerRadius;
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
  }

  scale(baseX: number, baseY: number, factor: number) {
    this.cx = baseX + (this.cx - baseX) * factor;
    this.cy = baseY + (this.cy - baseY) * factor;
    this.innerRadius *= factor;
    this.outerRadius *= factor;
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const reflected = reflectPointAcrossLine({ x: this.cx, y: this.cy }, p1, p2);
    this.cx = reflected.x;
    this.cy = reflected.y;
  }

  getBoundingBox(): BoundingBox {
    return {
      minX: this.cx - this.outerRadius,
      minY: this.cy - this.outerRadius,
      maxX: this.cx + this.outerRadius,
      maxY: this.cy + this.outerRadius
    };
  }

  clone(newId: string): Donut {
    const copy = new Donut(newId, this.cx, this.cy, this.innerRadius, this.outerRadius);
    copy.layer = this.layer;
    copy.color = this.color;
    copy.linetype = this.linetype;
    copy.elevation = this.elevation;
    copy.thickness = this.thickness;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    return copy;
  }
}
