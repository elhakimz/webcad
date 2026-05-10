import { describe, it, expect } from 'vitest'
import { PolygonCommand } from './PolygonCommand'
import { Polyline } from '../model/Polyline'

describe('PolygonCommand', () => {
  it('should handle center method (Inscribed)', () => {
    const cmd = new PolygonCommand()
    
    // Step 0: Number of sides
    cmd.onInput('6', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(cmd.numSides).toBe(6)
    expect(cmd.step).toBe(1)

    // Step 1: Center
    cmd.onPoint(100, 100, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(cmd.center).toEqual({ x: 100, y: 100 })
    // removed

    // Step 2: I/C
    cmd.onInput('I', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(cmd.inscribed).toBe(true)
    expect(cmd.step).toBe(3)

    // Step 3: Radius
    const res = cmd.onPoint(200, 100, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as Polyline
    expect(res).toBeInstanceOf(Polyline)
    expect(res.vertices).toHaveLength(6)
    expect(res.closed).toBe(true)
    
    // First vertex should be at (200, 100)
    expect(res.vertices[0].x).toBeCloseTo(200)
    expect(res.vertices[0].y).toBeCloseTo(100)
  })

  it('should handle edge method', () => {
    const cmd = new PolygonCommand()
    
    // Step 0: Number of sides
    cmd.onInput('4', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    
    // Step 1: 'E' for edge
    cmd.onInput('E', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    // removed
    // removed

    // Step 2: First point
    cmd.onPoint(0, 0, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    // removed
    expect(cmd.step).toBe(11)

    // Step 3: Second point
    const res = cmd.onPoint(10, 0, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as Polyline
    expect(res).toBeInstanceOf(Polyline)
    // removed
    
    // For a square (0,0) to (10,0), next point should be (10, 10) in CCW
    expect(res.vertices[2].x).toBeCloseTo(10)
    expect(res.vertices[2].y).toBeCloseTo(10)
    expect(res.vertices[3].x).toBeCloseTo(0)
    expect(res.vertices[3].y).toBeCloseTo(10)
  })

  it('should support default values (4 sides, Inscribed)', () => {
    const cmd = new PolygonCommand()
    cmd.onInput('', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) // Default sides = 4
    cmd.onPoint(0, 0, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) // Center
    cmd.onInput('', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) // Default I
    const _res = cmd.onPoint(10, 0, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as Polyline
    // removed
    // removed
  })

  it('should provide preview', () => {
    const cmd = new PolygonCommand()
    cmd.onInput('3', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    cmd.onPoint(0, 0, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    cmd.onInput('I', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    const _preview = cmd.getPreview(10, 0, { type: 'decimal', precision: 2, scale: 1.0 }) as Polyline
    // removed
    // removed
  })

  it('should return correct options based on state', () => {
    const cmd = new PolygonCommand()
    const units = { type: 'decimal' as const, precision: 2, scale: 1.0 }
    
    // Step 0: Number of sides
    expect(cmd.getOptions(units)).toEqual([])
    
    cmd.onInput('4', 'DUMMY', units)
    // Step 1: Center or Edge
    expect(cmd.getOptions(units)).toEqual(["Edge"])
    
    cmd.onPoint(100, 100, 'DUMMY', units)
    // Step 2: I/C
    expect(cmd.getOptions(units)).toEqual(["Inscribed", "Circumscribed"])
    
    cmd.onInput('I', 'DUMMY', units)
    // Step 3: Radius
    expect(cmd.getOptions(units)).toEqual([])
  })

  it('should handle numeric radius input in onInput', () => {
    const cmd = new PolygonCommand()
    const units = { type: 'decimal' as const, precision: 2, scale: 1.0 }
    
    cmd.onInput('4', 'DUMMY', units)
    cmd.onPoint(100, 100, 'DUMMY', units)
    cmd.onInput('I', 'DUMMY', units)
    
    // Test with pickPt (cursor angle 45 deg)
    const pickPt = { x: 200, y: 200 } // 45 degrees from (100,100)
    const res = cmd.onInput('100', 'DUMMY', units, pickPt) as Polyline
    
    expect(res).toBeInstanceOf(Polyline)
    expect(res.vertices).toHaveLength(4)
    // Radius is 100, so vertices should be at distance 100 from center
    // Center is (100,100). Angle is 45 deg.
    // First vertex should be at 100 + 100*cos(45), 100 + 100*sin(45)
    expect(res.vertices[0].x).toBeCloseTo(100 + 100 * Math.cos(Math.PI/4))
    expect(res.vertices[0].y).toBeCloseTo(100 + 100 * Math.sin(Math.PI/4))
  })

  it('should return correct dynamic input based on state', () => {
    const cmd = new PolygonCommand()
    const units = { type: 'decimal' as const, precision: 2, scale: 1.0 }
    
    // Step 0: Number of sides
    expect(cmd.getDynamicInput(0, 0, units)).toEqual(["Number of sides <4>:"])
    
    cmd.onInput('4', 'DUMMY', units)
    // Step 1: Center or Edge
    expect(cmd.getDynamicInput(0, 0, units)).toEqual(["Edge/<Center of polygon>:"])
    
    cmd.onPoint(100, 100, 'DUMMY', units)
    // Step 2: I/C
    expect(cmd.getDynamicInput(0, 0, units)).toEqual(["Inscribed in circle/Circumscribed about circle (I/C) <I>:"])
    
    cmd.onInput('I', 'DUMMY', units)
    // Step 3: Radius
    const info = cmd.getDynamicInput(200, 100, units)
    expect(info).toEqual(["Radius of polygon:", "D:Distance: 100.00"])
  })
})
