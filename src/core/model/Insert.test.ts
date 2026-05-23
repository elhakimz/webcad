import { describe, it, expect } from 'vitest';
import { Insert } from './Insert';
import { Line } from './Line';
import { SelectionEngine } from '../engine/SelectionEngine';

describe('Insert Class and Selection Integration', () => {
  it('should initialize and support grips correctly', () => {
    const insert = new Insert('ins1', 'BOLT', 10, 20, 2, 2, 45);
    
    expect(insert.blockName).toBe('BOLT');
    expect(insert.x).toBe(10);
    expect(insert.y).toBe(20);
    expect(insert.scaleX).toBe(2);
    expect(insert.scaleY).toBe(2);
    expect(insert.rotation).toBe(45);

    const grips = insert.getGrips();
    expect(grips.length).toBe(1);
    expect(grips[0].id).toBe('origin');
    expect(grips[0].point).toEqual({ x: 10, y: 20, z: 0 });
    expect(grips[0].type).toBe('center');

    insert.moveGrip('origin', { x: 30, y: 40 });
    expect(insert.x).toBe(30);
    expect(insert.y).toBe(40);
  });

  it('should compute bounding boxes dynamically based on block definition', () => {
    const insert = new Insert('ins2', 'MYBLOCK', 100, 100, 2, 3, 0);

    // Dynamic block definition mock
    const myBlock = {
      basePoint: { x: 5, y: 5 },
      entities: [
        new Line('l1', 0, 0, 10, 0), // box: 0, 0, 10, 0 -> relative to base: -5, -5, 5, -5
        new Line('l2', 0, 10, 10, 10) // box: 0, 10, 10, 10 -> relative to base: -5, 5, 5, 5
      ]
    };

    Insert.getBlockCallback = (name) => {
      if (name === 'MYBLOCK') return myBlock;
      return null;
    };

    // Cumulative box relative to base:
    // minX = -5, minY = -5, maxX = 5, maxY = 5
    // After scaleX=2, scaleY=3:
    // minX = -10, minY = -15, maxX = 10, maxY = 15
    // Shifted by insertion point (100, 100):
    // minX = 90, minY = 85, maxX = 110, maxY = 115
    const box = insert.getBoundingBox();
    expect(box.minX).toBeCloseTo(90);
    expect(box.minY).toBeCloseTo(85);
    expect(box.maxX).toBeCloseTo(110);
    expect(box.maxY).toBeCloseTo(115);
  });

  it('should support direct click selection near insertion point and constituent entities', () => {
    const insert = new Insert('ins3', 'CLICKBLOCK', 0, 0, 1, 1, 0);

    const block = {
      basePoint: { x: 0, y: 0 },
      entities: [
        new Line('l1', 10, 10, 20, 10)
      ]
    };

    Insert.getBlockCallback = (name) => {
      if (name === 'CLICKBLOCK') return block;
      return null;
    };

    // Test selection near insertion point (0,0)
    const hitOrigin = SelectionEngine.getEntityAtSpatial(0, 0, 2, {
      querySpatialIndex: () => ['ins3'],
      getEntity: () => insert,
      getAllEntities: () => [insert]
    } as any);
    expect(hitOrigin).toBe(insert);

    // Test selection near sub-entity (Line from 10,10 to 20,10)
    const hitLine = SelectionEngine.getEntityAtSpatial(15, 10.5, 1, {
      querySpatialIndex: () => ['ins3'],
      getEntity: () => insert,
      getAllEntities: () => [insert]
    } as any);
    expect(hitLine).toBe(insert);

    // Test clicking outside should not select
    const hitOutside = SelectionEngine.getEntityAtSpatial(30, 30, 1, {
      querySpatialIndex: () => ['ins3'],
      getEntity: () => insert,
      getAllEntities: () => [insert]
    } as any);
    expect(hitOutside).toBeNull();
  });
});
