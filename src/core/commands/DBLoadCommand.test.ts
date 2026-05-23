import { describe, it, expect } from 'vitest'
import { DBLoadCommand } from './IOCommands'

describe('DBLoadCommand', () => {
  it('should return correct initial prompt', () => {
    const cmd = new DBLoadCommand()
    expect(cmd.getPrompt()).toBe('Load project from database (or ? for list):')
  })

  it('should return listFiles action when ? is provided', () => {
    const cmd = new DBLoadCommand()
    const res = cmd.onInput('?', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as any
    expect(res).toEqual({ action: 'dblistFiles' })
  })

  it('should return error/warning text when empty name is provided', () => {
    const cmd = new DBLoadCommand()
    const res = cmd.onInput('', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as any
    expect(res).toBe('Project name required. Load project from database:')
  })

  it('should return dbload action with custom project name when text is provided', () => {
    const cmd = new DBLoadCommand()
    const res = cmd.onInput('MySuperProject', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(res).toEqual({ action: 'dbload', projectName: 'MySuperProject' })
  })

  it('should accumulate multiple space-separated words when arguments are fed sequentially', () => {
    const cmd = new DBLoadCommand()
    cmd.onInput('My', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    const res = cmd.onInput('Drawing', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(res).toEqual({ action: 'dbload', projectName: 'My Drawing' })
  })
})
