import { describe, it, expect } from 'vitest'
import { CoordinateParser } from './CoordinateParser'

describe('CoordinateParser', () => {
  describe('Absolute Coordinates', () => {
    it('should parse simple x,y', () => {
      const res = CoordinateParser.parseCoordinate('100,200')
      expect(res).toEqual({ x: 100, y: 200 })
    })

    it('should parse negative values', () => {
      const res = CoordinateParser.parseCoordinate('-10.5, -20.5')
      expect(res).toEqual({ x: -10.5, y: -20.5 })
    })
  })

  describe('Relative Cartesian (@dx,dy)', () => {
    it('should parse @dx,dy relative to lastPoint', () => {
      const res = CoordinateParser.parseCoordinate('@10,20', { x: 50, y: 50 })
      expect(res).toEqual({ x: 60, y: 70 })
    })

    it('should return null if lastPoint is missing for relative', () => {
      const res = CoordinateParser.parseCoordinate('@10,20')
      expect(res).toBeNull()
    })
  })

  describe('Relative Polar (@dist<angle)', () => {
    it('should parse @dist<angle (horizontal right)', () => {
      const res = CoordinateParser.parseCoordinate('@100<0', { x: 10, y: 10 })
      expect(res?.x).toBeCloseTo(110)
      expect(res?.y).toBeCloseTo(10)
    })

    it('should parse @dist<angle (vertical up)', () => {
      const res = CoordinateParser.parseCoordinate('@100<90', { x: 10, y: 10 })
      expect(res?.x).toBeCloseTo(10)
      expect(res?.y).toBeCloseTo(110)
    })

    it('should parse @dist<angle (45 degrees)', () => {
      const res = CoordinateParser.parseCoordinate('@100<45', { x: 0, y: 0 })
      const expected = 100 * Math.cos(Math.PI / 4)
      expect(res?.x).toBeCloseTo(expected)
      expect(res?.y).toBeCloseTo(expected)
    })
  })

  describe('Error Handling', () => {
    it('should return null for non-numeric input', () => {
      expect(CoordinateParser.parseCoordinate('abc,def')).toBeNull()
      expect(CoordinateParser.parseCoordinate('@10,abc')).toBeNull()
    })

    it('should return null for malformed strings', () => {
      expect(CoordinateParser.parseCoordinate('100')).toBeNull()
      expect(CoordinateParser.parseCoordinate('100,,200')).toBeNull()
      expect(CoordinateParser.parseCoordinate('@<45')).toBeNull()
    })
  })
})
