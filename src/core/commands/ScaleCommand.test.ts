import { describe, it, expect } from 'vitest'
import { ScaleCommand } from './ScaleCommand'
import { CommandAction } from './types'

describe('ScaleCommand', () => {
  it('should transition through selection, base point, and factor', () => {
    const cmd = new ScaleCommand()
    
    // Step 0: Select object
    const res1 = cmd.onInput('L1', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(cmd.step).toBe(1)
    expect(cmd.targetIds).toContain('L1')
    expect(res1).toBe('Base point [Origin(default)/Creation(O)/Center(C)] <0,0,0>:')

    // Step 1: Base point
    const res2 = cmd.onPoint(100, 100, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(cmd.step).toBe(2)
    expect(cmd.basePoint.x).toBe(100)
    expect(cmd.basePoint.y).toBe(100)
    expect(res2).toBe('Scale factor:')

    // Step 2: Scale factor (2.5)
    const res3 = cmd.onInput('2.5', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as CommandAction
    expect(cmd.step).toBe(0)
    expect(res3.action).toBe('scale')
    expect(res3.ids).toContain('L1')
    expect(res3.factor).toBe(2.5)
  })

  it('should calculate factor from vertical mouse movement', () => {
    const cmd = new ScaleCommand(['L1'])
    expect(cmd.step).toBe(1)
    
    cmd.onPoint(0, 0, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) // Base point (0,0)
    const res = cmd.onPoint(0, 10, 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }) as CommandAction // Mouse moved 10 units up
    
    expect(res.action).toBe('scale')
    expect(res.factor).toBe(2.0) // 1.0 + 10 / 10 = 2.0
  })

  it('should default to base point 0,0,0 when pressing Enter', () => {
    const cmd = new ScaleCommand(['L1'])
    expect(cmd.step).toBe(1)
    
    const res2 = cmd.onInput('', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(cmd.step).toBe(2)
    expect(cmd.basePoint.x).toBe(0)
    expect(cmd.basePoint.y).toBe(0)
    expect(res2).toBe('Scale factor:')
  })

  it('should snap to object creation coordinate when entering O', () => {
    const cmd = new ScaleCommand(['S3D1'])
    expect(cmd.step).toBe(1)
    
    // Mock target entity with creationParams
    const mockEntity = {
      id: 'S3D1',
      creationParams: {
        type: 'box',
        params: { x: 50, y: 60, z: 0 }
      }
    }
    const mockDoc = {
      getEntity: (id: string) => id === 'S3D1' ? mockEntity : null
    }
    
    const res2 = cmd.onInput('O', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }, undefined, mockDoc)
    expect(cmd.step).toBe(2)
    expect(cmd.basePoint.x).toBe(50)
    expect(cmd.basePoint.y).toBe(60)
    expect(res2).toBe('Scale factor:')
  })

  it('should snap to solid object center when entering C', () => {
    const cmd = new ScaleCommand(['S3D1'])
    expect(cmd.step).toBe(1)
    
    // Mock target entity with center position properties
    const mockEntity = {
      id: 'S3D1',
      type: 'Solid3D',
      position: { x: 15, y: 25, z: 5 }
    }
    const mockDoc = {
      getEntity: (id: string) => id === 'S3D1' ? mockEntity : null
    }
    
    const res2 = cmd.onInput('c', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 }, undefined, mockDoc)
    expect(cmd.step).toBe(2)
    expect(cmd.basePoint.x).toBe(15)
    expect(cmd.basePoint.y).toBe(25)
    expect(res2).toBe('Scale factor:')
  })

  it('should return correct dynamic input tooltip lines', () => {
    const cmd = new ScaleCommand(['L1'])
    const units = { type: 'decimal' as const, precision: 2, scale: 1.0 }
    
    // Step 1: Base point coordinates
    const lines1 = cmd.getDynamicInput(10, 20, units)
    expect(lines1).toEqual([
      'Specify base point <0,0,0>',
      '[O] Object Creation Coordinate',
      '[C] Center of Object',
      'X: 10.00',
      'Y: 20.00'
    ])
    
    // Set base point to 0,0 and go to Step 2
    cmd.onPoint(0, 0, 'DUMMY', units)
    expect(cmd.step).toBe(2)
    
    // Step 2: Factor based on vertical mouse y = 10
    const lines2 = cmd.getDynamicInput(0, 10, units)
    expect(lines2).toEqual([
      'Factor: 2.00',
      'Move mouse up/down to adjust'
    ])
  })
})
