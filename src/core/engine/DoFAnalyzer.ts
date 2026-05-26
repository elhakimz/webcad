/**
 * DoFAnalyzer.ts
 *
 * Jacobian-based Degrees of Freedom analysis for the 2D PBD constraint system.
 *
 * Runs AFTER solveConstraints() as a read-only analysis pass.
 * Does NOT modify any point coordinates — the PBD solver handles that.
 *
 * Outputs:
 *   - dof           : integer — how many free scalar coordinates remain
 *   - status        : 'under' | 'solved' | 'over'
 *   - freePointSet  : which point indices have at least one free coordinate
 *   - redundantSet  : which constraint indices are linearly dependent (over-constrained)
 *
 * Algorithm (from SolveSpace system.cpp):
 *   1. Assign each non-fixed coordinate (x_i, y_i) a column index.
 *   2. Each constraint generates one or two scalar equations → rows.
 *   3. Fill the Jacobian analytically (no numerical perturbation).
 *   4. Gram-Schmidt orthogonalisation to find rank.
 *   5. dof = n_cols - rank.
 *   6. Zero rows after GS → redundant constraint.
 *   7. Columns with zero norm across all rows → free coordinate.
 */

import type { SketchPoint, SketchConstraint } from './SketchSolver';

// ─── public types ──────────────────────────────────────────────────────────────

export type DoFStatus = 'under' | 'solved' | 'over';

export interface DoFAnalysis {
  dof:            number;       // scalar degrees of freedom remaining
  status:         DoFStatus;
  freePointSet:   Set<number>;  // point indices with at least one unconstrained coord
  redundantSet:   Set<number>;  // constraint indices that are linearly dependent
}

// ─── main entry point ─────────────────────────────────────────────────────────

export function analyzeDoF(
  points:      SketchPoint[],
  constraints: SketchConstraint[],
): DoFAnalysis {

  // ── Step 1: assign column indices to free coordinates ──────────────────────
  // Fixed points (isFixed === true) have weight 0 in the PBD solver;
  // here we exclude them from free variables.
  // Each free point contributes 2 columns: colX = 2*i, colY = 2*i+1
  // A point that is "fixed" contributes 0 columns.

  const colX = (i: number) => 2 * i;      // column for x_i
  const colY = (i: number) => 2 * i + 1;  // column for y_i

  // n = total free scalar variables
  const n = points.length * 2;

  // ── Step 2: build Jacobian rows analytically ───────────────────────────────
  // Each row represents one scalar equation f(coords) = 0.
  // We store it as a sparse flat Float64Array of length n.
  // row_owners[i] = index into constraints[] that produced this row.

  type JacRow = { data: Float64Array; ownerIdx: number };
  const rows: JacRow[] = [];

  const mkRow = (ownerIdx: number): Float64Array => {
    const d = new Float64Array(n);
    rows.push({ data: d, ownerIdx });
    return d;
  };

  for (let ci = 0; ci < constraints.length; ci++) {
    const c = constraints[ci];

    if (c.type === 'fix') {
      // fix pins one or both coords of p1 to a specific value.
      // In the Jacobian, a fixed coord becomes a known — its column
      // should be treated as zero-dof regardless.
      // We model this as a unit equation for each pinned axis.
      const pt = points[c.p1];
      if (!pt || pt.isFixed) continue;
      // x fixed:
      if (c.x !== undefined) {
        const row = mkRow(ci);
        row[colX(c.p1)] = 1;
      }
      // y fixed:
      if (c.y !== undefined) {
        const row = mkRow(ci);
        row[colY(c.p1)] = 1;
      }
      continue;
    }

    if (c.type === 'coincident') {
      // f1 = x1 - x2 = 0  →  ∂/∂x1 = 1, ∂/∂x2 = -1
      // f2 = y1 - y2 = 0  →  ∂/∂y1 = 1, ∂/∂y2 = -1
      if (!validIdx(points, c.p1, c.p2)) continue;
      const r1 = mkRow(ci); r1[colX(c.p1)] = 1; r1[colX(c.p2)] = -1;
      const r2 = mkRow(ci); r2[colY(c.p1)] = 1; r2[colY(c.p2)] = -1;
      continue;
    }

    if (c.type === 'concentric') {
      if (!validIdx(points, c.p1, c.p2)) continue;
      const r1 = mkRow(ci); r1[colX(c.p1)] = 1; r1[colX(c.p2)] = -1;
      const r2 = mkRow(ci); r2[colY(c.p1)] = 1; r2[colY(c.p2)] = -1;
      continue;
    }

    if (c.type === 'horizontal') {
      // f = y1 - y2 = 0
      if (!validIdx(points, c.p1, c.p2)) continue;
      const row = mkRow(ci);
      row[colY(c.p1)] = 1; row[colY(c.p2)] = -1;
      continue;
    }

    if (c.type === 'vertical') {
      // f = x1 - x2 = 0
      if (!validIdx(points, c.p1, c.p2)) continue;
      const row = mkRow(ci);
      row[colX(c.p1)] = 1; row[colX(c.p2)] = -1;
      continue;
    }

    if (c.type === 'distance') {
      // f = sqrt((x2-x1)² + (y2-y1)²) - d = 0
      // ∂f/∂x1 = -(x2-x1)/dist,  ∂f/∂y1 = -(y2-y1)/dist
      // ∂f/∂x2 =  (x2-x1)/dist,  ∂f/∂y2 =  (y2-y1)/dist
      if (!validIdx(points, c.p1, c.p2)) continue;
      const dx   = points[c.p2].x - points[c.p1].x;
      const dy   = points[c.p2].y - points[c.p1].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1e-10) continue; // degenerate — skip
      const row = mkRow(ci);
      row[colX(c.p1)] = -dx / dist;
      row[colY(c.p1)] = -dy / dist;
      row[colX(c.p2)] =  dx / dist;
      row[colY(c.p2)] =  dy / dist;
      continue;
    }

    if (c.type === 'parallel') {
      // f = (x2-x1)*(y4-y3) - (y2-y1)*(x4-x3) = 0
      // cross product of direction vectors = 0
      const [p1, p2] = c.l1, [p3, p4] = c.l2;
      if (!validIdx(points, p1, p2, p3, p4)) continue;
      const dx1 = points[p2].x - points[p1].x, dy1 = points[p2].y - points[p1].y;
      const dx2 = points[p4].x - points[p3].x, dy2 = points[p4].y - points[p3].y;
      const row = mkRow(ci);
      // ∂f/∂x1 = -(y4-y3) = -dy2
      row[colX(p1)] = -dy2;
      // ∂f/∂y1 = +(x4-x3) = dx2
      row[colY(p1)] =  dx2;
      // ∂f/∂x2 = +(y4-y3) = dy2
      row[colX(p2)] =  dy2;
      // ∂f/∂y2 = -(x4-x3) = -dx2
      row[colY(p2)] = -dx2;
      // ∂f/∂x3 = +(y2-y1) = dy1
      row[colX(p3)] =  dy1;
      // ∂f/∂y3 = -(x2-x1) = -dx1
      row[colY(p3)] = -dx1;
      // ∂f/∂x4 = -(y2-y1) = -dy1
      row[colX(p4)] = -dy1;
      // ∂f/∂y4 = +(x2-x1) = dx1
      row[colY(p4)] =  dx1;
      continue;
    }

    if (c.type === 'perpendicular') {
      // f = (x2-x1)*(x4-x3) + (y2-y1)*(y4-y3) = 0
      // dot product of direction vectors = 0
      const [p1, p2] = c.l1, [p3, p4] = c.l2;
      if (!validIdx(points, p1, p2, p3, p4)) continue;
      const dx1 = points[p2].x - points[p1].x, dy1 = points[p2].y - points[p1].y;
      const dx2 = points[p4].x - points[p3].x, dy2 = points[p4].y - points[p3].y;
      const row = mkRow(ci);
      // ∂f/∂x1 = -(x4-x3) = -dx2
      row[colX(p1)] = -dx2;
      // ∂f/∂y1 = -(y4-y3) = -dy2
      row[colY(p1)] = -dy2;
      // ∂f/∂x2 = +(x4-x3) = dx2
      row[colX(p2)] =  dx2;
      // ∂f/∂y2 = +(y4-y3) = dy2
      row[colY(p2)] =  dy2;
      // ∂f/∂x3 = -(x2-x1) = -dx1
      row[colX(p3)] = -dx1;
      // ∂f/∂y3 = -(y2-y1) = -dy1
      row[colY(p3)] = -dy1;
      // ∂f/∂x4 = +(x2-x1) = dx1
      row[colX(p4)] =  dx1;
      // ∂f/∂y4 = +(y2-y1) = dy1
      row[colY(p4)] =  dy1;
      continue;
    }

    if (c.type === 'angular') {
      // f = (x2-x1)*(x4-x3) + (y2-y1)*(y4-y3) - len1*len2*cos(value) = 0
      // Jacobian same structure as perpendicular (the cos term is constant)
      const [p1, p2] = c.l1, [p3, p4] = c.l2;
      if (!validIdx(points, p1, p2, p3, p4)) continue;
      const dx1 = points[p2].x - points[p1].x, dy1 = points[p2].y - points[p1].y;
      const dx2 = points[p4].x - points[p3].x, dy2 = points[p4].y - points[p3].y;
      const row = mkRow(ci);
      row[colX(p1)] = -dx2;
      row[colY(p1)] = -dy2;
      row[colX(p2)] =  dx2;
      row[colY(p2)] =  dy2;
      row[colX(p3)] = -dx1;
      row[colY(p3)] = -dy1;
      row[colX(p4)] =  dx1;
      row[colY(p4)] =  dy1;
      continue;
    }

    if (c.type === 'symmetric') {
      // p3 is the midpoint of p1 and p2
      // f1 = x3 - 0.5*x1 - 0.5*x2 = 0  => ∂/∂x3=1, ∂/∂x1=-0.5, ∂/∂x2=-0.5
      // f2 = y3 - 0.5*y1 - 0.5*y2 = 0  => ∂/∂y3=1, ∂/∂y1=-0.5, ∂/∂y2=-0.5
      if (!validIdx(points, c.p1, c.p2, c.p3)) continue;
      const r1 = mkRow(ci);
      r1[colX(c.p3)] = 1.0; r1[colX(c.p1)] = -0.5; r1[colX(c.p2)] = -0.5;
      const r2 = mkRow(ci);
      r2[colY(c.p3)] = 1.0; r2[colY(c.p1)] = -0.5; r2[colY(c.p2)] = -0.5;
      continue;
    }

    if (c.type === 'midpoint') {
      // pm is midpoint of ps and pe
      if (!validIdx(points, c.pm, c.ps, c.pe)) continue;
      const r1 = mkRow(ci);
      r1[colX(c.pm)] = 1.0; r1[colX(c.ps)] = -0.5; r1[colX(c.pe)] = -0.5;
      const r2 = mkRow(ci);
      r2[colY(c.pm)] = 1.0; r2[colY(c.ps)] = -0.5; r2[colY(c.pe)] = -0.5;
      continue;
    }

    if (c.type === 'equal_length') {
      const p1 = c.l1[0], p2 = c.l1[1], p3 = c.l2[0], p4 = c.l2[1];
      if (!validIdx(points, p1, p2, p3, p4)) continue;

      const dx1 = points[p2].x - points[p1].x;
      const dy1 = points[p2].y - points[p1].y;
      const l1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

      const dx2 = points[p4].x - points[p3].x;
      const dy2 = points[p4].y - points[p3].y;
      const l2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      if (l1 > 1e-6 && l2 > 1e-6) {
        const row = mkRow(ci);
        row[colX(p1)] = -dx1 / l1;
        row[colY(p1)] = -dy1 / l1;
        row[colX(p2)] =  dx1 / l1;
        row[colY(p2)] =  dy1 / l1;
        row[colX(p3)] =  dx2 / l2;
        row[colY(p3)] =  dy2 / l2;
        row[colX(p4)] = -dx2 / l2;
        row[colY(p4)] = -dy2 / l2;
      }

    }
  }

  // ── Step 3: Gram-Schmidt orthogonalisation (from SolveSpace calculateRank) ─
  // Work on row copies so we don't destroy the originals.
  const MAG_TOL = 1e-8;
  const m = rows.length;

  // We'll orthogonalise in-place on a copy
  const gs = rows.map(r => new Float64Array(r.data));
  const rowMag = new Float64Array(m);
  const redundantSet = new Set<number>();
  let rank = 0;

  for (let i = 0; i < m; i++) {
    // Subtract projections onto all previously accepted rows
    for (let j = 0; j < i; j++) {
      if (rowMag[j] < MAG_TOL) continue;
      let dot = 0;
      for (let k = 0; k < n; k++) dot += gs[j][k] * gs[i][k];
      const scale = dot / rowMag[j];
      for (let k = 0; k < n; k++) gs[i][k] -= scale * gs[j][k];
    }

    // Compute magnitude of residual row
    let mag = 0;
    for (let k = 0; k < n; k++) mag += gs[i][k] * gs[i][k];
    rowMag[i] = mag;

    if (mag > MAG_TOL) {
      rank++;
    } else {
      // Row became zero → linearly dependent → redundant constraint
      redundantSet.add(rows[i].ownerIdx);
    }
  }

  // ── Step 4: identify free coordinates ─────────────────────────────────────
  // A column k is free if it had zero contribution in ALL Gram-Schmidt rows
  // that were accepted (mag > tol) before orthogonalisation wiped it.
  // Simpler approximation: column k is free if the column norm across all
  // original Jacobian rows is near zero.

  const colNorm = new Float64Array(n);
  for (let i = 0; i < m; i++) {
    for (let k = 0; k < n; k++) {
      colNorm[k] += rows[i].data[k] * rows[i].data[k];
    }
  }

  const freePointSet = new Set<number>();
  for (let k = 0; k < n; k++) {
    if (colNorm[k] < MAG_TOL) {
      const ptIdx = Math.floor(k / 2);
      // Don't report fixed points as "free" — they're intentionally locked
      if (!points[ptIdx]?.isFixed) {
        freePointSet.add(ptIdx);
      }
    }
  }

  // ── Step 5: total DoF and status ───────────────────────────────────────────
  const nFreeVars = points.filter(p => !p.isFixed).length * 2;
  const dof = Math.max(0, nFreeVars - rank);

  let status: DoFStatus;
  if (redundantSet.size > 0) {
    status = 'over';
  } else if (dof > 0) {
    status = 'under';
  } else {
    status = 'solved';
  }

  return { dof, status, freePointSet, redundantSet };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function validIdx(points: SketchPoint[], ...indices: number[]): boolean {
  return indices.every(i => i >= 0 && i < points.length);
}