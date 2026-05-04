import { describe, it, expect } from 'vitest'
import { Document } from './Document'
import { Line } from './Line'

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
