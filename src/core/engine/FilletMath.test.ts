import { describe, it, expect } from 'vitest'
import * as MathUtils from '../engine/MathUtils'

describe('Fillet Math', () => {
  it('should calculate correct fillet parameters for perpendicular lines', () => {
    const p1 = { x: 0, y: 100 };
    const p2 = { x: 100, y: 100 }; // Horizontal line y=100
    const p3 = { x: 100, y: 0 };
    const p4 = { x: 100, y: 100 }; // Vertical line x=100
    
    // Pick points far from the corner (100, 100)
    const pick1 = { x: 50, y: 100 };
    const pick2 = { x: 100, y: 50 };
    
    const radius = 20;
    const res = MathUtils.filletLines(p1, p2, p3, p4, radius, pick1, pick2);
    
    expect(res).not.toBeNull();
    if (res) {
        expect(res.radius).toBe(20);
        // Intersection is (100, 100). 
        // Tangent points should be (80, 100) and (100, 80).
        // Center should be (80, 80).
        expect(res.cx).toBeCloseTo(80);
        expect(res.cy).toBeCloseTo(80);
        expect(res.tp1.x).toBeCloseTo(80);
        expect(res.tp1.y).toBeCloseTo(100);
        expect(res.tp2.x).toBeCloseTo(100);
        expect(res.tp2.y).toBeCloseTo(80);
    }
  });

  it('should handle acute angles', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 100, y: 0 }; // Horizontal
    const p3 = { x: 0, y: 0 };
    const p4 = { x: 100, y: 100 }; // 45 degree line
    
    // Corner at (0, 0)
    // Pick far along lines
    const res = MathUtils.filletLines(p1, p2, p3, p4, 10, {x: 50, y: 0}, {x: 50, y: 50});
    
    expect(res).not.toBeNull();
    if (res) {
        // angleDiff is 45 deg (PI/4)
        // halfAngle is 22.5 deg
        // distToTangent = 10 / tan(22.5) = 10 / 0.414 = 24.14
        expect(res.tp1.x).toBeCloseTo(24.14, 1);
        expect(res.tp1.y).toBeCloseTo(0);
    }
  });
});
