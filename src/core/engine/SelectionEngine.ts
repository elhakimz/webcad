
import { Entity } from "../model/Entity";
import { Line } from "../model/Line";
import { Circle } from "../model/Circle";
import { Arc } from "../model/Arc";
import { Point } from "../model/Point";
import { Polyline } from "../model/Polyline";
import { Text } from "../model/Text";
import * as MathUtils from "./MathUtils";
import { bulgeToArc } from "./MathUtils";

export class SelectionEngine {
  static getEntityAt(x: number, y: number, tolerance: number, entities: Entity[]): Entity | null {
    // Iterate in reverse to select top-most entities
    for (let i = entities.length - 1; i >= 0; i--) {
      const entity = entities[i];
      const box = entity.getBoundingBox();

      // Broad Phase: AABB check with tolerance
      if (
        x >= box.minX - tolerance &&
        x <= box.maxX + tolerance &&
        y >= box.minY - tolerance &&
        y <= box.maxY + tolerance
      ) {
        // Narrow Phase: Exact geometry check
        if (this.isPointNearEntity(x, y, entity, tolerance)) {
          return entity;
        }
      }
    }
    return null;
  }

  private static isPointNearEntity(px: number, py: number, entity: Entity, tolerance: number): boolean {
    if (entity instanceof Line) {
      return MathUtils.distancePointToLineSegment(px, py, entity.x1, entity.y1, entity.x2, entity.y2) <= tolerance;
    }
    if (entity instanceof Circle) {
      return MathUtils.distancePointToCircle(px, py, entity.cx, entity.cy, entity.r) <= tolerance;
    }
    if (entity instanceof Arc) {
      return MathUtils.distancePointToArc(px, py, entity.cx, entity.cy, entity.r, entity.startAngle, entity.endAngle, entity.ccw) <= tolerance;
    }
    if (entity instanceof Point) {
      return MathUtils.distancePointToPoint(px, py, entity.x, entity.y) <= tolerance;
    }
    if (entity instanceof Polyline) {
      for (let i = 0; i < entity.vertices.length - (entity.closed ? 0 : 1); i++) {
        const v1 = entity.vertices[i];
        const v2 = entity.vertices[(i + 1) % entity.vertices.length];
        if (Math.abs(v1.bulge) < 1e-6) {
          if (MathUtils.distancePointToLineSegment(px, py, v1.x, v1.y, v2.x, v2.y) <= tolerance) return true;
        } else {
          const arc = bulgeToArc(v1, v2, v1.bulge);
          if (arc && MathUtils.distancePointToArc(px, py, arc.cx, arc.cy, arc.r, arc.startAngle, arc.endAngle, arc.ccw) <= tolerance) return true;
        }
      }
      return false;
    }
    if (entity instanceof Text) {
      // For text, the broad phase is often enough, but we can refine if needed.
      // Since it's a rectangle, the AABB check IS the exact check (mostly).
      return true;
    }
    return false;
  }
}
