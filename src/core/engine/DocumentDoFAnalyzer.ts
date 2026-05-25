/**
 * DocumentDoFAnalyzer.ts
 *
 * Bridge layer: takes DocumentConstraints (which reference entities by ID/pointId)
 * and produces a per-entity DoF color classification that the Viewer can apply.
 *
 * This mirrors the same "gather unique refs → build SketchPoints array →
 * build SketchConstraints array" logic used in solveDocumentConstraints(),
 * but instead of solving it calls analyzeDoF().
 *
 * Call this AFTER solveDocumentConstraints() has already run so the point
 * coordinates are at their solved positions — the Jacobian is evaluated at
 * the current geometry, giving accurate linearisation.
 */

import { analyzeDoF, DoFAnalysis } from './DoFAnalyzer';
import type { DoFStatus } from './DoFAnalyzer';
import {
  SketchPoint,
  SketchConstraint,
  DocumentConstraint,
  DocumentPointRef,
  getPointCoords,
} from './SketchSolver';
import type { IDocument } from '../model/Document';

// ── Entity-level DoF result ────────────────────────────────────────────────

export type EntityDoFStatus =
  | 'underconstrained'   // at least one coordinate is free → blue
  | 'fullyconstrained'   // all coordinates bound, no redundancy → green
  | 'overconstrained'    // involves a redundant constraint → red
  | 'normal';            // not referenced by any constraint → default color

export interface DocumentDoFResult {
  /** Overall status of the sketch */
  status: DoFStatus;
  /** Remaining degrees of freedom */
  dof: number;
  /** Per-entity classification */
  entityStatus: Map<string, EntityDoFStatus>;
  /** Indices into doc.constraints[] that are redundant */
  redundantConstraintIndices: Set<number>;
}

// ── Main entry point ───────────────────────────────────────────────────────

export function analyzeDocumentDoF(
  doc: IDocument,
  constraints: DocumentConstraint[],
): DocumentDoFResult {

  if (constraints.length === 0) {
    return {
      status: 'under',
      dof: 0,
      entityStatus: new Map(),
      redundantConstraintIndices: new Set(),
    };
  }

  // ── 1. Gather unique DocumentPointRefs (same logic as solveDocumentConstraints) ──

  const uniqueRefs: DocumentPointRef[] = [];
  const refToIndex = new Map<string, number>();
  const referencedEntityIds = new Set<string>();

  const refKey = (r: DocumentPointRef) => `${r.entityId}::${r.pointId}`;

  function addRef(r: DocumentPointRef): void {
    const key = refKey(r);
    if (!refToIndex.has(key)) {
      refToIndex.set(key, uniqueRefs.length);
      uniqueRefs.push(r);
    }
    referencedEntityIds.add(r.entityId);
  }

  // Collect refs from constraints — same pass as solveDocumentConstraints
  for (const c of constraints) {
    if (
      c.type === 'coincident' ||
      c.type === 'concentric' ||
      c.type === 'horizontal' ||
      c.type === 'vertical' ||
      c.type === 'distance' ||
      c.type === 'fix'
    ) {
      addRef(c.p1);
      if ('p2' in c) addRef((c as any).p2);
    } else if (c.type === 'parallel' || c.type === 'perpendicular' || c.type === 'angular') {
      addRef(c.l1[0]); addRef(c.l1[1]);
      addRef(c.l2[0]); addRef(c.l2[1]);
    } else if (c.type === 'tangent') {
      addRef(c.l1[0]); addRef(c.l1[1]);
      addRef(c.circle);
    } else if (c.type === 'tangent_smooth') {
      addRef(c.p1); addRef(c.p2); addRef(c.p3);
    } else if (c.type === 'symmetric') {
      addRef(c.p1); addRef(c.p2); addRef(c.p3);
    } else if (c.type === 'midpoint') {
      addRef(c.pm); addRef(c.ps); addRef(c.pe);
    } else if (c.type === 'equal_length') {
      addRef(c.l1[0]); addRef(c.l1[1]);
      addRef(c.l2[0]); addRef(c.l2[1]);
    }
  }

  // Also include all points of referenced entities (so full entity geometry
  // is covered even if only one endpoint appears in a constraint)
  for (const entId of referencedEntityIds) {
    const ent = doc.getEntity(entId);
    if (!ent) continue;
    const type = ent.constructor.name;
    if (type === 'Line') {
      addRef({ entityId: entId, pointId: 'start' });
      addRef({ entityId: entId, pointId: 'end' });
    } else if (type === 'Circle') {
      addRef({ entityId: entId, pointId: 'center' });
    } else if (type === 'Arc') {
      addRef({ entityId: entId, pointId: 'center' });
      addRef({ entityId: entId, pointId: 'start' });
      addRef({ entityId: entId, pointId: 'end' });
    } else if (type === 'Polyline') {
      const poly = ent as any;
      poly.vertices?.forEach((_: any, idx: number) => {
        addRef({ entityId: entId, pointId: `vertex_${idx}` });
      });
    }
  }

  // ── 2. Build SketchPoint array ─────────────────────────────────────────────

  const points: SketchPoint[] = uniqueRefs.map(ref => {
    const coords = getPointCoords(doc, ref);
    return {
      x:       coords?.x ?? 0,
      y:       coords?.y ?? 0,
      isFixed: false,
    };
  });

  // ── 3. Map DocumentConstraints → SketchConstraints ────────────────────────

  const sketchConstraints: SketchConstraint[] = [];

  // Keep a parallel mapping: sketchConstraints[i] came from constraints[constraintOwner[i]]
  const constraintOwner: number[] = [];

  for (let ci = 0; ci < constraints.length; ci++) {
    const c = constraints[ci];

    if (c.type === 'fix') {
      const idx = refToIndex.get(refKey(c.p1));
      if (idx !== undefined) {
        points[idx].isFixed = true;
        const coords = getPointCoords(doc, c.p1);
        sketchConstraints.push({
          type: 'fix',
          p1: idx,
          x: c.x ?? coords?.x,
          y: c.y ?? coords?.y,
        });
        constraintOwner.push(ci);
      }
    } else if (c.type === 'coincident') {
      const i1 = refToIndex.get(refKey(c.p1));
      const i2 = refToIndex.get(refKey(c.p2));
      if (i1 !== undefined && i2 !== undefined) {
        sketchConstraints.push({ type: 'coincident', p1: i1, p2: i2 });
        constraintOwner.push(ci);
      }
    } else if (c.type === 'concentric') {
      const i1 = refToIndex.get(refKey(c.p1));
      const i2 = refToIndex.get(refKey(c.p2));
      if (i1 !== undefined && i2 !== undefined) {
        sketchConstraints.push({ type: 'concentric', p1: i1, p2: i2 });
        constraintOwner.push(ci);
      }
    } else if (c.type === 'horizontal') {
      const i1 = refToIndex.get(refKey(c.p1));
      const i2 = refToIndex.get(refKey(c.p2));
      if (i1 !== undefined && i2 !== undefined) {
        sketchConstraints.push({ type: 'horizontal', p1: i1, p2: i2 });
        constraintOwner.push(ci);
      }
    } else if (c.type === 'vertical') {
      const i1 = refToIndex.get(refKey(c.p1));
      const i2 = refToIndex.get(refKey(c.p2));
      if (i1 !== undefined && i2 !== undefined) {
        sketchConstraints.push({ type: 'vertical', p1: i1, p2: i2 });
        constraintOwner.push(ci);
      }
    } else if (c.type === 'distance') {
      const i1 = refToIndex.get(refKey(c.p1));
      const i2 = refToIndex.get(refKey(c.p2));
      if (i1 !== undefined && i2 !== undefined) {
        sketchConstraints.push({ type: 'distance', p1: i1, p2: i2, value: c.value });
        constraintOwner.push(ci);
      }
    } else if (c.type === 'parallel') {
      const p1 = refToIndex.get(refKey(c.l1[0]));
      const p2 = refToIndex.get(refKey(c.l1[1]));
      const p3 = refToIndex.get(refKey(c.l2[0]));
      const p4 = refToIndex.get(refKey(c.l2[1]));
      if (p1 !== undefined && p2 !== undefined && p3 !== undefined && p4 !== undefined) {
        sketchConstraints.push({ type: 'parallel', l1: [p1, p2], l2: [p3, p4] });
        constraintOwner.push(ci);
      }
    } else if (c.type === 'perpendicular') {
      const p1 = refToIndex.get(refKey(c.l1[0]));
      const p2 = refToIndex.get(refKey(c.l1[1]));
      const p3 = refToIndex.get(refKey(c.l2[0]));
      const p4 = refToIndex.get(refKey(c.l2[1]));
      if (p1 !== undefined && p2 !== undefined && p3 !== undefined && p4 !== undefined) {
        sketchConstraints.push({ type: 'perpendicular', l1: [p1, p2], l2: [p3, p4] });
        constraintOwner.push(ci);
      }
    } else if (c.type === 'angular') {
      const p1 = refToIndex.get(refKey(c.l1[0]));
      const p2 = refToIndex.get(refKey(c.l1[1]));
      const p3 = refToIndex.get(refKey(c.l2[0]));
      const p4 = refToIndex.get(refKey(c.l2[1]));
      if (p1 !== undefined && p2 !== undefined && p3 !== undefined && p4 !== undefined) {
        sketchConstraints.push({ type: 'angular', l1: [p1, p2], l2: [p3, p4], value: c.value });
        constraintOwner.push(ci);
      }
    } else if (c.type === 'tangent') {
      const p1 = refToIndex.get(refKey(c.l1[0]));
      const p2 = refToIndex.get(refKey(c.l1[1]));
      const pc = refToIndex.get(refKey(c.circle));

      const ent = doc.getEntity(c.circle.entityId);
      const r = (ent as any)?.r ?? 0;

      if (p1 !== undefined && p2 !== undefined && pc !== undefined && r > 0) {
        sketchConstraints.push({ type: 'tangent', l1: [p1, p2], circle: pc, radius: r });
        constraintOwner.push(ci);
      }
    } else if (c.type === 'tangent_smooth') {
      const p1 = refToIndex.get(refKey(c.p1));
      const p2 = refToIndex.get(refKey(c.p2));
      const p3 = refToIndex.get(refKey(c.p3));
      if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
        sketchConstraints.push({ type: 'tangent_smooth', p1, p2, p3 });
        constraintOwner.push(ci);
      }
    } else if (c.type === 'symmetric') {
      const p1 = refToIndex.get(refKey(c.p1));
      const p2 = refToIndex.get(refKey(c.p2));
      const p3 = refToIndex.get(refKey(c.p3));
      if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
        sketchConstraints.push({ type: 'symmetric', p1, p2, p3 });
        constraintOwner.push(ci);
      }
    } else if (c.type === 'midpoint') {
      const pm = refToIndex.get(refKey(c.pm));
      const ps = refToIndex.get(refKey(c.ps));
      const pe = refToIndex.get(refKey(c.pe));
      if (pm !== undefined && ps !== undefined && pe !== undefined) {
        sketchConstraints.push({ type: 'midpoint', pm, ps, pe });
        constraintOwner.push(ci);
      }
    } else if (c.type === 'equal_length') {
      const p1 = refToIndex.get(refKey(c.l1[0]));
      const p2 = refToIndex.get(refKey(c.l1[1]));
      const p3 = refToIndex.get(refKey(c.l2[0]));
      const p4 = refToIndex.get(refKey(c.l2[1]));
      if (p1 !== undefined && p2 !== undefined && p3 !== undefined && p4 !== undefined) {
        sketchConstraints.push({ type: 'equal_length', l1: [p1, p2], l2: [p3, p4] });
        constraintOwner.push(ci);
      }
    }
  }

  // ── 4. Run DoF analysis ────────────────────────────────────────────────────

  const analysis: DoFAnalysis = analyzeDoF(points, sketchConstraints);

  // ── 5. Map redundant SketchConstraint indices → DocumentConstraint indices ─

  const redundantDocIndices = new Set<number>();
  analysis.redundantSet.forEach(sketchIdx => {
    if (constraintOwner[sketchIdx] !== undefined) {
      redundantDocIndices.add(constraintOwner[sketchIdx]);
    }
  });

  // ── 6. Map free point indices → entity IDs ────────────────────────────────

  // For each point index in freePointSet, look up which entity it came from
  const freeEntityIds = new Set<string>();
  analysis.freePointSet.forEach(ptIdx => {
    const ref = uniqueRefs[ptIdx];
    if (ref) freeEntityIds.add(ref.entityId);
  });

  // For each entity in redundantDocIndices, find the entities involved
  const overEntityIds = new Set<string>();
  redundantDocIndices.forEach(docIdx => {
    const c = constraints[docIdx];
    if (!c) return;
    if ('p1' in c) overEntityIds.add((c as any).p1.entityId);
    if ('p2' in c) overEntityIds.add((c as any).p2.entityId);
    if ('p3' in c) overEntityIds.add((c as any).p3.entityId);
    if ('pm' in c) overEntityIds.add((c as any).pm.entityId);
    if ('ps' in c) overEntityIds.add((c as any).ps.entityId);
    if ('pe' in c) overEntityIds.add((c as any).pe.entityId);
    if ('l1' in c) {
      overEntityIds.add((c as any).l1[0].entityId);
      overEntityIds.add((c as any).l1[1].entityId);
      overEntityIds.add((c as any).l2[0].entityId);
      overEntityIds.add((c as any).l2[1].entityId);
    }
  });

  // ── 7. Build per-entity status map ────────────────────────────────────────

  const entityStatus = new Map<string, EntityDoFStatus>();

  for (const entId of referencedEntityIds) {
    if (overEntityIds.has(entId)) {
      entityStatus.set(entId, 'overconstrained');
    } else if (freeEntityIds.has(entId)) {
      entityStatus.set(entId, 'underconstrained');
    } else {
      entityStatus.set(entId, 'fullyconstrained');
    }
  }

  return {
    status:                     analysis.status,
    dof:                        analysis.dof,
    entityStatus,
    redundantConstraintIndices: redundantDocIndices,
  };
}