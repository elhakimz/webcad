import { Entity } from "./Entity"

export class Text extends Entity {
  x: number;
  y: number;
  height: number;
  rotation: number; // in degrees
  text: string;

  constructor(id: string, x: number, y: number, height: number, rotation: number, text: string) {
    super(id);
    this.x = x;
    this.y = y;
    this.height = height;
    this.rotation = rotation;
    this.text = text;
  }

  move(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
  }
}
