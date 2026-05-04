export type Point = { x: number; y: number };

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
  const cy = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / D;

  const r = Math.sqrt((x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy));

  const startAngle = Math.atan2(y1 - cy, x1 - cx);
  const endAngle = Math.atan2(y3 - cy, x3 - cx);

  // We need to determine if p1 -> p2 -> p3 is CCW or CW
  // Cross product of (p2-p1) and (p3-p2)
  const cross = (x2 - x1) * (y3 - y2) - (y2 - y1) * (x3 - x2);
  const ccw = cross > 0;

  return { cx, cy, r, startAngle, endAngle, ccw };
}

/**
 * Converts a bulge value to arc parameters.
 * Bulge is tan(included_angle / 4).
 */
export function bulgeToArc(p1: Point, p2: Point, bulge: number) {
  const L = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
  if (L < 1e-6 || Math.abs(bulge) < 1e-6) return null;

  const h = (bulge * L) / 2;
  const r = (L * L / 4 + h * h) / (2 * h);

  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;

  // Normal vector (p1 to p2 rotated 90 deg)
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const nx = -dy / L;
  const ny = dx / L;

  // Center is at distance (r - h) from midpoint along normal
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

/**
 * Calculates vertices for a regular polygon given its center, number of sides,
 * inscribed/circumscribed method, and a point defining radius/rotation.
 */
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
    // If circumscribed, radiusPoint is midpoint of an edge.
    // The vertex radius R = r / cos(PI/n)
    // The start angle for vertices is startAngle + PI/n
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

/**
 * Calculates vertices for a regular polygon given the first edge endpoints.
 */
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
  
  // Normalize angles to [0, 2PI)
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
    // CW is equivalent to CCW from e to s
    if (e <= s) withinArc = (a >= e && a <= s);
    else withinArc = (a >= e || a <= s);
  }

  if (withinArc) {
    return distancePointToCircle(px, py, cx, cy, r);
  } else {
    // Distance to nearest endpoint
    const d1 = distancePointToPoint(px, py, cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle));
    const d2 = distancePointToPoint(px, py, cx + r * Math.cos(endAngle), cy + r * Math.sin(endAngle));
    return Math.min(d1, d2);
  }
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

