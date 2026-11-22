import { describe, it, expect } from 'vitest'
import { Document } from '../../../../src/core/model/Document'
import { Solid3D } from '../../../../src/core/model/Solid3D'

describe('Document snapshot provider', () => {
  it('returns brepSnapshot for Solid3D entities', async () => {
    const doc = new Document()
    const solid = new Solid3D('s1', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2])
    solid.brepSnapshot = new Uint8Array([1, 2, 3])
    doc.addEntity(solid)

    const provider = doc.getSnapshotProvider()
    const result = await provider('s1')

    expect(result).toEqual({ id: 's1' })
  })

  it('returns null for non-existent entity', async () => {
    const doc = new Document()
    const provider = doc.getSnapshotProvider()
    const result = await provider('missing')
    expect(result).toBeNull()
  })

  it('returns null for non-Solid3D entities', async () => {
    const doc = new Document()
    const entity = { id: 'e1', type: 'Sketch', getBoundingBox: () => ({ minX: 0, minY: 0, maxX: 10, maxY: 10 }) } as any
    doc.addEntity(entity)
    const provider = doc.getSnapshotProvider()
    const result = await provider('e1')
    expect(result).toBeNull()
  })

  it('returns null for Solid3D without brepSnapshot', async () => {
    const doc = new Document()
    const solid = new Solid3D('s1', [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2])
    doc.addEntity(solid)
    const provider = doc.getSnapshotProvider()
    const result = await provider('s1')
    expect(result).toBeNull()
  })
})
