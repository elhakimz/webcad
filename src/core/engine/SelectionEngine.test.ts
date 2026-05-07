
import { describe, it, expect } from 'vitest'
import { SelectionEngine } from './SelectionEngine'
import { Line } from '../model/Line'
import { Circle } from '../model/Circle'
import { Polyline } from '../model/Polyline'
import { Dimension } from '../model/Dimension'

describe('SelectionEngine', () => {
  it('should select a line within tolerance', () => {
    const line = new Line('L1', 0, 0, 100, 100);
    const entities = [line];
    
    // Exactly on the line
    expect(SelectionEngine.getEntityAt(50, 50, 5, entities)).toBe(line);
    
    // Near the line (distance ~3.53)
    expect(SelectionEngine.getEntityAt(55, 50, 5, entities)).toBe(line);
    
    // Far from the line
    expect(SelectionEngine.getEntityAt(60, 50, 5, entities)).toBeNull();
  });

  it('should select a circle within tolerance', () => {
    const circle = new Circle('C1', 0, 0, 50);
    const entities = [circle];
    
    // On the edge
    expect(SelectionEngine.getEntityAt(50, 0, 5, entities)).toBe(circle);
    
    // Near the edge
    expect(SelectionEngine.getEntityAt(54, 0, 5, entities)).toBe(circle);
    
    // In the center (not on the edge)
    expect(SelectionEngine.getEntityAt(0, 0, 5, entities)).toBeNull();
  });

  it('should select the top-most entity', () => {
    const line1 = new Line('L1', 0, 0, 100, 100);
    const line2 = new Line('L2', 0, 0, 100, 100); // Identical, but added later
    const entities = [line1, line2];
    
    expect(SelectionEngine.getEntityAt(50, 50, 5, entities)).toBe(line2);
  });

  it('should select a polyline segment within tolerance', () => {
    const poly = new Polyline('P1', [
      { x: 0, y: 0, bulge: 0 },
      { x: 100, y: 0, bulge: 0 },
      { x: 100, y: 100, bulge: 0 }
    ]);
    const entities = [poly];
    
    expect(SelectionEngine.getEntityAt(50, 0, 5, entities)).toBe(poly);
    expect(SelectionEngine.getEntityAt(100, 50, 5, entities)).toBe(poly);
    expect(SelectionEngine.getEntityAt(50, 50, 5, entities)).toBeNull();
  });
  it('should select a dimension (RADIUS) within tolerance', () => {
    const dim = new Dimension('D1', 'RADIUS', 0, 0, 50, 0, 10);
    const entities = [dim];
    
    // Near the radius line (center 0,0 to edge 50,0)
    expect(SelectionEngine.getEntityAt(25, 0, 5, entities)).toBe(dim);
    expect(SelectionEngine.getEntityAt(25, 3, 5, entities)).toBe(dim);
    
    // Far from the radius line
    expect(SelectionEngine.getEntityAt(25, 10, 5, entities)).toBeNull();
  });
});
