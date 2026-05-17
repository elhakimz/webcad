import { describe, it, expect, vi } from 'vitest'
import { HullCommand } from './HullCommand'
import { Point } from '../model/Point'
import { Line } from '../model/Line'
import { Solid3D } from '../model/Solid3D'
import { Document } from '../model/Document'
import { SelectionEngine } from '../engine/SelectionEngine'

// Mock SelectionEngine
vi.mock('../engine/SelectionEngine', () => {
  return {
    SelectionEngine: {
      getEntityAtSpatial: vi.fn()
    }
  };
});

describe('HullCommand', () => {
  const units = { type: 'decimal' as const, precision: 2, scale: 1.0 }

  it('should add custom clicked points sequentially', () => {
    const cmd = new HullCommand()

    const res0 = cmd.onPoint(10, 20, 'entity_1', units, undefined, 5)
    expect(cmd.clickedPoints.length).toBe(1)
    expect(cmd.clickedPoints[0]).toEqual({ x: 10, y: 20, z: 5 })
    expect(res0).toContain('Added point: P[X:10.00, Y:20.00, Z:5.00]')

    cmd.onPoint(30, 40, 'entity_1', units, undefined, 0)
    expect(cmd.clickedPoints.length).toBe(2)
    expect(cmd.clickedPoints[1]).toEqual({ x: 30, y: 40, z: 0 })
  })

  it('should support selecting existing Solid3D shapes from document', () => {
    const cmd = new HullCommand()
    const doc = new Document()
    const solid = new Solid3D('solid_1', [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 10], [0, 1, 2, 0, 2, 3])
    doc.addEntity(solid)

    const getEntityAtSpatialMock = vi.mocked(SelectionEngine.getEntityAtSpatial);
    getEntityAtSpatialMock.mockReturnValue(solid);

    const res = cmd.onPoint(0, 0, 'entity_2', units, doc, 0)
    expect(cmd.selectedIds).toContain('solid_1')
    expect(res).toContain('Selected solid: solid_1')
  })

  it('should enforce at least 4 points to bake a convex hull', () => {
    const cmd = new HullCommand()

    // Add only 2 points
    cmd.onPoint(0, 0, 'entity_1', units, undefined, 0)
    cmd.onPoint(10, 0, 'entity_1', units, undefined, 0)

    const res = cmd.onInput('', 'entity_1', units)
    expect(res).toContain('Convex hull requires at least 4 unique points')
  })

  it('should output correct live dynamic preview with custom clicked points', () => {
    const cmd = new HullCommand()

    // Add 3 points
    cmd.onPoint(0, 0, 'entity_1', units, undefined, 0)
    cmd.onPoint(10, 0, 'entity_1', units, undefined, 0)
    cmd.onPoint(0, 10, 'entity_1', units, undefined, 0)

    // Dynamic preview with current cursor point forms 4 points, enabling full 3D hull computation
    const preview = cmd.getPreview(10, 10, units) as any
    expect(preview.type).toBe('entities')

    const points = preview.entities.filter((e: any) => e instanceof Point)
    const lines = preview.entities.filter((e: any) => e instanceof Line)

    // We should see 3 points drawn as Point objects (representing clicked points)
    expect(points.length).toBe(3)
    // We should see the dynamic orange/yellow wireframe edges forming a hull
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0].properties.color).toBe(0xFFA500)
  })
})
