import { describe, it, expect } from 'vitest'
import { EraseCommand } from './EraseCommand'

describe('EraseCommand', () => {
  it('should return a delete action when an ID is provided via onInput', () => {
    const cmd = new EraseCommand()
    const result = cmd.onInput('L1', 'DUMMY')
    
    expect(result).toEqual({ action: 'delete', ids: ['L1'] })
    expect(cmd.step).toBe(0)
  })

  it('should prompt for selection on onPoint', () => {
    const cmd = new EraseCommand()
    const result = cmd.onPoint(0, 0, 'DUMMY')
    expect(result).toBe('Select objects:')
  })
})
