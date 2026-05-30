import { describe, it, expect, vi } from 'vitest'
import { ChamferHandler } from '../../src/core/engine/handlers/transform/ChamferHandler'
import { FilletHandler } from '../../src/core/engine/handlers/transform/FilletHandler'
import { Document } from '../../src/core/model/Document'
import { Polyline } from '../../src/core/model/Polyline'
import { Line } from '../../src/core/model/Line'
import { AppContext } from '../../src/core/engine/handlers/types'

describe('Polyline Chamfer & Fillet', () => {
  const createMockContext = (doc: Document) => ({
    doc,
    viewer: {
      removeObject: vi.fn(),
      render: vi.fn(),
      clearHighlight: vi.fn(),
      setPreview: vi.fn(),
      setHelpers: vi.fn(),
      setBaseLine: vi.fn(),
      camera: { zoom: 1 },
      syncFromDocument: vi.fn(),
      clearSelection: vi.fn(),
      requestRender: vi.fn(),
    } as any,
    selectedEntityIds: new Set(),
    addEntity: vi.fn((e) => doc.addEntity(e)),
    syncFromDocument: vi.fn(),
  } as unknown as AppContext)

  it('should chamfer two adjacent segments of a polyline', async () => {
    const doc = new Document()
    // A 10x10 square polyline
    const poly = new Polyline('PL1', [
      {x: 0, y: 0, bulge: 0},
      {x: 10, y: 0, bulge: 0},
      {x: 10, y: 10, bulge: 0},
      {x: 0, y: 10, bulge: 0}
    ], true)
    doc.addEntity(poly)

    const handler = new ChamferHandler()
    const context = createMockContext(doc)

    const action = {
      action: 'chamfer',
      id1: 'PL1',
      id2: 'PL1',
      dist1: 2,
      dist2: 2,
      pick1: {x: 5, y: 0},
      pick2: {x: 10, y: 5}
    }

    const resp = await handler.handle(action as any, context)
    expect(resp).toBe("Polyline corner chamfered.")

    const updatedPoly = doc.getEntity('PL1') as Polyline
    expect(updatedPoly.vertices.length).toBe(5)
    expect(updatedPoly.vertices[1].x).toBe(8)
    expect(updatedPoly.vertices[1].y).toBe(0)
    expect(updatedPoly.vertices[2].x).toBe(10)
    expect(updatedPoly.vertices[2].y).toBe(2)
  })

  it('should fillet two adjacent segments of a polyline', async () => {
    const doc = new Document()
    const poly = new Polyline('PL1', [
      {x: 0, y: 0, bulge: 0},
      {x: 10, y: 0, bulge: 0},
      {x: 10, y: 10, bulge: 0}
    ], false)
    doc.addEntity(poly)

    const handler = new FilletHandler()
    const context = createMockContext(doc)

    const action = {
      action: 'fillet',
      id1: 'PL1',
      id2: 'PL1',
      radius: 2,
      pick1: {x: 5, y: 0},
      pick2: {x: 10, y: 5}
    }

    const resp = await handler.handle(action as any, context)
    expect(resp).toBe("Polyline corner filleted.")

    const updatedPoly = doc.getEntity('PL1') as Polyline
    expect(updatedPoly.vertices.length).toBe(4)
    expect(updatedPoly.vertices[1].x).toBeCloseTo(8, 5)
    expect(updatedPoly.vertices[1].y).toBeCloseTo(0, 5)
    expect(Math.abs(updatedPoly.vertices[1].bulge)).toBeGreaterThan(0.4) 
    expect(updatedPoly.vertices[2].x).toBeCloseTo(10, 5)
    expect(updatedPoly.vertices[2].y).toBeCloseTo(2, 5)
  })

  it('should chamfer between a line and a polyline segment and join them', async () => {
    const doc = new Document()
    const line = new Line('L1', 0, 0, 10, 0)
    const poly = new Polyline('PL1', [{x: 10, y: 10, bulge: 0}, {x: 10, y: -10, bulge: 0}], false)
    doc.addEntity(line)
    doc.addEntity(poly)

    const handler = new ChamferHandler()
    const context = createMockContext(doc)

    const action = {
      action: 'chamfer',
      id1: 'L1',
      id2: 'PL1',
      dist1: 1,
      dist2: 1,
      pick1: {x: 5, y: 0},
      pick2: {x: 10, y: 5}
    }

    const resp = await handler.handle(action as any, context)
    expect(resp).toBe("Entities chamfered and joined into polyline.")

    // Originals should be removed
    expect(doc.getEntity('L1')).toBeUndefined()
    expect(doc.getEntity('PL1')).toBeUndefined()

    // A new polyline should exist
    const allPolys = doc.getAllEntities().filter(e => e instanceof Polyline) as Polyline[]
    expect(allPolys.length).toBe(1)
    const resPoly = allPolys[0]
    
    // Line was (0,0)-(10,0). Trimmed to (0,0)-(9,0).
    // Chamfer was (9,0)-(10,1).
    // Polyline was (10,10)-(10,-10). Trimmed to (10,10)-(10,1).
    // Resulting chain: (0,0) -> (9,0) -> (10,1) -> (10,10)
    expect(resPoly.vertices.length).toBe(4)
    expect(resPoly.vertices[0].x).toBeCloseTo(0, 5)
    expect(resPoly.vertices[1].x).toBeCloseTo(9, 5)
    expect(resPoly.vertices[2].y).toBeCloseTo(1, 5)
    expect(resPoly.vertices[3].y).toBeCloseTo(10, 5)
  })

  it('should fillet two separate lines and preserve the arc bulge', async () => {
    const doc = new Document()
    const l1 = new Line('L1', 0, 0, 10, 0)
    const l2 = new Line('L2', 10, 10, 10, 0)
    doc.addEntity(l1)
    doc.addEntity(l2)

    const handler = new FilletHandler()
    const context = createMockContext(doc)

    const action = {
      action: 'fillet',
      id1: 'L1',
      id2: 'L2',
      radius: 2,
      pick1: {x: 5, y: 0},
      pick2: {x: 10, y: 5}
    }

    const resp = await handler.handle(action as any, context)
    expect(resp).toBe("Entities filleted and joined into polyline.")

    const allPolys = doc.getAllEntities().filter(e => e instanceof Polyline) as Polyline[]
    expect(allPolys.length).toBe(1)
    const poly = allPolys[0]

    // Line 1: (0,0)-(8,0). Corner: (8,0).
    // Fillet Arc: (8,0) to (10,2) with radius 2.
    // Line 2: (10,2)-(10,10).
    // Vertices: [ (0,0), (8,0, bulge), (10,2), (10,10) ]
    expect(poly.vertices.length).toBe(4)
    expect(poly.vertices[1].x).toBeCloseTo(8, 5)
    expect(poly.vertices[1].y).toBeCloseTo(0, 5)
    
    // The vertex at the start of the fillet (index 1) MUST have a non-zero bulge
    expect(Math.abs(poly.vertices[1].bulge)).toBeGreaterThan(0.4) 
    
    expect(poly.vertices[2].x).toBeCloseTo(10, 5)
    expect(poly.vertices[2].y).toBeCloseTo(2, 5)
  })
})
