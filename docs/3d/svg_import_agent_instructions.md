# Agent Task: SVG Import → Polylines for WebCAD
# Model: Gemini | Framework: Antigravity
# Scope: Complete implementation — importer, command, handler, drag-drop, tests
#
# Read these files BEFORE writing any code:
#   core/commands/types.ts              ← CommandAction type, Entity imports
#   core/commands/IOCommands.ts         ← Pattern for file import commands
#   core/engine/handlers/IOHandler.ts   ← Pattern for file handling
#   core/model/Line.ts                  ← Line(x1,y1,x2,y2) constructor
#   core/model/Arc.ts                   ← Arc fields: cx,cy,r,startAngle,endAngle,ccw
#   core/model/Circle.ts                ← Circle(cx,cy,r)
#   core/model/Polyline.ts              ← Polyline: vertices[{x,y,bulge?}], closed
#   core/model/Ellipse.ts               ← Ellipse fields
#   core/model/Layer.ts                 ← Layer constructor
#   app.ts                              ← drop handler, handleResult pattern

═══════════════════════════════════════════════════════════════
## STEP 1 — Types (modify core/commands/types.ts)
═══════════════════════════════════════════════════════════════

Add to CommandAction.action union:
  'svg_import' | 'svg_import_file' | 'svg_import_done'

Add to CommandAction interface:
  svgFile?: File

═══════════════════════════════════════════════════════════════
## STEP 2 — SvgPathParser.ts (create)
## File: core/io/SvgPathParser.ts
## Purpose: tokenise the SVG path 'd' attribute into a flat
##          list of command tokens ready for the main importer.
═══════════════════════════════════════════════════════════════

export interface PathToken { cmd: string; args: number[] }

// Number of arguments each SVG path command consumes per repetition
const CMD_ARGS: Record<string, number> = {
  M:2,m:2, L:2,l:2, H:1,h:1, V:1,v:1,
  C:6,c:6, S:4,s:4, Q:4,q:4, T:2,t:2,
  A:7,a:7, Z:0,z:0,
}

export function tokenisePath(d: string): PathToken[] {
  const tokens: PathToken[] = []
  let i = 0

  while (i < d.length) {
    skipSep(d, i)  // advance past whitespace/commas (mutates i via object)
    if (i >= d.length) break

    if (!/[MmLlHhVvCcSsQqTtAaZz]/.test(d[i])) { i++; continue }

    const cmd   = d[i++]
    const nArgs = CMD_ARGS[cmd] ?? 0

    if (nArgs === 0) {
      tokens.push({ cmd, args: [] })
      continue
    }

    // Greedily consume arg groups until the next command letter
    while (i < d.length && !/[MmLlHhVvCcSsQqTtAaZz]/.test(d[i].trim() || 'X')) {
      skipSep(d, i)
      if (i >= d.length || /[MmLlHhVvCcSsQqTtAaZz]/.test(d[i])) break

      const args: number[] = []
      let ok = true
      for (let j = 0; j < nArgs; j++) {
        skipSep(d, i)
        if (i >= d.length) { ok = false; break }

        // Arc flags (args 3,4) are single digits 0 or 1
        if ((cmd === 'A' || cmd === 'a') && (j === 3 || j === 4)) {
          args.push(parseInt(d[i++]))
          continue
        }

        const { value, end } = readNumber(d, i)
        if (isNaN(value)) { ok = false; break }
        args.push(value)
        i = end
      }
      if (!ok) break
      tokens.push({ cmd, args })

      // First M becomes implicit L, first m becomes implicit l
      if (cmd === 'M') continue  // next group uses cmd='L'
      if (cmd === 'm') continue  // next group uses cmd='l'
    }
  }

  return tokens
}

function skipSep(d: string, iRef: { i: number }): void {
  while (iRef.i < d.length && /[\s,]/.test(d[iRef.i])) iRef.i++
}

// NOTE: In the actual implementation i is a plain number, not an object.
// The pseudocode uses mutation via closure. In practice pass a {i} box
// or track with a class state. Either pattern is fine.

function readNumber(d: string, start: number): { value: number; end: number } {
  let i = start
  while (i < d.length && /\s/.test(d[i])) i++
  const s = i
  if (d[i] === '+' || d[i] === '-') i++
  while (i < d.length && /[0-9]/.test(d[i])) i++
  if (d[i] === '.') { i++; while (i < d.length && /[0-9]/.test(d[i])) i++ }
  if (d[i] === 'e' || d[i] === 'E') {
    i++
    if (d[i] === '+' || d[i] === '-') i++
    while (i < d.length && /[0-9]/.test(d[i])) i++
  }
  return { value: parseFloat(d.slice(s, i)), end: i }
}

═══════════════════════════════════════════════════════════════
## STEP 3 — SvgImporter.ts (create)
## File: core/io/SvgImporter.ts
═══════════════════════════════════════════════════════════════

import { Line }     from '../model/Line'
import { Arc }      from '../model/Arc'
import { Circle }   from '../model/Circle'
import { Polyline } from '../model/Polyline'
import { Ellipse }  from '../model/Ellipse'
import { Entity }   from '../model/Entity'
import { tokenisePath } from './SvgPathParser'

// ── Internal types ────────────────────────────────────────────

interface Viewport {
  minX: number; minY: number
  vbW:  number; vbH: number    // viewBox dimensions (SVG user units)
  physW: number; physH: number  // physical dimensions in mm
  scaleX: number; scaleY: number
}

// 2×3 affine matrix [a,b,c,d,e,f]:
//   x' = a*x + c*y + e
//   y' = b*x + d*y + f
type Mat = [number,number,number,number,number,number]

// Coordinate transform: SVG user-unit point → CAD mm point
// Applied AFTER all local transforms are accumulated.
type ToCad = (svgX: number, svgY: number) => [number, number]

const IDENTITY: Mat = [1,0,0,1,0,0]

// Adaptive bezier subdivision: max chord height in SVG units
const BEZIER_TOL   = 0.5
const BEZIER_DEPTH = 8

// 96-DPI pixel → mm
const PX_MM = 25.4 / 96

export interface SvgLayer {
  name:     string
  color:    number   // ACI index
  lw:       number   // lineweight in mm (-3 = default)
  entities: Entity[]
}

export class SvgImporter {

  // ── Public API ────────────────────────────────────────────

  async fromFile(file: File): Promise<SvgLayer[]> {
    const text = await file.text()
    return this.fromString(text)
  }

  fromString(svgText: string): SvgLayer[] {
    const dom = new DOMParser().parseFromString(svgText, 'image/svg+xml')
    const svg = dom.querySelector('svg')
    if (!svg) throw new Error('No <svg> root element found')

    const vp  = this.parseViewport(svg)
    const toCAD = this.makeCoordTransform(vp)

    const layers = new Map<string, SvgLayer>()
    this.traverse(svg, layers, toCAD, IDENTITY, false)

    return Array.from(layers.values()).filter(l => l.entities.length > 0)
  }

  // ── Viewport parsing ──────────────────────────────────────

  private parseViewport(svg: SVGSVGElement): Viewport {
    // ViewBox
    const vbStr = svg.getAttribute('viewBox')?.trim()
    const vb    = vbStr?.split(/[\s,]+/).map(Number) ?? []
    const minX  = vb[0] ?? 0, minY = vb[1] ?? 0
    const vbW   = vb[2] ?? 0, vbH  = vb[3] ?? 0

    // Physical dimensions in mm
    const wAttr = svg.getAttribute('width')  ?? `${vbW || 100}px`
    const hAttr = svg.getAttribute('height') ?? `${vbH || 100}px`
    const physW = this.parseLenMM(wAttr)
    const physH = this.parseLenMM(hAttr)

    // Effective viewBox (if no viewBox attribute, use px dimensions)
    const effW = vbW || physW / PX_MM
    const effH = vbH || physH / PX_MM

    return {
      minX, minY,
      vbW: effW, vbH: effH,
      physW, physH,
      scaleX: physW / effW,
      scaleY: physH / effH,
    }
  }

  private parseLenMM(s: string): number {
    const m = s.trim().match(/^([\d.eE+\-]+)\s*(px|mm|cm|in|pt|pc|em|%)?/)
    if (!m) return parseFloat(s) * PX_MM
    const v = parseFloat(m[1])
    const units: Record<string, number> = {
      px:PX_MM, mm:1, cm:10, in:25.4, pt:0.3528, pc:4.2333, em:4.2333, '%':1
    }
    return v * (units[m[2] ?? 'px'] ?? PX_MM)
  }

  // ── Coordinate transform factory ──────────────────────────

  private makeCoordTransform(vp: Viewport): ToCad {
    // SVG: origin top-left, Y down
    // CAD: origin bottom-left, Y up (flip)
    return (svgX: number, svgY: number): [number, number] => [
      (svgX - vp.minX) * vp.scaleX,
      (vp.vbH - (svgY - vp.minY)) * vp.scaleY,
    ]
  }

  // ── DOM tree traversal ────────────────────────────────────

  private traverse(
    el:     Element,
    layers: Map<string, SvgLayer>,
    toCAD:  ToCad,
    parent: Mat,
    insideDefs: boolean,
  ): void {
    // Skip invisible / non-geometry elements
    const tag = el.tagName.toLowerCase().replace(/^svg:/, '')
    if (['defs','symbol','style','script','title','desc','metadata'].includes(tag)) return
    if (el.getAttribute('display') === 'none') return
    if (el.getAttribute('visibility') === 'hidden') return

    // Accumulate transform
    const local   = this.parseTrsf(el.getAttribute('transform') ?? '')
    const trsf    = mulMat(parent, local)

    // Wrapped toCAD that also applies the accumulated SVG transform
    const applyAll = (x: number, y: number): [number, number] => {
      const [tx, ty] = applyMat(trsf, x, y)
      return toCAD(tx, ty)
    }

    // Resolve target layer
    const layerName = this.resolveLayer(el)
    if (!layers.has(layerName)) {
      layers.set(layerName, {
        name:     layerName,
        color:    this.resolveColor(el),
        lw:       this.resolveLineweight(el),
        entities: [],
      })
    }
    const layer = layers.get(layerName)!

    // Dispatch per element type
    let newEntities: Entity[] = []
    switch (tag) {
      case 'line':     newEntities = this.doLine(el, applyAll);     break
      case 'circle':   newEntities = this.doCircle(el, applyAll, trsf); break
      case 'ellipse':  newEntities = this.doEllipse(el, applyAll, trsf); break
      case 'rect':     newEntities = this.doRect(el, applyAll);     break
      case 'polyline': newEntities = this.doPolyline(el, applyAll); break
      case 'polygon':  newEntities = this.doPolygon(el, applyAll);  break
      case 'path':     newEntities = this.doPath(el, applyAll, trsf); break
      case 'use':      this.doUse(el, layers, toCAD, trsf); return
      case 'g':
      case 'svg':
        // Recurse into children — they pick up parent transform
        for (const child of Array.from(el.children)) {
          this.traverse(child, layers, toCAD, trsf, insideDefs)
        }
        return
    }

    layer.entities.push(...newEntities)
  }

  // ── Layer resolution ──────────────────────────────────────

  private resolveLayer(el: Element): string {
    // Walk up to find nearest named <g> (Inkscape layer convention)
    let node: Element | null = el.parentElement
    while (node) {
      const tag = node.tagName.toLowerCase().replace(/^svg:/, '')
      if (tag === 'g' || tag === 'layer') {
        // Inkscape uses inkscape:label; plain SVG uses id
        const label = node.getAttributeNS('http://www.inkscape.org/namespaces/inkscape', 'label')
        const id    = node.getAttribute('id')
        const name  = label ?? id ?? ''
        if (name && name !== 'svg1' && name !== 'layer0') {
          return this.sanitise(name)
        }
      }
      node = node.parentElement
    }
    return 'SVG_IMPORT'
  }

  private sanitise(s: string): string {
    return s.replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 30).toUpperCase() || 'SVG_IMPORT'
  }

  // ── Style resolution helpers ──────────────────────────────

  private getStyle(el: Element, prop: string): string {
    // Inline style attribute takes precedence over presentation attribute
    const style = el.getAttribute('style') ?? ''
    const m     = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`))
    if (m) return m[1].trim()
    return el.getAttribute(prop) ?? ''
  }

  private resolveColor(el: Element): number {
    const stroke = this.getStyle(el, 'stroke')
    const fill   = this.getStyle(el, 'fill')
    const raw    = (stroke && stroke !== 'none') ? stroke : fill
    return this.cssToAci(raw)
  }

  private cssToAci(css: string): number {
    // Map common CSS colors to ACI indices (approximate)
    const map: Record<string, number> = {
      red:'1',yellow:'2',green:'3',cyan:'4',blue:'5',magenta:'6',
      white:'7',black:'7','#ff0000':'1','#ff0':'2','#ffff00':'2',
      '#00ff00':'3','#0f0':'3','#00ffff':'4','#0ff':'4',
      '#0000ff':'5','#00f':'5','#ff00ff':'6','#f0f':'6',
      '#ffffff':'7','#000000':'7','#000':'7','#fff':'7',
    } as any
    const key = css.toLowerCase().replace(/\s/g,'')
    return parseInt(map[key] ?? '7')
  }

  private resolveLineweight(el: Element): number {
    const sw = parseFloat(this.getStyle(el, 'stroke-width') ?? '0')
    if (isNaN(sw) || sw <= 0) return -3   // default
    // SVG stroke-width is in user units → mm via scaleX
    // Snap to nearest standard pen: 0.18, 0.25, 0.35, 0.50, 0.70mm
    const mmVal = sw * PX_MM  // rough approximation
    const pens  = [0.13,0.18,0.20,0.25,0.30,0.35,0.50,0.70,1.00]
    return pens.reduce((prev,cur) =>
      Math.abs(cur-mmVal) < Math.abs(prev-mmVal) ? cur : prev, 0.25)
  }

  // ── Element converters ────────────────────────────────────

  private doLine(el: Element, ap: ToCad): Entity[] {
    const [x1,y1] = ap(getN(el,'x1'), getN(el,'y1'))
    const [x2,y2] = ap(getN(el,'x2'), getN(el,'y2'))
    if (d2(x1,y1,x2,y2) < 1e-10) return []
    return [new Line(x1,y1, x2,y2)]
  }

  private doCircle(el: Element, ap: ToCad, trsf: Mat): Entity[] {
    const cx0 = getN(el,'cx'), cy0 = getN(el,'cy'), r0 = getN(el,'r')
    if (r0 <= 0) return []
    const [cx,cy] = ap(cx0, cy0)
    // Radius: apply uniform scale factor (average X and Y scale)
    const scaleR  = Math.sqrt(Math.abs(trsf[0]*trsf[3] - trsf[1]*trsf[2]))
    return [new Circle(cx, cy, r0 * scaleR)]
  }

  private doEllipse(el: Element, ap: ToCad, trsf: Mat): Entity[] {
    const cx0 = getN(el,'cx'), cy0 = getN(el,'cy')
    const rx0 = getN(el,'rx'), ry0 = getN(el,'ry')
    if (rx0 <= 0 || ry0 <= 0) return []
    const [cx,cy] = ap(cx0, cy0)
    const scale   = Math.sqrt(Math.abs(trsf[0]*trsf[3] - trsf[1]*trsf[2]))

    if (Math.abs(rx0 - ry0) / Math.max(rx0,ry0) < 0.001) {
      return [new Circle(cx, cy, rx0 * scale)]
    }
    // Build Ellipse entity: major axis along X direction (post-transform)
    const rx = rx0 * scale, ry = ry0 * scale
    // Ellipse entity fields: cx,cy, majorX (half-length of major axis in X),
    // majorY (usually 0 for axis-aligned), ratio=ry/rx
    return [new Ellipse(cx, cy, rx, 0, ry/rx)]
  }

  private doRect(el: Element, ap: ToCad): Entity[] {
    const x  = getN(el,'x'),  y  = getN(el,'y')
    const w  = getN(el,'width'), h = getN(el,'height')
    const rxRaw = getN(el,'rx'), ryRaw = getN(el,'ry')
    if (w <= 0 || h <= 0) return []

    const rx = Math.min(Math.abs(rxRaw || ryRaw), w/2)
    const ry = Math.min(Math.abs(ryRaw || rxRaw), h/2)

    if (rx < 1e-6 || ry < 1e-6) {
      // Plain rectangle → 4-vertex closed polyline
      const pl = new Polyline()
      pl.vertices = [
        { x: ap(x,  y  )[0], y: ap(x,  y  )[1] },
        { x: ap(x+w,y  )[0], y: ap(x+w,y  )[1] },
        { x: ap(x+w,y+h)[0], y: ap(x+w,y+h)[1] },
        { x: ap(x,  y+h)[0], y: ap(x,  y+h)[1] },
      ]
      pl.closed = true
      return [pl]
    }

    // Rounded rect: corner arcs tessellated, 8 segments each
    const N    = Math.max(4, Math.ceil(Math.PI/2 / 0.2))
    const pts: {x:number,y:number}[] = []

    // Corner centres and arc start/end angles (SVG Y-down space)
    const corners: [number,number,number,number][] = [
      [x+w-rx, y+ry,    -Math.PI/2, 0       ],  // top-right
      [x+rx,   y+ry,    -Math.PI,   -Math.PI/2], // top-left
      [x+rx,   y+h-ry, -3*Math.PI/2,-Math.PI ], // bottom-left
      [x+w-rx, y+h-ry,  0,   -3*Math.PI/2   ],  // bottom-right — wait: use proper angles
    ]
    // Correct corner data:
    const cornersFixed: [number,number,number,number,number,number][] = [
      [x+rx,   y+ry,   rx,ry, Math.PI,    3*Math.PI/2], // top-left
      [x+w-rx, y+ry,   rx,ry, 3*Math.PI/2, 2*Math.PI ], // top-right
      [x+w-rx, y+h-ry, rx,ry, 0,           Math.PI/2  ], // bottom-right
      [x+rx,   y+h-ry, rx,ry, Math.PI/2,   Math.PI    ], // bottom-left
    ]
    for (const [ccx,ccy,crx,cry,a0,a1] of cornersFixed) {
      for (let i = 0; i <= N; i++) {
        const a  = a0 + (a1-a0)*i/N
        const px = ccx + crx*Math.cos(a)
        const py = ccy + cry*Math.sin(a)
        const [cx_,cy_] = ap(px,py)
        pts.push({ x:cx_, y:cy_ })
      }
    }
    const pl = new Polyline(); pl.vertices = pts; pl.closed = true
    return [pl]
  }

  private doPolyline(el: Element, ap: ToCad): Entity[] {
    const verts = this.parsePoints(el.getAttribute('points') ?? '', ap)
    if (verts.length < 2) return []
    const pl = new Polyline(); pl.vertices = verts; pl.closed = false
    return [pl]
  }

  private doPolygon(el: Element, ap: ToCad): Entity[] {
    const verts = this.parsePoints(el.getAttribute('points') ?? '', ap)
    if (verts.length < 2) return []
    const pl = new Polyline(); pl.vertices = verts; pl.closed = true
    return [pl]
  }

  private parsePoints(s: string, ap: ToCad): {x:number,y:number}[] {
    const nums = s.trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n))
    const out: {x:number,y:number}[] = []
    for (let i = 0; i < nums.length - 1; i += 2) {
      const [x,y] = ap(nums[i], nums[i+1])
      out.push({ x, y })
    }
    return out
  }

  // ── <use> element — flatten the referenced element ────────

  private doUse(el: Element, layers: Map<string, SvgLayer>, toCAD: ToCad, trsf: Mat): void {
    const href = el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? ''
    const id   = href.replace('#', '')
    const ref  = el.ownerDocument?.getElementById(id)
    if (!ref) return

    // Apply <use> translate offset on top of current transform
    const tx = getN(el, 'x'), ty = getN(el, 'y')
    const offset: Mat = [1,0,0,1, tx,ty]
    const combined    = mulMat(trsf, offset)

    this.traverse(ref, layers, toCAD, combined, false)
  }

  // ── Path converter ────────────────────────────────────────

  private doPath(el: Element, ap: ToCad, trsf: Mat): Entity[] {
    const d = el.getAttribute('d') ?? ''; if (!d.trim()) return []
    const tokens   = tokenisePath(d)
    const entities: Entity[] = []

    let cx = 0, cy = 0        // current SVG position
    let sx = 0, sy = 0        // sub-path start
    let prevQCtrl: [number,number] | null = null  // smooth quadratic
    let prevCCtrl: [number,number] | null = null  // smooth cubic

    let verts: {x:number,y:number}[] = []

    const flush = (close: boolean) => {
      if (verts.length >= 2) {
        if (verts.length === 2 && !close) {
          entities.push(new Line(verts[0].x,verts[0].y, verts[1].x,verts[1].y))
        } else {
          const pl = new Polyline()
          pl.vertices = [...verts]
          pl.closed   = close
          entities.push(pl)
        }
      }
      verts = []
    }

    const addPt = (svgX: number, svgY: number) => {
      const [x,y] = ap(svgX, svgY)
      const last  = verts[verts.length-1]
      if (!last || d2(last.x,last.y, x,y) > 1e-8) verts.push({x,y})
    }

    for (const tok of tokens) {
      const abs = tok.cmd === tok.cmd.toUpperCase()
      const a   = tok.args
      const X   = (v: number) => abs ? v : cx+v
      const Y   = (v: number) => abs ? v : cy+v

      switch (tok.cmd.toUpperCase()) {

        case 'M':
          flush(false)
          cx=X(a[0]); cy=Y(a[1]); sx=cx; sy=cy
          addPt(cx,cy)
          prevCCtrl=null; prevQCtrl=null
          break

        case 'Z':
          cx=sx; cy=sy
          flush(true)
          prevCCtrl=null; prevQCtrl=null
          break

        case 'L':
          cx=X(a[0]); cy=Y(a[1])
          addPt(cx,cy); prevCCtrl=null; prevQCtrl=null
          break

        case 'H':
          cx=abs?a[0]:cx+a[0]; addPt(cx,cy)
          prevCCtrl=null; prevQCtrl=null; break

        case 'V':
          cy=abs?a[0]:cy+a[0]; addPt(cx,cy)
          prevCCtrl=null; prevQCtrl=null; break

        case 'C': {
          const x1=X(a[0]),y1=Y(a[1]), x2=X(a[2]),y2=Y(a[3]), ex=X(a[4]),ey=Y(a[5])
          prevCCtrl=[x2,y2]; prevQCtrl=null
          for (const [px,py] of this.subdivideCubic(cx,cy,x1,y1,x2,y2,ex,ey).slice(1))
            addPt(px,py)
          cx=ex; cy=ey; break
        }

        case 'S': {
          const x1=prevCCtrl?2*cx-prevCCtrl[0]:cx, y1=prevCCtrl?2*cy-prevCCtrl[1]:cy
          const x2=X(a[0]),y2=Y(a[1]), ex=X(a[2]),ey=Y(a[3])
          prevCCtrl=[x2,y2]; prevQCtrl=null
          for (const [px,py] of this.subdivideCubic(cx,cy,x1,y1,x2,y2,ex,ey).slice(1))
            addPt(px,py)
          cx=ex; cy=ey; break
        }

        case 'Q': {
          const qx1=X(a[0]),qy1=Y(a[1]), ex=X(a[2]),ey=Y(a[3])
          prevQCtrl=[qx1,qy1]; prevCCtrl=null
          for (const [px,py] of this.tessQuad(cx,cy,qx1,qy1,ex,ey).slice(1))
            addPt(px,py)
          cx=ex; cy=ey; break
        }

        case 'T': {
          const qx1=prevQCtrl?2*cx-prevQCtrl[0]:cx, qy1=prevQCtrl?2*cy-prevQCtrl[1]:cy
          const ex=X(a[0]),ey=Y(a[1])
          prevQCtrl=[qx1,qy1]; prevCCtrl=null
          for (const [px,py] of this.tessQuad(cx,cy,qx1,qy1,ex,ey).slice(1))
            addPt(px,py)
          cx=ex; cy=ey; break
        }

        case 'A': {
          const rx=Math.abs(a[0]), ry=Math.abs(a[1])
          const phi=a[2], laf=a[3]!==0, sf=a[4]!==0
          const ex=X(a[5]), ey=Y(a[6])
          prevCCtrl=null; prevQCtrl=null

          if (rx<1e-6||ry<1e-6 || (Math.abs(cx-ex)<1e-8&&Math.abs(cy-ey)<1e-8)) {
            addPt(ex,ey)  // degenerate — treat as line
          } else if (Math.abs(rx-ry)/Math.max(rx,ry)<0.001 && Math.abs(phi)<0.01) {
            // Circular arc → flush current polyline, emit Arc entity, restart
            flush(false)
            const arc = this.svgArcToCAD(cx,cy, ex,ey, rx, laf, sf, ap, trsf)
            if (arc) entities.push(arc)
            addPt(ex,ey)  // restart polyline from arc end
          } else {
            // Elliptic arc — tessellate
            for (const [px,py] of this.tessEllArc(cx,cy,ex,ey,rx,ry,phi,laf,sf).slice(1))
              addPt(px,py)
          }
          cx=ex; cy=ey; break
        }
      }
    }
    flush(false)
    return entities
  }

  // ── SVG circular arc → WebCAD Arc entity ─────────────────

  private svgArcToCAD(
    x1:number, y1:number, x2:number, y2:number,
    r:number, largeArc:boolean, sweep:boolean,
    ap: ToCad, trsf: Mat,
  ): Arc | null {
    // Endpoint parameterisation → center parameterisation
    // https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes
    if (d2(x1,y1,x2,y2) < 1e-10) return null

    const mx=(x1+x2)/2, my=(y1+y2)/2
    const dx=(x1-x2)/2, dy=(y1-y2)/2
    const d  = dx*dx+dy*dy
    let   rr = r
    if (d > r*r) rr = Math.sqrt(d)   // clamp radius
    const rr2 = rr*rr

    const num  = Math.max(0, rr2*rr2 - rr2*d)
    const denom = rr2*d
    const sq   = denom < 1e-12 ? 0 : Math.sqrt(num/denom)
    const sign = (largeArc !== sweep) ? 1 : -1

    const ccx = mx + sign*sq* rr*dy/rr
    const ccy = my + sign*sq*-rr*dx/rr

    // Angles in SVG (Y-down) space
    const a1  = Math.atan2(y1-ccy, x1-ccx)
    const a2  = Math.atan2(y2-ccy, x2-ccx)

    // After Y-flip: angle_cad = π - angle_svg (because y_cad = -y_svg)
    // Actually: after y_cad = vbH - y_svg, the angular direction reverses.
    // So: start_cad = -a1, end_cad = -a2, and the CCW/CW sense flips.
    const cadStart = normalAngle(-a1)
    const cadEnd   = normalAngle(-a2)
    // In SVG: sweep=true means clockwise (Y-down). After Y-flip, CW→CCW.
    const ccw = sweep

    // Transform centre point
    const [cadCx, cadCy] = ap(ccx, ccy)

    // Scale radius (use determinant of linear part for area-preserving scale)
    const scaleR = Math.sqrt(Math.abs(trsf[0]*trsf[3] - trsf[1]*trsf[2]))

    const arc = new Arc()
    arc.cx         = cadCx
    arc.cy         = cadCy
    arc.r          = rr * scaleR
    arc.startAngle = cadStart
    arc.endAngle   = cadEnd
    arc.ccw        = ccw
    return arc
  }

  // ── Bezier subdivision ────────────────────────────────────

  private subdivideCubic(
    p0x:number,p0y:number, p1x:number,p1y:number,
    p2x:number,p2y:number, p3x:number,p3y:number,
    depth=0,
  ): [number,number][] {
    if (depth>=BEZIER_DEPTH) return [[p3x,p3y]]
    if (this.flatness(p0x,p0y,p1x,p1y,p2x,p2y,p3x,p3y) <= BEZIER_TOL)
      return [[p3x,p3y]]

    const m01x=(p0x+p1x)/2, m01y=(p0y+p1y)/2
    const m12x=(p1x+p2x)/2, m12y=(p1y+p2y)/2
    const m23x=(p2x+p3x)/2, m23y=(p2y+p3y)/2
    const m012x=(m01x+m12x)/2, m012y=(m01y+m12y)/2
    const m123x=(m12x+m23x)/2, m123y=(m12y+m23y)/2
    const mx=(m012x+m123x)/2,  my=(m012y+m123y)/2

    return [
      ...this.subdivideCubic(p0x,p0y,m01x,m01y,m012x,m012y,mx,my,depth+1),
      ...this.subdivideCubic(mx,my,m123x,m123y,m23x,m23y,p3x,p3y,depth+1),
    ]
  }

  private tessQuad(
    p0x:number,p0y:number, p1x:number,p1y:number,
    p2x:number,p2y:number,
  ): [number,number][] {
    // Elevate to cubic
    const c1x=p0x+(2/3)*(p1x-p0x), c1y=p0y+(2/3)*(p1y-p0y)
    const c2x=p2x+(2/3)*(p1x-p2x), c2y=p2y+(2/3)*(p1y-p2y)
    return [[p0x,p0y],...this.subdivideCubic(p0x,p0y,c1x,c1y,c2x,c2y,p2x,p2y)]
  }

  private flatness(p0x:number,p0y:number,p1x:number,p1y:number,
                   p2x:number,p2y:number,p3x:number,p3y:number): number {
    const dx=p3x-p0x, dy=p3y-p0y
    const len=Math.sqrt(dx*dx+dy*dy)
    if(len<1e-10) return Math.sqrt(d2(p0x,p0y,p1x,p1y))+Math.sqrt(d2(p0x,p0y,p2x,p2y))
    const nx=dy/len, ny=-dx/len
    return Math.max(
      Math.abs((p1x-p0x)*nx+(p1y-p0y)*ny),
      Math.abs((p2x-p0x)*nx+(p2y-p0y)*ny),
    )
  }

  // ── Elliptic arc tessellation ─────────────────────────────

  private tessEllArc(
    x1:number,y1:number, x2:number,y2:number,
    rx:number,ry:number, phiDeg:number,
    laf:boolean,sf:boolean,
  ): [number,number][] {
    const phi=phiDeg*Math.PI/180
    const cp=Math.cos(phi), sp=Math.sin(phi)
    const dx=(x1-x2)/2, dy=(y1-y2)/2
    const xp= cp*dx+sp*dy, yp=-sp*dx+cp*dy

    const lam=(xp*xp)/(rx*rx)+(yp*yp)/(ry*ry)
    const rr=lam>1?Math.sqrt(lam):1
    const rX=rx*rr, rY=ry*rr

    const num=Math.max(0,(rX*rX)*(rY*rY)-(rX*rX)*(yp*yp)-(rY*rY)*(xp*xp))
    const den=(rX*rX)*(yp*yp)+(rY*rY)*(xp*xp)
    const sq=den<1e-12?0:Math.sqrt(num/den)
    const sg=(laf!==sf)?1:-1
    const cxp=sg*sq*rX*yp/rY, cyp=-sg*sq*rY*xp/rX
    const ccx=cp*cxp-sp*cyp+(x1+x2)/2, ccy=sp*cxp+cp*cyp+(y1+y2)/2

    const ux=(xp-cxp)/rX, uy=(yp-cyp)/rY
    const vx=(-xp-cxp)/rX, vy=(-yp-cyp)/rY
    let th1=Math.atan2(uy,ux)
    let dth=Math.atan2(vy*ux-vx*uy, vx*ux+vy*uy)
    if(!sf&&dth>0) dth-=Math.PI*2
    if(sf&&dth<0) dth+=Math.PI*2

    const N=Math.max(8, Math.ceil(Math.abs(dth)/0.12))
    const pts:[number,number][]=[]
    for(let i=0;i<=N;i++) {
      const t=th1+dth*i/N
      pts.push([
        cp*rX*Math.cos(t)-sp*rY*Math.sin(t)+ccx,
        sp*rX*Math.cos(t)+cp*rY*Math.sin(t)+ccy,
      ])
    }
    return pts
  }
}

// ── Module-level helpers ──────────────────────────────────────

function d2(x1:number,y1:number,x2:number,y2:number): number {
  return (x2-x1)**2+(y2-y1)**2
}

function getN(el:Element, attr:string, def=0): number {
  const v=parseFloat(el.getAttribute(attr)??'')
  return isNaN(v)?def:v
}

function normalAngle(a:number): number {
  while(a<0) a+=Math.PI*2; while(a>=Math.PI*2) a-=Math.PI*2; return a
}

function mulMat(A:Mat, B:Mat): Mat {
  return [
    A[0]*B[0]+A[2]*B[1], A[1]*B[0]+A[3]*B[1],
    A[0]*B[2]+A[2]*B[3], A[1]*B[2]+A[3]*B[3],
    A[0]*B[4]+A[2]*B[5]+A[4], A[1]*B[4]+A[3]*B[5]+A[5],
  ]
}

function applyMat(M:Mat, x:number, y:number): [number,number] {
  return [M[0]*x+M[2]*y+M[4], M[1]*x+M[3]*y+M[5]]
}

function parseTrsf(t:string): Mat {
  let R:Mat=[1,0,0,1,0,0]
  const re=/(translate|rotate|scale|matrix|skewX|skewY)\s*\(([^)]*)\)/g
  let m:RegExpExecArray|null
  while((m=re.exec(t))!==null) {
    const ns=m[2].trim().split(/[\s,]+/).map(Number)
    let L:Mat=[1,0,0,1,0,0]
    switch(m[1]) {
      case 'translate': L=[1,0,0,1,ns[0]??0,ns[1]??0]; break
      case 'scale': {const s=ns[0]??1,sy=ns[1]??s; L=[s,0,0,sy,0,0]; break}
      case 'rotate': {
        const a=(ns[0]??0)*Math.PI/180, c=Math.cos(a), s=Math.sin(a)
        const px=ns[1]??0, py=ns[2]??0
        L=[c,-s,s,c, px-c*px-s*py, py+s*px-c*py]; break
      }
      case 'matrix': L=ns as Mat; break
      case 'skewX': L=[1,0,Math.tan((ns[0]??0)*Math.PI/180),1,0,0]; break
      case 'skewY': L=[1,Math.tan((ns[0]??0)*Math.PI/180),0,1,0,0]; break
    }
    R=mulMat(R,L)
  }
  return R
}

═══════════════════════════════════════════════════════════════
## STEP 4 — SvgImportCommand.ts (create)
## File: core/commands/SvgImportCommand.ts
═══════════════════════════════════════════════════════════════

import { Command, CommandAction, CommandResponse } from './types'
import { UnitsConfig } from '../model/Document'

export class SvgImportCommand implements Command {
  getPrompt() { return 'SVGIMPORT — press Enter to pick file:' }

  onInput(text:string, id:string, _u:UnitsConfig): CommandResponse|undefined {
    return { action:'svg_import' } as CommandAction
  }
  onPoint(): CommandResponse {
    return { action:'svg_import' } as CommandAction
  }
}

// Add to CommandManager registry:
// ['SVGIMPORT', () => new SvgImportCommand()],
// ['ISVG',      () => new SvgImportCommand()],

═══════════════════════════════════════════════════════════════
## STEP 5 — SvgImportHandler.ts (create)
## File: core/engine/handlers/SvgImportHandler.ts
═══════════════════════════════════════════════════════════════

import { ActionHandler, AppContext }       from './types'
import { CommandAction, CommandResponse }  from '../../commands/types'
import { SvgImporter }                    from '../../io/SvgImporter'

export class SvgImportHandler implements ActionHandler {
  canHandle(action:CommandAction): boolean {
    return action.action==='svg_import' || action.action==='svg_import_file'
  }

  async handle(action:CommandAction, ctx:AppContext): Promise<CommandResponse|undefined> {
    const { doc, viewer, addEntity } = ctx

    let file: File | null = null

    if (action.action === 'svg_import') {
      file = await pickFile()
      if (!file) return 'SVG import cancelled.'
    } else {
      file = (action as any).svgFile ?? null
      if (!file) return 'SVG import: no file provided.'
    }

    let svgLayers: Awaited<ReturnType<SvgImporter['fromFile']>>
    try {
      svgLayers = await new SvgImporter().fromFile(file)
    } catch (e:any) {
      return `SVG import failed: ${e.message}`
    }

    const totalEntities = svgLayers.reduce((n,l) => n+l.entities.length, 0)
    if (totalEntities === 0) return 'SVG import: no geometry found.'

    // Batch add — one undo record for the entire import
    doc.startTransaction?.('svg_import')

    for (const svgLayer of svgLayers) {
      // Ensure layer exists
      if (!doc.layers.getLayer(svgLayer.name)) {
        doc.layers.createLayer(svgLayer.name, svgLayer.color, 'CONTINUOUS', svgLayer.lw)
      }
      for (const entity of svgLayer.entities) {
        entity.layer = svgLayer.name
        addEntity(entity, false, false)
      }
    }

    doc.commitTransaction?.()
    ctx.syncFromDocument()
    viewer.zoomExtents?.()

    const layerNames = svgLayers.map(l=>l.name).join(', ')
    return `SVG import: ${totalEntities} entities on ${layerNames} (from '${file.name}')`
  }
}

async function pickFile(): Promise<File|null> {
  return new Promise(res => {
    const inp = document.createElement('input')
    inp.type='file'; inp.accept='.svg,image/svg+xml'
    inp.onchange = () => res(inp.files?.[0]??null)
    inp.click()
    setTimeout(()=>res(null), 60_000)   // timeout safeguard
  })
}

═══════════════════════════════════════════════════════════════
## STEP 6 — Register in app.ts
═══════════════════════════════════════════════════════════════

// Import at top of app.ts:
import { SvgImportHandler } from './core/engine/handlers/SvgImportHandler'
import { SvgImporter }      from './core/io/SvgImporter'

// Register handler (near other registerHandler calls):
this.dispatcher.registerHandler(new SvgImportHandler())

// Drag-drop for .svg files (add to existing drop listener):
canvas.addEventListener('dragover', e => { e.preventDefault() })
canvas.addEventListener('drop', async e => {
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (!file) return
  if (file.name.toLowerCase().endsWith('.svg') || file.type==='image/svg+xml') {
    await this.handleResult({ action:'svg_import_file', svgFile:file } as any)
    return
  }
  // ... existing DXF / other drop handlers
})

═══════════════════════════════════════════════════════════════
## STEP 7 — Tests (create)
## File: core/io/__tests__/SvgImporter.test.ts
═══════════════════════════════════════════════════════════════

import { SvgImporter } from '../SvgImporter'
import { Line }        from '../../model/Line'
import { Arc }         from '../../model/Arc'
import { Circle }      from '../../model/Circle'
import { Polyline }    from '../../model/Polyline'

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
    // Y is flipped: CAD y = (100-svg_y) * 1mm
    expect(ent.x1).toBeCloseTo(10)
    expect(ent.y1).toBeCloseTo(80)   // 100-20
    expect(ent.x2).toBeCloseTo(80)
    expect(ent.y2).toBeCloseTo(30)   // 100-70
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

  test('imports <polyline> as open Polyline', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <polyline points="0,0 50,50 100,0"/>
       </svg>`
    )
    const ent = layers[0].entities[0] as Polyline
    expect(ent).toBeInstanceOf(Polyline)
    expect(ent.closed).toBe(false)
    expect(ent.vertices).toHaveLength(3)
  })

  test('imports <polygon> as closed Polyline', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <polygon points="50,0 100,100 0,100"/>
       </svg>`
    )
    const ent = layers[0].entities[0] as Polyline
    expect(ent.closed).toBe(true)
    expect(ent.vertices).toHaveLength(3)
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

  test('circular arc A becomes Arc entity', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <path d="M 0,50 A 50,50 0 0 1 100,50"/>
       </svg>`
    )
    const arcs = layers[0].entities.filter(e => e instanceof Arc)
    expect(arcs.length).toBeGreaterThan(0)
    const arc = arcs[0] as Arc
    expect(arc.r).toBeCloseTo(50, 0)
  })

  test('cubic bezier C produces Polyline with >2 vertices', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <path d="M 0,50 C 0,0 100,0 100,50"/>
       </svg>`
    )
    const pl = layers[0].entities[0] as Polyline
    expect(pl).toBeInstanceOf(Polyline)
    expect(pl.vertices.length).toBeGreaterThan(3)
  })

  test('quadratic bezier Q tessellates', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <path d="M 0,100 Q 50,0 100,100"/>
       </svg>`
    )
    const pl = layers[0].entities[0] as Polyline
    expect(pl.vertices.length).toBeGreaterThan(2)
  })

  test('relative commands l h v work correctly', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <path d="M 10,10 l 50,0 h 10 v 20 Z"/>
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

  test('rotate transform rotates entities', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <g transform="rotate(90,50,50)">
           <line x1="50" y1="50" x2="70" y2="50"/>
         </g>
       </svg>`
    )
    const line = layers[0].entities[0] as Line
    // After 90° rotation around (50,50) in SVG, point (70,50) → (50,30) in SVG
    // Then Y-flip in CAD
    expect(line).toBeInstanceOf(Line)
  })

  test('matrix transform applied', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 200 200" width="200mm" height="200mm">
         <g transform="matrix(1,0,0,1,100,100)">
           <line x1="0" y1="0" x2="10" y2="0"/>
         </g>
       </svg>`
    )
    const line = layers[0].entities[0] as Line
    expect(line.x1).toBeCloseTo(100)
  })

  // ── Layer detection ──────────────────────────────────────

  test('Inkscape layers become separate SvgLayers', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm"
            xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
         <g inkscape:label="VISIBLE" id="layer1">
           <circle cx="20" cy="20" r="10"/>
         </g>
         <g inkscape:label="HIDDEN" id="layer2">
           <circle cx="80" cy="80" r="5"/>
         </g>
       </svg>`
    )
    expect(layers).toHaveLength(2)
    expect(layers.map(l=>l.name)).toContain('VISIBLE')
    expect(layers.map(l=>l.name)).toContain('HIDDEN')
  })

  test('ungrouped elements go to SVG_IMPORT layer', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <circle cx="50" cy="50" r="20"/>
       </svg>`
    )
    expect(layers[0].name).toBe('SVG_IMPORT')
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

  test('SVG in cm: viewBox units scaled to mm', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 10 10" width="10cm" height="10cm">
         <line x1="0" y1="5" x2="1" y2="5"/>
       </svg>`
    )
    const line = layers[0].entities[0] as Line
    // 1 viewBox unit = 10cm/10 = 1cm = 10mm
    expect(Math.abs(line.x2 - line.x1)).toBeCloseTo(10, 1)
  })

  // ── Edge cases ───────────────────────────────────────────

  test('zero-length line is skipped', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <line x1="10" y1="10" x2="10" y2="10"/>
       </svg>`
    )
    expect(layers[0]?.entities ?? []).toHaveLength(0)
  })

  test('empty path produces no entities', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <path d=""/>
       </svg>`
    )
    expect(layers[0]?.entities ?? []).toHaveLength(0)
  })

  test('multiple M commands produce separate entities', () => {
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <path d="M 0,0 L 50,0 M 60,0 L 100,0"/>
       </svg>`
    )
    // Two separate line/polyline entities
    expect(layers[0].entities).toHaveLength(2)
  })

  test('degenerate arc treated as line', () => {
    // Arc with same start/end point
    const layers = imp().fromString(
      `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
         <path d="M 50,50 A 10,10 0 0 1 50,50"/>
       </svg>`
    )
    // Should produce nothing or just a point (filtered)
    // No crash is the main requirement
    expect(layers.length).toBeGreaterThanOrEqual(0)
  })
})

═══════════════════════════════════════════════════════════════
## ACCEPTANCE CRITERIA
═══════════════════════════════════════════════════════════════

□ Drag .svg file onto canvas → entities appear in viewport
□ SVGIMPORT command → file picker → entities appear
□ All test suite passes: npm test SvgImporter
□ Inkscape SVG with named layers → one CAD layer per group
□ SVG with transforms (translate, rotate, matrix) → correct positions
□ Circular arc path 'A' → Arc entity (not polyline)
□ Bezier curves → smooth polyline (no visible faceting at normal zoom)
□ SVG in mm → 1:1 mapping to CAD mm units
□ SVG in cm/in → scaled to mm correctly
□ Empty/degenerate geometry → no crash, no zero-length entities
□ All new entities on their SVG layer visible in layer panel
□ Undo removes all imported entities in one step
□ TypeScript: tsc --noEmit passes (no type errors)

═══════════════════════════════════════════════════════════════
## KNOWN LIMITATIONS (do NOT implement — document only)
═══════════════════════════════════════════════════════════════

- <text> elements: ignored (no font outline extraction)
- <image> embedded rasters: ignored
- CSS class-based styles (.myClass { stroke: red }): parsed for
  inline style="" only; external/class stylesheets are ignored
- Gradient/pattern fills: colour approximated, pattern geometry ignored
- clip-path and mask: ignored (no clipping in CAD space)
- SVG animations (<animate>, <animateTransform>): ignored
- <symbol> referenced by <use>: supported only if defined in same file
- 2D boolean (difference of two <path> shapes inside same group):
  both paths imported as-is; no 2D clipping performed
