import { describe, it, expect, vi } from 'vitest'
import { DBSaveCommand } from './IOCommands'

vi.mock('../persistence/PersistenceService', () => {
  return {
    PersistenceService: {
      getInstance: () => ({
        activeProjectName: 'MockProject'
      })
    }
  }
})

describe('DBSaveCommand', () => {
  it('should return correct prompt containing active project name', () => {
    const cmd = new DBSaveCommand()
    expect(cmd.getPrompt()).toBe('Save project to database <MockProject>:')
  })

  it('should return default active project name when no text is provided', () => {
    const cmd = new DBSaveCommand()
    const res = cmd.onInput('', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(res).toEqual({ action: 'dbsave', projectName: 'MockProject' })
  })

  it('should return custom project name when text is provided', () => {
    const cmd = new DBSaveCommand()
    const res = cmd.onInput('MySuperProject', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(res).toEqual({ action: 'dbsave', projectName: 'MySuperProject' })
  })
})
