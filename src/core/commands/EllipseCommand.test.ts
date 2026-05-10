import { describe, it, expect } from 'vitest'
import { EllipseCommand } from './EllipseCommand'
import { Ellipse } from '../model/Ellipse'

describe('EllipseCommand', () => {
  it('should create an Ellipse', () => {
    const cmd = new EllipseCommand()
    
    // Step 0: Axis endpoint 1
    cmd.onPoint(0, 0, 'E1', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(cmd.step).toBe(1)

    // Step 1: Axis endpoint 2
    cmd.onPoint(10, 0, 'E1', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(cmd.step).toBe(2)
    expect(cmd.center).toEqual({ x: 5, y: 0 })
    expect(cmd.majorRadius).toBe(5)

    // Step 2: Distance to other axis
    const res = cmd.onPoint(5, 2, 'E1', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(cmd.step).toBe(0)
    expect(res).toBeInstanceOf(Ellipse)
    
    const ellipse = res as Ellipse
    expect(ellipse.id).toBe('E1')
    expect(ellipse.ratio).toBeCloseTo(2 / 5) // dist is 2, majorRadius is 5
  })

  it('should return dynamic input info', () => {
    const cmd = new EllipseCommand()
    cmd.onPoint(0, 0, 'E1', { type: 'decimal', precision: 2, scale: 1.0 })
    
    // Step 1
    const info1 = cmd.getDynamicInput(10, 0, { type: 'decimal', precision: 2, scale: 1.0 })
    expect(info1).toEqual(['10.00', '0.0'])

    cmd.onPoint(10, 0, 'E1', { type: 'decimal', precision: 2, scale: 1.0 })
    
    // Step 2
    const info2 = cmd.getDynamicInput(5, 2, { type: 'decimal', precision: 2, scale: 1.0 })
    // Center is 5,0. Point is 5,2. Distance is 2. Angle is 90.
    expect(info2).toEqual(['2.00', '90.0'])
  })
})
