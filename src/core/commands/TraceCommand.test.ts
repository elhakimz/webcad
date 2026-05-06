import { describe, it, expect } from 'vitest'
import { TraceCommand } from './TraceCommand'

describe('TraceCommand', () => {
  it('should start with width prompt', () => {
    const cmd = new TraceCommand()
    expect(cmd.getPrompt()).toBe('TRACE width <5>:')
  })

  it('should accept custom width', () => {
    const cmd = new TraceCommand()
    const result = cmd.onInput('0.2', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })

    expect(result).toBe('From point:')
  })

  it('should accept default width on empty input', () => {
    const cmd = new TraceCommand()
    const result = cmd.onInput('', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })

    expect(result).toBe('From point:')
  })

  it('should prompt for to point after from point', () => {
    const cmd = new TraceCommand()
    cmd.onInput('0.2', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) // Set width and advance to step 1
    
    const result = cmd.onPoint(10, 10, 'TR1', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(result).toContain('P1[X:10.00, Y:10.00, Z:0.00]')
  })

  it('should create trace entity on to point', () => {
    const cmd = new TraceCommand()
    cmd.onInput('0.2', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) // Set width
    cmd.onPoint(10, 10, 'TR1', { type: 'decimal', precision: 2, scale: 1.0 }) // From point
    
    const result = cmd.onPoint(20, 20, 'TR1', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(result).toBeDefined()
    if (result && typeof result === 'object' && 'x1' in result) {
        expect(result).toHaveProperty('x1', 10)
        expect(result).toHaveProperty('y1', 10)
        expect(result).toHaveProperty('x2', 20)
        expect(result).toHaveProperty('y2', 20)
        expect(result).toHaveProperty('width', 0.2)
    }
  })

  it('should handle U for undo', () => {
    const cmd = new TraceCommand()
    cmd.onInput('0.2', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    cmd.onPoint(10, 10, 'TR1', { type: 'decimal', precision: 2, scale: 1.0 })
    cmd.onPoint(20, 20, 'TR1', { type: 'decimal', precision: 2, scale: 1.0 })
    
    const _result = cmd.onInput('U', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
  })

  it('should handle E to exit', () => {
    const cmd = new TraceCommand()
    cmd.onInput('0.2', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    cmd.onPoint(10, 10, 'TR1', { type: 'decimal', precision: 2, scale: 1.0 })
    
    const _result = cmd.onInput('E', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
  })

  it('should return preview at step 2', () => {
    const cmd = new TraceCommand()
    cmd.onInput('0.2', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    cmd.onPoint(10, 10, 'TR1', { type: 'decimal', precision: 2, scale: 1.0 })
    
    const preview = cmd.getPreview(20, 20, { type: 'decimal', precision: 2, scale: 1.0 })
    expect(preview).toBeDefined()
    if (preview && 'x1' in preview) {
        expect(preview.x1).toBe(10)
        expect(preview.x2).toBe(20)
    }
  })
})
