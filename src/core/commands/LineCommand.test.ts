import { describe, it, expect } from 'vitest'
import { LineCommand } from './LineCommand'
import { Line } from '../model/Line'
import { CommandAction } from './types'

describe('LineCommand (Classic Behavior)', () => {
  it('should support continuous segments', () => {
    const cmd = new LineCommand()
    cmd.onPoint(0, 0, 'L1', { type: 'decimal', precision: 2, scale: 1.0 })
    const line1 = cmd.onPoint(10, 10, 'L2', { type: 'decimal', precision: 2, scale: 1.0 }) as Line
    
    expect(line1.x1).toBe(0)
    expect(line1.y1).toBe(0)
    expect(line1.x2).toBe(10)
    expect(line1.y2).toBe(10)
    expect(line1.id).toBe('L2')
    expect(cmd.points).toHaveLength(2)

    const line2 = cmd.onPoint(20, 10, 'L3', { type: 'decimal', precision: 2, scale: 1.0 }) as Line
    expect(line2.x1).toBe(10)
    expect(line2.y1).toBe(10)
    expect(line2.x2).toBe(20)
    expect(line2.y2).toBe(10)
    expect(line2.id).toBe('L3')
    expect(cmd.points).toHaveLength(3)
  })

  it('should support Close (C)', () => {
    const cmd = new LineCommand()
    cmd.onPoint(0, 0, 'L1', { type: 'decimal', precision: 2, scale: 1.0 })
    cmd.onPoint(10, 0, 'L2', { type: 'decimal', precision: 2, scale: 1.0 })
    cmd.onPoint(10, 10, 'L3', { type: 'decimal', precision: 2, scale: 1.0 })
    
    const res = cmd.onInput('C', 'L4', { type: 'decimal', precision: 2, scale: 1.0 }) as CommandAction
    expect(res.action).toBe('close')
    const entity = res.entity as Line
    expect(entity.x1).toBe(10)
    expect(entity.y1).toBe(10)
    expect(entity.x2).toBe(0)
    expect(entity.y2).toBe(0)
    expect(entity.id).toBe('L4')
  })

  it('should support Undo (U)', () => {
    const cmd = new LineCommand()
    cmd.onPoint(0, 0, 'L1', { type: 'decimal', precision: 2, scale: 1.0 })
    cmd.onPoint(10, 0, 'L2', { type: 'decimal', precision: 2, scale: 1.0 })
    const line2 = cmd.onPoint(10, 10, 'L3', { type: 'decimal', precision: 2, scale: 1.0 }) as Line
    
    expect(cmd.points).toHaveLength(3)
    expect(cmd.drawnEntityIds).toContain(line2.id)

    const res = cmd.onInput('U', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as CommandAction
    expect(res.action).toBe('undo')
    expect(res.id).toBe(line2.id)
    expect(cmd.points).toHaveLength(2)
    expect(cmd.points[1]).toEqual({ x: 10, y: 0 })
  })

  it('should finish on empty input', () => {
    const cmd = new LineCommand()
    cmd.onPoint(0, 0, 'L1', { type: 'decimal', precision: 2, scale: 1.0 })
    const res = cmd.onInput('', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as CommandAction
    expect(res.action).toBe('finish')
  })

  it('should finish on "E" input', () => {
    const cmd = new LineCommand()
    cmd.onPoint(0, 0, 'L1', { type: 'decimal', precision: 2, scale: 1.0 })
    const res = cmd.onInput('E', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as CommandAction
    expect(res.action).toBe('finish')
  })
})
