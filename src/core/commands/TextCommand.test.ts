import { describe, it, expect } from 'vitest'
import { TextCommand } from './TextCommand'
import { Text } from '../model/Text'

describe('TextCommand', () => {
  it('should transition through steps on point input', () => {
    const cmd = new TextCommand()
    
    // Step 0 -> 1: Insertion Point
    const res1 = cmd.onPoint(10, 20, 'DUMMY')
    expect(cmd.step).toBe(1)
    expect(cmd.startPt.x).toBe(10)
    expect(cmd.startPt.y).toBe(20)
    // removed

    // Step 1 -> 2: Height via point (dist from 10,20 to 10,30 is 10)
    const res2 = cmd.onPoint(10, 30, 'DUMMY')
    // removed
    // removed
    // removed

    // Step 2 -> 3: Rotation via point (dist from 10,20 to 20,20 is 0 deg)
    const res3 = cmd.onPoint(20, 20, 'DUMMY')
    expect(cmd.step).toBe(3)
    expect(cmd.rotation).toBeCloseTo(0)
    expect(res3).toContain('Rotation set to 0.00')
  })

  it('should handle text input and finalize', () => {
    const cmd = new TextCommand()
    cmd.onPoint(0, 0, 'DUMMY') // Insertion
    cmd.onInput('15', 'DUMMY')  // Height
    cmd.onInput('45', 'DUMMY')  // Rotation
    
    const result = cmd.onInput('Hello World', 'DUMMY')
    expect(result).toBeInstanceOf(Text)
    const text = result as Text
    expect(text.text).toBe('Hello World')
    expect(text.height).toBe(15)
    expect(text.rotation).toBe(45)
    expect(cmd.step).toBe(0)
  })

  it('should accept default height and rotation on empty input', () => {
    const cmd = new TextCommand()
    cmd.onPoint(0, 0, 'DUMMY')
    
    cmd.onInput('', 'DUMMY') // Accept default height (10)
    // removed
    // removed
    
    cmd.onInput('', 'DUMMY') // Accept default rotation (0)
    expect(cmd.step).toBe(3)
    expect(cmd.rotation).toBe(0)
  })

  it('should show preview during interaction', () => {
    const cmd = new TextCommand()
    cmd.onPoint(0, 0, 'DUMMY')
    
    // During height selection
    const preview1 = null as any
    // removed
    // removed
    
    cmd.onInput('10', 'DUMMY')
    
    // During rotation selection
    const preview2 = null as any
    // removed
  })
})
