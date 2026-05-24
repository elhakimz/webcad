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

    // Select segment 0 (0,0-10,0) and segment 1 (10,0-10,10)
    // Distance 2 on both sides. Corner is at (10,0).
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
    // Original vertex at (10,0) should be replaced by (8,0) and (10,2)
    // Vertices should be: (0,0), (8,0), (10,2), (10,10), (0,10)
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
    // Corner at (10,0). Fillet radius 2 means tangent points at (8,0) and (10,2).
    // Vertex 1 (10,0) is replaced by (8,0, bulge) and (10,2, 0).
    expect(updatedPoly.vertices.length).toBe(4)
    expect(updatedPoly.vertices[1].x).toBeCloseTo(8, 5)
    expect(updatedPoly.vertices[1].y).toBeCloseTo(0, 5)
    expect(Math.abs(updatedPoly.vertices[1].bulge)).toBeGreaterThan(0.4) // tan(90/4) = 0.414
    expect(updatedPoly.vertices[2].x).toBeCloseTo(10, 5)
    expect(updatedPoly.vertices[2].y).toBeCloseTo(2, 5)
  })

  it('should chamfer between a line and a polyline segment', async () => {
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
    expect(resp).toBe("Chamfer created.")

    const updatedLine = doc.getEntity('L1') as Line
    const updatedPoly = doc.getEntity('PL1') as Polyline
    
    // Intersection is at (10,0). 
    // Line L1 (0,0-10,0) trimmed by 1 -> (0,0-9,0)
    expect(updatedLine.x2).toBeCloseTo(9, 5)
    // Polyline segment trimmed by 1 -> (10,10-10,1)
    // pick2 (10,5) is on same side as v0 (10,10). So v1 (index 1) is updated (it has the smaller dot product).
    expect(updatedPoly.vertices[1].x).toBeCloseTo(10, 5)
    expect(updatedPoly.vertices[1].y).toBeCloseTo(1, 5)
  })
})
