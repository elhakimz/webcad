import { describe, it, expect } from 'vitest'
import { PolyhedronCommand } from './PolyhedronCommand'
import { Point } from '../model/Point'
import { Line } from '../model/Line'

describe('PolyhedronCommand', () => {
  const units = { type: 'decimal' as const, precision: 2, scale: 1.0 }

  it('should add vertices sequentially and sketch a face', () => {
    const cmd = new PolyhedronCommand()

    // Add first point
    const res0 = cmd.onPoint(0, 0, 'entity_1', units, undefined, 0)
    expect(cmd.vertices.length).toBe(1)
    expect(cmd.currentFace).toEqual([0])
    expect(res0).toContain('Added vertex to face')

    // Add second point
    cmd.onPoint(10, 0, 'entity_1', units, undefined, 0)
    expect(cmd.vertices.length).toBe(2)
    expect(cmd.currentFace).toEqual([0, 1])

    // Add third point
    cmd.onPoint(10, 10, 'entity_1', units, undefined, 0)
    expect(cmd.vertices.length).toBe(3)
    expect(cmd.currentFace).toEqual([0, 1, 2])
  })

  it('should snap to existing vertices within tolerance', () => {
    const cmd = new PolyhedronCommand()

    // Add first point
    cmd.onPoint(0, 0, 'entity_1', units, undefined, 0) // Vertex 0
    expect(cmd.vertices.length).toBe(1)

    // Add second point near Vertex 0 (distance ~0.1, within 0.5 tolerance)
    cmd.onPoint(0.05, 0.05, 'entity_1', units, undefined, 0)
    // Vertices length should still be 1 (snapped to Vertex 0)
    expect(cmd.vertices.length).toBe(1)
  })

  it('should close active face when clicking back on first vertex', () => {
    const cmd = new PolyhedronCommand()

    cmd.onPoint(0, 0, 'entity_1', units, undefined, 0)   // Vertex 0
    cmd.onPoint(10, 0, 'entity_1', units, undefined, 0)  // Vertex 1
    cmd.onPoint(10, 10, 'entity_1', units, undefined, 0) // Vertex 2

    // Click back on Vertex 0 (snaps to 0) to close face
    const res = cmd.onPoint(0.1, 0.1, 'entity_1', units, undefined, 0)
    expect(cmd.faces.length).toBe(1)
    expect(cmd.faces[0]).toEqual([0, 1, 2])
    expect(cmd.currentFace.length).toBe(0)
    expect(res).toContain('Face 1 defined')
  })

  it('should support closing active face via keyboard CLOSE or ENTER input', () => {
    const cmd = new PolyhedronCommand()

    cmd.onPoint(0, 0, 'entity_1', units, undefined, 0)
    cmd.onPoint(10, 0, 'entity_1', units, undefined, 0)
    cmd.onPoint(10, 10, 'entity_1', units, undefined, 0)

    const res = cmd.onInput('CLOSE', 'entity_1', units)
    expect(cmd.faces.length).toBe(1)
    expect(cmd.faces[0]).toEqual([0, 1, 2])
    expect(cmd.currentFace.length).toBe(0)
    expect(res).toContain('Face 1 defined')
  })

  it('should calculate naked edges dynamically and set preview colors', () => {
    const cmd = new PolyhedronCommand()

    // Create a simple wedge/open box with two adjacent faces sharing one edge
    // Face 1: [0, 1, 2]
    cmd.onPoint(0, 0, 'entity_1', units, undefined, 0)   // 0
    cmd.onPoint(10, 0, 'entity_1', units, undefined, 0)  // 1
    cmd.onPoint(10, 10, 'entity_1', units, undefined, 0) // 2
    cmd.onInput('CLOSE', 'entity_1', units)

    // Face 2: [1, 3, 2]
    cmd.onPoint(10, 0, 'entity_1', units, undefined, 0)  // snap to 1
    cmd.onPoint(20, 5, 'entity_1', units, undefined, 0)  // 3
    cmd.onPoint(10, 10, 'entity_1', units, undefined, 0) // snap to 2
    cmd.onInput('CLOSE', 'entity_1', units)

    expect(cmd.faces.length).toBe(2)
    expect(cmd.faces[0]).toEqual([0, 1, 2])
    expect(cmd.faces[1]).toEqual([1, 3, 2])

    // Under the hood:
    // Face 1 has edges: (0-1), (1-2), (2-0)
    // Face 2 has edges: (1-3), (3-2), (2-1) i.e. (1-2)
    // Edge (1-2) is shared by Face 1 and Face 2, count is 2 (manifold)
    // Other edges: (0-1), (2-0), (1-3), (3-2) have count 1 (naked)
    const preview = cmd.getPreview(15, 15, units) as any
    expect(preview.type).toBe('entities')

    const points = preview.entities.filter((e: any) => e instanceof Point)
    const lines = preview.entities.filter((e: any) => e instanceof Line)

    // Should render vertices as Points and edges as Lines
    expect(points.length).toBe(4) // 4 unique vertices
    expect(lines.length).toBe(5)  // 5 unique edges

    // Verify naked edges are colored in RED (0xFF0000) and shared is grey (0x888888)
    const sharedLine = lines.find((l: any) => 
      (l.x1 === 10 && l.y1 === 0 && l.x2 === 10 && l.y2 === 10) ||
      (l.x1 === 10 && l.y1 === 10 && l.x2 === 10 && l.y2 === 0)
    )
    expect(sharedLine).toBeDefined()
    expect(sharedLine.properties.color).toBe(0x888888)

    const nakedLine = lines.find((l: any) => 
      (l.x1 === 0 && l.y1 === 0 && l.x2 === 10 && l.y2 === 0) ||
      (l.x1 === 10 && l.y1 === 0 && l.x2 === 0 && l.y2 === 0)
    )
    expect(nakedLine).toBeDefined()
    expect(nakedLine.properties.color).toBe(0xFF0000)
  })

  it('should provide dynamic input coordinates and snapping guide', () => {
    const cmd = new PolyhedronCommand()

    const dynamicStart = cmd.getDynamicInput(5, 5, units)
    expect(dynamicStart).toEqual(['X: Distance: 5.00', 'Y: Distance: 5.00'])

    cmd.onPoint(0, 0, 'entity_1', units, undefined, 0)
    const dynamicSecond = cmd.getDynamicInput(10, 0, units)
    expect(dynamicSecond).toEqual(['D: Distance: 10.00 (click start vertex to close face)'])
  })
})
