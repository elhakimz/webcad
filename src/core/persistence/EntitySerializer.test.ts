import { describe, it, expect } from 'vitest';
import { EntitySerializer } from './EntitySerializer';
import { Line } from '../model/Line';

describe('EntitySerializer', () => {
  it('should serialize and deserialize a Line', () => {
    const line = new Line('L1', 0, 0, 10, 10);
    line.layer = '0';
    
    const serialized = EntitySerializer.serialize(line, 'proj1');
    expect(serialized).toBeDefined();
    expect((serialized as any).id).toBe('L1');
    expect((serialized as any).projectId).toBe('proj1');
    expect((serialized as any).type).toBe('Line');
    
    const deserialized = EntitySerializer.deserialize(serialized);
    expect(deserialized).toBeInstanceOf(Line);
    const deserializedLine = deserialized as Line;
    expect(deserializedLine.id).toBe('L1');
    expect(deserializedLine.x1).toBe(0);
    expect(deserializedLine.y1).toBe(0);
    expect(deserializedLine.x2).toBe(10);
    expect(deserializedLine.y2).toBe(10);
    expect(deserializedLine.layer).toBe('0');
  });
});
