import { describe, it, expect } from 'vitest'
import { SnapEngine, SnapType } from './SnapEngine'
import { Polyline } from '../model/Polyline'

describe('SnapEngine', () => {
  it('should snap to center of a polyline if center property exists', () => {
    const poly = new Polyline('P1', [
      { x: 0, y: 0, bulge: 0 },
      { x: 10, y: 0, bulge: 0 },
      { x: 10, y: 10, bulge: 0 },
      { x: 0, y: 10, bulge: 0 }
    ], true)
    poly.properties.center = { x: 5, y: 5 }

    const snap = SnapEngine.getSnapPoint(4.8, 4.8, [poly], 1.0)
    expect(snap).not.toBeNull()
    expect(snap!.type).toBe(SnapType.CENTER)
    expect(snap!.x).toBe(5)
    expect(snap!.y).toBe(5)
  })

  it('should update snap point after polyline is moved', () => {
    const poly = new Polyline('P1', [
      { x: 0, y: 0, bulge: 0 },
      { x: 10, y: 0, bulge: 0 },
      { x: 10, y: 10, bulge: 0 },
      { x: 0, y: 10, bulge: 0 }
    ], true)
    poly.properties.center = { x: 5, y: 5 }

    poly.move(10, 10)

    const snap = SnapEngine.getSnapPoint(15.1, 15.1, [poly], 1.0)
    expect(snap).not.toBeNull()
    expect(snap!.type).toBe(SnapType.CENTER)
    expect(snap!.x).toBe(15)
    expect(snap!.y).toBe(15)
  })
})
