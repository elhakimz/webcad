import { describe, it, expect } from 'vitest';
import { MText, AttachmentPoint } from './MText';

describe('MText.getBoundingBox', () => {
  it('should return correct bounding box', () => {
    const mtext = new MText('1', { x: 0, y: 10 }, 100, 20, 'Hello');
    mtext.bounds = { x: 0, y: -10, width: 100, height: 20 }; // bounds.y is bottom
    
    const box = mtext.getBoundingBox();
    expect(box.minX).toBe(0);
    expect(box.minY).toBe(-10);
    expect(box.maxX).toBe(100);
    expect(box.maxY).toBe(10); // -10 + 20
  });
});

describe('MText.hitTest', () => {
  it('should hit test unrotated MText', () => {
    const mtext = new MText('1', { x: 0, y: 10 }, 100, 20, 'Hello');
    // TOP_LEFT attachment point (default)
    // Insertion point is at (0, 10)
    // Width is 100, Height is 20
    // So box is [0, 100] x [-10, 10]
    
    expect(mtext.hitTest(50, 0, 0)).toBe(true);
    expect(mtext.hitTest(-1, 0, 0)).toBe(false);
    expect(mtext.hitTest(101, 0, 0)).toBe(false);
    expect(mtext.hitTest(50, 11, 0)).toBe(false);
    expect(mtext.hitTest(50, -11, 0)).toBe(false);
  });
});
