import { describe, it, expect } from 'vitest'
import { RebuildCommand } from './RebuildCommand'
import { CommandAction } from './types'

describe('RebuildCommand', () => {
  it('should construct with selected entity id', () => {
    const cmd = new RebuildCommand(['S3D1'])
    expect(cmd.targetId).toBe('S3D1')
    expect(cmd.getPrompt()).toBe('Rebuild solid object S3D1?')
  })

  it('should request object selection if constructed empty', () => {
    const cmd = new RebuildCommand()
    expect(cmd.targetId).toBe('')
    expect(cmd.getPrompt()).toBe('Select solid object to rebuild [ALL]:')
  })

  it('should transition and return rebuild action when object name is supplied', () => {
    const cmd = new RebuildCommand()
    expect(cmd.targetId).toBe('')
    
    // First, enter name
    const res = cmd.onInput('S3D2', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as CommandAction
    expect(cmd.targetId).toBe('S3D2')
    expect(res).toEqual({ action: 'rebuild', id: 'S3D2' })
  })

  it('should return rebuild action immediately on onPoint if target exists', () => {
    const cmd = new RebuildCommand(['S3D3'])
    const res = cmd.onPoint(0, 0, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as CommandAction
    expect(res).toEqual({ action: 'rebuild', id: 'S3D3' })
  })
})
