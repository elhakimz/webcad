import { describe, it, expect } from 'vitest'
import { ConeCommand } from './ConeCommand'
import { Circle } from '../model/Circle'
import { Line } from '../model/Line'

describe('ConeCommand', () => {
  it('should transition through state steps correctly', () => {
    const cmd = new ConeCommand()
    const units = { type: 'decimal' as const, precision: 2, scale: 1.0 }

    // Step 0 -> Step 1 (Specify center)
    const res0 = cmd.onPoint(10, 20, 'entity_1', units, null, 5)
    expect(cmd.step).toBe(1)
    expect(cmd.center).toEqual({ x: 10, y: 20, z: 5 })
    expect(res0).toContain('Specify base radius:')

    // Step 1 -> Step 2 (Specify base radius)
    const res1 = cmd.onPoint(20, 20, 'entity_1', units)
    expect(cmd.step).toBe(2)
    expect(cmd.radius).toBeCloseTo(10)
    expect(res1).toContain('Specify height')

    // Step 2 -> Step 3 (Specify height)
    const res2 = cmd.onPoint(20, 50, 'entity_1', units)
    expect(cmd.step).toBe(3)
    expect(cmd.height).toBeCloseTo(30)
    expect(res2).toContain('Specify top radius')
  })

  it('should accept keyboard inputs at each step', () => {
    const cmd = new ConeCommand()
    const units = { type: 'decimal' as const, precision: 2, scale: 1.0 }

    cmd.onPoint(0, 0, 'entity_1', units, null, 0)
    expect(cmd.step).toBe(1)

    // Input base radius R1
    cmd.onInput('15', 'entity_1', units)
    expect(cmd.step).toBe(2)
    expect(cmd.radius).toBe(15)

    // Input height H
    cmd.onInput('40', 'entity_1', units)
    expect(cmd.step).toBe(3)
    expect(cmd.height).toBe(40)
  })

  it('should generate correct preview entities at each step', () => {
    const cmd = new ConeCommand()
    const units = { type: 'decimal' as const, precision: 2, scale: 1.0 }

    cmd.onPoint(0, 0, 'entity_1', units, null, 10)

    // Step 1 Preview: Bottom circle only
    const prev1 = cmd.getPreview(5, 0, units) as Circle
    expect(prev1).toBeInstanceOf(Circle)
    expect(prev1.r).toBe(5)
    expect(prev1.elevation).toBe(10)

    // Transition to Step 2
    cmd.onPoint(5, 0, 'entity_1', units)

    // Step 2 Preview: Bottom circle + 4 lines to apex
    const prev2 = cmd.getPreview(5, 12, units) as any
    expect(prev2.type).toBe('entities')
    expect(prev2.entities.length).toBe(5) // 1 circle + 4 lines
    expect(prev2.entities[0]).toBeInstanceOf(Circle)
    expect(prev2.entities[1]).toBeInstanceOf(Line)
    expect(prev2.entities[1].x1).toBe(5) // cx + r
    expect(prev2.entities[1].elevation).toBe(10) // elevation z
    expect(prev2.entities[1].thickness).toBe(12) // height h

    // Transition to Step 3
    cmd.onPoint(5, 12, 'entity_1', units)

    // Step 3 Preview: Bottom circle + Top circle + 4 slanted lines
    const prev3 = cmd.getPreview(3, 0, units) as any
    expect(prev3.type).toBe('entities')
    expect(prev3.entities.length).toBe(6) // 2 circles + 4 lines
    expect(prev3.entities[0]).toBeInstanceOf(Circle) // bottom circle (R = 5)
    expect(prev3.entities[0].r).toBe(5)
    expect(prev3.entities[1]).toBeInstanceOf(Circle) // top circle (R = 3)
    expect(prev3.entities[1].r).toBe(3)
    expect(prev3.entities[1].elevation).toBe(22) // elevation 10 + height 12
    expect(prev3.entities[2]).toBeInstanceOf(Line) // slanted line
    expect(prev3.entities[2].x1).toBe(5) // cx + r1
    expect(prev3.entities[2].x2).toBe(3) // cx + r2
  })

  it('should provide informative dynamic input cues', () => {
    const cmd = new ConeCommand()
    const units = { type: 'decimal' as const, precision: 2, scale: 1.0 }

    expect(cmd.getDynamicInput(1.5, 2.5, units)).toEqual(['X: Distance: 1.50', 'Y: Distance: 2.50'])

    cmd.onPoint(0, 0, 'entity_1', units)
    expect(cmd.getDynamicInput(0, 8, units)).toEqual(['R1: Distance: 8.00 (enter value)'])

    cmd.onPoint(0, 8, 'entity_1', units)
    expect(cmd.getDynamicInput(0, 15, units)).toEqual(['H: Distance: 15.00 (enter value)'])

    cmd.onPoint(0, 15, 'entity_1', units)
    expect(cmd.getDynamicInput(4, 0, units)).toEqual(['R2: Distance: 4.00 (enter value or press ENTER for 0)'])
  })
})
