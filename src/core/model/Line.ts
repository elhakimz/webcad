
import { Entity, BoundingBox } from "./Entity"

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
