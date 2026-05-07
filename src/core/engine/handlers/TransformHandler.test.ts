import { describe, it, expect, vi } from 'vitest'
import { TransformHandler } from './TransformHandler'
import { Document } from '../../model/Document'
import { Ellipse } from '../../model/Ellipse'
import { Line } from '../../model/Line'
import { AppContext } from './types'

describe('TransformHandler Trim Ellipse', () => {
  it('should trim an ellipse with a line', async () => {
    const doc = new Document()
    const ellipse = new Ellipse('E1', 0, 0, 100, 0, 0.5) // Center(0,0), Major(100,0), Ratio 0.5
    doc.addEntity(ellipse)
    
    const line = new Line('L1', 50, -100, 50, 100) // Vertical line at x=50
    doc.addEntity(line)

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
        addEllipse: vi.fn(),
      } as any,
      selectedEntityIds: new Set(),
      addEntity: vi.fn((e) => doc.addEntity(e)),
      terminateActiveCommand: vi.fn(),
    } as any

    const action = {
      action: 'trim',
      id: 'E1',
      boundaryIds: ['L1'],
      pickPt: { x: 75, y: 0 } // Pick the right part of the ellipse
    }

    const result = await handler.handle(action as any, context)
    expect(result).toBe('Entity trimmed.')
  })

  it('should extend an elliptical arc with a line', async () => {
    const doc = new Document()
    // Elliptical arc from 0 to 90 degrees (Math.PI/2)
    const ellipse = new Ellipse('E1', 0, 0, 100, 0, 0.5, 0, Math.PI / 2, true) 
    doc.addEntity(ellipse)
    
    const line = new Line('L1', 0, 100, 100, 100) // Horizontal line at y=100
    doc.addEntity(line)

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
      action: 'extend',
      id: 'E1',
      boundaryIds: ['L1'],
      pickPt: { x: 0, y: 50 } // Pick near the end of the arc (0, 50 in local coordinates for 90 deg)
    }

    const result = await handler.handle(action as any, context)
    expect(result).toBe('Ellipse extended.')
  })
})
