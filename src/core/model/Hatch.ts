import { Entity, BoundingBox } from "./Entity"
import { rotatePoint, reflectPointAcrossLine, isPointInPolygon } from "../engine/MathUtils"
import { getPattern } from "../io/Patterns"
import type { LineFamily } from "../engine/PATConverter"

export class Hatch extends Entity {
  boundaryVertices: { x: number; y: number }[];
  pattern: string;
  patternScale: number;
  angle: number;
  color: number;
  private _patternData: { name: string; lines: LineFamily[] } | null = null;

  constructor(
    id: string,
    boundaryVertices: { x: number; y: number }[],
    pattern: string = "ANSI31",
    patternScale: number = 1,
    angle: number = 0,
    color: number = 0x00ff00
  ) {
    super(id);
    this.boundaryVertices = boundaryVertices;
    this.pattern = pattern;
    this.patternScale = patternScale;
    this.angle = angle;
    this.color = color;
    this._patternData = getPattern(pattern) || null;
  }

  getPatternData(): { name: string; lines: LineFamily[] } | null {
    return this._patternData;
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
    this.patternScale *= Math.abs(factor);
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    this.boundaryVertices.forEach(v => {
      const reflected = reflectPointAcrossLine({ x: v.x, y: v.y }, p1, p2);
      v.x = reflected.x;
      v.y = reflected.y;
    });
  }

  getBoundingBox(): BoundingBox {
    if (!this.boundaryVertices || this.boundaryVertices.length === 0) {
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

  hitTest(px: number, py: number, _tolerance: number): boolean {
    return isPointInPolygon({ x: px, y: py }, this.boundaryVertices);
  }

  clone(newId: string): Hatch {
    const copy = new Hatch(
      newId,
      this.boundaryVertices.map(v => ({ ...v })),
      this.pattern,
      this.patternScale,
      this.angle,
      this.color
    );
    copy.layer = this.layer;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    return copy;
  }
}