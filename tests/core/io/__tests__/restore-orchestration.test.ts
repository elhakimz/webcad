import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenCascadeService } from '../../../../src/core/io/OpenCascadeService'
import { CommandReplayManager } from '../../../../src/core/engine/CommandReplayManager'

describe('Restore orchestration', () => {
  let service: OpenCascadeService
  let mockTransport: any

  beforeEach(() => {
    service = OpenCascadeService.getInstance()
    mockTransport = {
      restore: vi.fn().mockResolvedValue(['s1']),
      addEventListener: vi.fn(),
    }
    ;(service as any).transport = mockTransport
    ;(service as any).snapshotProvider = vi.fn().mockResolvedValue({ id: 's1' })
    ;(service as any).replayManager = null
  })

  it('calls Restore via transport when snapshot provider is configured', async () => {
    const doc = {
      getEntities: () => [{ id: 's1', type: 'Solid3D', brepSnapshot: new Uint8Array([1]) }],
    }
    await service.rehydrateViaRestore(doc)

    expect(mockTransport.restore).toHaveBeenCalledWith([
      { entityId: 's1', brepRefId: 's1' },
    ])
  })

  it('replays aborted commands after Restore when replay manager is set', async () => {
    const replayed: string[] = []
    const replayManager = new CommandReplayManager()
    replayManager.queueAborted({ clientSeq: 1n, replay: async () => { replayed.push('c1') } })
    replayManager.queueAborted({ clientSeq: 2n, replay: async () => { replayed.push('c2') } })
    ;(service as any).replayManager = replayManager

    const doc = {
      getEntities: () => [{ id: 's1', type: 'Solid3D', brepSnapshot: new Uint8Array([1]) }],
    }
    await service.rehydrateViaRestore(doc)

    expect(replayed).toEqual(['c1', 'c2'])
  })

  it('does not throw when replay manager is not set', async () => {
    ;(service as any).replayManager = null

    const doc = {
      getEntities: () => [{ id: 's1', type: 'Solid3D', brepSnapshot: new Uint8Array([1]) }],
    }
    await expect(service.rehydrateViaRestore(doc)).resolves.toBeUndefined()
  })
})
