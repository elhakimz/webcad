import { describe, it, expect } from 'vitest'
import { CircleCommand } from './CircleCommand'
import { Circle } from '../model/Circle'

describe('CircleCommand', () => {
  it('should transition from step 0 to step 1 on first point', () => {
    const cmd = new CircleCommand()
    const result = cmd.onPoint(100, 100)
    
    expect(cmd.step).toBe(1)
    expect(cmd.cx).toBe(100)
    expect(cmd.cy).toBe(100)
    expect(result).toBe('Specify radius or pick point on circumference')
  })

  it('should create a Circle using a second point', () => {
    const cmd = new CircleCommand()
    cmd.onPoint(100, 100)
    const result = cmd.onPoint(200, 100)
    
    expect(cmd.step).toBe(0)
    expect(result).toBeInstanceOf(Circle)
    const circle = result as Circle
    expect(circle.cx).toBe(100)
    expect(circle.cy).toBe(100)
    expect(circle.r).toBe(100) // distance from (100,100) to (200,100)
  })

  it('should create a Circle using a typed radius', () => {
    const cmd = new CircleCommand()
    cmd.onPoint(100, 100)
    const result = cmd.onInput('50')
    
    expect(cmd.step).toBe(0)
    expect(result).toBeInstanceOf(Circle)
    const circle = result as Circle
    expect(circle.cx).toBe(100)
    expect(circle.cy).toBe(100)
    expect(circle.r).toBe(50)
  })

  it('should handle invalid radius input', () => {
    const cmd = new CircleCommand()
    cmd.onPoint(100, 100)
    const result = cmd.onInput('abc')
    
    expect(cmd.step).toBe(1)
    expect(result).toBe('Invalid radius. Specify radius or pick point on circumference')
  })
})
