import { Entity, BoundingBox } from "./Entity"
import { rotatePoint, reflectPointAcrossLine } from "../engine/MathUtils"

export class Hatch extends Entity {
  boundaryVertices: { x: number; y: number }[];
  pattern: string;
  scale: number;
  angle: number;
  color: number;

  constructor(
    id: string, 
    boundaryVertices: { x: number; y: number }[], 
    pattern: string = "ANSI31", 
    scale: number = 1, 
    angle: number = 0,
    color: number = 0x00ff00
  ) {
    super(id);
    this.boundaryVertices = boundaryVertices;
    this.pattern = pattern;
    this.scale = scale;
    this.angle = angle;
    this.color = color;
  }

  move(dx: number, dy: number) {
    this.boundaryVertices.forEach(v => {
      v.x += dx;
      v.y += dy;
    });
  }

  rotate(baseX: number, baseY: number, angleRad: number) {
    this.boundaryVertices.forEach(v => {
      const p = rotatePoint(v.x, v.y, baseX, baseY, angleRad);
      v.x = p.x;
      v.y = p.y;
    });
    this.angle += angleRad * (180 / Math.PI);
  }

  scale(baseX: number, baseY: number, factor: number) {
    this.boundaryVertices.forEach(v => {
      v.x = baseX + (v.x - baseX) * factor;
      v.y = baseY + (v.y - baseY) * factor;
    });
    this.scale *= Math.abs(factor);
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    this.boundaryVertices.forEach(v => {
      const reflected = reflectPointAcrossLine({ x: v.x, y: v.y }, p1, p2);
      v.x = reflected.x;
      v.y = reflected.y;
    });
  }

  getBoundingBox(): BoundingBox {
    if (this.boundaryVertices.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.boundaryVertices.forEach(v => {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    });
    return { minX, minY, maxX, maxY };
  }

  clone(newId: string): Hatch {
    return new Hatch(
      newId, 
      this.boundaryVertices.map(v => ({ ...v })), 
      this.pattern, 
      this.scale, 
      this.angle, 
      this.color
    );
  }
}