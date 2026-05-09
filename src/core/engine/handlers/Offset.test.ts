import { describe, it, expect, vi } from 'vitest'
import { TransformHandler } from './TransformHandler'
import { Document } from '../../model/Document'
import { Polyline } from '../../model/Polyline'
import { AppContext } from './types'

describe('TransformHandler Offset Polyline', () => {
  it('should offset an L-shaped polyline and intersect at corner', async () => {
    const doc = new Document()
    const polyline = new Polyline('PL1', [
      { x: 0, y: 0, bulge: 0 },
      { x: 10, y: 0, bulge: 0 },
      { x: 10, y: 10, bulge: 0 }
    ], false) // Open polyline
    doc.addEntity(polyline)

    const handler = new TransformHandler()
    const context: AppContext = {
      doc,
      viewer: {
        removeObject: vi.fn(),
        render: vi.fn(),
        clearHighlight: vi.fn(),
        setPreview: vi.fn(),
        setHelpers: vi.fn(),
        setBaseLine: vi.fn(),
        camera: { zoom: 1 },
      } as any,
      selectedEntityIds: new Set(),
      addEntity: vi.fn((e) => doc.addEntity(e)),
      terminateActiveCommand: vi.fn(),
    } as any

    const action = {
      action: 'offset',
      id: 'PL1',
      distance: 1.0,
      sidePt: { x: 5, y: 5 } // Inside the L
    }

    const result = await handler.handle(action as any, context)
    expect(result).toBe('Entity offset created.')

    expect(context.addEntity).toHaveBeenCalled()
    const addedEntity = (context.addEntity as any).mock.calls[0][0] as Polyline
    expect(addedEntity).toBeTruthy()
    expect(addedEntity.vertices).toHaveLength(3)
    
    // Expected vertices: (0,1), (9,1), (9,10)
    expect(addedEntity.vertices[0].x).toBeCloseTo(0)
    expect(addedEntity.vertices[0].y).toBeCloseTo(1)
    expect(addedEntity.vertices[1].x).toBeCloseTo(9)
    expect(addedEntity.vertices[1].y).toBeCloseTo(1)
    expect(addedEntity.vertices[2].x).toBeCloseTo(9)
    expect(addedEntity.vertices[2].y).toBeCloseTo(10)
  })

  it('should offset a polyline with an arc segment', async () => {
    const doc = new Document()
    const polyline = new Polyline('PL2', [
      { x: 0, y: 0, bulge: 1.0 }, // Semi-circle to (10,0)
      { x: 10, y: 0, bulge: 0 },
      { x: 10, y: 10, bulge: 0 }
    ], false)
    doc.addEntity(polyline)

    const handler = new TransformHandler()
    const context: AppContext = {
      doc,
      viewer: {
        removeObject: vi.fn(),
        render: vi.fn(),
        clearHighlight: vi.fn(),
        setPreview: vi.fn(),
        setHelpers: vi.fn(),
        setBaseLine: vi.fn(),
        camera: { zoom: 1 },
      } as any,
      selectedEntityIds: new Set(),
      addEntity: vi.fn((e) => doc.addEntity(e)),
      terminateActiveCommand: vi.fn(),
    } as any

    const action = {
      action: 'offset',
      id: 'PL2',
      distance: 1.0,
      sidePt: { x: 5, y: 10 } // Further from center (5,0) than the arc (r=5)
    }

    const result = await handler.handle(action as any, context)
    expect(result).toBe('Entity offset created.')

    expect(context.addEntity).toHaveBeenCalled()
    const addedEntity = (context.addEntity as any).mock.calls[0][0] as Polyline
    expect(addedEntity).toBeTruthy()
    expect(addedEntity.vertices).toHaveLength(3)
    
    // Expected vertices:
    // Arc segment from (0,0) to (10,0) with bulge 1.0
    // Center is (5,0), radius 5.
    // Offset by 1 outwards -> radius 6.
    // Start angle PI -> (-1, 0)
    // End angle 0 -> (11, 0)
    // So vertex 0 should be (-1, 0)
    // Vertex 1 should be the intersection of the offset arc and the offset line!
    // The line segment was (10,0) -> (10,10). Direction (0,1).
    // Offset to the left (sidePt is at x=5, so left of (10,10) is x < 10!).
    // Wait, sidePt is at (5,10). For segment (10,0)->(10,10), direction is (0,1).
    // (5,10) is to the LEFT of (10,0)->(10,10)!
    // So we offset to the left: x = 10 - 1 = 9!
    // So the offset line is x = 9!
    // Now we intersect offset arc (center 5,0, radius 6) with offset line x = 9!
    // (9 - 5)^2 + y^2 = 6^2
    // 4^2 + y^2 = 36
    // 16 + y^2 = 36
    // y^2 = 20
    // y = sqrt(20) approx 4.472
    // So vertex 1 should be (9, 4.472)!
    // And vertex 2 should be at the end of the offset line!
    // The line was (10,0)->(10,10). Offset is x=9.
    // So vertex 2 should be (9, 10)!
    
    expect(addedEntity.vertices[0].x).toBeCloseTo(-1)
    expect(addedEntity.vertices[0].y).toBeCloseTo(0)
    expect(addedEntity.vertices[1].x).toBeCloseTo(9)
    expect(addedEntity.vertices[1].y).toBeCloseTo(Math.sqrt(20))
    expect(addedEntity.vertices[2].x).toBeCloseTo(9)
    expect(addedEntity.vertices[2].y).toBeCloseTo(10)
  })
})
