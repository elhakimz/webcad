import { describe, it, expect } from 'vitest'
import { ArcCommand } from './ArcCommand'
import { Arc } from '../model/Arc'

describe('ArcCommand', () => {
  it('should transition through 3 points and create an Arc', () => {
    const cmd = new ArcCommand()
    
    // Step 0: Start point
    const res1 = cmd.onPoint(0, 0, 'A1')
    expect(cmd.step).toBe(1)
    expect(res1).toContain('P1[X:0.00, Y:0.00, Z:0.00]')

    // Step 1: Second point
    const res2 = cmd.onPoint(10, 0, 'A1')
    expect(cmd.step).toBe(2)
    expect(res2).toContain('P2[X:10.00, Y:0.00, Z:0.00]')


    // Step 2: End point
    const res3 = cmd.onPoint(10, 10, 'A1')
    expect(cmd.step).toBe(0)
    expect(res3).toBeInstanceOf(Arc)
    
    const arc = res3 as Arc
    expect(arc.id).toBe('A1')
    expect(arc.cx).toBeCloseTo(5)
    expect(arc.cy).toBeCloseTo(5)
    expect(arc.r).toBeCloseTo(Math.sqrt(50))
  })

  it('should handle collinear points by staying on step 0', () => {
    const cmd = new ArcCommand()
    cmd.onPoint(0, 0, 'A1')
    cmd.onPoint(100, 0, 'A1')
    const res = cmd.onPoint(200, 0, 'A1')
    
    expect(res).toBe('Points are collinear. Start point of arc:')
    expect(cmd.step).toBe(0)
  })

  it('should provide a preview in step 2', () => {
    const cmd = new ArcCommand()
    cmd.onPoint(0, 0, 'A1')
    cmd.onPoint(100, 100, 'A1')
    
    const preview = cmd.getPreview(200, 0)
    expect(preview).toBeInstanceOf(Arc)
    expect(preview?.cx).toBeCloseTo(100)
    expect(preview?.cy).toBeCloseTo(0)
  })
})
