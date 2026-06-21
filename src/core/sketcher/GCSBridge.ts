// src/core/sketcher/GCSBridge.ts
import { IDocument } from "../model/Document";
import { DocumentConstraint, DocumentPointRef, getPointCoords } from "../engine/SketchSolver";
import { SketchModel } from "./SketchModel";
import { System } from "./System";
import { SolveOutput } from "./Solver";
import { hEntity } from "./SketchPoint";
import { Coincident } from "./constraints/Coincident";
import { Horizontal } from "./constraints/Horizontal";
import { Vertical } from "./constraints/Vertical";
import { Distance } from "./constraints/Distance";
import { Radius } from "./constraints/Radius";
import { Parallel } from "./constraints/Parallel";
import { Perpendicular } from "./constraints/Perpendicular";
import { Tangent } from "./constraints/Tangent";
import { Angle } from "./constraints/Angle";
import { Concentric } from "./constraints/Concentric";
import { ArcPointsOnCircle } from "./constraints/ArcPointsOnCircle";
import { Line } from "../model/Line";
import { Circle } from "../model/Circle";
import { Arc } from "../model/Arc";
import { Polyline } from "../model/Polyline";

export function solveDocumentGCS(
  doc: IDocument,
  constraints: DocumentConstraint[],
  lockedPoint?: DocumentPointRef,
  dryRun: boolean = false
): SolveOutput {
  const model = new SketchModel();
  
  // 1. Gather all unique points referenced by constraints
  const refKey = (r: DocumentPointRef) => `${r.entityId}:${r.pointId}`;
  const uniqueRefs = new Set<string>();
  const addRef = (r: DocumentPointRef) => uniqueRefs.add(refKey(r));

  for (const c of constraints) {
    if (c.type === 'coincident' || c.type === 'horizontal' || c.type === 'vertical' || c.type === 'distance' || c.type === 'concentric') {
        addRef(c.p1); addRef(c.p2);
    } else if (c.type === 'angular' || c.type === 'parallel' || c.type === 'perpendicular' || c.type === 'equal_length') {
        addRef(c.l1[0]); addRef(c.l1[1]); addRef(c.l2[0]); addRef(c.l2[1]);
    } else if (c.type === 'tangent') {
        addRef(c.l1[0]); addRef(c.l1[1]); addRef(c.circle);
    } else if (c.type === 'fix') {
        addRef(c.p1);
    }
  }

  // 2. Add points to SketchModel
  const refToHandle = new Map<string, hEntity>();
  for (const rKey of uniqueRefs) {
    const [entId, ptId] = rKey.split(':');
    const coords = getPointCoords(doc, { entityId: entId, pointId: ptId });
    if (coords) {
        const pt = model.addPoint(coords.x, coords.y);
        refToHandle.set(rKey, pt.h);
    }
  }

  // 3. Add entities to SketchModel
  const entityToHandle = new Map<string, hEntity>();
  const referencedEntityIds = new Set<string>();
  for (const c of constraints) {
    if ((c as any).entityId) referencedEntityIds.add((c as any).entityId);
    if ((c as any).circle)  referencedEntityIds.add((c as any).circle.entityId);
    if ((c as any).l1) { referencedEntityIds.add((c as any).l1[0].entityId); referencedEntityIds.add((c as any).l1[1].entityId); }
    if ((c as any).l2) { referencedEntityIds.add((c as any).l2[0].entityId); referencedEntityIds.add((c as any).l2[1].entityId); }
  }

  for (const entId of referencedEntityIds) {
    const ent = doc.getEntity(entId);
    if (ent instanceof Line) {
        const h1 = refToHandle.get(`${entId}:start`) || refToHandle.get(`${entId}:vertex_0`);
        const h2 = refToHandle.get(`${entId}:end`) || refToHandle.get(`${entId}:vertex_1`);
        if (h1 !== undefined && h2 !== undefined) {
            const h = model.addLine(h1, h2);
            entityToHandle.set(entId, h.h);
        }
    } else if (ent instanceof Circle) {
        const hC = refToHandle.get(`${entId}:center`);
        if (hC !== undefined) {
            const h = model.addCircle(hC, ent.r);
            entityToHandle.set(entId, h.h);
        }
    } else if (ent instanceof Arc) {
        const hC = refToHandle.get(`${entId}:center`);
        const hS = refToHandle.get(`${entId}:start`);
        const hE = refToHandle.get(`${entId}:end`);
        if (hC !== undefined && hS !== undefined && hE !== undefined) {
            const h = model.addArc(hC, hS, hE, ent.r);
            entityToHandle.set(entId, h.h);
            // Implicit: points must be on radius
            model.constraints.push(new ArcPointsOnCircle(h.h));
        }
    }
  }

  // 4. Map DocumentConstraints to GCS Constraints
  for (const c of constraints) {
    switch (c.type) {
        case 'fix': {
            const h = refToHandle.get(refKey(c.p1));
            if (h !== undefined) {
                const pt = model.points.get(h)!;
                model.params.get(pt.px).known = true;
                model.params.get(pt.py).known = true;
                if (c.x !== undefined) model.params.get(pt.px).val = c.x;
                if (c.y !== undefined) model.params.get(pt.py).val = c.y;
            }
            break;
        }
        case 'coincident': {
            const h1 = refToHandle.get(refKey(c.p1));
            const h2 = refToHandle.get(refKey(c.p2));
            if (h1 !== undefined && h2 !== undefined) model.constraints.push(new Coincident(h1, h2));
            break;
        }
        case 'horizontal': {
            const h1 = refToHandle.get(refKey(c.p1));
            const h2 = refToHandle.get(refKey(c.p2));
            if (h1 !== undefined && h2 !== undefined) model.constraints.push(new Horizontal(h1, h2));
            break;
        }
        case 'vertical': {
            const h1 = refToHandle.get(refKey(c.p1));
            const h2 = refToHandle.get(refKey(c.p2));
            if (h1 !== undefined && h2 !== undefined) model.constraints.push(new Vertical(h1, h2));
            break;
        }
        case 'distance': {
            const h1 = refToHandle.get(refKey(c.p1));
            const h2 = refToHandle.get(refKey(c.p2));
            if (h1 !== undefined && h2 !== undefined) model.constraints.push(new Distance(h1, h2, c.value));
            break;
        }
        case 'radius': {
            const h = entityToHandle.get(c.entityId);
            if (h !== undefined) {
                model.constraints.push(new Radius(h, c.value));
                const ent = model.entities.get(h)!;
                if (ent.distance !== undefined) model.params.get(ent.distance).known = true;
            }
            break;
        }
        case 'parallel': {
            const h1 = entityToHandle.get(c.l1[0].entityId);
            const h2 = entityToHandle.get(c.l2[0].entityId);
            if (h1 !== undefined && h2 !== undefined) model.constraints.push(new Parallel(h1, h2));
            break;
        }
        case 'perpendicular': {
            const h1 = entityToHandle.get(c.l1[0].entityId);
            const h2 = entityToHandle.get(c.l2[0].entityId);
            if (h1 !== undefined && h2 !== undefined) model.constraints.push(new Perpendicular(h1, h2));
            break;
        }
        case 'tangent': {
            const lineH = entityToHandle.get(c.l1[0].entityId);
            const circH = entityToHandle.get(c.circle.entityId);
            if (lineH !== undefined && circH !== undefined) model.constraints.push(new Tangent(lineH, circH));
            break;
        }
        case 'angular': {
            const h1 = entityToHandle.get(c.l1[0].entityId);
            const h2 = entityToHandle.get(c.l2[0].entityId);
            if (h1 !== undefined && h2 !== undefined) model.constraints.push(new Angle(h1, h2, c.value));
            break;
        }
        case 'concentric': {
            const h1 = entityToHandle.get(c.p1.entityId);
            const h2 = entityToHandle.get(c.p2.entityId);
            if (h1 !== undefined && h2 !== undefined) model.constraints.push(new Concentric(h1, h2));
            break;
        }
    }
  }

  // 5. Handle lockedPoint (for dragging)
  if (lockedPoint) {
    const h = refToHandle.get(refKey(lockedPoint));
    if (h !== undefined) {
        const pt = model.points.get(h)!;
        model.params.get(pt.px).known = true;
        model.params.get(pt.py).known = true;
    }
  }

  // 6. Solve
  const result = System.solve(model);

  // 7. Sync back to document (skip for dry-run / DoF analysis)
  if (!dryRun) {
  for (const rKey of uniqueRefs) {
    const [entId, ptId] = rKey.split(':');
    const h = refToHandle.get(rKey);
    if (h !== undefined) {
        const pt = model.points.get(h)!;
        const coords = pt.getNum(model.params);
        const ent = doc.getEntity(entId);
        if (ent) {
            if (ent instanceof Line) {
                if (ptId === 'start' || ptId === 'vertex_0') { ent.x1 = coords.x; ent.y1 = coords.y; }
                else if (ptId === 'end' || ptId === 'vertex_1') { ent.x2 = coords.x; ent.y2 = coords.y; }
            } else if (ent instanceof Circle) {
                if (ptId === 'center') { ent.cx = coords.x; ent.cy = coords.y; }
            } else if (ent instanceof Arc) {
                if (ptId === 'center') { ent.cx = coords.x; ent.cy = coords.y; }
                else if (ptId === 'start') {
                    // Update r if start point moved
                    const dx = coords.x - ent.cx; const dy = coords.y - ent.cy;
                    ent.r = Math.sqrt(dx*dx + dy*dy);
                    ent.startAngle = Math.atan2(dy, dx);
                }
                else if (ptId === 'end') {
                    const dx = coords.x - ent.cx; const dy = coords.y - ent.cy;
                    ent.r = Math.sqrt(dx*dx + dy*dy);
                    ent.endAngle = Math.atan2(dy, dx);
                }
            } else if (ent instanceof Polyline) {
                if (ptId.startsWith('vertex_')) {
                    const idx = parseInt(ptId.split('_')[1]);
                    if (ent.vertices[idx]) { ent.vertices[idx].x = coords.x; ent.vertices[idx].y = coords.y; }
                }
            }
        }
    }
  }
  }
  
  // Sync Radius/Distance back
  if (!dryRun) {
  for (const entId of referencedEntityIds) {
      const ent = doc.getEntity(entId);
      const h = entityToHandle.get(entId);
      if (h !== undefined) {
          const gEnt = model.entities.get(h)!;
          if (gEnt.distance !== undefined) {
              const val = model.params.get(gEnt.distance).val;
              if (ent instanceof Circle) ent.r = val;
              else if (ent instanceof Arc) ent.r = val;
          }
      }
  }
  }

  return result;
}


