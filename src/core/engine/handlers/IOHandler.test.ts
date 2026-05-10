import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IOHandler } from './IOHandler'
import { Document } from '../../model/Document'
import { AppContext } from './types'

vi.mock('../../io/dxfImport', () => {
  return {
    DXFImporter: class {
      import() {
        // Mock import
      }
    }
  }
})

describe('IOHandler', () => {
  let doc: Document
  let context: AppContext
  let handler: IOHandler

  beforeEach(() => {
    doc = new Document()
    handler = new IOHandler()
    
    // Setup minimal AppContext
    context = {
      doc,
      viewer: {
        camera: {
          zoom: 1,
          position: { set: vi.fn() },
          updateProjectionMatrix: vi.fn()
        },
        zoomAll: vi.fn(),
        render: vi.fn()
      } as unknown as AppContext['viewer'],
      cmd: {} as unknown as AppContext['cmd'],
      drafting: {} as unknown as AppContext['drafting'],
      selectedEntityIds: new Set(),
      addEntity: vi.fn(),
      syncFromDocument: vi.fn(),
      updateLayerVisibility: vi.fn(),
      terminateActiveCommand: vi.fn(),
      onStatusBarUpdate: vi.fn(),
      onLayersChange: vi.fn()
    } as unknown as AppContext

    // Mock global fetch
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        text: async () => "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF",
        json: async () => []
      }
    })
  })

  it('should clear layers and call onLayersChange when loading a drawing', async () => {
    doc.layers.createLayer("TestLayer");
    expect(doc.layers.layers.has("TestLayer")).toBe(true);

    const action = {
      action: 'load',
      filename: 'test.dxf'
    }

    const result = await handler.handle(action as unknown as Parameters<IOHandler['handle']>[0], context)
    console.log('LOAD Result:', result)

    expect(doc.layers.layers.has("TestLayer")).toBe(false);
    expect(doc.layers.layers.has("0")).toBe(true);
    expect(context.onLayersChange).toHaveBeenCalled()
  })

  it('should reset layers and call onLayersChange on new drawing', async () => {
    doc.layers.createLayer("TestLayer")
    expect(doc.layers.layers.has("TestLayer")).toBe(true)

    const action = {
      action: 'new'
    }

    const result = await handler.handle(action as unknown as Parameters<IOHandler['handle']>[0], context)
    console.log('NEW Result:', result)

    expect(doc.layers.layers.has("TestLayer")).toBe(false)
    expect(doc.layers.layers.has("0")).toBe(true)
    expect(doc.layers.currentLayerName).toBe("0")
    expect(context.onLayersChange).toHaveBeenCalled()
  })
})
