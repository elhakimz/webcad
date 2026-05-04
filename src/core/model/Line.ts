
import { Entity } from "./Entity"

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
}
