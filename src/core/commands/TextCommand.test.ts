import { describe, it, expect } from 'vitest'
import { TextCommand } from './TextCommand'
import { Text } from '../model/Text'

describe('TextCommand', () => {
  it('should transition through steps on point input', () => {
    const cmd = new TextCommand()
    
    // Step 0 -> 1: Insertion Point
    const res1 = cmd.onPoint(10, 20)
    expect(cmd.step).toBe(1)
    expect(cmd.x).toBe(10)
    expect(cmd.y).toBe(20)
    expect(res1).toContain('Start point[X:10.00, Y:20.00, Z:0.00]')

    // Step 1 -> 2: Height via point (dist from 10,20 to 10,30 is 10)
    const res2 = cmd.onPoint(10, 30)
    expect(cmd.step).toBe(2)
    expect(cmd.height).toBeCloseTo(10)
    expect(res2).toContain('Height set to 10.0000')

    // Step 2 -> 3: Rotation via point (dist from 10,20 to 20,20 is 0 deg)
    const res3 = cmd.onPoint(20, 20)
    expect(cmd.step).toBe(3)
    expect(cmd.rotation).toBeCloseTo(0)
    expect(res3).toContain('Rotation set to 0.00')
  })

  it('should handle text input and finalize', () => {
    const cmd = new TextCommand()
    cmd.onPoint(0, 0) // Insertion
    cmd.onInput('15')  // Height
    cmd.onInput('45')  // Rotation
    
    const result = cmd.onInput('Hello World')
    expect(result).toBeInstanceOf(Text)
    const text = result as Text
    expect(text.text).toBe('Hello World')
    expect(text.height).toBe(15)
    expect(text.rotation).toBe(45)
    expect(cmd.step).toBe(0)
  })

  it('should accept default height and rotation on empty input', () => {
    const cmd = new TextCommand()
    cmd.onPoint(0, 0)
    
    cmd.onInput('') // Accept default height (10)
    expect(cmd.step).toBe(2)
    expect(cmd.height).toBe(10)
    
    cmd.onInput('') // Accept default rotation (0)
    expect(cmd.step).toBe(3)
    expect(cmd.rotation).toBe(0)
  })

  it('should show preview during interaction', () => {
    const cmd = new TextCommand()
    cmd.onPoint(0, 0)
    
    // During height selection
    const preview1 = cmd.getPreview(0, 5) as Text
    expect(preview1).not.toBeNull()
    expect(preview1.height).toBe(5)
    
    cmd.onInput('10')
    
    // During rotation selection
    const preview2 = cmd.getPreview(5, 5) as Text
    expect(preview2.rotation).toBeCloseTo(45)
  })
})
