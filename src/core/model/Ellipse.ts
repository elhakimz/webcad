import { Entity, BoundingBox } from "./Entity";
import { rotatePoint, reflectPointAcrossLine } from "../engine/MathUtils"

export class Ellipse extends Entity {
  cx: number;
  cy: number;
  majorX: number; // Vector from center to endpoint of major axis
  majorY: number;
  ratio: number; // Minor axis length / Major axis length
  startAngle: number;
  endAngle: number;
  ccw: boolean;

  constructor(id: string, cx: number, cy: number, majorX: number, majorY: number, ratio: number, startAngle: number = 0, endAngle: number = 2 * Math.PI, ccw: boolean = true, elevation = 0, thickness = 0) {
    super(id);
    this.cx = cx;
    this.cy = cy;
    this.majorX = majorX;
    this.majorY = majorY;
    this.ratio = ratio;
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.ccw = ccw;
    this.elevation = elevation;
    this.thickness = thickness;
  }

  move(dx: number, dy: number) {
    this.cx += dx;
    this.cy += dy;
  }

  rotate(baseX: number, baseY: number, angleRad: number) {
    const p = rotatePoint(this.cx, this.cy, baseX, baseY, angleRad);
    this.cx = p.x;
    this.cy = p.y;
    
    // Rotate the major axis vector
    const pr = rotatePoint(this.majorX, this.majorY, 0, 0, angleRad);
    this.majorX = pr.x;
    this.majorY = pr.y;
  }

  scale(baseX: number, baseY: number, factor: number) {
    this.cx = baseX + (this.cx - baseX) * factor;
    this.cy = baseY + (this.cy - baseY) * factor;
    this.majorX *= factor;
    this.majorY *= factor;
  }

  mirror(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const reflected = reflectPointAcrossLine({ x: this.cx, y: this.cy }, p1, p2);
    this.cx = reflected.x;
    this.cy = reflected.y;

    const vEnd = { x: this.cx + this.majorX, y: this.cy + this.majorY };
    const rEnd = reflectPointAcrossLine(vEnd, p1, p2);
    this.majorX = rEnd.x - this.cx;
    this.majorY = rEnd.y - this.cy;
    
    // Reflect angles if it's an arc
    // This is complex for ellipses, but a simple way is to flip CCW
    this.ccw = !this.ccw;
  }

  getBoundingBox(): BoundingBox {
    const a = Math.sqrt(this.majorX**2 + this.majorY**2);
    const b = a * this.ratio;
    // Conservative bounding box for now
    const maxR = Math.max(a, b);
    return {
      minX: this.cx - maxR,
      minY: this.cy - maxR,
      maxX: this.cx + maxR,
      maxY: this.cy + maxR
    };
  }

  clone(newId: string): Ellipse {
    const copy = new Ellipse(newId, this.cx, this.cy, this.majorX, this.majorY, this.ratio, this.startAngle, this.endAngle, this.ccw, this.elevation, this.thickness);
    copy.layer = this.layer;
    copy.color = this.color;
    copy.linetype = this.linetype;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    return copy;
  }
}
