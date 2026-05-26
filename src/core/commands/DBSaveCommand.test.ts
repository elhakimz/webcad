import { describe, it, expect } from 'vitest'
import { DBSaveCommand } from './IOCommands'
import { CommandAction } from './types'

describe('DBSaveCommand', () => {
  it('should return correct prompt containing active project name or timestamp', () => {
    const cmd = new DBSaveCommand()
    expect(cmd.getPrompt()).toMatch(/^Save project to database <DWG-\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}>:$/)
  })

  it('should return default timestamped project name when no text is provided', () => {
    const cmd = new DBSaveCommand()
    const res = cmd.onInput('', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as CommandAction
    expect(res.action).toBe('dbsave')
    expect(res.projectName).toMatch(/^DWG-\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('should return custom project name when text is provided', () => {
    const cmd = new DBSaveCommand()
    const res = cmd.onInput('MySuperProject', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(res).toEqual({ action: 'dbsave', projectName: 'MySuperProject' })
  })

  it('should accumulate multiple space-separated words when arguments are fed sequentially', () => {
    const cmd = new DBSaveCommand()
    cmd.onInput('My', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    const res = cmd.onInput('Drawing', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(res).toEqual({ action: 'dbsave', projectName: 'My Drawing' })
  })
})
