
import { Entity, BoundingBox } from "./Entity"
import { rotatePoint, reflectPointAcrossLine } from "../engine/MathUtils"

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

  rotate(baseX: number, baseY: number, angleRad: number) {
    const p = rotatePoint(this.x, this.y, baseX, baseY, angleRad);
    this.x = p.x;
    this.y = p.y;
    this.rotation += angleRad * (180 / Math.PI);
  }

  scale(baseX: number, baseY: number, factor: number) {
    this.x = baseX + (this.x - baseX) * factor;
    this.y = baseY + (this.y - baseY) * factor;
    this.height *= Math.abs(factor);
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const reflected = reflectPointAcrossLine({ x: this.x, y: this.y }, p1, p2);
    this.x = reflected.x;
    this.y = reflected.y;
    this.rotation = 180 - this.rotation;
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

  hitTest(px: number, py: number, tolerance: number): boolean {
    const dx = px - this.x;
    const dy = py - this.y;
    const rad = -this.rotation * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    const width = this.text.length * this.height * 0.6;
    
    return localX >= -tolerance && localX <= width + tolerance &&
           localY >= -tolerance && localY <= this.height + tolerance;
  }

  clone(newId: string): Text {
    const copy = new Text(newId, this.x, this.y, this.height, this.rotation, this.text);
    copy.layer = this.layer;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    return copy;
  }
}

