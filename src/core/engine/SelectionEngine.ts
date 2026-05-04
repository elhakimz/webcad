
import { Entity } from "../model/Entity";
import { Line } from "../model/Line";
import { Circle } from "../model/Circle";
import { Arc } from "../model/Arc";
import { Point } from "../model/Point";
import { Polyline } from "../model/Polyline";
import { Text } from "../model/Text";
import { Solid } from "../model/Solid";
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
    if (entity instanceof Solid) {
      return this.isPointInPolygon(px, py, entity.vertices);
    }
    return false;
  }

  private static isPointInPolygon(px: number, py: number, vertices: { x: number, y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  static getEntitiesInWindow(x1: number, y1: number, x2: number, y2: number, entities: Entity[]): Entity[] {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    return entities.filter(entity => {
      const box = entity.getBoundingBox();
      // Entirely inside
      return (
        box.minX >= minX &&
        box.maxX <= maxX &&
        box.minY >= minY &&
        box.maxY <= maxY
      );
    });
  }

  static getEntitiesInCrossing(x1: number, y1: number, x2: number, y2: number, entities: Entity[]): Entity[] {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    return entities.filter(entity => {
      const box = entity.getBoundingBox();
      // Broad Phase: Box intersection
      const overlaps = !(
        box.maxX < minX ||
        box.minX > maxX ||
        box.maxY < minY ||
        box.minY > maxY
      );

      if (!overlaps) return false;

      // Narrow Phase: Precise intersection
      return this.isEntityIntersectingBox(entity, minX, minY, maxX, maxY);
    });
  }

  private static isEntityIntersectingBox(entity: Entity, minX: number, minY: number, maxX: number, maxY: number): boolean {
    // If entirely inside, it's also a crossing
    const box = entity.getBoundingBox();
    if (box.minX >= minX && box.maxX <= maxX && box.minY >= minY && box.maxY <= maxY) return true;

    if (entity instanceof Line) {
      return this.isLineIntersectingBox(entity.x1, entity.y1, entity.x2, entity.y2, minX, minY, maxX, maxY);
    }
    if (entity instanceof Circle) {
      return this.isCircleIntersectingBox(entity.cx, entity.cy, entity.r, minX, minY, maxX, maxY);
    }
    if (entity instanceof Arc) {
      // Simplified: use circle intersection and check angles if needed
      // For crossing, circle intersection is usually enough for a "fat" select
      return this.isCircleIntersectingBox(entity.cx, entity.cy, entity.r, minX, minY, maxX, maxY);
    }
    if (entity instanceof Polyline) {
      for (let i = 0; i < entity.vertices.length - (entity.closed ? 0 : 1); i++) {
        const v1 = entity.vertices[i];
        const v2 = entity.vertices[(i + 1) % entity.vertices.length];
        if (this.isLineIntersectingBox(v1.x, v1.y, v2.x, v2.y, minX, minY, maxX, maxY)) return true;
      }
      return false;
    }
    if (entity instanceof Solid) {
        // Check if any edge intersects
        for (let i = 0; i < entity.vertices.length; i++) {
            const v1 = entity.vertices[i];
            const v2 = entity.vertices[(i + 1) % entity.vertices.length];
            if (this.isLineIntersectingBox(v1.x, v1.y, v2.x, v2.y, minX, minY, maxX, maxY)) return true;
        }
        return false;
    }
    // Point, Text: Bounding box overlaps is enough
    return true;
  }

  private static isLineIntersectingBox(x1: number, y1: number, x2: number, y2: number, minX: number, minY: number, maxX: number, maxY: number): boolean {
    // Liang-Barsky or simple side-by-side check
    // If either endpoint is inside, they intersect
    if (this.isPointInRect(x1, y1, minX, minY, maxX, maxY)) return true;
    if (this.isPointInRect(x2, y2, minX, minY, maxX, maxY)) return true;

    // Check intersection with each side
    if (this.linesIntersect(x1, y1, x2, y2, minX, minY, maxX, minY)) return true; // Bottom
    if (this.linesIntersect(x1, y1, x2, y2, minX, maxY, maxX, maxY)) return true; // Top
    if (this.linesIntersect(x1, y1, x2, y2, minX, minY, minX, maxY)) return true; // Left
    if (this.linesIntersect(x1, y1, x2, y2, maxX, minY, maxX, maxY)) return true; // Right

    return false;
  }

  private static isCircleIntersectingBox(cx: number, cy: number, r: number, minX: number, minY: number, maxX: number, maxY: number): boolean {
    // Find closest point on rect to circle center
    const closestX = Math.max(minX, Math.min(cx, maxX));
    const closestY = Math.max(minY, Math.min(cy, maxY));
    const dist = Math.sqrt((cx - closestX) ** 2 + (cy - closestY) ** 2);
    return dist <= r;
  }

  private static isPointInRect(px: number, py: number, minX: number, minY: number, maxX: number, maxY: number): boolean {
    return px >= minX && px <= maxX && py >= minY && py <= maxY;
  }

  private static linesIntersect(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): boolean {
    const det = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
    if (det === 0) return false;
    const lambda = ((y4 - y3) * (x4 - x1) + (x3 - x4) * (y4 - y1)) / det;
    const gamma = ((y1 - y2) * (x4 - x1) + (x2 - x1) * (y4 - y1)) / det;
    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
  }
}
