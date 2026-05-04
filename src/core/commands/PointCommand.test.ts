import { describe, it, expect } from 'vitest'
import { PointCommand } from './PointCommand'
import { Point } from '../model/Point'

describe('PointCommand', () => {
  it('should create a point on onPoint', () => {
    const cmd = new PointCommand()
    const res = cmd.onPoint(10, 20) as Point
    expect(res).toBeInstanceOf(Point)
    expect(res.x).toBe(10)
    expect(res.y).toBe(20)
    expect(res.id).toMatch(/^PT\d+$/)
  })

  it('should finish on exit input', () => {
    const cmd = new PointCommand()
    const res = cmd.onInput('EXIT')
    expect(res).toEqual({ action: 'finish' })
  })
})
