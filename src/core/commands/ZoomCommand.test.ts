import { describe, it, expect } from 'vitest'
import { ZoomCommand } from './ZoomCommand'
import { CommandAction } from './types'

describe('ZoomCommand', () => {
  it('should support Zoom Window via two points', () => {
    const cmd = new ZoomCommand()
    
    // Step 0: First point
    const res1 = cmd.onPoint(100, 100, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(cmd.step).toBe(1)
    expect(res1).toBe('Second point:')

    // Step 1: Second point
    const res2 = cmd.onPoint(200, 200, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as CommandAction
    expect(cmd.step).toBe(0)
    expect(res2.action).toBe('zoom')
    expect(res2.zoomType).toBe('window')
    expect(res2.p1).toEqual({ x: 100, y: 100 })
    expect(res2.p2).toEqual({ x: 200, y: 200 })
  })

  it('should support Zoom All via input', () => {
    const cmd = new ZoomCommand()
    const res = cmd.onInput('A', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as CommandAction
    expect(res.action).toBe('zoom')
    expect(res.zoomType).toBe('all')
  })

  it('should support Window mode via input', () => {
    const cmd = new ZoomCommand()
    const _res = cmd.onInput('W', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    // removed
    expect(cmd.step).toBe(0)
  })
})
