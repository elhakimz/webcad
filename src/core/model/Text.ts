
import { Entity, BoundingBox } from "./Entity"

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

  getBoundingBox(): BoundingBox {
    // Rough estimate based on character count and height
    const width = this.text.length * this.height * 0.6; // Average aspect ratio
    return {
      minX: Math.min(this.x, this.x + width), // Simplified for rotation
      minY: Math.min(this.y, this.y + this.height),
      maxX: Math.max(this.x, this.x + width),
      maxY: Math.max(this.y, this.y + this.height)
    };
  }

  clone(newId: string): Text {
    return new Text(newId, this.x, this.y, this.height, this.rotation, this.text);
  }
}

