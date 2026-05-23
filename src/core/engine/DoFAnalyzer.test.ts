import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeDoF } from './DoFAnalyzer';
import type { SketchPoint, SketchConstraint } from './SketchSolver';

describe('analyzeDoF', () => {

  // Helper: make n free points
  const pts = (n: number): SketchPoint[] =>
    Array.from({ length: n }, (_, i) => ({
      x: i * 10, y: 0, isFixed: false
    }));

  // ── Baseline: no constraints ───────────────────────────────────────────
  it('2 free points with no constraints → dof = 4', () => {
    const result = analyzeDoF(pts(2), []);
    expect(result.dof).toBe(4);       // 2 points × 2 coords
    expect(result.status).toBe('under');
    expect(result.freePointSet.size).toBe(2);
    expect(result.redundantSet.size).toBe(0);
  });

  // ── Single constraint ─────────────────────────────────────────────────
  it('horizontal constraint removes 1 dof', () => {
    const points = pts(2);
    const constraints: SketchConstraint[] = [
      { type: 'horizontal', p1: 0, p2: 1 }
    ];
    const result = analyzeDoF(points, constraints);
    expect(result.dof).toBe(3);       // 4 - 1
    expect(result.status).toBe('under');
  });

  it('vertical constraint removes 1 dof', () => {
    const result = analyzeDoF(pts(2), [{ type: 'vertical', p1: 0, p2: 1 }]);
    expect(result.dof).toBe(3);
  });

  it('coincident constraint removes 2 dof', () => {
    const result = analyzeDoF(pts(2), [{ type: 'coincident', p1: 0, p2: 1 }]);
    expect(result.dof).toBe(2);
  });

  // ── Fully constrained rectangle ───────────────────────────────────────
  // 4 points, fix one corner, constrain the others:
  // fix(0), horizontal(0,1), horizontal(3,2), vertical(0,3), vertical(1,2), distance(0,1,40), distance(0,3,30)
  // → 4 points × 2 = 8 free coords; fix takes 2, h/v take 1 each (4 more), 2 distances take 1 each
  // = 8 - (2+1+1+1+1+1+1) = 0 → fully constrained
  it('fully constrained rectangle → dof = 0', () => {
    const points: SketchPoint[] = [
      { x: 0,  y: 0,  isFixed: false },
      { x: 40, y: 0,  isFixed: false },
      { x: 40, y: 30, isFixed: false },
      { x: 0,  y: 30, isFixed: false },
    ];
    const constraints: SketchConstraint[] = [
      { type: 'fix',          p1: 0, x: 0,  y: 0  },   // 2 equations
      { type: 'horizontal',   p1: 0, p2: 1 },            // 1
      { type: 'horizontal',   p1: 3, p2: 2 },            // 1
      { type: 'vertical',     p1: 0, p2: 3 },            // 1
      { type: 'vertical',     p1: 1, p2: 2 },            // 1
      { type: 'distance',     p1: 0, p2: 1, value: 40 }, // 1
      { type: 'distance',     p1: 0, p2: 3, value: 30 }, // 1
      // Total: 8 equations, 8 unknowns → rank=8, dof=0
    ];
    const result = analyzeDoF(points, constraints);
    expect(result.dof).toBe(0);
    expect(result.status).toBe('solved');
    expect(result.freePointSet.size).toBe(0);
    expect(result.redundantSet.size).toBe(0);
  });

  // ── Over-constrained detection ────────────────────────────────────────
  it('horizontal + horizontal on same line → over-constrained', () => {
    const points = pts(2);
    const constraints: SketchConstraint[] = [
      { type: 'horizontal', p1: 0, p2: 1 },
      { type: 'horizontal', p1: 0, p2: 1 },   // redundant
    ];
    const result = analyzeDoF(points, constraints);
    expect(result.status).toBe('over');
    expect(result.redundantSet.size).toBe(1);
    expect(result.redundantSet.has(1)).toBe(true);  // second one is redundant
  });

  it('coincident + horizontal + vertical → over-constrained (h and v implied by coincident)', () => {
    const points = pts(2);
    const constraints: SketchConstraint[] = [
      { type: 'coincident',  p1: 0, p2: 1 },  // 2 eqs: x1=x2, y1=y2
      { type: 'horizontal',  p1: 0, p2: 1 },  // redundant: y1=y2 already
      { type: 'vertical',    p1: 0, p2: 1 },  // redundant: x1=x2 already
    ];
    const result = analyzeDoF(points, constraints);
    expect(result.status).toBe('over');
    expect(result.redundantSet.size).toBe(2);
  });

  // ── Free coordinate identification ───────────────────────────────────
  it('one horizontal constraint: y coords are bound, x coords are free', () => {
    const points: SketchPoint[] = [
      { x: 0, y: 5, isFixed: false },
      { x: 10, y: 5, isFixed: false },
    ];
    const result = analyzeDoF(points, [{ type: 'horizontal', p1: 0, p2: 1 }]);
    expect(result.dof).toBe(3);
    expect(result.freePointSet.has(0)).toBe(true);
    expect(result.freePointSet.has(1)).toBe(true);
  });

  // ── Fixed point ───────────────────────────────────────────────────────
  it('fixed point contributes 0 free vars', () => {
    const points: SketchPoint[] = [
      { x: 0, y: 0, isFixed: true  },   // fixed
      { x: 10, y: 0, isFixed: false },
    ];
    const result = analyzeDoF(points, []);
    expect(result.dof).toBe(2);
    expect(result.freePointSet.has(0)).toBe(false);
    expect(result.freePointSet.has(1)).toBe(true);
  });

  // ── Parallel constraint ───────────────────────────────────────────────
  it('parallel removes 1 dof', () => {
    const points: SketchPoint[] = [
      { x: 0,  y: 0,  isFixed: false },
      { x: 10, y: 0,  isFixed: false },
      { x: 0,  y: 5,  isFixed: false },
      { x: 10, y: 5,  isFixed: false },
    ];
    const result = analyzeDoF(points, [
      { type: 'parallel', l1: [0, 1], l2: [2, 3] }
    ]);
    expect(result.dof).toBe(7);   // 8 - 1
    expect(result.status).toBe('under');
  });

  // ── Perpendicular constraint ───────────────────────────────────────────
  it('perpendicular removes 1 dof', () => {
    const points: SketchPoint[] = [
      { x: 0,  y: 0,  isFixed: false },
      { x: 10, y: 0,  isFixed: false },
      { x: 0,  y: 5,  isFixed: false },
      { x: 0,  y: 15, isFixed: false },
    ];
    const result = analyzeDoF(points, [
      { type: 'perpendicular', l1: [0, 1], l2: [2, 3] }
    ]);
    expect(result.dof).toBe(7);   // 8 - 1
    expect(result.status).toBe('under');
  });

  // ── Distance constraint ───────────────────────────────────────────────
  it('distance constraint removes 1 dof', () => {
    const points = pts(2);
    const result = analyzeDoF(points, [{ type: 'distance', p1: 0, p2: 1, value: 10 }]);
    expect(result.dof).toBe(3);   // 4 - 1
    expect(result.status).toBe('under');
  });

  // ── Fix constraint ─────────────────────────────────────────────────────
  it('fix pins point to specific coordinates', () => {
    const points: SketchPoint[] = [
      { x: 0, y: 0, isFixed: false },
      { x: 10, y: 0, isFixed: false },
    ];
    const result = analyzeDoF(points, [{ type: 'fix', p1: 0, x: 0, y: 0 }]);
    expect(result.dof).toBe(2);   // second point still free
    expect(result.status).toBe('under');
  });

  // ── Edge case: degenerate distance (points at same location) ──────────
  it('skips degenerate distance constraint when points coincide', () => {
    const points: SketchPoint[] = [
      { x: 0, y: 0, isFixed: false },
      { x: 0, y: 0, isFixed: false },  // same location
    ];
    const result = analyzeDoF(points, [{ type: 'distance', p1: 0, p2: 1, value: 5 }]);
    // dist < 1e-10, so constraint is skipped → 4 dof
    expect(result.dof).toBe(4);
  });

  // ── Empty constraints array ────────────────────────────────────────────
  it('empty constraints array → under with all points free', () => {
    const result = analyzeDoF(pts(3), []);
    expect(result.dof).toBe(6);   // 3 points × 2 coords
    expect(result.status).toBe('under');
    expect(result.freePointSet.size).toBe(3);
    expect(result.redundantSet.size).toBe(0);
  });

  // ── All points fixed ───────────────────────────────────────────────────
  it('all points fixed → dof = 0, all freePointSet empty', () => {
    const points: SketchPoint[] = [
      { x: 0, y: 0, isFixed: true },
      { x: 10, y: 0, isFixed: true },
    ];
    const result = analyzeDoF(points, []);
    expect(result.dof).toBe(0);
    expect(result.freePointSet.size).toBe(0);
    expect(result.status).toBe('solved');
  });
});