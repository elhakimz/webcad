
import { Entity, BoundingBox } from "./Entity"
import { rotatePoint, reflectPointAcrossLine } from "../engine/MathUtils"

export class Circle extends Entity {
  cx: number;
  cy: number;
  r: number;

  constructor(id: string, cx: number, cy: number, r: number, elevation: number = 0, thickness: number = 0) {
    super(id)
    this.cx = cx;
    this.cy = cy;
    this.r = r;
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
    const copy = new Circle(newId, this.cx, this.cy, this.r, this.elevation, this.thickness);
    copy.layer = this.layer;
    copy.color = this.color;
    copy.linetype = this.linetype;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    return copy;
  }

  getGrips(): import("./Entity").Grip[] {
    return [
      { id: 'center', point: { x: this.cx, y: this.cy }, type: 'center' },
      { id: 'quad_0', point: { x: this.cx + this.r, y: this.cy }, type: 'custom' },
      { id: 'quad_90', point: { x: this.cx, y: this.cy + this.r }, type: 'custom' },
      { id: 'quad_180', point: { x: this.cx - this.r, y: this.cy }, type: 'custom' },
      { id: 'quad_270', point: { x: this.cx, y: this.cy - this.r }, type: 'custom' }
    ];
  }

  moveGrip(gripId: string, newPosition: { x: number; y: number }): void {
    if (gripId === 'center') {
      this.cx = newPosition.x;
      this.cy = newPosition.y;
    } else if (gripId.startsWith('quad_')) {
      const dist = Math.sqrt((newPosition.x - this.cx) ** 2 + (newPosition.y - this.cy) ** 2);
      this.r = dist;
    }
  }
}

