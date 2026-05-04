
import { describe, it, expect } from 'vitest'
import { Solid } from './Solid'

describe('Solid', () => {
  it('should calculate bounding box correctly for a triangle', () => {
    const solid = new Solid('S1', [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 50 }
    ]);
    const box = solid.getBoundingBox();
    expect(box.minX).toBe(0);
    expect(box.minY).toBe(0);
    expect(box.maxX).toBe(100);
    expect(box.maxY).toBe(50);
  });

  it('should calculate bounding box correctly for a quad', () => {
    const solid = new Solid('S2', [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
      { x: 110, y: 110 },
      { x: 10, y: 110 }
    ]);
    const box = solid.getBoundingBox();
    expect(box.minX).toBe(10);
    expect(box.minY).toBe(10);
    expect(box.maxX).toBe(110);
    expect(box.maxY).toBe(110);
  });

  it('should move correctly', () => {
    const solid = new Solid('S1', [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    solid.move(5, -2);
    expect(solid.vertices[0]).toEqual({ x: 5, y: -2 });
    expect(solid.vertices[1]).toEqual({ x: 15, y: 8 });
  });

  it('should clone correctly', () => {
    const solid = new Solid('S1', [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    const clone = solid.clone('S2');
    expect(clone.id).toBe('S2');
    expect(clone.vertices).toEqual(solid.vertices);
    expect(clone.vertices).not.toBe(solid.vertices); // Deep copy of array
  });
});
