import { describe, it, expect, vi } from 'vitest'
import { LoftCommand } from './LoftCommand'
import { SelectionEngine } from '../engine/SelectionEngine'
import { Polyline } from '../model/Polyline'
import { Circle } from '../model/Circle'
import { CommandAction } from './types'

// Mock OpenCascadeService
vi.mock('../io/OpenCascadeService', () => {
  return {
    OpenCascadeService: {
      getInstance: vi.fn().mockReturnValue({
        createLoft: vi.fn().mockResolvedValue({
          attributes: {
            position: {
              array: new Float32Array([0,0,0, 10,0,0, 0,10,0])
            }
          },
          index: {
            array: new Uint16Array([0,1,2])
          }
        })
      })
    }
  };
});

// Mock SelectionEngine
vi.mock('../engine/SelectionEngine', () => {
  return {
    SelectionEngine: {
      getEntityAtSpatial: vi.fn()
    }
  };
});

describe('LoftCommand', () => {
  it('should collect profiles and complete', async () => {
    const cmd = new LoftCommand()
    
    const p1 = new Polyline('P1', [{x:0,y:0,bulge:0}, {x:10,y:0,bulge:0}], false)
    const p2 = new Polyline('P2', [{x:0,y:10,bulge:0}, {x:10,y:10,bulge:0}], false)
    
    const mockDoc = {
      getEntity: vi.fn().mockImplementation((id) => {
        if (id === 'P1') return p1;
        if (id === 'P2') return p2;
        return null;
      }),
      facetres: 5.0
    };
    
    // Step 1: Select profiles
    const res1 = cmd.onInput('P1', 'L1', { type: 'decimal', precision: 2, scale: 1.0 }, undefined, mockDoc as any)
    expect(res1).toContain('(Selected: 1)')
    
    const res2 = cmd.onInput('P2', 'L1', { type: 'decimal', precision: 2, scale: 1.0 }, undefined, mockDoc as any)
    expect(res2).toContain('(Selected: 2)')
    
    expect(cmd.profiles).toHaveLength(2)
    
    // Press Enter to finish profile selection
    cmd.onInput('', 'L1', { type: 'decimal', precision: 2, scale: 1.0 }, undefined, mockDoc as any)
    expect(cmd.step).toBe(2)
    
    // Step 2: Mode (Solid)
    cmd.onInput('Solid', 'L1', { type: 'decimal', precision: 2, scale: 1.0 }, undefined, mockDoc as any)
    expect(cmd.step).toBe(3)
    
    // Step 3: Transition (Smooth)
    const res = await cmd.onInput('Smooth', 'L1', { type: 'decimal', precision: 2, scale: 1.0 }, undefined, mockDoc as any) as CommandAction
    
    expect(res.action).toBe('loft_result')
    expect(res.result).toBeDefined()
    expect(cmd.step).toBe(4)
  })

  it('should handle invalid profile selection', () => {
    const cmd = new LoftCommand()
    
    const mockDoc = {
      getEntity: vi.fn().mockReturnValue(null),
      facetres: 5.0
    };
    
    const res = cmd.onInput('InvalidID', 'L1', { type: 'decimal', precision: 2, scale: 1.0 }, undefined, mockDoc as any)
    expect(res).toContain('Select profiles in order')
    expect(cmd.profiles).toHaveLength(0)
  })

  it('should require at least 2 profiles', () => {
    const cmd = new LoftCommand()
    const p1 = new Polyline('P1', [{x:0,y:0,bulge:0}, {x:10,y:0,bulge:0}], false)
    
    const mockDoc = {
      getEntity: vi.fn().mockReturnValue(p1),
      facetres: 5.0
    };
    
    cmd.onInput('P1', 'L1', { type: 'decimal', precision: 2, scale: 1.0 }, undefined, mockDoc as any)
    const res = cmd.onInput('', 'L1', { type: 'decimal', precision: 2, scale: 1.0 }, undefined, mockDoc as any)
    
    expect(res).toContain('Select at least 2 profiles')
    expect(cmd.step).toBe(1)
  })

  it('should select profiles via onPoint', () => {
    const cmd = new LoftCommand()
    const p1 = new Polyline('P1', [{x:0,y:0,bulge:0}, {x:10,y:0,bulge:0}], false)
    
    const mockDoc = {
      facetres: 5.0
    };
    
    const getEntityAtSpatialMock = vi.mocked(SelectionEngine.getEntityAtSpatial);
    getEntityAtSpatialMock.mockReturnValue(p1);
    
    const res = cmd.onPoint(0, 0, 'L1', { type: 'decimal', precision: 2, scale: 1.0 }, mockDoc as any)
    
    expect(res).toContain('(Selected: 1)')
    expect(cmd.profiles).toHaveLength(1)
    expect(cmd.profiles[0]).toBe(p1)
  })

  it('should collect a Polyline and a Circle and complete', async () => {
    const cmd = new LoftCommand()
    
    const p1 = new Polyline('P1', [
      {x:0,y:0,bulge:0}, 
      {x:10,y:0,bulge:0}, 
      {x:10,y:10,bulge:0}, 
      {x:0,y:10,bulge:0}
    ], true); // Rectangle
    const c1 = new Circle('C1', 5, 5, 5, 20); // Circle at elevation 20
    
    const mockDoc = {
      getEntity: vi.fn().mockImplementation((id) => {
        if (id === 'P1') return p1;
        if (id === 'C1') return c1;
        return null;
      }),
      facetres: 5.0
    };
    
    // Step 1: Select profiles
    const res1 = cmd.onInput('P1', 'L1', { type: 'decimal', precision: 2, scale: 1.0 }, undefined, mockDoc as any)
    expect(res1).toContain('(Selected: 1)')
    
    const res2 = cmd.onInput('C1', 'L1', { type: 'decimal', precision: 2, scale: 1.0 }, undefined, mockDoc as any)
    expect(res2).toContain('(Selected: 2)')
    
    expect(cmd.profiles).toHaveLength(2)
    
    // Press Enter to finish profile selection
    cmd.onInput('', 'L1', { type: 'decimal', precision: 2, scale: 1.0 }, undefined, mockDoc as any)
    expect(cmd.step).toBe(2)
    
    // Step 2: Mode (Solid)
    cmd.onInput('Solid', 'L1', { type: 'decimal', precision: 2, scale: 1.0 }, undefined, mockDoc as any)
    expect(cmd.step).toBe(3)
    
    // Step 3: Transition (Smooth)
    const res = await cmd.onInput('Smooth', 'L1', { type: 'decimal', precision: 2, scale: 1.0 }, undefined, mockDoc as any) as CommandAction
    
    expect(res.action).toBe('loft_result')
    expect(res.result).toBeDefined()
    expect(cmd.step).toBe(4)
  })
})
