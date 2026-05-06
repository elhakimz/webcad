import { describe, it, expect } from 'vitest'
import { TraceCommand } from './TraceCommand'

describe('TraceCommand', () => {
  it('should start with width prompt', () => {
    const cmd = new TraceCommand()
    expect(cmd.getPrompt()).toBe('TRACE line width <0.10>:')
  })

  it('should accept custom width', () => {
    const cmd = new TraceCommand()
    const result = cmd.onInput('0.5', 'DUMMY')
    expect(result).toBe('From point:')
  })

  it('should accept default width on empty input', () => {
    const cmd = new TraceCommand()
    const result = cmd.onInput('', 'DUMMY')
    expect(result).toBe('From point:')
  })

  it('should prompt for to point after from point', () => {
    const cmd = new TraceCommand()
    cmd.onInput('0.2', 'DUMMY') // Set width and advance to step 1
    
    const result = cmd.onPoint(10, 10, 'TR1')
    expect(result).toContain('To point:')
  })

  it('should create trace entity on to point', () => {
    const cmd = new TraceCommand()
    cmd.onInput('0.2', 'DUMMY') // Set width
    cmd.onPoint(10, 10, 'TR1') // From point
    
    const result = cmd.onPoint(20, 20, 'TR1') as any
    expect(result).toBeDefined()
    expect(result.id).toBe('TR1')
    expect(result).toHaveProperty('x1', 10)
    expect(result).toHaveProperty('y1', 10)
    expect(result).toHaveProperty('x2', 20)
    expect(result).toHaveProperty('y2', 20)
    expect(result).toHaveProperty('width', 0.2)
  })

  it('should handle U for undo', () => {
    const cmd = new TraceCommand()
    cmd.onInput('0.2', 'DUMMY')
    cmd.onPoint(10, 10, 'TR1')
    cmd.onPoint(20, 20, 'TR1')
    
    const result = cmd.onInput('U', 'DUMMY') as any
    expect(result.action).toBe('undo')
    expect(result.id).toBe('TR1')
  })

  it('should handle E to exit', () => {
    const cmd = new TraceCommand()
    cmd.onInput('0.2', 'DUMMY')
    cmd.onPoint(10, 10, 'TR1')
    
    const result = cmd.onInput('E', 'DUMMY')
    expect(result).toEqual({ action: 'finish' })
  })

  it('should return preview at step 2', () => {
    const cmd = new TraceCommand()
    cmd.onInput('0.2', 'DUMMY')
    cmd.onPoint(10, 10, 'TR1')
    
    const preview = cmd.getPreview(20, 20)
    expect(preview).toBeDefined()
    expect(preview?.x1).toBe(10)
    expect(preview?.x2).toBe(20)
  })
})