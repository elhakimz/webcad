import { describe, it, expect } from 'vitest'
import { PointCommand } from './PointCommand'
import { Point } from '../model/Point'

describe('PointCommand', () => {
  it('should create a point on onPoint', () => {
    const cmd = new PointCommand()
    const res = cmd.onPoint(10, 20, 'PT1', { type: 'decimal', precision: 2, scale: 1.0 }) as Point
    expect(res).toBeInstanceOf(Point)
    expect(res.x).toBe(10)
    expect(res.y).toBe(20)
    expect(res.id).toBe('PT1')
  })

  it('should finish on exit input', () => {
    const cmd = new PointCommand()
    const res = cmd.onInput('EXIT', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(res).toEqual({ action: 'finish' })
  })
})
