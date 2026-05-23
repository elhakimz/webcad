export interface SketchPoint {
  x: number;
  y: number;
  isFixed?: boolean;
}

export type SketchElement =
  | { type: 'line'; p1: number; p2: number }
  | { type: 'circle'; center: number; r: number };

export type SketchConstraint =
  | { type: 'coincident'; p1: number; p2: number }
  | { type: 'horizontal'; p1: number; p2: number }
  | { type: 'vertical'; p1: number; p2: number }
  | { type: 'distance'; p1: number; p2: number; value: number }
  | { type: 'parallel'; l1: [number, number]; l2: [number, number] }
  | { type: 'perpendicular'; l1: [number, number]; l2: [number, number] }
  | { type: 'fix'; p1: number; x?: number; y?: number };

/**
 * Geometric Parametric 2D Constraint Solver using Position Based Dynamics (PBD) relaxation technique.
 * Solves coincident, horizontal, vertical, distance, parallel, and perpendicular constraints in real-time.
 */
export function solveConstraints(
  points: SketchPoint[],
  constraints: SketchConstraint[],
  lockedPointIndex?: number,
  iterations = 50
): void {
  const w = points.map((p, idx) => (p.isFixed || idx === lockedPointIndex ? 0.0 : 1.0));

  for (let iter = 0; iter < iterations; iter++) {
    for (const c of constraints) {
      if (c.type === 'coincident') {
        const { p1, p2 } = c;
        if (p1 >= points.length || p2 >= points.length) continue;
        const w1 = w[p1];
        const w2 = w[p2];
        const sumW = w1 + w2;
        if (sumW > 0) {
          const dx = points[p2].x - points[p1].x;
          const dy = points[p2].y - points[p1].y;
          points[p1].x += dx * (w1 / sumW);
          points[p1].y += dy * (w1 / sumW);
          points[p2].x -= dx * (w2 / sumW);
          points[p2].y -= dy * (w2 / sumW);
        }
      } else if (c.type === 'horizontal') {
        const { p1, p2 } = c;
        if (p1 >= points.length || p2 >= points.length) continue;
        const w1 = w[p1];
        const w2 = w[p2];
        const sumW = w1 + w2;
        if (sumW > 0) {
          const dy = points[p2].y - points[p1].y;
          points[p1].y += dy * (w1 / sumW);
          points[p2].y -= dy * (w2 / sumW);
        }
      } else if (c.type === 'vertical') {
        const { p1, p2 } = c;
        if (p1 >= points.length || p2 >= points.length) continue;
        const w1 = w[p1];
        const w2 = w[p2];
        const sumW = w1 + w2;
        if (sumW > 0) {
          const dx = points[p2].x - points[p1].x;
          points[p1].x += dx * (w1 / sumW);
          points[p2].x -= dx * (w2 / sumW);
        }
      } else if (c.type === 'distance') {
        const { p1, p2, value } = c;
        if (p1 >= points.length || p2 >= points.length) continue;
        const w1 = w[p1];
        const w2 = w[p2];
        const sumW = w1 + w2;
        if (sumW > 0) {
          const dx = points[p2].x - points[p1].x;
          const dy = points[p2].y - points[p1].y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 1e-6) {
            const err = len - value;
            const ux = dx / len;
            const uy = dy / len;
            points[p1].x += ux * err * (w1 / sumW);
            points[p1].y += uy * err * (w1 / sumW);
            points[p2].x -= ux * err * (w2 / sumW);
            points[p2].y -= uy * err * (w2 / sumW);
          }
        }
      } else if (c.type === 'parallel') {
        const { l1, l2 } = c;
        const [p1, p2] = l1;
        const [p3, p4] = l2;
        if (p1 >= points.length || p2 >= points.length || p3 >= points.length || p4 >= points.length) continue;

        const m1x = (points[p1].x + points[p2].x) / 2;
        const m1y = (points[p1].y + points[p2].y) / 2;
        const m2x = (points[p3].x + points[p4].x) / 2;
        const m2y = (points[p3].y + points[p4].y) / 2;

        const dx1 = points[p2].x - points[p1].x;
        const dy1 = points[p2].y - points[p1].y;
        const dx2 = points[p4].x - points[p3].x;
        const dy2 = points[p4].y - points[p3].y;

        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

        if (len1 > 1e-6 && len2 > 1e-6) {
          const theta1 = Math.atan2(dy1, dx1);
          const theta2 = Math.atan2(dy2, dx2);

          let diff = theta2 - theta1;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;

          if (diff > Math.PI / 2) diff -= Math.PI;
          else if (diff < -Math.PI / 2) diff += Math.PI;

          const W1 = w[p1] + w[p2];
          const W2 = w[p3] + w[p4];
          const sumW = W1 + W2;
          if (sumW > 0) {
            const corr1 = diff * (W1 / sumW);
            const corr2 = -diff * (W2 / sumW);

            const t1 = theta1 + corr1;
            const t2 = theta2 + corr2;

            const cos1 = Math.cos(t1);
            const sin1 = Math.sin(t1);
            const cos2 = Math.cos(t2);
            const sin2 = Math.sin(t2);

            if (w[p1] > 0) {
              points[p1].x = m1x - 0.5 * len1 * cos1;
              points[p1].y = m1y - 0.5 * len1 * sin1;
            }
            if (w[p2] > 0) {
              points[p2].x = m1x + 0.5 * len1 * cos1;
              points[p2].y = m1y + 0.5 * len1 * sin1;
            }
            if (w[p3] > 0) {
              points[p3].x = m2x - 0.5 * len2 * cos2;
              points[p3].y = m2y - 0.5 * len2 * sin2;
            }
            if (w[p4] > 0) {
              points[p4].x = m2x + 0.5 * len2 * cos2;
              points[p4].y = m2y + 0.5 * len2 * sin2;
            }
          }
        }
      } else if (c.type === 'perpendicular') {
        const { l1, l2 } = c;
        const [p1, p2] = l1;
        const [p3, p4] = l2;
        if (p1 >= points.length || p2 >= points.length || p3 >= points.length || p4 >= points.length) continue;

        const m1x = (points[p1].x + points[p2].x) / 2;
        const m1y = (points[p1].y + points[p2].y) / 2;
        const m2x = (points[p3].x + points[p4].x) / 2;
        const m2y = (points[p3].y + points[p4].y) / 2;

        const dx1 = points[p2].x - points[p1].x;
        const dy1 = points[p2].y - points[p1].y;
        const dx2 = points[p4].x - points[p3].x;
        const dy2 = points[p4].y - points[p3].y;

        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

        if (len1 > 1e-6 && len2 > 1e-6) {
          const theta1 = Math.atan2(dy1, dx1);
          const theta2 = Math.atan2(dy2, dx2);

          let diff = theta2 - theta1 - Math.PI / 2;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;

          if (diff > Math.PI / 2) diff -= Math.PI;
          else if (diff < -Math.PI / 2) diff += Math.PI;

          const W1 = w[p1] + w[p2];
          const W2 = w[p3] + w[p4];
          const sumW = W1 + W2;
          if (sumW > 0) {
            const corr1 = diff * (W1 / sumW);
            const corr2 = -diff * (W2 / sumW);

            const t1 = theta1 + corr1;
            const t2 = theta2 + corr2;

            const cos1 = Math.cos(t1);
            const sin1 = Math.sin(t1);
            const cos2 = Math.cos(t2);
            const sin2 = Math.sin(t2);

            if (w[p1] > 0) {
              points[p1].x = m1x - 0.5 * len1 * cos1;
              points[p1].y = m1y - 0.5 * len1 * sin1;
            }
            if (w[p2] > 0) {
              points[p2].x = m1x + 0.5 * len1 * cos1;
              points[p2].y = m1y + 0.5 * len1 * sin1;
            }
            if (w[p3] > 0) {
              points[p3].x = m2x - 0.5 * len2 * cos2;
              points[p3].y = m2y - 0.5 * len2 * sin2;
            }
            if (w[p4] > 0) {
              points[p4].x = m2x + 0.5 * len2 * cos2;
              points[p4].y = m2y + 0.5 * len2 * sin2;
            }
          }
        }
      } else if (c.type === 'fix') {
        const { p1, x, y } = c;
        if (p1 < points.length) {
          if (x !== undefined && y !== undefined) {
            points[p1].x = x;
            points[p1].y = y;
          }
        }
      }
    }
  }
}

export interface DocumentPointRef {
  entityId: string;
  pointId: string; // 'start', 'end', 'center', 'vertex_0', 'vertex_1', etc.
}

export type DocumentConstraint =
  | { type: 'coincident'; p1: DocumentPointRef; p2: DocumentPointRef }
  | { type: 'horizontal'; p1: DocumentPointRef; p2: DocumentPointRef }
  | { type: 'vertical'; p1: DocumentPointRef; p2: DocumentPointRef }
  | { type: 'distance'; p1: DocumentPointRef; p2: DocumentPointRef; value: number }
  | { type: 'parallel'; l1: [DocumentPointRef, DocumentPointRef]; l2: [DocumentPointRef, DocumentPointRef] }
  | { type: 'perpendicular'; l1: [DocumentPointRef, DocumentPointRef]; l2: [DocumentPointRef, DocumentPointRef] }
  | { type: 'fix'; p1: DocumentPointRef; x?: number; y?: number };

import { IDocument } from "../model/Document";
import { Line } from "../model/Line";
import { Circle } from "../model/Circle";
import { Arc } from "../model/Arc";
import { Polyline } from "../model/Polyline";
import { Text } from "../model/Text";
import { MText } from "../model/MText";
import { Point } from "../model/Point";

export function getPointCoords(doc: IDocument, ref: DocumentPointRef): { x: number; y: number } | null {
  const entity = doc.getEntity(ref.entityId);
  if (!entity) return null;

  if (entity instanceof Line) {
    if (ref.pointId === 'start') return { x: entity.x1, y: entity.y1 };
    if (ref.pointId === 'end') return { x: entity.x2, y: entity.y2 };
  } else if (entity instanceof Circle) {
    if (ref.pointId === 'center') return { x: entity.cx, y: entity.cy };
  } else if (entity instanceof Arc) {
    if (ref.pointId === 'center') return { x: entity.cx, y: entity.cy };
    if (ref.pointId === 'start') {
      return {
        x: entity.cx + entity.r * Math.cos(entity.startAngle),
        y: entity.cy + entity.r * Math.sin(entity.startAngle)
      };
    }
    if (ref.pointId === 'end') {
      return {
        x: entity.cx + entity.r * Math.cos(entity.endAngle),
        y: entity.cy + entity.r * Math.sin(entity.endAngle)
      };
    }
  } else if (entity instanceof Polyline) {
    if (ref.pointId.startsWith('vertex_')) {
      const idx = parseInt(ref.pointId.substring(7), 10);
      if (!isNaN(idx) && idx >= 0 && idx < entity.vertices.length) {
        return { x: entity.vertices[idx].x, y: entity.vertices[idx].y };
      }
    }
  } else if (entity instanceof Text) {
    if (ref.pointId === 'position') return { x: entity.x, y: entity.y };
  } else if (entity instanceof MText) {
    if (ref.pointId === 'position') return { x: entity.insertionPoint.x, y: entity.insertionPoint.y };
  } else if (entity instanceof Point) {
    if (ref.pointId === 'position') return { x: entity.x, y: entity.y };
  }
  return null;
}

export function setPointCoords(doc: IDocument, ref: DocumentPointRef, coords: { x: number; y: number }): void {
  const entity = doc.getEntity(ref.entityId);
  if (!entity) return;

  if (entity instanceof Line) {
    if (ref.pointId === 'start') {
      entity.x1 = coords.x;
      entity.y1 = coords.y;
    } else if (ref.pointId === 'end') {
      entity.x2 = coords.x;
      entity.y2 = coords.y;
    }
  } else if (entity instanceof Circle) {
    if (ref.pointId === 'center') {
      entity.cx = coords.x;
      entity.cy = coords.y;
    }
  } else if (entity instanceof Arc) {
    if (ref.pointId === 'center') {
      entity.cx = coords.x;
      entity.cy = coords.y;
    } else if (ref.pointId === 'start' || ref.pointId === 'end') {
      const dx = coords.x - entity.cx;
      const dy = coords.y - entity.cy;
      const angle = Math.atan2(dy, dx);
      if (ref.pointId === 'start') {
        entity.startAngle = angle;
      } else {
        entity.endAngle = angle;
      }
      entity.r = Math.sqrt(dx * dx + dy * dy);
    }
  } else if (entity instanceof Polyline) {
    if (ref.pointId.startsWith('vertex_')) {
      const idx = parseInt(ref.pointId.substring(7), 10);
      if (!isNaN(idx) && idx >= 0 && idx < entity.vertices.length) {
        entity.vertices[idx].x = coords.x;
        entity.vertices[idx].y = coords.y;
      }
    }
  } else if (entity instanceof Text) {
    if (ref.pointId === 'position') {
      entity.x = coords.x;
      entity.y = coords.y;
    }
  } else if (entity instanceof MText) {
    if (ref.pointId === 'position') {
      entity.insertionPoint.x = coords.x;
      entity.insertionPoint.y = coords.y;
      entity.layoutMText();
    }
  } else if (entity instanceof Point) {
    if (ref.pointId === 'position') {
      entity.x = coords.x;
      entity.y = coords.y;
    }
  }
}

export function solveDocumentConstraints(
  doc: IDocument,
  constraints: DocumentConstraint[],
  lockedPoint?: DocumentPointRef,
  iterations = 50
): void {
  if (constraints.length === 0) return;

  // 1. Gather all unique DocumentPointRefs referenced in constraints
  const uniqueRefs: DocumentPointRef[] = [];
  const refKey = (r: DocumentPointRef) => `${r.entityId}::${r.pointId}`;
  const refToIndex = new Map<string, number>();

  function addRef(r: DocumentPointRef) {
    const key = refKey(r);
    if (!refToIndex.has(key)) {
      refToIndex.set(key, uniqueRefs.length);
      uniqueRefs.push(r);
    }
  }

  // Also, for any line or polyline or arc referenced, we want to include all its other vertices/points
  // so that the entire entity is updated and maintains its structural integrity.
  const referencedEntityIds = new Set<string>();

  for (const c of constraints) {
    if (c.type === 'coincident' || c.type === 'horizontal' || c.type === 'vertical' || c.type === 'distance' || c.type === 'fix') {
      addRef(c.p1);
      referencedEntityIds.add(c.p1.entityId);
      if ('p2' in c) {
        addRef(c.p2);
        referencedEntityIds.add(c.p2.entityId);
      }
    } else if (c.type === 'parallel' || c.type === 'perpendicular') {
      addRef(c.l1[0]);
      addRef(c.l1[1]);
      addRef(c.l2[0]);
      addRef(c.l2[1]);
      referencedEntityIds.add(c.l1[0].entityId);
      referencedEntityIds.add(c.l1[1].entityId);
      referencedEntityIds.add(c.l2[0].entityId);
      referencedEntityIds.add(c.l2[1].entityId);
    }
  }

  // Include other points of referenced entities to ensure complete coordinate preservation/updates
  for (const entId of referencedEntityIds) {
    const ent = doc.getEntity(entId);
    if (ent instanceof Line) {
      addRef({ entityId: entId, pointId: 'start' });
      addRef({ entityId: entId, pointId: 'end' });
    } else if (ent instanceof Circle) {
      addRef({ entityId: entId, pointId: 'center' });
    } else if (ent instanceof Arc) {
      addRef({ entityId: entId, pointId: 'center' });
      addRef({ entityId: entId, pointId: 'start' });
      addRef({ entityId: entId, pointId: 'end' });
    } else if (ent instanceof Polyline) {
      ent.vertices.forEach((_, idx) => {
        addRef({ entityId: entId, pointId: `vertex_${idx}` });
      });
    }
  }

  // 2. Build SketchPoints array
  const points: SketchPoint[] = [];
  for (const ref of uniqueRefs) {
    const coords = getPointCoords(doc, ref);
    if (coords) {
      points.push({ x: coords.x, y: coords.y, isFixed: false });
    } else {
      points.push({ x: 0, y: 0, isFixed: false });
    }
  }

  // 3. Map DocumentConstraints to SketchConstraints
  const solverConstraints: SketchConstraint[] = [];
  for (const c of constraints) {
    if (c.type === 'fix') {
      const idx = refToIndex.get(refKey(c.p1));
      if (idx !== undefined) {
        points[idx].isFixed = true;
        const coords = getPointCoords(doc, c.p1);
        solverConstraints.push({
          type: 'fix',
          p1: idx,
          x: c.x !== undefined ? c.x : coords?.x,
          y: c.y !== undefined ? c.y : coords?.y
        });
      }
    } else if (c.type === 'coincident') {
      const idx1 = refToIndex.get(refKey(c.p1));
      const idx2 = refToIndex.get(refKey(c.p2));
      if (idx1 !== undefined && idx2 !== undefined) {
        solverConstraints.push({ type: 'coincident', p1: idx1, p2: idx2 });
      }
    } else if (c.type === 'horizontal') {
      const idx1 = refToIndex.get(refKey(c.p1));
      const idx2 = refToIndex.get(refKey(c.p2));
      if (idx1 !== undefined && idx2 !== undefined) {
        solverConstraints.push({ type: 'horizontal', p1: idx1, p2: idx2 });
      }
    } else if (c.type === 'vertical') {
      const idx1 = refToIndex.get(refKey(c.p1));
      const idx2 = refToIndex.get(refKey(c.p2));
      if (idx1 !== undefined && idx2 !== undefined) {
        solverConstraints.push({ type: 'vertical', p1: idx1, p2: idx2 });
      }
    } else if (c.type === 'distance') {
      const idx1 = refToIndex.get(refKey(c.p1));
      const idx2 = refToIndex.get(refKey(c.p2));
      if (idx1 !== undefined && idx2 !== undefined) {
        solverConstraints.push({ type: 'distance', p1: idx1, p2: idx2, value: c.value });
      }
    } else if (c.type === 'parallel') {
      const p1 = refToIndex.get(refKey(c.l1[0]));
      const p2 = refToIndex.get(refKey(c.l1[1]));
      const p3 = refToIndex.get(refKey(c.l2[0]));
      const p4 = refToIndex.get(refKey(c.l2[1]));
      if (p1 !== undefined && p2 !== undefined && p3 !== undefined && p4 !== undefined) {
        solverConstraints.push({ type: 'parallel', l1: [p1, p2], l2: [p3, p4] });
      }
    } else if (c.type === 'perpendicular') {
      const p1 = refToIndex.get(refKey(c.l1[0]));
      const p2 = refToIndex.get(refKey(c.l1[1]));
      const p3 = refToIndex.get(refKey(c.l2[0]));
      const p4 = refToIndex.get(refKey(c.l2[1]));
      if (p1 !== undefined && p2 !== undefined && p3 !== undefined && p4 !== undefined) {
        solverConstraints.push({ type: 'perpendicular', l1: [p1, p2], l2: [p3, p4] });
      }
    }
  }

  // Find locked point index
  let lockedIndex: number | undefined;
  if (lockedPoint) {
    lockedIndex = refToIndex.get(refKey(lockedPoint));
  }

  // 4. Run solver
  solveConstraints(points, solverConstraints, lockedIndex, iterations);

  // 5. Write back to entities in document
  for (let i = 0; i < uniqueRefs.length; i++) {
    const ref = uniqueRefs[i];
    setPointCoords(doc, ref, points[i]);
  }

  // 6. Update spatial index for all affected entities
  for (const entId of referencedEntityIds) {
    const ent = doc.getEntity(entId);
    if (ent) {
      doc.updateSpatialIndex();
    }
  }
}
