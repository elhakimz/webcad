import { Entity } from "../model/Entity";
import { Line } from "../model/Line";
import { Polyline } from "../model/Polyline";
import { Spline } from "../model/Spline";
import { Arc } from "../model/Arc";
import { Text } from "../model/Text";
import { Point } from "../model/Point";
import { Circle } from "../model/Circle";
import { Ellipse } from "../model/Ellipse";

export interface BoundingBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export class StretchEngine {
    static applyStretch(entity: Entity, window: BoundingBox, displacement: { x: number, y: number }): boolean {
        if (this.shouldMoveWholeEntity(entity, window)) {
            entity.move(displacement.x, displacement.y);
            return true;
        }

        if (entity instanceof Line) {
            let changed = false;
            if (this.isPointInside(entity.x1, entity.y1, window)) {
                entity.x1 += displacement.x;
                entity.y1 += displacement.y;
                changed = true;
            }
            if (this.isPointInside(entity.x2, entity.y2, window)) {
                entity.x2 += displacement.x;
                entity.y2 += displacement.y;
                changed = true;
            }
            return changed;
        }

        if (entity instanceof Polyline) {
            let changed = false;
            for (const v of entity.vertices) {
                if (this.isPointInside(v.x, v.y, window)) {
                    v.x += displacement.x;
                    v.y += displacement.y;
                    changed = true;
                }
            }
            if (changed) {
                // Polyline might need to recompute properties if it was a rectangle etc.
                // But usually we just update the vertices.
            }
            return changed;
        }

        if (entity instanceof Spline) {
            let changed = false;
            for (const cp of entity.controlPoints) {
                if (this.isPointInside(cp.x, cp.y, window)) {
                    cp.x += displacement.x;
                    cp.y += displacement.y;
                    changed = true;
                }
            }
            if (changed) {
                entity.sampledPoints = entity.updateSampledPoints();
            }
            return changed;
        }

        if (entity instanceof Arc) {
            const startPt = {
                x: entity.cx + entity.r * Math.cos(entity.startAngle),
                y: entity.cy + entity.r * Math.sin(entity.startAngle)
            };
            const endPt = {
                x: entity.cx + entity.r * Math.cos(entity.endAngle),
                y: entity.cy + entity.r * Math.sin(entity.endAngle)
            };

            const startInside = this.isPointInside(startPt.x, startPt.y, window);
            const endInside = this.isPointInside(endPt.x, endPt.y, window);

            if (startInside && endInside) {
                // Both ends inside, move whole arc (handled by shouldMoveWholeEntity, but center might be outside)
                // Actually, if both ends are inside, we should probably move the center too if it's inside.
                // But typical CAD behavior for ARC is to stretch endpoints.
                entity.move(displacement.x, displacement.y);
                return true;
            }

            if (startInside) {
                const newStart = { x: startPt.x + displacement.x, y: startPt.y + displacement.y };
                this.reconstructArc(entity, newStart, endPt);
                return true;
            }

            if (endInside) {
                const newEnd = { x: endPt.x + displacement.x, y: endPt.y + displacement.y };
                this.reconstructArc(entity, startPt, newEnd);
                return true;
            }
        }

        return false;
    }

    private static shouldMoveWholeEntity(entity: Entity, window: BoundingBox): boolean {
        const pts = this.getStretchPoints(entity);
        if (pts.length === 0) return false;
        
        return pts.every(p => this.isPointInside(p.x, p.y, window));
    }

    private static getStretchPoints(entity: Entity): { x: number, y: number }[] {
        if (entity instanceof Line) return [{ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }];
        if (entity instanceof Polyline) return entity.vertices.map(v => ({ x: v.x, y: v.y }));
        if (entity instanceof Spline) return entity.controlPoints;
        if (entity instanceof Arc) {
            return [
                { x: entity.cx + entity.r * Math.cos(entity.startAngle), y: entity.cy + entity.r * Math.sin(entity.startAngle) },
                { x: entity.cx + entity.r * Math.cos(entity.endAngle), y: entity.cy + entity.r * Math.sin(entity.endAngle) }
            ];
        }
        if (entity instanceof Text) return [{ x: entity.x, y: entity.y }];
        if (entity instanceof Point) return [{ x: entity.x, y: entity.y }];
        if (entity instanceof Circle) return [{ x: entity.cx, y: entity.cy }];
        if (entity instanceof Ellipse) return [{ x: entity.cx, y: entity.cy }];
        
        return [];
    }

    private static isPointInside(x: number, y: number, window: BoundingBox): boolean {
        return x >= window.minX && x <= window.maxX && y >= window.minY && y <= window.maxY;
    }

    private static reconstructArc(arc: Arc, p1: { x: number, y: number }, p2: { x: number, y: number }) {
        // Simplified arc reconstruction: keep center, update angles and radius to reach the moved point
        // This is a bit non-standard but avoids complex 3-point arc logic for now.
        // Actually, a better way is to keep radius and update angles?
        // Let's just update the start/end points and recompute angles.
        
        arc.startAngle = Math.atan2(p1.y - arc.cy, p1.x - arc.cx);
        arc.endAngle = Math.atan2(p2.y - arc.cy, p2.x - arc.cx);
        // Radius might change if we move endpoints relative to center
        const r1 = Math.sqrt((p1.x - arc.cx) ** 2 + (p1.y - arc.cy) ** 2);
        const r2 = Math.sqrt((p2.x - arc.cx) ** 2 + (p2.y - arc.cy) ** 2);
        arc.r = (r1 + r2) / 2;
    }
}
