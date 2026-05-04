
import { Entity, BoundingBox } from "./Entity"
import { rotatePoint } from "../engine/MathUtils"

export class Line extends Entity {
  x1:number; y1:number; x2:number; y2:number;

  constructor(id:string,x1:number,y1:number,x2:number,y2:number){
    super(id)
    this.x1=x1; this.y1=y1; this.x2=x2; this.y2=y2;
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

  getBoundingBox(): BoundingBox {
    return {
      minX: Math.min(this.x1, this.x2),
      minY: Math.min(this.y1, this.y2),
      maxX: Math.max(this.x1, this.x2),
      maxY: Math.max(this.y1, this.y2)
    };
  }

  clone(newId: string): Line {
    return new Line(newId, this.x1, this.y1, this.x2, this.y2);
  }
}
