/**
 * @vitest-environment jsdom
 */
import { SvgImporter } from '../SvgImporter'
import { Line }        from '../../model/Line'
import { Arc }         from '../../model/Arc'
import { Circle }      from '../../model/Circle'
import { Polyline }    from '../../model/Polyline'
import { describe, test, expect } from 'vitest'

const imp = () => new SvgImporter()

describe('SvgImporter', () => {

  // ── Basic elements ───────────────────────────────────────

  test('imports <line>', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <line x1="10" y1="20" x2="80" y2="70"/>
       </svg>`
    )
    expect(layers).toHaveLength(1)
    const ent = layers[0].entities[0] as Line
    expect(ent).toBeInstanceOf(Line)
    // CAD y is flipped: physH - (svgY * scale)
    // physH = 100, scale = 1.0. 
    // y1: 100 - (20 * 1.0) = 80
    // y2: 100 - (70 * 1.0) = 30
    expect(ent.x1).toBeCloseTo(10)
    expect(ent.y1).toBeCloseTo(80)
    expect(ent.x2).toBeCloseTo(80)
    expect(ent.y2).toBeCloseTo(30)
  })

  test('imports <circle>', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <circle cx="50" cy="50" r="25"/>
       </svg>`
    )
    const ent = layers[0].entities[0] as Circle
    expect(ent).toBeInstanceOf(Circle)
    expect(ent.cx).toBeCloseTo(50)
    expect(ent.cy).toBeCloseTo(50)
    expect(ent.r ).toBeCloseTo(25)
  })

  test('imports <rect> as closed Polyline', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <rect x="10" y="10" width="80" height="60"/>
       </svg>`
    )
    const ent = layers[0].entities[0] as Polyline
    expect(ent).toBeInstanceOf(Polyline)
    expect(ent.closed).toBe(true)
    expect(ent.vertices).toHaveLength(4)
  })

  // ── Path commands ────────────────────────────────────────

  test('path M L produces Line', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <path d="M 10,10 L 90,90"/>
       </svg>`
    )
    const ent = layers[0].entities[0]
    expect(ent).toBeInstanceOf(Line)
  })

  test('path M L L produces Polyline', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <path d="M 0,0 L 50,0 L 50,50"/>
       </svg>`
    )
    const ent = layers[0].entities[0]
    expect(ent).toBeInstanceOf(Polyline)
    expect((ent as Polyline).vertices).toHaveLength(3)
  })

  test('path Z closes Polyline', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <path d="M 0,0 L 100,0 L 100,100 Z"/>
       </svg>`
    )
    const ent = layers[0].entities[0] as Polyline
    expect(ent.closed).toBe(true)
  })

  // ── Transform handling ───────────────────────────────────

  test('translate transform shifts entities', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <g transform="translate(20,30)">
           <line x1="0" y1="0" x2="10" y2="0"/>
         </g>
       </svg>`
    )
    const line = layers[0].entities[0] as Line
    expect(line.x1).toBeCloseTo(20)
  })

  // ── Unit scaling ─────────────────────────────────────────

  test('SVG in mm: 10mm line is 10 CAD units', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <line x1="0" y1="50" x2="10" y2="50"/>
       </svg>`
    )
    const line = layers[0].entities[0] as Line
    expect(Math.abs(line.x2 - line.x1)).toBeCloseTo(10, 1)
  })
})
