import { describe, it, expect } from 'vitest'
import { CoordinateParser } from './CoordinateParser'

const defUnits = { type: 'decimal' as const, precision: 4, scale: 1.0 };
const metricUnits = { type: 'metric' as const, precision: 4, scale: 1.0 };
const archUnits = { type: 'architectural' as const, precision: 4, scale: 1.0 };

describe('CoordinateParser', () => {
  describe('Absolute Coordinates', () => {
    it('should parse simple x,y', () => {
      const res = CoordinateParser.parseCoordinate('100,200', defUnits)
      expect(res).toEqual({ x: 100, y: 200 })
    })

    it('should parse negative values', () => {
      const res = CoordinateParser.parseCoordinate('-10.5, -20.5', defUnits)
      expect(res).toEqual({ x: -10.5, y: -20.5 })
    })
  })

  describe('Relative Cartesian (@dx,dy)', () => {
    it('should parse @dx,dy relative to lastPoint', () => {
      const res = CoordinateParser.parseCoordinate('@10,20', defUnits, { x: 50, y: 50 })
      expect(res).toEqual({ x: 60, y: 70 })
    })

    it('should return null if lastPoint is missing for relative', () => {
      const res = CoordinateParser.parseCoordinate('@10,20', defUnits)
      expect(res).toBeNull()
    })
  })

  describe('Relative Polar (@dist<angle)', () => {
    it('should parse @dist<angle (horizontal right)', () => {
      const res = CoordinateParser.parseCoordinate('@100<0', defUnits, { x: 10, y: 10 })
      expect(res?.x).toBeCloseTo(110)
      expect(res?.y).toBeCloseTo(10)
    })

    it('should parse @dist<angle (vertical up)', () => {
      const res = CoordinateParser.parseCoordinate('@100<90', defUnits, { x: 10, y: 10 })
      expect(res?.x).toBeCloseTo(10)
      expect(res?.y).toBeCloseTo(110)
    })
  })

  describe('Unit Suffixes', () => {
    it('should parse metric suffixes', () => {
      const res = CoordinateParser.parseCoordinate('100mm,200mm', metricUnits)
      expect(res).toEqual({ x: 100, y: 200 })

      const resCm = CoordinateParser.parseCoordinate('10cm,20cm', metricUnits)
      expect(resCm).toEqual({ x: 100, y: 200 })

      const resM = CoordinateParser.parseCoordinate('1m,2m', metricUnits)
      expect(resM).toEqual({ x: 1000, y: 2000 })
    })

    it('should parse architectural suffixes', () => {
      const resIn = CoordinateParser.parseCoordinate('12",24"', archUnits)
      expect(resIn).toEqual({ x: 12, y: 24 })

      const resFt = CoordinateParser.parseCoordinate("1',2'", archUnits)
      expect(resFt).toEqual({ x: 12, y: 24 })
    })

    it('should ignore suffixes in decimal mode', () => {
      const res = CoordinateParser.parseCoordinate('100mm,200mm', defUnits)
      expect(res).toEqual({ x: 100, y: 200 }) // parseFloat ignores mm
    })
  })

  describe('Error Handling', () => {
    it('should return null for non-numeric input', () => {
      expect(CoordinateParser.parseCoordinate('abc,def', defUnits)).toBeNull()
      expect(CoordinateParser.parseCoordinate('@10,abc', defUnits, { x: 0, y: 0 })).toBeNull()
    })

    it('should return null for malformed strings', () => {
      expect(CoordinateParser.parseCoordinate('100', defUnits)).toBeNull()
      expect(CoordinateParser.parseCoordinate('100,,200', defUnits)).toBeNull()
      expect(CoordinateParser.parseCoordinate('@<45', defUnits, { x: 0, y: 0 })).toBeNull()
    })
  })
})
