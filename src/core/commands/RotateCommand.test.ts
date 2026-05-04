import { describe, it, expect } from 'vitest'
import { RotateCommand } from './RotateCommand'
import { CommandAction } from './types'

describe('RotateCommand', () => {
  it('should transition through selection, base point, and angle', () => {
    const cmd = new RotateCommand()
    
    // Step 0: Select object
    const res1 = cmd.onInput('L1')
    expect(cmd.step).toBe(1)
    expect(cmd.targetIds).toContain('L1')
    expect(res1).toBe('Base point:')

    // Step 1: Base point
    const res2 = cmd.onPoint(100, 100)
    expect(cmd.step).toBe(2)
    expect(cmd.baseX).toBe(100)
    expect(cmd.baseY).toBe(100)
    expect(res2).toBe('Rotation angle:')

    // Step 2: Rotation angle (90 degrees)
    const res3 = cmd.onInput('90') as CommandAction
    expect(cmd.step).toBe(0)
    expect(res3.action).toBe('rotate')
    expect(res3.ids).toContain('L1')
    expect(res3.angle).toBeCloseTo(Math.PI / 2)
  })

  it('should calculate angle from second point', () => {
    const cmd = new RotateCommand(['L1'])
    expect(cmd.step).toBe(1)
    
    cmd.onPoint(0, 0) // Base point (0,0)
    const res = cmd.onPoint(0, 100) as CommandAction // 90 degrees
    
    expect(res.action).toBe('rotate')
    expect(res.angle).toBeCloseTo(Math.PI / 2)
  })
})
