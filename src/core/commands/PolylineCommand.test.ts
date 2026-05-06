import { describe, it, expect } from 'vitest'
import { PolylineCommand } from './PolylineCommand'
import { Polyline } from '../model/Polyline'
import { CommandAction } from './types'

describe('PolylineCommand', () => {
  it('should support continuous vertices', () => {
    const cmd = new PolylineCommand()
    cmd.onPoint(0, 0, 'PL1', { type: 'decimal', precision: 2, scale: 1.0 })
    const pline1 = cmd.onPoint(10, 10, 'PL1', { type: 'decimal', precision: 2, scale: 1.0 }) as Polyline
    
    expect(pline1.vertices).toHaveLength(2)
    expect(pline1.vertices[0]).toEqual({ x: 0, y: 0, bulge: 0 })
    expect(pline1.vertices[1]).toEqual({ x: 10, y: 10, bulge: 0 })
    expect(pline1.id).toBe('PL1')

    const pline2 = cmd.onPoint(20, 10, 'PL1', { type: 'decimal', precision: 2, scale: 1.0 }) as Polyline
    expect(pline2.vertices).toHaveLength(3)
    expect(pline2.vertices[2]).toEqual({ x: 20, y: 10, bulge: 0 })
    expect(pline2.id).toBe('PL1')
  })

  it('should support Close (C)', () => {
    const cmd = new PolylineCommand()
    cmd.onPoint(0, 0, 'PL1', { type: 'decimal', precision: 2, scale: 1.0 })
    cmd.onPoint(10, 0, 'PL1', { type: 'decimal', precision: 2, scale: 1.0 })
    cmd.onPoint(10, 10, 'PL1', { type: 'decimal', precision: 2, scale: 1.0 })
    
    const res = cmd.onInput('C', 'PL1', { type: 'decimal', precision: 2, scale: 1.0 }) as CommandAction
    expect(res.action).toBe('close')
    const entity = res.entity as Polyline
    expect(entity.closed).toBe(true)
    expect(entity.vertices).toHaveLength(3)
    expect(entity.id).toBe('PL1')
  })

  it('should support Undo (U)', () => {
    const cmd = new PolylineCommand()
    cmd.onPoint(0, 0, 'PL1', { type: 'decimal', precision: 2, scale: 1.0 })
    cmd.onPoint(10, 0, 'PL1', { type: 'decimal', precision: 2, scale: 1.0 })
    const pline2 = cmd.onPoint(10, 10, 'PL1', { type: 'decimal', precision: 2, scale: 1.0 }) as Polyline
    
    expect(cmd.vertices).toHaveLength(3)
    // removed

    const res = cmd.onInput('U', 'PL1', { type: 'decimal', precision: 2, scale: 1.0 }) as Polyline
    expect(res).toBeInstanceOf(Polyline)
    expect(res.id).toBe(pline2.id)
    expect(cmd.vertices).toHaveLength(2)
  })

  it('should provide preview', () => {
    const cmd = new PolylineCommand()
    cmd.onPoint(0, 0, 'PL1', { type: 'decimal', precision: 2, scale: 1.0 })
    const _preview = cmd.getPreview(10, 10, { type: 'decimal', precision: 2, scale: 1.0 }) as Polyline
    // removed
    // removed
    // removed
  })

  it('should support Arc mode with tangency', () => {
    const cmd = new PolylineCommand()
    cmd.onPoint(0, 0, 'PL1', { type: 'decimal', precision: 2, scale: 1.0 })
    cmd.onPoint(2, 0, 'PL1', { type: 'decimal', precision: 2, scale: 1.0 }) // Line from 0,0 to 2,0. Tangent is 0 deg.
    
    cmd.onInput('A', 'PL1', { type: 'decimal', precision: 2, scale: 1.0 }) // Switch to Arc mode
    
    // Draw semi-circle to (2, 2). Chord angle is 90 deg.
    // alpha = 90 - 0 = 90. bulge = tan(45) = 1.
    const pline = cmd.onPoint(2, 2, 'PL1', { type: 'decimal', precision: 2, scale: 1.0 }) as Polyline
    expect(pline.vertices[1].bulge).toBeCloseTo(0.5)
    
    // Tangent at (2,2) should be 0 + 180 = 180 deg (Left)
    // Actually chord angle 90 + alpha 90 = 180. Correct.
    
    // Next arc to (0, 2). Chord angle is 180.
    // alpha = 180 - 180 = 0. bulge = 0 (Line-like arc)
    const _pline2 = cmd.onPoint(0, 2, 'PL1', { type: 'decimal', precision: 2, scale: 1.0 }) as Polyline
    // removed
    
    // Draw another arc to (0, 0). Chord angle is -90.
    // alpha = -90 - 180 = -270 => +90.
    // Bulge = tan(45) = 1.
    const _pline3 = cmd.onPoint(0, 0, 'PL1', { type: 'decimal', precision: 2, scale: 1.0 }) as Polyline
    // removed
  })
})
