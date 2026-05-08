import { Entity, BoundingBox } from "./Entity";
import { rotatePoint, reflectPointAcrossLine } from "../engine/MathUtils";

export class Note extends Entity {
  targetEntityId: string | null;
  anchorPoint: { x: number; y: number };
  bendPoint: { x: number; y: number };
  text: string;
  height: number;

  constructor(id: string, targetEntityId: string | null, anchorPoint: { x: number; y: number }, bendPoint: { x: number; y: number }, text: string, height: number = 2.5) {
    super(id);
    this.targetEntityId = targetEntityId;
    this.anchorPoint = anchorPoint;
    this.bendPoint = bendPoint;
    this.text = text;
    this.height = height;
  }

  move(dx: number, dy: number) {
    this.anchorPoint.x += dx;
    this.anchorPoint.y += dy;
    this.bendPoint.x += dx;
    this.bendPoint.y += dy;
  }

  rotate(baseX: number, baseY: number, angleRad: number) {
    const p1 = rotatePoint(this.anchorPoint.x, this.anchorPoint.y, baseX, baseY, angleRad);
    const p2 = rotatePoint(this.bendPoint.x, this.bendPoint.y, baseX, baseY, angleRad);
    this.anchorPoint = p1;
    this.bendPoint = p2;
  }

  scale(baseX: number, baseY: number, factor: number) {
    this.anchorPoint.x = baseX + (this.anchorPoint.x - baseX) * factor;
    this.anchorPoint.y = baseY + (this.anchorPoint.y - baseY) * factor;
    this.bendPoint.x = baseX + (this.bendPoint.x - baseX) * factor;
    this.bendPoint.y = baseY + (this.bendPoint.y - baseY) * factor;
    this.height *= factor;
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const reflected1 = reflectPointAcrossLine(this.anchorPoint, p1, p2);
    const reflected2 = reflectPointAcrossLine(this.bendPoint, p1, p2);
    this.anchorPoint = reflected1;
    this.bendPoint = reflected2;
  }

  getBoundingBox(): BoundingBox {
    // For simplicity, bounding box includes anchor and bend points.
    // Text width is not accounted for here as it's computed at render time.
    return {
      minX: Math.min(this.anchorPoint.x, this.bendPoint.x),
      minY: Math.min(this.anchorPoint.y, this.bendPoint.y),
      maxX: Math.max(this.anchorPoint.x, this.bendPoint.x),
      maxY: Math.max(this.anchorPoint.y, this.bendPoint.y)
    };
  }

  clone(newId: string): Note {
    const copy = new Note(newId, this.targetEntityId, { ...this.anchorPoint }, { ...this.bendPoint }, this.text, this.height);
    copy.layer = this.layer;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    return copy;
  }
}
