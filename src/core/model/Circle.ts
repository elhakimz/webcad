import { Entity } from "./Entity"

export class Circle extends Entity {
  cx: number;
  cy: number;
  r: number;

  constructor(id: string, cx: number, cy: number, r: number) {
    super(id)
    this.cx = cx;
    this.cy = cy;
    this.r = r;
  }

  move(dx: number, dy: number) {
    this.cx += dx;
    this.cy += dy;
  }
}
