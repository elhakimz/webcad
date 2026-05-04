import { describe, it, expect } from 'vitest'
import { MirrorCommand } from './MirrorCommand'

describe('MirrorCommand', () => {
  it('should start with select objects prompt', () => {
    const cmd = new MirrorCommand()
    expect(cmd.getPrompt()).toBe('Select objects to mirror:')
    expect(cmd.onPoint(0, 0)).toBe('Select objects to mirror:')
  })

  it('should accept pre-selected ids and skip to step 1', () => {
    const cmd = new MirrorCommand(['L1'])
    expect(cmd.getPrompt()).toBe('First point of mirror line:')
  })

  it('should progress through steps after selection', () => {
    const cmd = new MirrorCommand(['L1'])
    
    expect(cmd.onPoint(10, 10)).toBe('Second point of mirror line:')
    
    expect(cmd.getPrompt()).toBe('Second point of mirror line:')
  })

  it('should handle Y input to delete originals', () => {
    const cmd = new MirrorCommand(['L1'])
    cmd.onPoint(10, 10)
    cmd.onPoint(20, 20)
    
    const result = cmd.onInput('Y')
    expect(result).toEqual({
      action: 'mirror',
      ids: ['L1'],
      p1: { x: 10, y: 10 },
      p2: { x: 20, y: 20 },
      deleteOriginal: true
    })
  })

  it('should handle N input to keep originals', () => {
    const cmd = new MirrorCommand(['L1'])
    cmd.onPoint(10, 10)
    cmd.onPoint(20, 20)
    
    const result = cmd.onInput('n')
    expect(result).toEqual({
      action: 'mirror',
      ids: ['L1'],
      p1: { x: 10, y: 10 },
      p2: { x: 20, y: 20 },
      deleteOriginal: false
    })
  })

  it('should reject invalid Y/N input', () => {
    const cmd = new MirrorCommand(['L1'])
    cmd.onPoint(10, 10)
    cmd.onPoint(20, 20)
    
    const result = cmd.onInput('X')
    expect(result).toBe('Delete old objects? (Y/N):')
  })

  it('should accept entity ID via onInput to select', () => {
    const cmd = new MirrorCommand()
    const result = cmd.onInput('L1')
    expect(result).toBe('First point of mirror line:')
    expect(cmd.getPrompt()).toBe('First point of mirror line:')
  })

  it('should return reference points correctly', () => {
    const cmd = new MirrorCommand(['L1'])
    expect(cmd.getReferencePoints()).toEqual([])
    
    cmd.onPoint(10, 10)
    expect(cmd.getReferencePoints()).toEqual([{ x: 10, y: 10 }, { x: 0, y: 0 }])
  })
})