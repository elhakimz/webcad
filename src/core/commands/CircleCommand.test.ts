import { describe, it, expect } from 'vitest'
import { CircleCommand } from './CircleCommand'
import { Circle } from '../model/Circle'

describe('CircleCommand', () => {
  it('should transition from step 0 to step 1 on first point', () => {
    const cmd = new CircleCommand()
    const result = cmd.onPoint(100, 100, 'C1')
    
    expect(cmd.step).toBe(1)
    expect(cmd.cx).toBe(100)
    expect(cmd.cy).toBe(100)
    expect(result).toContain('Center[X:100.00, Y:100.00, Z:0.00]')
  })

  it('should create a Circle using a second point (Radius mode)', () => {
    const cmd = new CircleCommand()
    cmd.onPoint(100, 100, 'C1')
    const result = cmd.onPoint(200, 100, 'C1')
    
    expect(cmd.step).toBe(0)
    expect(result).toBeInstanceOf(Circle)
    const circle = result as Circle
    expect(circle.cx).toBe(100)
    expect(circle.cy).toBe(100)
    expect(circle.r).toBe(100)
    expect(circle.id).toBe('C1')
  })

  it('should create a Circle using a typed radius', () => {
    const cmd = new CircleCommand()
    cmd.onPoint(100, 100, 'C1')
    const result = cmd.onInput('50', 'C1')
    
    expect(cmd.step).toBe(0)
    expect(result).toBeInstanceOf(Circle)
    const circle = result as Circle
    expect(circle.r).toBe(50)
    expect(circle.id).toBe('C1')
  })

  it('should switch to Diameter mode when "D" is entered', () => {
    const cmd = new CircleCommand()
    cmd.onPoint(100, 100, 'C1')
    const result = cmd.onInput('D', 'DUMMY')
    
    expect(cmd.step).toBe(2)
    expect(cmd.isDiameterMode).toBe(true)
    expect(result).toBe('Diameter:')
  })

  it('should create a Circle using a typed diameter', () => {
    const cmd = new CircleCommand()
    cmd.onPoint(100, 100, 'C1')
    cmd.onInput('D', 'DUMMY')
    const result = cmd.onInput('100', 'C1')
    
    expect(cmd.step).toBe(0)
    expect(result).toBeInstanceOf(Circle)
    const circle = result as Circle
    expect(circle.r).toBe(50)
    expect(circle.id).toBe('C1')
  })

  it('should create a Circle using a point as diameter', () => {
    const cmd = new CircleCommand()
    cmd.onPoint(100, 100, 'C1')
    cmd.onInput('D', 'DUMMY')
    const result = cmd.onPoint(200, 100, 'C1')
    
    expect(cmd.step).toBe(0)
    expect(result).toBeInstanceOf(Circle)
    const circle = result as Circle
    expect(circle.r).toBe(50) // distance is 100, so radius is 50
    expect(circle.id).toBe('C1')
  })

  it('should provide a diameter-based preview', () => {
    const cmd = new CircleCommand()
    cmd.onPoint(100, 100, 'C1')
    cmd.onInput('D', 'DUMMY')
    const preview = cmd.getPreview(200, 100) as Circle
    expect(preview.r).toBe(50)
  })

  it('should handle invalid input', () => {
    const cmd = new CircleCommand()
    cmd.onPoint(100, 100, 'C1')
    const result = cmd.onInput('abc', 'DUMMY')
    
    expect(cmd.step).toBe(1)
    expect(result).toContain('Invalid radius or option')
  })
})
