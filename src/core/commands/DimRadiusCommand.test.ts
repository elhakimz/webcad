import { describe, it, expect, beforeEach } from 'vitest'
import { DimRadiusCommand } from './DimRadiusCommand'
import { Circle } from '../model/Circle'
import { UnitsConfig } from '../model/Document'
import { Dimension } from '../model/Dimension'

describe('DimRadiusCommand', () => {
  let command: DimRadiusCommand
  const units: UnitsConfig = {
    type: 'decimal',
    precision: 2,
    scale: 1.0
  }

  beforeEach(() => {
    command = new DimRadiusCommand()
  })

  it('should calculate correct radius when clicking outside the circle', () => {
    const circle = new Circle('C1', 0, 0, 50)
    const entities = new Map()
    entities.set('C1', circle)

    // Step 0: Select circle
    command.setEntity(circle)
    const prompt = command.onInput('C1', 'DIM1', units, { x: 50, y: 0 })
    expect(prompt).toBe("Specify dimension line location:")
    
    // Step 1: Specify location
    const result = command.onPoint(50, 0, 'DIM1', units)
    
    expect(result).toBeInstanceOf(Dimension)
    const dim = result as Dimension
    expect(dim.type).toBe('RADIUS')
    expect(dim.x1).toBe(0) // Center
    expect(dim.y1).toBe(0)
    expect(dim.x2).toBe(50) // Boundary point
    expect(dim.y2).toBe(0)
    expect(dim.computeValue()).toBe(50)
    // dimLineLocation should be at 50% of radius (50 * 0.5 = 25)
    expect(dim.dimLineLocation.x).toBeCloseTo(25)
  })

  it('should calculate correct radius when clicking inside the circle', () => {
    const circle = new Circle('C1', 10, 10, 25)
    
    // Step 0: Select circle
    command.setEntity(circle)
    const prompt = command.onInput('C1', 'DIM1', units, { x: 35, y: 10 })
    expect(prompt).toBe("Specify dimension line location:")
    
    // Step 1: Specify location
    const result = command.onPoint(35, 10, 'DIM1', units)
    
    expect(result).toBeInstanceOf(Dimension)
    const dim = result as Dimension
    expect(dim.computeValue()).toBe(25)
    expect(dim.x2).toBe(35) // Point on boundary
    expect(dim.y2).toBe(10)
    // dimLineLocation should be at 50% of radius (25 * 0.5 = 12.5 from center at 10,10)
    expect(dim.dimLineLocation.x).toBeCloseTo(22.5)
  })
})
