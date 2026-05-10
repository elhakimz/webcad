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
      } as unknown as AppContext['viewer'],
      selectedEntityIds: new Set(),
      addEntity: vi.fn((e) => doc.addEntity(e)),
      terminateActiveCommand: vi.fn(),
    } as unknown as AppContext

    const action = {
      action: 'offset',
      id: 'PL1',
      distance: 1.0,
      sidePt: { x: 5, y: 5 } // Inside the L
    }

    const result = await handler.handle(action as unknown as Parameters<TransformHandler['handle']>[0], context)
    expect(result).toBe('Entity offset created.')

    expect(context.addEntity).toHaveBeenCalled()
    const addedEntity = vi.mocked(context.addEntity).mock.calls[0][0] as Polyline
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
      } as unknown as AppContext['viewer'],
      selectedEntityIds: new Set(),
      addEntity: vi.fn((e) => doc.addEntity(e)),
      terminateActiveCommand: vi.fn(),
    } as unknown as AppContext

    const action = {
      action: 'offset',
      id: 'PL2',
      distance: 1.0,
      sidePt: { x: 15, y: 5 } // To the right of the line segment, triggering outwards offset
    }

    const result = await handler.handle(action as unknown as Parameters<TransformHandler['handle']>[0], context)
    expect(result).toBe('Entity offset created.')

    expect(context.addEntity).toHaveBeenCalled()
    const addedEntity = vi.mocked(context.addEntity).mock.calls[0][0] as Polyline
    expect(addedEntity).toBeTruthy()
    expect(addedEntity.vertices).toHaveLength(3)
    
    // Expected vertices:
    // Arc segment from (0,0) to (10,0) with bulge 1.0 (CCW, negative y)
    // Center is (5,0), radius 5.
    // Offset by 1 outwards (to the right/outside) -> radius 6.
    // Start angle PI -> (-1, 0)
    // End angle 0 -> (11, 0)
    // So vertex 0 should be (-1, 0)
    // Vertex 1 should be the intersection of the offset arc and the offset line!
    // The line segment was (10,0) -> (10,10). Direction (0,1).
    // Offset to the right: x = 10 + 1 = 11!
    // Now we intersect offset arc (center 5,0, radius 6) with offset line x = 11!
    // (11 - 5)^2 + y^2 = 6^2
    // 6^2 + y^2 = 36
    // y^2 = 0
    // So vertex 1 should be (11, 0)!
    // And vertex 2 should be at the end of the offset line!
    // The line was (10,0)->(10,10). Offset is x=11.
    // So vertex 2 should be (11, 10)!
    
    expect(addedEntity.vertices[0].x).toBeCloseTo(-1)
    expect(addedEntity.vertices[0].y).toBeCloseTo(0)
    expect(addedEntity.vertices[1].x).toBeCloseTo(11)
    expect(addedEntity.vertices[1].y).toBeCloseTo(0)
    expect(addedEntity.vertices[2].x).toBeCloseTo(11)
    expect(addedEntity.vertices[2].y).toBeCloseTo(10)
  })
})
