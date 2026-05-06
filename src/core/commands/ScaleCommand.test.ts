import { describe, it, expect } from 'vitest'
import { ScaleCommand } from './ScaleCommand'
import { CommandAction } from './types'

describe('ScaleCommand', () => {
  it('should transition through selection, base point, and factor', () => {
    const cmd = new ScaleCommand()
    
    // Step 0: Select object
    const res1 = cmd.onInput('L1', 'DUMMY')
    expect(cmd.step).toBe(1)
    expect(cmd.targetIds).toContain('L1')
    expect(res1).toBe('Base point:')

    // Step 1: Base point
    const res2 = cmd.onPoint(100, 100, 'DUMMY')
    expect(cmd.step).toBe(2)
    expect(cmd.basePoint.x).toBe(100)
    expect(cmd.basePoint.y).toBe(100)
    expect(res2).toBe('Scale factor:')

    // Step 2: Scale factor (2.5)
    const res3 = cmd.onInput('2.5', 'DUMMY') as CommandAction
    expect(cmd.step).toBe(0)
    expect(res3.action).toBe('scale')
    expect(res3.ids).toContain('L1')
    expect(res3.factor).toBe(2.5)
  })

  it('should calculate factor from second point distance', () => {
    const cmd = new ScaleCommand(['L1'])
    expect(cmd.step).toBe(1)
    
    cmd.onPoint(0, 0, 'DUMMY') // Base point (0,0)
    const res = cmd.onPoint(3, 4, 'DUMMY') as CommandAction // Distance 5
    
    expect(res.action).toBe('scale')
    expect(res.factor).toBe(0.5)
  })
})
