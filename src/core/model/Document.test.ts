import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Document } from './Document'
import { Line } from './Line'
import { Solid3D } from './Solid3D'
import { OpenCascadeService } from '../io/OpenCascadeService'

describe('Document', () => {
  it('should add and retrieve entities', () => {
    const doc = new Document()
    const line = new Line('L1', 0, 0, 10, 10)
    doc.addEntity(line)
    
    expect(doc.getEntity('L1')).toBe(line)
    expect(doc.getAllEntities()).toHaveLength(1)
  })

  it('should remove entities', () => {
    const doc = new Document()
    const line = new Line('L1', 0, 0, 10, 10)
    doc.addEntity(line)
    doc.removeEntity('L1')
    
    expect(doc.getEntity('L1')).toBeUndefined()
    expect(doc.getAllEntities()).toHaveLength(0)
  })
})

/**
 * Regression cover for the OCC worker cache going stale on undo.
 *
 * `HistoryManager` has always been able to push a solid's previous B-rep back to
 * the kernel, but `Document.undo()`/`redo()` passed `undefined` for that callback,
 * so the restore never ran: the document reverted while the worker kept holding
 * the post-operation shape, and the next kernel operation used geometry the user
 * had already undone.
 */
describe('Document undo/redo — solid B-rep restore', () => {
  let importBRep: ReturnType<typeof vi.fn>

  const solidWithSnapshot = (id: string, snapshot: Uint8Array) => {
    const solid = new Solid3D(id, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2])
    solid.brepSnapshot = snapshot
    return solid
  }

  beforeEach(() => {
    importBRep = vi.fn().mockResolvedValue({})
    vi.spyOn(OpenCascadeService, 'getInstance').mockReturnValue({
      importBRep,
      transformShape: vi.fn(),
    } as unknown as OpenCascadeService)
  })

  /**
   * Stands in for a fillet/shell/chamfer: the solid gains a new B-rep, recorded
   * as a transform against a clone of its pre-operation state.
   */
  const editSolid = (doc: Document) => {
    const solid = solidWithSnapshot('S1', new Uint8Array([1, 2, 3]))
    doc.addEntity(solid)

    const beforeClone = solid.clone('S1') as Solid3D
    solid.brepSnapshot = new Uint8Array([9, 9, 9])

    doc.history.startTransaction()
    doc.recordTransform(beforeClone, solid)
    doc.history.commitTransaction()
  }

  it('restores the previous B-rep to the kernel when a solid edit is undone', () => {
    const doc = new Document()
    editSolid(doc)

    doc.undo()

    expect(importBRep).toHaveBeenCalledTimes(1)
    const [id, bytes] = importBRep.mock.calls[0]
    expect(id).toBe('S1')
    // The pre-operation snapshot, not the filleted one.
    expect(Array.from(bytes as Uint8Array)).toEqual([1, 2, 3])
  })

  it('restores the B-rep on redo as well', () => {
    const doc = new Document()
    editSolid(doc)

    doc.undo()
    importBRep.mockClear()
    doc.redo()

    expect(importBRep).toHaveBeenCalledTimes(1)
    expect(importBRep.mock.calls[0][0]).toBe('S1')
  })

  it('does not throw when the kernel restore fails', async () => {
    importBRep.mockRejectedValue(new Error('worker gone'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const doc = new Document()
    editSolid(doc)

    expect(() => doc.undo()).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
