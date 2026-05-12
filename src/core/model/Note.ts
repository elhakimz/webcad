import { Entity, BoundingBox } from "./Entity";
import { rotatePoint, reflectPointAcrossLine, distancePointToLineSegment, distancePointToPoint } from "../engine/MathUtils";

export class Note extends Entity {
  targetEntityId: string | null;
  anchorPoint: { x: number; y: number };
  bendPoint: { x: number; y: number };
  text: string;
  height: number;

  constructor(id: string, targetEntityId: string | null, anchorPoint: { x: number; y: number }, bendPoint: { x: number; y: number }, text: string, height: number = 2.5) {
    super(id);
    this.targetEntityId = targetEntityId;
    this.anchorPoint = anchorPoint || { x: 0, y: 0 };
    this.bendPoint = bendPoint || { x: 0, y: 0 };
    this.text = text || "";
    this.height = height || 2.5;
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
    const textWidthApprox = (this.text || "").length * this.height * 0.6;
    const textGap = 0.1;
    let minX = Math.min(this.anchorPoint.x, this.bendPoint.x);
    let maxX = Math.max(this.anchorPoint.x, this.bendPoint.x);
    let minY = Math.min(this.anchorPoint.y, this.bendPoint.y);
    let maxY = Math.max(this.anchorPoint.y, this.bendPoint.y);

    const p1 = this.anchorPoint;
    const p2 = this.bendPoint;

    if (this.targetEntityId !== null) {
      const shelfDir = p2.x >= p1.x ? 1 : -1;
      const shelfLength = Math.max(textWidthApprox, this.height * 2) + 0.5;
      const shelfEnd = { x: p2.x + shelfDir * shelfLength, y: p2.y };
      
      minX = Math.min(minX, shelfEnd.x);
      maxX = Math.max(maxX, shelfEnd.x);
      
      if (shelfDir > 0) {
        maxX = Math.max(maxX, shelfEnd.x + textGap + textWidthApprox);
      } else {
        minX = Math.min(minX, shelfEnd.x - textGap - textWidthApprox);
      }
    } else {
      maxX = Math.max(maxX, p2.x + textGap + textWidthApprox);
    }

    maxY = Math.max(maxY, p2.y + this.height);
    minY = Math.min(minY, p2.y - this.height);

    return { minX, minY, maxX, maxY };
  }

  hitTest(px: number, py: number, tolerance: number): boolean {
    const p1 = this.anchorPoint;
    const p2 = this.bendPoint;

    if (this.targetEntityId !== null) {
      // Leader line
      if (distancePointToLineSegment(px, py, p1.x, p1.y, p2.x, p2.y) <= tolerance) {
        return true;
      }
      
      // Shelf line (approximate length)
      const shelfDir = p2.x >= p1.x ? 1 : -1;
      const shelfLength = this.height * 4; // Approximation
      const shelfEnd = { x: p2.x + shelfDir * shelfLength, y: p2.y };
      if (distancePointToLineSegment(px, py, p2.x, p2.y, shelfEnd.x, shelfEnd.y) <= tolerance) {
        return true;
      }
    } else {
      // Free point - vertical line at p2
      const sepHeight = this.height;
      if (distancePointToLineSegment(px, py, p2.x, p2.y - this.height, p2.x, p2.y + sepHeight) <= tolerance) {
        return true;
      }
    }

    // Check if point is inside text rectangle
    const textWidthApprox = (this.text || "").length * this.height * 0.6;
    const textGap = 0.1;
    let textMinX = 0;
    let textMaxX = 0;
    let textMinY = p2.y;
    let textMaxY = p2.y + this.height;

    if (this.targetEntityId !== null) {
      const shelfDir = p2.x >= p1.x ? 1 : -1;
      const shelfLength = Math.max(textWidthApprox, this.height * 2) + 0.5; // From Viewer.ts
      const shelfEnd = { x: p2.x + shelfDir * shelfLength, y: p2.y };
      
      if (shelfDir > 0) {
        textMinX = shelfEnd.x + textGap;
        textMaxX = textMinX + textWidthApprox;
      } else {
        textMaxX = shelfEnd.x - textGap;
        textMinX = textMaxX - textWidthApprox;
      }
    } else {
      textMinX = p2.x + textGap;
      textMaxX = textMinX + textWidthApprox;
    }

    if (px >= textMinX - tolerance && px <= textMaxX + tolerance &&
        py >= textMinY - tolerance && py <= textMaxY + tolerance) {
      return true;
    }

    // Also check if point is near anchor or bend points directly
    if (distancePointToPoint(px, py, p1.x, p1.y) <= tolerance) return true;
    if (distancePointToPoint(px, py, p2.x, p2.y) <= tolerance) return true;

    return false;
  }

  clone(newId: string): Note {
    const copy = new Note(newId, this.targetEntityId, { ...this.anchorPoint }, { ...this.bendPoint }, this.text, this.height);
    copy.layer = this.layer;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    return copy;
  }
}
