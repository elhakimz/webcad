
import { Entity, BoundingBox } from "./Entity"
import { rotatePoint, reflectPointAcrossLine } from "../engine/MathUtils"

export class Line extends Entity {
  x1:number; y1:number; x2:number; y2:number;

  constructor(id:string,x1:number,y1:number,x2:number,y2:number, elevation: number = 0, thickness: number = 0){
    super(id)
    this.x1=x1; this.y1=y1; this.x2=x2; this.y2=y2;
    this.elevation = elevation;
    this.thickness = thickness;
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
    return {
      minX: Math.min(this.x1, this.x2),
      minY: Math.min(this.y1, this.y2),
      maxX: Math.max(this.x1, this.x2),
      maxY: Math.max(this.y1, this.y2)
    };
  }

  clone(newId: string): Line {
    const copy = new Line(newId, this.x1, this.y1, this.x2, this.y2, this.elevation, this.thickness);
    copy.layer = this.layer;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    return copy;
  }

  getGrips(): import("./Entity").Grip[] {
    return [
      { id: 'start', point: { x: this.x1, y: this.y1 }, type: 'endpoint' },
      { id: 'end', point: { x: this.x2, y: this.y2 }, type: 'endpoint' },
      { id: 'mid', point: { x: (this.x1 + this.x2) / 2, y: (this.y1 + this.y2) / 2 }, type: 'midpoint' }
    ];
  }

  moveGrip(gripId: string, newPosition: { x: number; y: number }): void {
    if (gripId === 'start') {
      this.x1 = newPosition.x;
      this.y1 = newPosition.y;
    } else if (gripId === 'end') {
      this.x2 = newPosition.x;
      this.y2 = newPosition.y;
    } else if (gripId === 'mid') {
      const dx = newPosition.x - (this.x1 + this.x2) / 2;
      const dy = newPosition.y - (this.y1 + this.y2) / 2;
      this.move(dx, dy);
    }
  }
}
