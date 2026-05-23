import { Entity } from "../model/Entity";
import { Line } from "../model/Line";
import { Circle } from "../model/Circle";
import { Arc } from "../model/Arc";
import { Polyline } from "../model/Polyline";
import { Spline } from "../model/Spline";
import { Donut } from "../model/Donut";
import { Document } from "../model/Document";
import { distancePointToPoint, bulgeToArc } from "./MathUtils";

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
  static getSnapPoint(x: number, y: number, entities: Entity[], tolerance: number): SnapPoint | null {
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
        const snaps = this.getEntitySnaps(entity);
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

  static getSnapPointSpatial(x: number, y: number, doc: Document, tolerance: number): SnapPoint | null {
    const range = { minX: x - tolerance, minY: y - tolerance, maxX: x + tolerance, maxY: y + tolerance };
    const ids = doc.querySpatialIndex(range);
    
    let closestSnap: SnapPoint | null = null;
    let minDistance = tolerance;

    for (const id of ids) {
        const entity = doc.getEntity(id);
        if (entity) {
            const snaps = this.getEntitySnaps(entity);
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

  private static getEntitySnaps(entity: Entity): SnapPoint[] {
    if (entity.getSnapPoints) {
      return entity.getSnapPoints();
    }
    const snaps: SnapPoint[] = [];
    const zVal = entity.elevation || 0;

    if (entity instanceof Line) {
      snaps.push({ x: entity.x1, y: entity.y1, z: zVal, type: SnapType.ENDPOINT });
      snaps.push({ x: entity.x2, y: entity.y2, z: zVal, type: SnapType.ENDPOINT });
      snaps.push({ x: (entity.x1 + entity.x2) / 2, y: (entity.y1 + entity.y2) / 2, z: zVal, type: SnapType.MIDPOINT });
    } 
    else if (entity instanceof Circle) {
      snaps.push({ x: entity.cx, y: entity.cy, z: zVal, type: SnapType.CENTER });
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
    }
    
    return snaps;
  }
}
