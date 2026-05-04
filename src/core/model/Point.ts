
import { Entity, BoundingBox } from "./Entity"

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

  getBoundingBox(): BoundingBox {
    return {
      minX: this.x,
      minY: this.y,
      maxX: this.x,
      maxY: this.y
    };
  }

  clone(newId: string): Point {
    return new Point(newId, this.x, this.y);
  }
}

