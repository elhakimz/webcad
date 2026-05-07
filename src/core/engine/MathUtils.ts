import { Line as LineEntity } from "../model/Line";
import { Circle as CircleEntity } from "../model/Circle";
import { Arc as ArcEntity } from "../model/Arc";
import { Polyline as PolylineEntity } from "../model/Polyline";
import { Ellipse as EllipseEntity } from "../model/Ellipse";
import { Entity } from "../model/Entity";

export type Point = { x: number; y: number };

export function isPointInPolygon(p: Point, vertices: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;

    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function basisFunction(i: number, degree: number, t: number, knots: number[]): number {
  if (degree === 0) {
    return (t >= knots[i] && t < knots[i + 1]) ? 1 : 0;
  }

  let leftTerm = 0;
  const leftDenom = knots[i + degree] - knots[i];
  if (Math.abs(leftDenom) > 1e-9) {
    leftTerm = ((t - knots[i]) / leftDenom) * basisFunction(i, degree - 1, t, knots);
  }

  let rightTerm = 0;
  const rightDenom = knots[i + degree + 1] - knots[i + 1];
  if (Math.abs(rightDenom) > 1e-9) {
    rightTerm = ((knots[i + degree + 1] - t) / rightDenom) * basisFunction(i + 1, degree - 1, t, knots);
  }

  return leftTerm + rightTerm;
}

export function evaluateSplinePoint(controlPoints: Point[], knots: number[], degree: number, t: number): Point {
  let x = 0;
  let y = 0;
  for (let i = 0; i < controlPoints.length; i++) {
    const basis = basisFunction(i, degree, t, knots);
    x += controlPoints[i].x * basis;
    y += controlPoints[i].y * basis;
  }
  return { x, y };
}

export function tessellateSpline(controlPoints: Point[], degree: number, knots: number[], segments = 100): Point[] {
  const points: Point[] = [];
  const tMin = knots[degree];
  const tMax = knots[controlPoints.length];
  
  if (tMax <= tMin) return [];

  for (let i = 0; i <= segments; i++) {
    const t = tMin + (tMax - tMin) * (i / segments);
    const valT = t >= tMax ? tMax - 1e-9 : t;
    points.push(evaluateSplinePoint(controlPoints, knots, degree, valT));
  }
  return points;
}

/**
 * Calculates circle parameters from 3 points.
 * Returns { cx, cy, r, startAngle, endAngle, ccw } or null if collinear.
 */
export function calculateArcFrom3Points(p1: Point, p2: Point, p3: Point) {
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y;

  const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(D) < 1e-6) return null; // Collinear

  const cx = ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1) + (x3 * x3 + y3 * y3) * (y1 - y2)) / D;
  const cy_fixed = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / D;

  const r = Math.sqrt((x1 - cx) * (x1 - cx) + (y1 - cy_fixed) * (y1 - cy_fixed));

  const startAngle = Math.atan2(y1 - cy_fixed, x1 - cx);
  const endAngle = Math.atan2(endAngle - cy_fixed, x3 - cx); // BUG detected: endAngle was using variable of same name
  // Wait, I should re-calculate endAngle properly
  const endAngle_fixed = Math.atan2(y3 - cy_fixed, x3 - cx);

  const cross = (x2 - x1) * (y3 - y2) - (y2 - y1) * (x3 - x2);
  const ccw = cross > 0;

  return { cx, cy: cy_fixed, r, startAngle, endAngle: endAngle_fixed, ccw };
}

/**
 * Converts a bulge value to arc parameters.
 */
export function bulgeToArc(p1: Point, p2: Point, bulge: number) {
  const L = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
  if (L < 1e-6 || Math.abs(bulge) < 1e-6) return null;

  const h = (bulge * L) / 2;
  const r = (L * L / 4 + h * h) / (2 * h);

  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const nx = -dy / L;
  const ny = dx / L;

  const dist = r - h;
  const cx = midX + nx * dist;
  const cy = midY + ny * dist;

  const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
  const endAngle = Math.atan2(p2.y - cy, p2.x - cx);

  return {
    cx,
    cy,
    r: Math.abs(r),
    startAngle,
    endAngle,
    ccw: bulge > 0
  };
}

export function calculatePolygonVerticesByCenter(
  center: Point,
  sides: number,
  radiusPoint: Point,
  inscribed: boolean
): Point[] {
  const dx = radiusPoint.x - center.x;
  const dy = radiusPoint.y - center.y;
  let r = Math.sqrt(dx * dx + dy * dy);
  let startAngle = Math.atan2(dy, dx);

  if (!inscribed) {
    const angleOffset = Math.PI / sides;
    r = r / Math.cos(angleOffset);
    startAngle += angleOffset;
  }

  const vertices: Point[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + (i * 2 * Math.PI) / sides;
    vertices.push({
      x: center.x + r * Math.cos(angle),
      y: center.y + r * Math.sin(angle)
    });
  }
  return vertices;
}

export function calculatePolygonVerticesByEdge(
  p1: Point,
  p2: Point,
  sides: number
): Point[] {
  const vertices: Point[] = [p1, p2];
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const angleStep = (2 * Math.PI) / sides;
  
  let currentX = p2.x;
  let currentY = p2.y;
  let currentAngle = Math.atan2(dy, dx);

  for (let i = 2; i < sides; i++) {
    currentAngle += angleStep;
    currentX += Math.sqrt(dx * dx + dy * dy) * Math.cos(currentAngle);
    currentY += Math.sqrt(dx * dx + dy * dy) * Math.sin(currentAngle);
    vertices.push({ x: currentX, y: currentY });
  }

  return vertices;
}

export function distancePointToPoint(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function projectPointOnLine(px: number, py: number, x1: number, y1: number, x2: number, y2: number): { x: number, y: number } | null {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return null;
  const t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

export function distancePointToLineSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return distancePointToPoint(px, py, x1, y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distancePointToPoint(px, py, x1 + t * (x2 - x1), y1 + t * (y2 - y1));
}

export function distancePointToCircle(px: number, py: number, cx: number, cy: number, r: number): number {
  const d = distancePointToPoint(px, py, cx, cy);
  return Math.abs(d - r);
}

export function distancePointToArc(px: number, py: number, cx: number, cy: number, r: number, startAngle: number, endAngle: number, ccw: boolean): number {
  const angle = Math.atan2(py - cy, px - cx);
  
  const normalize = (a: number) => {
    while (a < 0) a += Math.PI * 2;
    while (a >= Math.PI * 2) a -= Math.PI * 2;
    return a;
  };

  const s = normalize(startAngle);
  const e = normalize(endAngle);
  const a = normalize(angle);

  let withinArc = false;
  if (ccw) {
    if (s <= e) withinArc = (a >= s && a <= e);
    else withinArc = (a >= s || a <= e);
  } else {
    if (e <= s) withinArc = (a >= e && a <= s);
    else withinArc = (a >= e || a <= s);
  }

  if (withinArc) {
    return distancePointToCircle(px, py, cx, cy, r);
  } else {
    const d1 = distancePointToPoint(px, py, cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle));
    const d2 = distancePointToPoint(px, py, cx + r * Math.cos(endAngle), cy + r * Math.sin(endAngle));
    return Math.min(d1, d2);
  }
}

export function getEllipsePointAngle(px: number, py: number, cx: number, cy: number, majorX: number, majorY: number, ratio: number): number {
  const rotation = Math.atan2(majorY, majorX);
  const majorR = Math.sqrt(majorX * majorX + majorY * majorY);
  const minorR = majorR * ratio;

  const dx = px - cx;
  const dy = py - cy;

  const cosRot = Math.cos(rotation);
  const sinRot = Math.sin(rotation);

  const localX = dx * cosRot + dy * sinRot;
  const localY = -dx * sinRot + dy * cosRot;

  return Math.atan2(localY / minorR, localX / majorR);
}

export function distancePointToEllipse(px: number, py: number, cx: number, cy: number, majorX: number, majorY: number, ratio: number, startAngle: number, endAngle: number, ccw: boolean): number {
  const rotation = Math.atan2(majorY, majorX);
  const majorR = Math.sqrt(majorX * majorX + majorY * majorY);
  const minorR = majorR * ratio;

  const normalize = (a: number) => {
    while (a < 0) a += Math.PI * 2;
    while (a >= Math.PI * 2) a -= Math.PI * 2;
    return a;
  };

  const s = normalize(startAngle);
  let e = normalize(endAngle);
  if (ccw && e <= s) e += Math.PI * 2;
  if (!ccw && e >= s) e -= Math.PI * 2;
  
  const getPt = (ang: number) => {
    const tx = majorR * Math.cos(ang);
    const ty = minorR * Math.sin(ang);
    const rx = tx * Math.cos(rotation) - ty * Math.sin(rotation);
    const ry = tx * Math.sin(rotation) + ty * Math.cos(rotation);
    return { x: cx + rx, y: cy + ry };
  };

  // Sample ellipse curve and find minimum distance to perimeter (not center!)
  const steps = 128;
  let minDist = Infinity;
  
  // For full ellipse (startAngle=0, endAngle=2π, ccw=true), use full circle
  // For arc, only sample the arc portion
  const isFullEllipse = Math.abs(endAngle - startAngle - 2 * Math.PI) < 0.01 || Math.abs(startAngle) < 0.01 && Math.abs(endAngle - 2 * Math.PI) < 0.01;
  
  if (isFullEllipse) {
    // Full ellipse - sample full circle
    for (let i = 0; i <= steps; i++) {
      const ang = (i / steps) * Math.PI * 2;
      const pt = getPt(ang);
      const d = Math.sqrt((px - pt.x) ** 2 + (py - pt.y) ** 2);
      if (d < minDist) minDist = d;
    }
  } else {
    // Arc - sample only the arc portion
    const sweep = e - s;
    for (let i = 0; i <= steps; i++) {
      const ang = s + (i / steps) * sweep;
      const pt = getPt(ang);
      const d = Math.sqrt((px - pt.x) ** 2 + (py - pt.y) ** 2);
      if (d < minDist) minDist = d;
    }
  }

  return minDist;
}

export function rotatePoint(x: number, y: number, cx: number, cy: number, angleRad: number) {
  const s = Math.sin(angleRad);
  const c = Math.cos(angleRad);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + (dx * c - dy * s),
    y: cy + (dx * s + dy * c)
  };
}

export function reflectPointAcrossLine(point: Point, lineP1: Point, lineP2: Point): Point {
  const dx = lineP2.x - lineP1.x;
  const dy = lineP2.y - lineP1.y;
  const angle = Math.atan2(dy, dx);

  const tx = point.x - lineP1.x;
  const ty = point.y - lineP1.y;

  const rx = tx * Math.cos(-angle) - ty * Math.sin(-angle);
  const ry = tx * Math.sin(-angle) + ty * Math.cos(-angle);

  const reflectedRy = -ry;

  const finalX = rx * Math.cos(angle) - reflectedRy * Math.sin(angle);
  const finalY = rx * Math.sin(angle) + reflectedRy * Math.cos(angle);

  return {
    x: finalX + lineP1.x,
    y: finalY + lineP1.y
  };
}

export interface Line {
  p1: Point;
  p2: Point;
}

export function computeBoundingBox(vertices: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of vertices) {
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
  }
  return { minX, minY, maxX, maxY };
}

export function generateHatchLines(vertices: Point[], spacing: number, angle: number, originX = 0, originY = 0): Line[] {
  const bbox = computeBoundingBox(vertices);
  const diag = Math.sqrt((bbox.maxX - bbox.minX) ** 2 + (bbox.maxY - bbox.minY) ** 2) * 2;

  const rad = (angle * Math.PI) / 180;
  const dirX = Math.cos(rad);
  const dirY = Math.sin(rad);
  const normX = -dirY;
  const normY = dirX;

  let minProj = Infinity;
  let maxProj = -Infinity;
  const corners = [
    { x: bbox.minX, y: bbox.minY },
    { x: bbox.maxX, y: bbox.minY },
    { x: bbox.maxX, y: bbox.maxY },
    { x: bbox.minX, y: bbox.maxY }
  ];
  for (const c of corners) {
    const proj = c.x * normX + c.y * normY;
    minProj = Math.min(minProj, proj);
    maxProj = Math.max(maxProj, proj);
  }

  const originOffset = originX * normX + originY * normY;
  minProj -= spacing * 2;
  maxProj += spacing * 2;

  const startIdx = Math.floor((minProj - originOffset) / spacing);
  const endIdx = Math.ceil((maxProj - originOffset) / spacing);

  const lines: Line[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const d = i * spacing + originOffset;
    const baseX = normX * d;
    const baseY = normY * d;
    lines.push({
      p1: { x: baseX - dirX * diag, y: baseY - dirY * diag },
      p2: { x: baseX + dirX * diag, y: baseY + dirY * diag }
    });
  }
  return lines;
}

export function lineSegmentIntersection(line: Line, segStart: Point, segEnd: Point): Point | null {
  const lx1 = line.p1.x, ly1 = line.p1.y;
  const lx2 = line.p2.x, ly2 = line.p2.y;
  const sx1 = segStart.x, sy1 = segStart.y;
  const sx2 = segEnd.x, sy2 = segEnd.y;
  
  const dx1 = lx2 - lx1, dy1 = ly2 - ly1;
  const dx2 = sx2 - sx1, dy2 = sy2 - sy1;
  
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-6) return null;
  
  const t = ((sx1 - lx1) * dy2 - (sy1 - ly1) * dx2) / denom;
  const u = ((sx1 - lx1) * dy1 - (sy1 - ly1) * dx1) / denom;
  
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: lx1 + t * dx1, y: ly1 + t * dy1 };
  }
  return null;
}

export function clipLineWithPolygon(line: Line, vertices: Point[]): Line[] {
  const intersections: Point[] = [];
  
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    const pt = lineSegmentIntersection(line, vertices[i], vertices[j]);
    if (pt) {
      // Avoid duplicate points at vertices
      const exists = intersections.some(p => Math.abs(p.x - pt.x) < 1e-6 && Math.abs(p.y - pt.y) < 1e-6);
      if (!exists) intersections.push(pt);
    }
  }
  
  if (intersections.length < 2) return [];
  
  const lx1 = line.p1.x, ly1 = line.p1.y;
  const lx2 = line.p2.x, ly2 = line.p2.y;
  const dirX = lx2 - lx1, dirY = ly2 - ly1;
  
  intersections.sort((a, b) => {
    const da = (a.x - lx1) * dirX + (a.y - ly1) * dirY;
    const db = (b.x - lx1) * dirX + (b.y - ly1) * dirY;
    return da - db;
  });
  
  const segments: Line[] = [];
  // For convex polygons, pairing should be 0-1, 2-3, etc.
  for (let i = 0; i < intersections.length - 1; i++) {
    const p1 = intersections[i];
    const p2 = intersections[i + 1];
    if (isPointInPolygon({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, vertices)) {
      segments.push({ p1, p2 });
    }
  }
  return segments;
}

export function offsetLine(x1: number, y1: number, x2: number, y2: number, distance: number, sidePt: Point) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return { x1, y1, x2, y2 };

  const nx = -dy / len;
  const ny = dx / len;

  const p1a = { x: x1 + nx * distance, y: y1 + ny * distance };
  const p2a = { x: x2 + nx * distance, y: y2 + ny * distance };
  const p1b = { x: x1 - nx * distance, y: y1 - ny * distance };
  const p2b = { x: x2 - nx * distance, y: y2 - ny * distance };

  const cross = (x2 - x1) * (sidePt.y - y1) - (y2 - y1) * (sidePt.x - x1);
  
  if (cross > 0) {
      return { x1: p1a.x, y1: p1a.y, x2: p2a.x, y2: p2a.y };
  } else {
      return { x1: p1b.x, y1: p1b.y, x2: p2b.x, y2: p2b.y };
  }
}

export function offsetCircle(cx: number, cy: number, r: number, distance: number, sidePt: Point) {
  const d = Math.sqrt((sidePt.x - cx) ** 2 + (sidePt.y - cy) ** 2);
  let newR: number;
  if (d > r) {
      newR = r + distance;
  } else {
      newR = Math.max(0, r - distance);
  }
  return { cx, cy, r: newR };
}

export function aciToRgb(aci?: number): number {
  const colors: Record<number, number> = {
    1: 0xff0000,
    2: 0xffff00,
    3: 0x00ff00,
    4: 0x00ffff,
    5: 0x0000ff,
    6: 0xff00ff,
    7: 0xffffff,
    8: 0x808080,
    9: 0xc0c0c0,
  };
  
  if (aci !== undefined && colors[aci] !== undefined) {
    return colors[aci];
  }

  return 0xffffff;
}

export const LINETYPES: Record<string, number[]> = {
  'DASHED': [5, -3],
  'HIDDEN': [2, -2],
  'DOTTED': [0, -2],
  'CENTER': [10, -2, 2, -2],
  'PHANTOM': [10, -2, 2, -2, 2, -2],
  'DASHDOT': [10, -3, 0, -3],
};

export function getLinetypeSettings(linetype: string): number[] | null {
  const name = linetype.toUpperCase();
  if (LINETYPES[name]) {
    return LINETYPES[name];
  }
  return null;
}

export function getLineLineIntersection(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
  
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-6) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }
  return null;
}

export function getLineLineIntersectionInfinite(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
  
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-6) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

export function filletLines(p1: Point, p2: Point, p3: Point, p4: Point, radius: number, pick1: Point, pick2: Point) {
  const intersect = getLineLineIntersectionInfinite(p1, p2, p3, p4);
  if (!intersect) return null;

  const getUnitDir = (pa: Point, pb: Point, pick: Point, inter: Point) => {
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;
    const tPick = (pick.x - inter.x) * ux + (pick.y - inter.y) * uy;
    const sign = tPick > 0 ? 1 : -1;
    return { x: ux * sign, y: uy * sign };
  };

  const dir1 = getUnitDir(p1, p2, pick1, intersect);
  const dir2 = getUnitDir(p3, p4, pick2, intersect);

  const a1 = Math.atan2(dir1.y, dir1.x);
  const a2 = Math.atan2(dir2.y, dir2.x);

  let angleDiff = a2 - a1;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

  const halfAngle = angleDiff / 2;
  const distToTangent = Math.abs(radius / Math.tan(halfAngle));
  const distToCenter = Math.sqrt(radius * radius + distToTangent * distToTangent);

  const bisectorAngle = a1 + halfAngle;
  const cx = intersect.x + distToCenter * Math.cos(bisectorAngle);
  const cy = intersect.y + distToCenter * Math.sin(bisectorAngle);

  const tp1 = { x: intersect.x + distToTangent * dir1.x, y: intersect.y + distToTangent * dir1.y };
  const tp2 = { x: intersect.x + distToTangent * dir2.x, y: intersect.y + distToTangent * dir2.y };

  const sAngle = Math.atan2(tp1.y - cy, tp1.x - cx);
  const eAngle = Math.atan2(tp2.y - cy, tp2.x - cx);

  // Sweep should be the smaller angle (always <= PI)
  let sweep = eAngle - sAngle;
  while (sweep < -Math.PI) sweep += Math.PI * 2;
  while (sweep > Math.PI) sweep -= Math.PI * 2;

  return { cx, cy, radius, startAngle: sAngle, endAngle: eAngle, ccw: sweep > 0, tp1, tp2 };
}

export function chamferLines(p1: Point, p2: Point, p3: Point, p4: Point, dist1: number, dist2: number, pick1: Point, pick2: Point) {
  const intersect = getLineLineIntersectionInfinite(p1, p2, p3, p4);
  if (!intersect) return null;

  const getUnitDir = (pa: Point, pb: Point, pick: Point, inter: Point) => {
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;
    const tPick = (pick.x - inter.x) * ux + (pick.y - inter.y) * uy;
    const sign = tPick > 0 ? 1 : -1;
    return { x: ux * sign, y: uy * sign };
  };

  const dir1 = getUnitDir(p1, p2, pick1, intersect);
  const dir2 = getUnitDir(p3, p4, pick2, intersect);

  const cp1 = { x: intersect.x + dist1 * dir1.x, y: intersect.y + dist1 * dir1.y };
  const cp2 = { x: intersect.x + dist2 * dir2.x, y: intersect.y + dist2 * dir2.y };

  return { tp1: cp1, tp2: cp2, cp1, cp2 };
}

export function getLineCircleIntersections(p1: Point, p2: Point, cx: number, cy: number, r: number): Point[] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const fx = p1.x - cx;
  const fy = p1.y - cy;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = (fx * fx + fy * fy) - r * r;

  let discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];

  discriminant = Math.sqrt(discriminant);
  const t1 = (-b - discriminant) / (2 * a);
  const t2 = (-b + discriminant) / (2 * a);

  const results: Point[] = [];
  if (t1 >= 0 && t1 <= 1) results.push({ x: p1.x + t1 * dx, y: p1.y + t1 * dy });
  if (t2 >= 0 && t2 <= 1) results.push({ x: p1.x + t2 * dx, y: p1.y + t2 * dy });
  return results;
}

export function getCircleCircleIntersections(cx1: number, cy1: number, r1: number, cx2: number, cy2: number, r2: number): Point[] {
  const d = Math.sqrt((cx2 - cx1) ** 2 + (cy2 - cy1) ** 2);
  if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) return [];

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(r1 * r1 - a * a);
  const x2 = cx1 + a * (cx2 - cx1) / d;
  const y2 = cy1 + a * (cy2 - cy1) / d;

  const rx = -(cy2 - cy1) * (h / d);
  const ry = (cx2 - cx1) * (h / d);

  return [
    { x: x2 + rx, y: y2 + ry },
    { x: x2 - rx, y: y2 - ry }
  ];
}

export function getEntityEntityIntersections(e1: unknown, e2: unknown): Point[] {
    const explode = (e: unknown): Entity[] => {
        if (e instanceof PolylineEntity) {
            const segments: Entity[] = [];
            for (let i = 0; i < e.vertices.length - (e.closed ? 0 : 1); i++) {
                const v1 = e.vertices[i];
                const v2 = e.vertices[(i + 1) % e.vertices.length];
                if (Math.abs(v1.bulge) < 1e-6) {
                    segments.push(new LineEntity("TMP", v1.x, v1.y, v2.x, v2.y));
                } else {
                    const arc = bulgeToArc(v1, v2, v1.bulge);
                    if (arc) segments.push(new ArcEntity("TMP", arc.cx, arc.cy, arc.r, arc.startAngle, arc.endAngle, arc.ccw));
                }
            }
            return segments;
        }
        if (e instanceof EllipseEntity) {
            const segments: Entity[] = [];
            const majorR = Math.sqrt(e.majorX**2 + e.majorY**2);
            const minorR = majorR * e.ratio;
            const rotation = Math.atan2(e.majorY, e.majorX);
            const numSegments = 64;
            
            const getPt = (angle: number) => {
                const tx = majorR * Math.cos(angle);
                const ty = minorR * Math.sin(angle);
                const rx = tx * Math.cos(rotation) - ty * Math.sin(rotation);
                const ry = tx * Math.sin(rotation) + ty * Math.cos(rotation);
                return { x: e.cx + rx, y: e.cy + ry };
            };

            const s = e.startAngle;
            let end = e.endAngle;
            if (e.ccw && end <= s) end += 2 * Math.PI;
            if (!e.ccw && end >= s) end -= 2 * Math.PI;
            const sweep = end - s;

            for (let i = 0; i < numSegments; i++) {
                const p1 = getPt(s + (sweep * i) / numSegments);
                const p2 = getPt(s + (sweep * (i + 1)) / numSegments);
                segments.push(new LineEntity("TMP", p1.x, p1.y, p2.x, p2.y));
            }
            return segments;
        }
        return [e as Entity];
    };

    const s1 = explode(e1);
    const s2 = explode(e2);
    const results: Point[] = [];

    const getCircleData = (e: unknown) => {
        if (e instanceof CircleEntity) return { cx: e.cx, cy: e.cy, r: e.r, isArc: false, s: 0, e: 0, ccw: true };
        if (e instanceof ArcEntity) return { cx: e.cx, cy: e.cy, r: e.r, isArc: true, s: e.startAngle, e: e.endAngle, ccw: e.ccw };
        return null;
    };

    const isPointOnArc = (p: Point, arc: { cx: number, cy: number, r: number, isArc: boolean, s: number, e: number, ccw: boolean }) => {
        const angle = Math.atan2(p.y - arc.cy, p.x - arc.cx);
        const normalize = (a: number) => {
            while (a < 0) a += Math.PI * 2;
            while (a >= Math.PI * 2) a -= Math.PI * 2;
            return a;
        };
        const s = normalize(arc.s);
        const e = normalize(arc.e);
        const a = normalize(angle);
        const eps = 1e-4;

        if (arc.ccw) {
            if (s <= e) return (a >= s - eps && a <= e + eps);
            return (a >= s - eps || a <= e + eps);
        } else {
            if (e <= s) return (a >= e - eps && a <= s + eps);
            return (a >= e - eps || a <= s + eps);
        }
    };

    for (const sub1 of s1) {
        for (const sub2 of s2) {
            if (sub1 instanceof LineEntity || sub2 instanceof LineEntity) {
                const line = sub1 instanceof LineEntity ? sub1 : sub2 as LineEntity;
                const other = sub1 instanceof LineEntity ? sub2 : sub1;
                const circle = getCircleData(other);
                if (circle) {
                    const pts = getLineCircleIntersections({x: line.x1, y: line.y1}, {x: line.x2, y: line.y2}, circle.cx, circle.cy, circle.r);
                    results.push(...(circle.isArc ? pts.filter(p => isPointOnArc(p, circle)) : pts));
                    continue;
                }
            }

            if (sub1 instanceof LineEntity && sub2 instanceof LineEntity) {
                const pt = getLineLineIntersection({x: sub1.x1, y: sub1.y1}, {x: sub1.x2, y: sub1.y2}, {x: sub2.x1, y: sub2.y1}, {x: sub2.x2, y: sub2.y2});
                if (pt) results.push(pt);
                continue;
            }

            const c1 = getCircleData(sub1);
            const c2 = getCircleData(sub2);
            if (c1 && c2) {
                const pts = getCircleCircleIntersections(c1.cx, c1.cy, c1.r, c2.cx, c2.cy, c2.r);
                if (c1.isArc) results.push(...pts.filter(p => isPointOnArc(p, c1)));
                else if (c2.isArc) results.push(...pts.filter(p => isPointOnArc(p, c2)));
                else results.push(...pts);
            }
        }
    }

return results;
}

export function sortConnected(entities: (LineEntity | ArcEntity)[]): (LineEntity | ArcEntity)[] | null {
  const sorted: (LineEntity | ArcEntity)[] = [];
  const remaining = new Set(entities);

  let current = entities[0];
  sorted.push(current);
  remaining.delete(current);

  while (remaining.size > 0) {
    let found = false;
    for (const entity of remaining) {
      const cEnd = (current instanceof LineEntity) 
        ? { x: current.x2, y: current.y2 } 
        : { x: current.cx + current.r * Math.cos(current.endAngle), y: current.cy + current.r * Math.sin(current.endAngle) };
      const eStart = (entity instanceof LineEntity) 
        ? { x: entity.x1, y: entity.y1 } 
        : { x: entity.cx + entity.r * Math.cos(entity.startAngle), y: entity.cy + entity.r * Math.sin(entity.startAngle) };
      const eEnd = (entity instanceof LineEntity) 
        ? { x: entity.x2, y: entity.y2 } 
        : { x: entity.cx + entity.r * Math.cos(entity.endAngle), y: entity.cy + entity.r * Math.sin(entity.endAngle) };

      if (distancePointToPoint(cEnd.x, cEnd.y, eStart.x, eStart.y) < 1e-3) {
        sorted.push(entity);
        remaining.delete(entity);
        current = entity;
        found = true;
        break;
      } else if (distancePointToPoint(cEnd.x, cEnd.y, eEnd.x, eEnd.y) < 1e-3) {
        if (entity instanceof LineEntity) {
          const temp = { x: entity.x1, y: entity.y1 };
          entity.x1 = entity.x2; entity.y1 = entity.y2;
          entity.x2 = temp.x; entity.y2 = temp.y;
        } else {
          const temp = entity.startAngle;
          entity.startAngle = entity.endAngle;
          entity.endAngle = temp;
          entity.ccw = !entity.ccw;
        }
        sorted.push(entity);
        remaining.delete(entity);
        current = entity;
        found = true;
        break;
      }
    }
    if (!found) return null;
  }
  return sorted;
}





