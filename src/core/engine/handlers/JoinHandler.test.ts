import { describe, it, expect, vi } from 'vitest'
import { JoinHandler } from './transform/JoinHandler'
import { Document } from '../../model/Document'
import { Arc } from '../../model/Arc'
import { Polyline } from '../../model/Polyline'
import { AppContext } from './types'

describe('JoinHandler', () => {
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
    } as any,
    selectedEntityIds: new Set(),
    addEntity: vi.fn((e) => doc.addEntity(e)),
    syncFromDocument: vi.fn(),
  } as unknown as AppContext)

  it('should join two arcs with correct bulge and terminal bulge 0', async () => {
    const doc = new Document()
    
    // Arc 1: (0,0) R=10, 0 to 90 deg CCW
    const arc1 = new Arc('A1', 0, 0, 10, 0, Math.PI / 2, true)
    // Arc 2: (0,0) R=10, 90 to 180 deg CCW
    const arc2 = new Arc('A2', 0, 0, 10, Math.PI / 2, Math.PI, true)
    
    doc.addEntity(arc1)
    doc.addEntity(arc2)

    const handler = new JoinHandler()
    const context = createMockContext(doc)

    const action = {
      action: 'join',
      ids: ['A1', 'A2']
    }

    await handler.handle(action as any, context)

    const polylines = doc.getAllEntities().filter(e => e instanceof Polyline) as Polyline[]
    expect(polylines.length).toBe(1)
    
    const poly = polylines[0]
    expect(poly.vertices.length).toBe(3)
    
    // Expected bulge for 90 deg arc is tan(90/4) = tan(22.5 deg) approx 0.414
    const expectedBulge = Math.tan(Math.PI / 8)
    
    expect(poly.vertices[0].bulge).toBeCloseTo(expectedBulge, 5)
    expect(poly.vertices[1].bulge).toBeCloseTo(expectedBulge, 5)
    expect(poly.vertices[2].bulge).toBe(0) // Terminal vertex bulge must be 0
  })

  it('should handle angle-wrapped arcs correctly', async () => {
    const doc = new Document()
    
    // Arc: (0,0) R=10, 350 deg to 10 deg CCW (wraps 0)
    // 350 deg = -10 deg = -Math.PI / 18
    // 10 deg = Math.PI / 18
    const s = (350 * Math.PI) / 180
    const e = (10 * Math.PI) / 180
    const arc = new Arc('A1', 0, 0, 10, s, e, true)
    doc.addEntity(arc)

    const handler = new JoinHandler()
    const context = createMockContext(doc)

    const action = {
      action: 'join',
      ids: ['A1']
    }

    await handler.handle(action as any, context)

    const poly = doc.getAllEntities().filter(e => e instanceof Polyline)[0] as Polyline
    
    // Angle span is 20 degrees = Math.PI / 9
    // Expected bulge = tan(20/4) = tan(5 deg) approx 0.08748
    const expectedBulge = Math.tan(Math.PI / 36)
    
    expect(poly.vertices[0].bulge).toBeCloseTo(expectedBulge, 5)
    expect(poly.vertices[1].bulge).toBe(0)
  })

  it('should join a polyline and an arc', async () => {
    const doc = new Document()
    
    // Polyline: (0,0) to (10,0)
    const poly1 = new Polyline('PL1', [{x: 0, y: 0, bulge: 0}, {x: 10, y: 0, bulge: 0}], false)
    doc.addEntity(poly1)
    
    // Arc: (15,0) R=5, 180 to 90 deg CCW (Start is (10,0), End is (15,5))
    const arc = new Arc('A1', 15, 0, 5, Math.PI, Math.PI / 2, false) // CW from 180 to 90
    doc.addEntity(arc)

    const handler = new JoinHandler()
    const context = createMockContext(doc)

    const action = {
      action: 'join',
      ids: ['PL1', 'A1']
    }

    await handler.handle(action as any, context)

    const poly = doc.getAllEntities().filter(e => e instanceof Polyline)[0] as Polyline
    expect(poly.vertices.length).toBe(3)
    
    // Polyline end (10,0) connects to Arc start (10,0)
    // Arc is CW, 90 deg span. Bulge = -tan(90/4) = -0.414
    const expectedBulge = -Math.tan(Math.PI / 8)
    
    expect(poly.vertices[1].bulge).toBeCloseTo(expectedBulge, 5)
    expect(poly.vertices[2].bulge).toBe(0)
  })

  it('should fail and cancel if endpoints do not meet at same coordinates', async () => {
    const doc = new Document()
    
    // Line 1: (0,0) to (10,0)
    const poly1 = new Polyline('PL1', [{x: 0, y: 0, bulge: 0}, {x: 10, y: 0, bulge: 0}], false)
    doc.addEntity(poly1)
    
    // Line 2: (10.1, 0) to (20.1, 0) -- Gap of 0.1
    const poly2 = new Polyline('PL2', [{x: 10.1, y: 0, bulge: 0}, {x: 20.1, y: 0, bulge: 0}], false)
    doc.addEntity(poly2)

    const handler = new JoinHandler()
    const context = createMockContext(doc)

    const action = {
      action: 'join',
      ids: ['PL1', 'PL2']
    }

    const response = await handler.handle(action as any, context)

    expect(response).toBe("Entities do not meet at same coordinates. Join canceled.")
    
    // Verify no entities were removed/added
    expect(doc.getEntity('PL1')).toBeDefined()
    expect(doc.getEntity('PL2')).toBeDefined()
    expect(doc.getAllEntities().length).toBe(2)
  })
})
