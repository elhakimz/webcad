import { describe, it, expect } from 'vitest'
import { CommandReplayManager } from '../../../src/core/engine/CommandReplayManager'

describe('CommandReplayManager', () => {
  it('replays commands in client_seq order', async () => {
    const manager = new CommandReplayManager()
    const executed: string[] = []

    manager.queueAborted({ clientSeq: 3n, replay: async () => { executed.push('c3') } })
    manager.queueAborted({ clientSeq: 1n, replay: async () => { executed.push('c1') } })
    manager.queueAborted({ clientSeq: 2n, replay: async () => { executed.push('c2') } })

    await manager.replayAll()
    expect(executed).toEqual(['c1', 'c2', 'c3'])
  })

  it('stops on first failure and returns the error', async () => {
    const manager = new CommandReplayManager()
    const error = new Error('boom')

    manager.queueAborted({ clientSeq: 1n, replay: async () => { /* ok */ } })
    manager.queueAborted({ clientSeq: 2n, replay: async () => { throw error } })
    manager.queueAborted({ clientSeq: 3n, replay: async () => { /* should not run */ } })

    await expect(manager.replayAll()).rejects.toThrow('boom')
  })

  it('clears queue after replay', async () => {
    const manager = new CommandReplayManager()
    manager.queueAborted({ clientSeq: 1n, replay: async () => { /* ok */ } })
    await manager.replayAll()
    expect(manager.pendingCount).toBe(0)
  })
})
