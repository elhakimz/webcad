import { Entity } from "../model/Entity";
import { Line } from "../model/Line";
import { Circle } from "../model/Circle";
import { Arc } from "../model/Arc";
import { Polyline } from "../model/Polyline";
import { Spline } from "../model/Spline";
import { Donut } from "../model/Donut";
import { Point } from "../model/Point";
import { Document } from "../model/Document";
import { distancePointToPoint, bulgeToArc, getEntityEntityIntersections } from "./MathUtils";

export enum SnapType {
  ENDPOINT = 'Endpoint',
  MIDPOINT = 'Midpoint',
  CENTER = 'Center',
  INTERSECTION = 'Intersection',
  PERPENDICULAR = 'Perpendicular'
}

export interface SnapPoint {
  x: number;
  y: number;
  z?: number;
  type: SnapType;
}

export class SnapEngine {
  static getSnapPoint(x: number, y: number, entities: Entity[], tolerance: number, basePoint: Point | null = null): SnapPoint | null {
    let closestSnap: SnapPoint | null = null;
    let minDistance = tolerance;

    for (const entity of entities) {
      const box = entity.getBoundingBox();
      if (
        x >= box.minX - tolerance &&
        x <= box.maxX + tolerance &&
        y >= box.minY - tolerance &&
        y <= box.maxY + tolerance
      ) {
        const snaps = this.getEntitySnaps(entity, basePoint);
        for (const snap of snaps) {
          const dist = distancePointToPoint(x, y, snap.x, snap.y);
          if (dist <= minDistance) {
            minDistance = dist;
            closestSnap = snap;
          }
        }
      }
    }
    return closestSnap;
  }

  static getSnapPointSpatial(x: number, y: number, doc: Document, tolerance: number, basePoint: Point | null = null): SnapPoint | null {
    const range = { minX: x - tolerance, minY: y - tolerance, maxX: x + tolerance, maxY: y + tolerance };
    const ids = doc.querySpatialIndex(range);
    
    let closestSnap: SnapPoint | null = null;
    let minDistance = tolerance;

    const entities: Entity[] = [];
    for (const id of ids) {
        const entity = doc.getEntity(id);
        if (entity) entities.push(entity);
    }

    // 1. Check for intersections first (high priority)
    for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
            const intersections = getEntityEntityIntersections(entities[i], entities[j]);
            for (const pt of intersections) {
                const dist = distancePointToPoint(x, y, pt.x, pt.y);
                if (dist <= minDistance) {
                    minDistance = dist;
                    closestSnap = { x: pt.x, y: pt.y, z: pt.z, type: SnapType.INTERSECTION };
                }
            }
        }
    }

    // If an intersection was found very close, we might want to prefer it
    // But for consistency with standard CAD, we then check other snaps
    // and let the distance-based logic pick the best one.
    
    for (const entity of entities) {
        const snaps = this.getEntitySnaps(entity, basePoint);
        for (const snap of snaps) {
            const dist = distancePointToPoint(x, y, snap.x, snap.y);
            if (dist < minDistance) { // Use < instead of <= to prefer intersection if distances are equal
                minDistance = dist;
                closestSnap = snap;
            }
        }
    }
    return closestSnap;
  }

  private static getEntitySnaps(entity: Entity, basePoint: Point | null = null): SnapPoint[] {
    if (entity.getSnapPoints) {
      return entity.getSnapPoints();
    }
    const snaps: SnapPoint[] = [];
    const zVal = entity.elevation || 0;

    if (entity instanceof Line) {
      snaps.push({ x: entity.x1, y: entity.y1, z: zVal, type: SnapType.ENDPOINT });
      snaps.push({ x: entity.x2, y: entity.y2, z: zVal, type: SnapType.ENDPOINT });
      snaps.push({ x: (entity.x1 + entity.x2) / 2, y: (entity.y1 + entity.y2) / 2, z: zVal, type: SnapType.MIDPOINT });
      
      if (basePoint) {
        const proj = this.projectPointOnLine(basePoint.x, basePoint.y, entity.x1, entity.y1, entity.x2, entity.y2);
        if (proj) {
          // Check if projection is within segment
          const t = ((proj.x - entity.x1) * (entity.x2 - entity.x1) + (proj.y - entity.y1) * (entity.y2 - entity.y1)) / 
                    ((entity.x2 - entity.x1)**2 + (entity.y2 - entity.y1)**2);
          if (t >= 0 && t <= 1) {
            snaps.push({ x: proj.x, y: proj.y, z: zVal, type: SnapType.PERPENDICULAR });
          }
        }
      }
    } 
    else if (entity instanceof Circle) {
      snaps.push({ x: entity.cx, y: entity.cy, z: zVal, type: SnapType.CENTER });
      if (basePoint) {
        const dx = basePoint.x - entity.cx;
        const dy = basePoint.y - entity.cy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 1e-6) {
          snaps.push({ x: entity.cx + (dx / dist) * entity.r, y: entity.cy + (dy / dist) * entity.r, z: zVal, type: SnapType.PERPENDICULAR });
        }
      }
    } 
    else if (entity instanceof Arc) {
      snaps.push({ x: entity.cx, y: entity.cy, z: zVal, type: SnapType.CENTER });
      snaps.push({ x: entity.cx + entity.r * Math.cos(entity.startAngle), y: entity.cy + entity.r * Math.sin(entity.startAngle), z: zVal, type: SnapType.ENDPOINT });
      snaps.push({ x: entity.cx + entity.r * Math.cos(entity.endAngle), y: entity.cy + entity.r * Math.sin(entity.endAngle), z: zVal, type: SnapType.ENDPOINT });
      
      let diff = entity.endAngle - entity.startAngle;
      if (entity.ccw) {
        while (diff < 0) diff += Math.PI * 2;
        while (diff >= Math.PI * 2) diff -= Math.PI * 2;
      } else {
        while (diff > 0) diff -= Math.PI * 2;
        while (diff <= -Math.PI * 2) diff += Math.PI * 2;
      }
      const midAngle = entity.startAngle + diff / 2;
      snaps.push({ x: entity.cx + entity.r * Math.cos(midAngle), y: entity.cy + entity.r * Math.sin(midAngle), z: zVal, type: SnapType.MIDPOINT });

      if (basePoint) {
        const dx = basePoint.x - entity.cx;
        const dy = basePoint.y - entity.cy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 1e-6) {
          const px = entity.cx + (dx / dist) * entity.r;
          const py = entity.cy + (dy / dist) * entity.r;
          const angle = Math.atan2(py - entity.cy, px - entity.cx);
          if (this.isAngleInArc(angle, entity.startAngle, entity.endAngle, entity.ccw)) {
            snaps.push({ x: px, y: py, z: zVal, type: SnapType.PERPENDICULAR });
          }
        }
      }
    } 
    else if (entity instanceof Polyline) {
      const center = entity.center;
      if (center) {
        snaps.push({ x: center.x, y: center.y, z: zVal, type: SnapType.CENTER });
      }
      for (let i = 0; i < entity.vertices.length; i++) {
        const v = entity.vertices[i];
        const vZ = v.z !== undefined ? v.z : zVal;
        snaps.push({ x: v.x, y: v.y, z: vZ, type: SnapType.ENDPOINT });
        
        if (i < entity.vertices.length - 1 || entity.closed) {
          const v1 = entity.vertices[i];
          const v2 = entity.vertices[(i + 1) % entity.vertices.length];
          const v1Z = v1.z !== undefined ? v1.z : zVal;
          const v2Z = v2.z !== undefined ? v2.z : zVal;
          const midZ = (v1Z + v2Z) / 2;
          
          if (Math.abs(v1.bulge) < 1e-6) {
            snaps.push({ x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2, z: midZ, type: SnapType.MIDPOINT });
            if (basePoint) {
              const proj = this.projectPointOnLine(basePoint.x, basePoint.y, v1.x, v1.y, v2.x, v2.y);
              if (proj) {
                const t = ((proj.x - v1.x) * (v2.x - v1.x) + (proj.y - v1.y) * (v2.y - v1.y)) / 
                          ((v2.x - v1.x)**2 + (v2.y - v1.y)**2);
                if (t >= 0 && t <= 1) {
                  snaps.push({ x: proj.x, y: proj.y, z: midZ, type: SnapType.PERPENDICULAR });
                }
              }
            }
          } else {
            const arc = bulgeToArc(v1, v2, v1.bulge);
            if (arc) {
                let diff = arc.endAngle - arc.startAngle;
                if (arc.ccw) {
                    while (diff < 0) diff += Math.PI * 2;
                    while (diff >= Math.PI * 2) diff -= Math.PI * 2;
                } else {
                    while (diff > 0) diff -= Math.PI * 2;
                    while (diff <= -Math.PI * 2) diff += Math.PI * 2;
                }
                const midAngle = arc.startAngle + diff / 2;
                snaps.push({ x: arc.cx + arc.r * Math.cos(midAngle), y: arc.cy + arc.r * Math.sin(midAngle), z: midZ, type: SnapType.MIDPOINT });
                snaps.push({ x: arc.cx, y: arc.cy, z: midZ, type: SnapType.CENTER });
                
                if (basePoint) {
                  const dx = basePoint.x - arc.cx;
                  const dy = basePoint.y - arc.cy;
                  const dist = Math.sqrt(dx*dx + dy*dy);
                  if (dist > 1e-6) {
                    const px = arc.cx + (dx / dist) * arc.r;
                    const py = arc.cy + (dy / dist) * arc.r;
                    const angle = Math.atan2(py - arc.cy, px - arc.cx);
                    if (this.isAngleInArc(angle, arc.startAngle, arc.endAngle, arc.ccw)) {
                      snaps.push({ x: px, y: py, z: midZ, type: SnapType.PERPENDICULAR });
                    }
                  }
                }
            }
          }
        }
      }
    } else if (entity instanceof Spline) {
      if (entity.sampledPoints.length > 0) {
        const start = entity.sampledPoints[0];
        const end = entity.sampledPoints[entity.sampledPoints.length - 1];
        snaps.push({ x: start.x, y: start.y, z: start.z !== undefined ? start.z : zVal, type: SnapType.ENDPOINT });
        snaps.push({ x: end.x, y: end.y, z: end.z !== undefined ? end.z : zVal, type: SnapType.ENDPOINT });
        
        const midIdx = Math.floor(entity.sampledPoints.length / 2);
        const mid = entity.sampledPoints[midIdx];
        snaps.push({ x: mid.x, y: mid.y, z: mid.z !== undefined ? mid.z : zVal, type: SnapType.MIDPOINT });
      }
      for (const cp of entity.controlPoints) {
        snaps.push({ x: cp.x, y: cp.y, z: cp.z !== undefined ? cp.z : zVal, type: SnapType.ENDPOINT });
      }
    } else if (entity instanceof Donut) {
      snaps.push({ x: entity.cx, y: entity.cy, z: zVal, type: SnapType.CENTER });
    } else if (entity instanceof Point) {
      snaps.push({ x: entity.x, y: entity.y, z: zVal, type: SnapType.ENDPOINT });
    }
    
    return snaps;
  }

  private static isAngleInArc(angle: number, start: number, end: number, ccw: boolean): boolean {
    const s = this.normalizeAngle(start);
    const e = this.normalizeAngle(end);
    const a = this.normalizeAngle(angle);
    const eps = 1e-4;

    if (ccw) {
      if (s <= e) return (a >= s - eps && a <= e + eps);
      return (a >= s - eps || a <= e + eps);
    } else {
      if (e <= s) return (a >= e - eps && a <= s + eps);
      return (a >= e - eps || a <= s + eps);
    }
  }

  private static normalizeAngle(a: number): number {
    const TWO_PI = Math.PI * 2;
    return ((a % TWO_PI) + TWO_PI) % TWO_PI;
  }

  private static projectPointOnLine(px: number, py: number, x1: number, y1: number, x2: number, y2: number): { x: number, y: number } | null {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return null;
    const t = ((px - x1) * dx + (py - y1) * dy) / l2;
    return { x: x1 + t * dx, y: y1 + t * dy };
  }
}
