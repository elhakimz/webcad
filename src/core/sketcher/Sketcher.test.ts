// src/core/sketcher/Sketcher.test.ts
import { describe, it, expect } from 'vitest';
import { Expr } from './Expr';
import { ParamStore } from './Param';
import { SketchModel } from './SketchModel';
import { System } from './System';
import { SolveResult } from './Solver';

import { Horizontal } from './constraints/Horizontal';
import { Radius } from './constraints/Radius';
import { Distance } from './constraints/Distance';
import { Parallel } from './constraints/Parallel';
import { Perpendicular } from './constraints/Perpendicular';
import { Tangent } from './constraints/Tangent';
import { Angle } from './constraints/Angle';
import { Concentric } from './constraints/Concentric';

describe('GCS Sketcher Core', () => {
  describe('Symbolic Expressions', () => {
    it('should evaluate basic arithmetic', () => {
      const e = Expr.const_(10).plus(Expr.const_(5)).times(Expr.const_(2));
      expect(e.eval()).toBe(30);
    });

    it('should evaluate parameters', () => {
      const ps = new ParamStore();
      const h = ps.add(42);
      const e = Expr.param(h);
      
      const ep = e.deepCopyWithPtrs(ps);
      expect(ep.eval()).toBe(42);
    });

    it('should calculate partial derivatives', () => {
      const ps = new ParamStore();
      const h = ps.add(3);
      // f(x) = x^2 + 5x + 10
      // f'(x) = 2x + 5
      const x = Expr.param(h);
      const f = x.square().plus(Expr.const_(5).times(x)).plus(Expr.const_(10));
      
      const df = f.partialWrt(h).foldConstants().deepCopyWithPtrs(ps);
      // f'(3) = 2(3) + 5 = 11
      expect(df.eval()).toBe(11);
    });
  });

  describe('Solver Convergence', () => {
    it('should solve a simple distance constraint', () => {
      const model = new SketchModel();
      const p1 = model.addPoint(0, 0, true); // fixed at origin
      const p2 = model.addPoint(10, 0);      // starting at (10,0)
      
      model.constraints.push(new Distance(p1.h, p2.h, 20));
      
      const result = System.solve(model);
      expect(result.result).toBe(SolveResult.SOLVED_OKAY);
      expect(result.dof).toBe(1); 
      
      const pos2 = p2.getNum(model.params);
      const dist = Math.sqrt(pos2.x ** 2 + pos2.y ** 2);
      expect(dist).toBeCloseTo(20, 8);
    });

    it('should solve a horizontal constraint', () => {
      const model = new SketchModel();
      const p1 = model.addPoint(0, 0, true);
      const p2 = model.addPoint(10, 5); // skewed
      
      model.constraints.push(new Horizontal(p1.h, p2.h));
      
      const result = System.solve(model);
      expect(result.result).toBe(SolveResult.SOLVED_OKAY);
      expect(p2.getNum(model.params).y).toBeCloseTo(0, 8);
    });

    it('should solve parallel constraint', () => {
      const model = new SketchModel();
      const p1 = model.addPoint(0, 0, true);
      const p2 = model.addPoint(10, 0, true); // fixed horizontal line
      
      const p3 = model.addPoint(0, 5);
      const p4 = model.addPoint(10, 10); // skewed line
      
      const l1 = model.addLine(p1.h, p2.h);
      const l2 = model.addLine(p3.h, p4.h);
      
      model.constraints.push(new Parallel(l1.h, l2.h));
      
      const result = System.solve(model);
      expect(result.result).toBe(SolveResult.SOLVED_OKAY);
      
      const pos3 = p3.getNum(model.params);
      const pos4 = p4.getNum(model.params);
      expect(pos4.y - pos3.y).toBeCloseTo(0, 8); 
    });

    it('should solve perpendicular constraint', () => {
      const model = new SketchModel();
      const p1 = model.addPoint(0, 0, true);
      const p2 = model.addPoint(10, 0, true); // fixed horizontal line
      
      const p3 = model.addPoint(5, 0);
      const p4 = model.addPoint(6, 10); // slightly skewed
      
      const l1 = model.addLine(p1.h, p2.h);
      const l2 = model.addLine(p3.h, p4.h);
      
      model.constraints.push(new Perpendicular(l1.h, l2.h));
      
      const result = System.solve(model);
      expect(result.result).toBe(SolveResult.SOLVED_OKAY);
      
      const pos3 = p3.getNum(model.params);
      const pos4 = p4.getNum(model.params);
      expect(pos4.x - pos3.x).toBeCloseTo(0, 8); 
    });

    it('should solve tangent constraint (line-circle)', () => {
      const model = new SketchModel();
      const p1 = model.addPoint(0, 0, true);
      const circle = model.addCircle(p1.h, 10); 
      // Fix the radius param so solver doesn't change it
      model.params.get(circle.distance!).known = true;
      
      const p2 = model.addPoint(0, 15);
      const p3 = model.addPoint(20, 15); 
      const line = model.addLine(p2.h, p3.h);
      
      model.constraints.push(new Tangent(line.h, circle.h));
      
      const result = System.solve(model);
      expect(result.result).toBe(SolveResult.SOLVED_OKAY);
      
      const pos2 = p2.getNum(model.params);
      const pos3 = p3.getNum(model.params);
      
      const dx = pos3.x - pos2.x;
      const dy = pos3.y - pos2.y;
      const cross = dx * (0 - pos2.y) - dy * (0 - pos2.x);
      const dist = Math.abs(cross) / Math.sqrt(dx*dx + dy*dy);
      expect(dist).toBeCloseTo(10, 8);
    });

    it('should solve a circle radius constraint', () => {
      const model = new SketchModel();
      const p1 = model.addPoint(0, 0, true);
      const c = model.addCircle(p1.h, 10);
      
      model.constraints.push(new Radius(c.h, 25));
      
      const result = System.solve(model);
      expect(result.result).toBe(SolveResult.SOLVED_OKAY);
      const radiusParam = model.entities.get(c.h)!.distance!;
      expect(model.params.get(radiusParam).val).toBeCloseTo(25, 8);
    });

    it('should solve concentric constraint', () => {
      const model = new SketchModel();
      const p1 = model.addPoint(0, 0, true);
      const c1 = model.addCircle(p1.h, 10);
      
      const p2 = model.addPoint(10, 10);
      const c2 = model.addCircle(p2.h, 5);
      
      model.constraints.push(new Concentric(c1.h, c2.h));
      
      const result = System.solve(model);
      expect(result.result).toBe(SolveResult.SOLVED_OKAY);
      const pos2 = p2.getNum(model.params);
      expect(pos2.x).toBeCloseTo(0, 8);
      expect(pos2.y).toBeCloseTo(0, 8);
    });
    
    it('should solve angle constraint', () => {
      const model = new SketchModel();
      const p1 = model.addPoint(0, 0, true);
      const p2 = model.addPoint(10, 0, true); // fixed horizontal line
      
      const p3 = model.addPoint(0, 0, true); // shared start point
      const p4 = model.addPoint(10, 10); // skewed
      
      const l1 = model.addLine(p1.h, p2.h);
      const l2 = model.addLine(p3.h, p4.h);
      
      // Constraint: 45 degrees (stored as radians)
      model.constraints.push(new Angle(l1.h, l2.h, Math.PI / 4));
      
      const result = System.solve(model);
      expect(result.result).toBe(SolveResult.SOLVED_OKAY);
      
      const pos4 = p4.getNum(model.params);
      const angle = Math.atan2(pos4.y, pos4.x) * 180 / Math.PI;
      // Note: dot product squared handles both 45 and -45/315.
      expect(Math.abs(angle)).toBeCloseTo(45, 8);
    });

    it('should detect over-constraint (singular Jacobian)', () => {
      const model = new SketchModel();
      const p1 = model.addPoint(0, 0, true);
      const p2 = model.addPoint(10, 0);
      
      model.constraints.push(new Distance(p1.h, p2.h, 20));
      model.constraints.push(new Distance(p1.h, p2.h, 30));
      
      const result = System.solve(model);
      expect(result.result).toBe(SolveResult.SINGULAR_JACOBIAN);
    });
  });
});
