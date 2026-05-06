import { describe, it, expect } from 'vitest'
import { reflectPointAcrossLine } from './MathUtils'

describe('MathUtils.reflectPointAcrossLine', () => {
  it('should reflect across vertical line', () => {
    const p = { x: 10, y: 10 }
    const p1 = { x: 0, y: 0 }
    const p2 = { x: 0, y: 100 }
    const result = reflectPointAcrossLine(p, p1, p2)
    expect(result.x).toBeCloseTo(-10)
    expect(result.y).toBeCloseTo(10)
  })

  it('should reflect across horizontal line', () => {
    const p = { x: 10, y: 10 }
    const p1 = { x: 0, y: 0 }
    const p2 = { x: 100, y: 0 }
    const result = reflectPointAcrossLine(p, p1, p2)
    expect(result.x).toBeCloseTo(10)
    expect(result.y).toBeCloseTo(-10)
  })

  it('should reflect across diagonal line (y=x)', () => {
    const p = { x: 10, y: 0 }
    const p1 = { x: 0, y: 0 }
    const p2 = { x: 10, y: 10 }
    const result = reflectPointAcrossLine(p, p1, p2)
    expect(result.x).toBeCloseTo(0)
    expect(result.y).toBeCloseTo(10)
  })
})
