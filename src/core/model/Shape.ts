import { Entity, BoundingBox } from "./Entity"
import { rotatePoint, reflectPointAcrossLine } from "../engine/MathUtils"

export class Shape extends Entity {
  shapeName: string;
  x: number;
  y: number;
  shapeScale: number;
  rotation: number;
  segments: { x1: number; y1: number; x2: number; y2: number }[];

  constructor(
    id: string,
    shapeName: string,
    x: number,
    y: number,
    shapeScale: number,
    rotation: number,
    segments: { x1: number; y1: number; x2: number; y2: number }[]
  ) {
    super(id);
    this.shapeName = shapeName;
    this.x = x;
    this.y = y;
    this.shapeScale = shapeScale;
    this.rotation = rotation;
    this.segments = segments;
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
    this.shapeScale *= Math.abs(factor);
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const reflected = reflectPointAcrossLine({ x: this.x, y: this.y }, p1, p2);
    this.x = reflected.x;
    this.y = reflected.y;
  }

  getBoundingBox(): BoundingBox {
    if (this.segments.length === 0) {
      return { minX: this.x, minY: this.y, maxX: this.x, maxY: this.y };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const rad = (this.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    for (const seg of this.segments) {
      const points = [
        { x: seg.x1, y: seg.y1 },
        { x: seg.x2, y: seg.y2 }
      ];

      for (const pt of points) {
        const sx = pt.x * this.shapeScale;
        const sy = pt.y * this.shapeScale;
        const rx = sx * cos - sy * sin + this.x;
        const ry = sx * sin + sy * cos + this.y;

        minX = Math.min(minX, rx);
        minY = Math.min(minY, ry);
        maxX = Math.max(maxX, rx);
        maxY = Math.max(maxY, ry);
      }
    }

    return { minX, minY, maxX, maxY };
  }

  clone(newId: string): Shape {
    return new Shape(
      newId,
      this.shapeName,
      this.x,
      this.y,
      this.shapeScale,
      this.rotation,
      this.segments.map(s => ({ ...s }))
    );
  }
}