import { Entity } from "./Entity"

export class Point extends Entity {
  x: number;
  y: number;

  constructor(id: string, x: number, y: number) {
    super(id);
    this.x = x;
    this.y = y;
  }

  move(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
  }
}
