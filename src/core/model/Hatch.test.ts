import { describe, it, expect } from 'vitest';
import { Hatch } from './Hatch';

describe('Hatch.hitTest', () => {
  it('should hit test point inside boundary', () => {
    const hatch = new Hatch('1', [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 }
    ]);
    
    expect(hatch.hitTest(5, 5, 0)).toBe(true);
    expect(hatch.hitTest(-1, 5, 0)).toBe(false);
    expect(hatch.hitTest(11, 5, 0)).toBe(false);
    expect(hatch.hitTest(5, 11, 0)).toBe(false);
    expect(hatch.hitTest(5, -1, 0)).toBe(false);
  });
});
