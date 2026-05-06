import { describe, it, expect } from 'vitest'
import { MoveCommand } from './MoveCommand'
import { CommandAction } from './types'

describe('MoveCommand', () => {
  it('should transition through selection, base point, and second point', () => {
    const cmd = new MoveCommand()
    
    // Step 0: Select object
    const res1 = cmd.onInput('L1', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(cmd.step).toBe(1)
    expect(cmd.targetIds).toContain('L1')
    expect(res1).toBe('Base point:')

    // Step 1: Base point
    const res2 = cmd.onPoint(100, 100, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(cmd.step).toBe(2)
    expect(cmd.basePoint.x).toBe(100)
    expect(cmd.basePoint.y).toBe(100)
    expect(res2).toBe('Second point:')

    // Step 2: Second point
    const res3 = cmd.onPoint(150, 120, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as CommandAction
    expect(cmd.step).toBe(0)
    expect(res3.action).toBe('move')
    expect(res3.ids).toContain('L1')
    expect(res3.dx).toBe(50)
    expect(res3.dy).toBe(20)
  })

  it('should prompt for selection if point is clicked in step 0', () => {
    const cmd = new MoveCommand()
    const res = cmd.onPoint(100, 100, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(res).toBe('Select objects:')
    expect(cmd.step).toBe(0)
  })
})
