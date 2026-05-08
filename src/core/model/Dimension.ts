import { Entity, BoundingBox } from "./Entity"
import { rotatePoint, reflectPointAcrossLine, distancePointToPoint } from "../engine/MathUtils"

export interface DimStyle {
  textHeight: number;
  arrowSize: number;
  offset: number;
  gap: number;
  precision: number;
  DIMTOH?: boolean;
  DIMTAD?: boolean;
}

export class Dimension extends Entity {
  type: 'LINEAR' | 'ALIGNED' | 'ANGULAR' | 'RADIUS' | 'DIAMETER';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  offset: number;
  style: DimStyle;
  dimLineLocation?: { x: number, y: number };

  constructor(id: string, type: 'LINEAR' | 'ALIGNED' | 'ANGULAR' | 'RADIUS' | 'DIAMETER', x1: number, y1: number, x2: number, y2: number, offset: number = 10) {
    super(id);
    this.type = type;
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.offset = offset;
    this.style = {
      textHeight: 2.5,
      arrowSize: 2.5,
      offset: 10,
      gap: 0,
      precision: 2,
      DIMTOH: false,
      DIMTAD: false
    };
  }

  computeValue(): number {
    if (this.type === 'RADIUS') {
      return distancePointToPoint(this.x1, this.y1, this.x2, this.y2);
    }
    if (this.type === 'DIAMETER') {
      return distancePointToPoint(this.x1, this.y1, this.x2, this.y2) * 2;
    }
    if (this.type === 'ANGULAR') {
      const vertex = this.properties?.vertex as { x: number, y: number } | undefined;
      if (vertex) {
        const a1 = Math.atan2(this.y1 - vertex.y, this.x1 - vertex.x);
        const a2 = Math.atan2(this.y2 - vertex.y, this.x2 - vertex.x);
        let diff = Math.abs(a2 - a1) * 180 / Math.PI;
        if (diff > 180) diff = 360 - diff;
        return diff;
      }
      return 0;
    }
    return distancePointToPoint(this.x1, this.y1, this.x2, this.y2);
  }

  move(dx: number, dy: number) {
    this.x1 += dx;
    this.y1 += dy;
    this.x2 += dx;
    this.y2 += dy;
  }

  rotate(baseX: number, baseY: number, angleRad: number) {
    const p1 = rotatePoint(this.x1, this.y1, baseX, baseY, angleRad);
    const p2 = rotatePoint(this.x2, this.y2, baseX, baseY, angleRad);
    this.x1 = p1.x;
    this.y1 = p1.y;
    this.x2 = p2.x;
    this.y2 = p2.y;
  }

  scale(baseX: number, baseY: number, factor: number) {
    this.x1 = baseX + (this.x1 - baseX) * factor;
    this.y1 = baseY + (this.y1 - baseY) * factor;
    this.x2 = baseX + (this.x2 - baseX) * factor;
    this.y2 = baseY + (this.y2 - baseY) * factor;
    this.offset *= factor;
    this.style.textHeight *= factor;
    this.style.arrowSize *= factor;
    this.style.gap *= factor;
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const reflected1 = reflectPointAcrossLine({ x: this.x1, y: this.y1 }, p1, p2);
    const reflected2 = reflectPointAcrossLine({ x: this.x2, y: this.y2 }, p1, p2);
    this.x1 = reflected1.x;
    this.y1 = reflected1.y;
    this.x2 = reflected2.x;
    this.y2 = reflected2.y;
  }

  getBoundingBox(): BoundingBox {
    const minX = Math.min(this.x1, this.x2) - this.offset - 10;
    const minY = Math.min(this.y1, this.y2) - this.offset - 10;
    const maxX = Math.max(this.x1, this.x2) + this.offset + 10;
    const maxY = Math.max(this.y1, this.y2) + this.offset + 10;
    return { minX, minY, maxX, maxY };
  }

  clone(newId?: string): Dimension {
    const dim = new Dimension(newId || this.id, this.type, this.x1, this.y1, this.x2, this.y2, this.offset);
    dim.layer = this.layer;
    dim.properties = JSON.parse(JSON.stringify(this.properties));
    dim.style = { ...this.style };
    if (this.dimLineLocation) {
      dim.dimLineLocation = { ...this.dimLineLocation };
    }
    return dim;
  }
}