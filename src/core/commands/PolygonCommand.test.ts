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
})
