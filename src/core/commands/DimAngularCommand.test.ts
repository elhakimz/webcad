import { describe, it, expect, beforeEach } from 'vitest'
import { DimAngularCommand } from './DimAngularCommand'
import { Line } from '../model/Line'
import { Arc } from '../model/Arc'
import { Dimension } from '../model/Dimension'
import { UnitsConfig } from '../model/Document'

describe('DimAngularCommand', () => {
  let cmd: DimAngularCommand;
  const units: UnitsConfig = { type: 'decimal', precision: 2, scale: 1 };

  beforeEach(() => {
    cmd = new DimAngularCommand();
  });

  it('should handle 3-point mode', () => {
    cmd.onPoint(10, 0, 'D1', units); // P1
    cmd.onPoint(0, 10, 'D1', units); // P2
    cmd.onPoint(0, 0, 'D1', units);  // Vertex
    const result = cmd.onPoint(5, 5, 'D1', units); // Arc location
    
    expect(result).toBeInstanceOf(Dimension);
    const dim = result as Dimension;
    expect(dim.type).toBe('ANGULAR');
    expect(dim.properties.vertex).toEqual({ x: 0, y: 0 });
  });

  it('should handle Arc selection', () => {
    const arc = new Arc('A1', 0, 0, 50, 0, Math.PI / 2, true);
    cmd.setEntity(arc);
    const response = cmd.onPoint(50, 0, 'D1', units);
    
    expect(response).toBe('Specify dimension arc line location:');
    expect(cmd.step).toBe(3);
    expect(cmd.vertex).toEqual({ x: 0, y: 0 });
    
    const result = cmd.onPoint(60, 60, 'D1', units);
    expect(result).toBeInstanceOf(Dimension);
    const dim = result as Dimension;
    expect(dim.x1).toBeCloseTo(50);
    expect(dim.y1).toBeCloseTo(0);
    expect(dim.x2).toBeCloseTo(0);
    expect(dim.y2).toBeCloseTo(50);
  });

  it('should handle Line-Line selection', () => {
    const l1 = new Line('L1', 0, 0, 100, 0);
    const l2 = new Line('L2', 0, 0, 0, 100);
    
    cmd.setEntity(l1);
    cmd.onPoint(50, 0, 'D1', units);
    
    cmd.setEntity(l2);
    const response = cmd.onPoint(0, 50, 'D1', units);
    
    expect(response).toBe('Specify dimension arc line location:');
    expect(cmd.vertex).toEqual({ x: 0, y: 0 });
  });
  it('should handle Box selection (simulated)', () => {
    const l1 = new Line('L1', 0, 0, 100, 0);
    const l2 = new Line('L2', 0, 0, 0, 100);
    
    // Line 1 via "box"
    cmd.setEntity(l1);
    cmd.onInput('L1', 'D1', units); // No pickPt
    expect(cmd.step).toBe(1);
    
    // Line 2 via "box"
    cmd.setEntity(l2);
    const response = cmd.onInput('L2', 'D1', units); // No pickPt
    expect(response).toBe('Specify dimension arc line location:');
    expect(cmd.step).toBe(3);
  });
});
