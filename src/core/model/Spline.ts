import { Entity, BoundingBox } from "./Entity";
import { rotatePoint, reflectPointAcrossLine, tessellateSpline, Point } from "../engine/MathUtils";

export class Spline extends Entity {
  controlPoints: Point[];
  degree: number;
  knots: number[];
  isClosed: boolean;
  sampledPoints: Point[];

  constructor(id: string, controlPoints: Point[], degree: number, knots: number[], isClosed = false, elevation = 0, thickness = 0) {
    super(id);
    this.controlPoints = controlPoints;
    this.degree = degree;
    this.knots = knots;
    this.isClosed = isClosed;
    this.elevation = elevation;
    this.thickness = thickness;
    this.sampledPoints = this.updateSampledPoints();
  }

  updateSampledPoints(): Point[] {
    const pts = tessellateSpline(this.controlPoints, this.degree, this.knots, 100);
    if (this.isClosed && pts.length > 1) {
      pts.push({ ...pts[0] });
    }
    return pts;
  }

  move(dx: number, dy: number) {
    for (const p of this.controlPoints) {
      p.x += dx;
      p.y += dy;
    }
    this.sampledPoints = this.updateSampledPoints();
  }

  rotate(baseX: number, baseY: number, angleRad: number) {
    for (let i = 0; i < this.controlPoints.length; i++) {
      this.controlPoints[i] = rotatePoint(this.controlPoints[i].x, this.controlPoints[i].y, baseX, baseY, angleRad);
    }
    this.sampledPoints = this.updateSampledPoints();
  }

  scale(baseX: number, baseY: number, factor: number) {
    for (const p of this.controlPoints) {
      p.x = baseX + (p.x - baseX) * factor;
      p.y = baseY + (p.y - baseY) * factor;
    }
    this.sampledPoints = this.updateSampledPoints();
  }

  mirror(p1: Point, p2: Point) {
    for (let i = 0; i < this.controlPoints.length; i++) {
      this.controlPoints[i] = reflectPointAcrossLine(this.controlPoints[i], p1, p2);
    }
    this.sampledPoints = this.updateSampledPoints();
  }

  getBoundingBox(): BoundingBox {
    if (this.sampledPoints.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of this.sampledPoints) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY };
  }

  clone(newId: string): Spline {
    const cpCopy = this.controlPoints.map(p => ({ ...p }));
    const knotsCopy = [...this.knots];
    const copy = new Spline(newId, cpCopy, this.degree, knotsCopy, this.isClosed, this.elevation, this.thickness);
    copy.layer = this.layer;
    copy.color = this.color;
    copy.linetype = this.linetype;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    return copy;
  }

  getGrips(): import("./Entity").Grip[] {
    return this.controlPoints.map((p, i) => ({
      id: `cp_${i}`,
      point: { x: p.x, y: p.y, z: p.z !== undefined ? p.z : this.elevation },
      type: 'custom'
    }));
  }

  moveGrip(gripId: string, newPosition: { x: number; y: number }): void {
    if (gripId.startsWith('cp_')) {
      const index = parseInt(gripId.split('_')[1]);
      if (index >= 0 && index < this.controlPoints.length) {
        this.controlPoints[index].x = newPosition.x;
        this.controlPoints[index].y = newPosition.y;
        this.sampledPoints = this.updateSampledPoints();
      }
    }
  }
}
