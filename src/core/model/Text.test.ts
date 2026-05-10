import { describe, it, expect } from 'vitest';
import { Text } from './Text';

describe('Text.hitTest', () => {
  it('should hit test unrotated text', () => {
    const text = new Text('1', 0, 0, 10, 0, 'Hello');
    // Width = 5 * 10 * 0.6 = 30
    // Height = 10
    
    expect(text.hitTest(15, 5, 0)).toBe(true);
    expect(text.hitTest(-1, -1, 0)).toBe(false);
    expect(text.hitTest(31, 5, 0)).toBe(false);
    expect(text.hitTest(15, 11, 0)).toBe(false);
  });

  it('should hit test rotated text', () => {
    const text = new Text('1', 0, 0, 10, 90, 'Hello'); // Rotated 90 degrees CCW
    // Width goes UP (along Y)
    // Height goes LEFT (along -X)
    
    expect(text.hitTest(-5, 15, 0)).toBe(true);
    expect(text.hitTest(5, 15, 0)).toBe(false);
    expect(text.hitTest(-5, -5, 0)).toBe(false);
    expect(text.hitTest(-15, 15, 0)).toBe(false); // Out of height range (height is 10, so X should be between -10 and 0)
  });

  it('should respect tolerance', () => {
    const text = new Text('1', 0, 0, 10, 0, 'Hello');
    expect(text.hitTest(-1, -1, 2)).toBe(true);
    expect(text.hitTest(31, 5, 2)).toBe(true);
  });
});
