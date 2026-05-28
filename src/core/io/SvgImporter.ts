import { Line }     from '../model/Line'
import { Arc }      from '../model/Arc'
import { Circle }   from '../model/Circle'
import { Polyline } from '../model/Polyline'
import { Ellipse }  from '../model/Ellipse'
import { Entity }   from '../model/Entity'
import { tokenisePath } from './SvgPathParser'

interface Viewport {
  minX: number; minY: number
  vbW:  number; vbH: number    
  physW: number; physH: number  
  scaleX: number; scaleY: number
}

type Mat = [number,number,number,number,number,number]
type ToCad = (svgX: number, svgY: number) => [number, number]

const IDENTITY: Mat = [1,0,0,1,0,0]
const BEZIER_TOL   = 0.5
const BEZIER_DEPTH = 8
const PX_MM = 25.4 / 96

export interface SvgLayer {
  name:     string
  color:    number
  lw:       number
  entities: Entity[]
}

export class SvgImporter {
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

  private parseViewport(svg: SVGSVGElement): Viewport {
    const vbStr = svg.getAttribute('viewBox')?.trim()
    const vb    = vbStr?.split(/[\s,]+/).map(Number) ?? []
    const minX  = vb[0] ?? 0, minY = vb[1] ?? 0
    const vbW   = vb[2] ?? 0, vbH  = vb[3] ?? 0
    const wAttr = svg.getAttribute('width')  ?? `${vbW || 100}px`
    const hAttr = svg.getAttribute('height') ?? `${vbH || 100}px`
    const physW = this.parseLenMM(wAttr)
    const physH = this.parseLenMM(hAttr)
    const effW = vbW || physW / PX_MM
    const effH = vbH || physH / PX_MM
    return { minX, minY, vbW: effW, vbH: effH, physW, physH, scaleX: physW / effW, scaleY: physH / effH }
  }

  private parseLenMM(s: string): number {
    const m = s.trim().match(/^([\d.eE+\-]+)\s*(px|mm|cm|in|pt|pc|em|%)?/)
    if (!m) return parseFloat(s) * PX_MM
    const v = parseFloat(m[1])
    const units: Record<string, number> = { px:PX_MM, mm:1, cm:10, in:25.4, pt:0.3528, pc:4.2333, em:4.2333, '%':1 }
    return v * (units[m[2] ?? 'px'] ?? PX_MM)
  }

  private makeCoordTransform(vp: Viewport): ToCad {
    return (svgX: number, svgY: number): [number, number] => [
      (svgX - vp.minX) * vp.scaleX,
      (vp.physH - (svgY - vp.minY) * vp.scaleY), // Corrected Y-flip to physical height
    ]
  }

  private traverse(el: Element, layers: Map<string, SvgLayer>, toCAD: ToCad, parent: Mat, insideDefs: boolean): void {
    const tag = el.tagName.toLowerCase().replace(/^svg:/, '')
    if (['style','script','title','desc','metadata'].includes(tag)) return
    if (tag === 'defs') {
        for (const child of Array.from(el.children)) this.traverse(child, layers, toCAD, parent, true)
        return
    }
    if (insideDefs && tag !== 'symbol') return
    if (el.getAttribute('display') === 'none' || el.getAttribute('visibility') === 'hidden') return

    const local   = parseTrsf(el.getAttribute('transform') ?? '')
    const trsf    = mulMat(parent, local)
    const applyAll = (x: number, y: number): [number, number] => {
      const [tx, ty] = applyMat(trsf, x, y)
      return toCAD(tx, ty)
    }

    const layerName = this.resolveLayer(el)
    if (!layers.has(layerName)) {
      layers.set(layerName, { name: layerName, color: this.resolveColor(el), lw: this.resolveLineweight(el), entities: [] })
    }
    const layer = layers.get(layerName)!

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
      case 'symbol':
        for (const child of Array.from(el.children)) this.traverse(child, layers, toCAD, trsf, insideDefs)
        return
    }
    layer.entities.push(...newEntities)
  }

  private resolveLayer(el: Element): string {
    let node: Element | null = el.parentElement
    while (node) {
      const tag = node.tagName.toLowerCase().replace(/^svg:/, '')
      if (tag === 'g' || tag === 'layer') {
        const label = node.getAttributeNS('http://www.inkscape.org/namespaces/inkscape', 'label')
        const id    = node.getAttribute('id')
        const name  = label ?? id ?? ''
        if (name && name !== 'svg1' && name !== 'layer0') return name.replace(/[^A-Za-z0-9_\-]/g, '_').toUpperCase()
      }
      node = node.parentElement
    }
    return 'SVG_IMPORT'
  }

  private getStyle(el: Element, prop: string): string {
    const style = el.getAttribute('style') ?? ''
    const m     = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`))
    if (m) return m[1].trim()
    return el.getAttribute(prop) ?? ''
  }

  private resolveColor(el: Element): number {
    const stroke = this.getStyle(el, 'stroke'); const fill = this.getStyle(el, 'fill')
    const raw    = (stroke && stroke !== 'none') ? stroke : fill
    if (!raw) return 7
    const map: Record<string, number> = { red:1,yellow:2,green:3,cyan:4,blue:5,magenta:6,white:7,black:7 }
    return map[raw.toLowerCase()] ?? 7
  }

  private resolveLineweight(el: Element): number {
    const sw = parseFloat(this.getStyle(el, 'stroke-width') ?? '0')
    return isNaN(sw) || sw <= 0 ? -3 : 0.25
  }

  private doLine(el: Element, ap: ToCad): Entity[] {
    const [x1,y1] = ap(getN(el,'x1'), getN(el,'y1')); const [x2,y2] = ap(getN(el,'x2'), getN(el,'y2'))
    const id = `SVG_LINE_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    return (d2(x1,y1,x2,y2) < 1e-10) ? [] : [new Line(id, x1,y1, x2,y2)]
  }

  private doCircle(el: Element, ap: ToCad, trsf: Mat): Entity[] {
    const cx0 = getN(el,'cx'), cy0 = getN(el,'cy'), r0 = getN(el,'r')
    if (r0 <= 0) return []
    const [cx,cy] = ap(cx0, cy0)
    const id = `SVG_CIRCLE_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    return [new Circle(id, cx, cy, r0 * Math.sqrt(Math.abs(trsf[0]*trsf[3] - trsf[1]*trsf[2])))]
  }

  private doEllipse(el: Element, ap: ToCad, trsf: Mat): Entity[] {
    const rx0 = getN(el,'rx'), ry0 = getN(el,'ry')
    if (rx0 <= 0 || ry0 <= 0) return []
    const [cx,cy] = ap(getN(el,'cx'), getN(el,'cy'))
    const scale = Math.sqrt(Math.abs(trsf[0]*trsf[3] - trsf[1]*trsf[2]))
    const id = `SVG_ELLIPSE_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    return [new Ellipse(id, cx, cy, rx0 * scale, 0, ry0/rx0)]
  }

  private doRect(el: Element, ap: ToCad): Entity[] {
    const x=getN(el,'x'), y=getN(el,'y'), w=getN(el,'width'), h=getN(el,'height')
    if (w <= 0 || h <= 0) return []
    const id = `SVG_RECT_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const pl = new Polyline(id, [
        { x: ap(x,y)[0], y: ap(x,y)[1], bulge: 0 }, { x: ap(x+w,y)[0], y: ap(x+w,y)[1], bulge: 0 },
        { x: ap(x+w,y+h)[0], y: ap(x+w,y+h)[1], bulge: 0 }, { x: ap(x,y+h)[0], y: ap(x,y+h)[1], bulge: 0 }
    ], true); return [pl]
  }

  private doPolyline(el: Element, ap: ToCad): Entity[] {
    const pts = this.parsePoints(el.getAttribute('points') ?? '', ap)
    if (pts.length < 2) return []
    const id = `SVG_PLINE_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    return [new Polyline(id, pts, false)]
  }

  private doPolygon(el: Element, ap: ToCad): Entity[] {
    const pts = this.parsePoints(el.getAttribute('points') ?? '', ap)
    if (pts.length < 2) return []
    const id = `SVG_PGON_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    return [new Polyline(id, pts, true)]
  }

  private parsePoints(s: string, ap: ToCad): {x:number,y:number, bulge: 0}[] {
    const nums = s.trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n))
    const out: {x:number,y:number, bulge: 0}[] = []
    for (let i = 0; i < nums.length - 1; i += 2) {
      const [x,y] = ap(nums[i], nums[i+1]); out.push({ x, y, bulge: 0 })
    }
    return out
  }

  private doUse(el: Element, layers: Map<string, SvgLayer>, toCAD: ToCad, trsf: Mat): void {
    const href = el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? ''
    const ref  = el.ownerDocument?.getElementById(href.replace('#', ''))
    if (!ref) return
    const offset: Mat = [1,0,0,1, getN(el,'x'),getN(el,'y')]
    this.traverse(ref, layers, toCAD, mulMat(trsf, offset), false)
  }

  private doPath(el: Element, ap: ToCad, trsf: Mat): Entity[] {
    const d = el.getAttribute('d') ?? ''; if (!d.trim()) return []
    const tokens = tokenisePath(d); const entities: Entity[] = []
    let cx = 0, cy = 0, sx = 0, sy = 0
    let verts: {x:number,y:number, bulge: 0}[] = []
    
    const flush = (close: boolean) => {
      if (verts.length >= 2) {
        const id = `SVG_PATH_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        if (verts.length === 2 && !close) entities.push(new Line(id, verts[0].x,verts[0].y, verts[1].x,verts[1].y))
        else { const pl = new Polyline(id, [...verts], close); entities.push(pl) }
      }
      verts = []
    }
    const addPt = (x: number, y: number) => { const [tx,ty] = ap(x,y); verts.push({x:tx,y:ty, bulge: 0}) }
    
    for (const tok of tokens) {
      const abs = tok.cmd === tok.cmd.toUpperCase(), a = tok.args
      const X = (v: number) => abs ? v : cx+v, Y = (v: number) => abs ? v : cy+v
      switch (tok.cmd.toUpperCase()) {
        case 'M': flush(false); cx=X(a[0]); cy=Y(a[1]); sx=cx; sy=cy; addPt(cx,cy); break
        case 'Z': cx=sx; cy=sy; flush(true); break
        case 'L': cx=X(a[0]); cy=Y(a[1]); addPt(cx,cy); break
        case 'H': cx=abs?a[0]:cx+a[0]; addPt(cx,cy); break
        case 'V': cy=abs?a[0]:cy+a[0]; addPt(cx,cy); break
        case 'C': {
            const x1=X(a[0]),y1=Y(a[1]), x2=X(a[2]),y2=Y(a[3]), ex=X(a[4]),ey=Y(a[5])
            this.subdivideCubic(cx,cy,x1,y1,x2,y2,ex,ey).forEach(([px,py]) => addPt(px,py));
            cx=ex; cy=ey; break
        }
        case 'Q': {
            const x1=X(a[0]),y1=Y(a[1]), ex=X(a[2]),ey=Y(a[3])
            this.subdivideQuad(cx,cy,x1,y1,ex,ey).forEach(([px,py]) => addPt(px,py));
            cx=ex; cy=ey; break
        }
      }
    }
    flush(false); return entities
  }

  private subdivideCubic(p0x:number,p0y:number, p1x:number,p1y:number, p2x:number,p2y:number, p3x:number,p3y:number, depth=0): [number,number][] {
    if (depth>=BEZIER_DEPTH || this.flatnessCubic(p0x,p0y,p1x,p1y,p2x,p2y,p3x,p3y) <= BEZIER_TOL) return [[p3x,p3y]]
    const m01x=(p0x+p1x)/2, m01y=(p0y+p1y)/2, m12x=(p1x+p2x)/2, m12y=(p1y+p2y)/2, m23x=(p2x+p3x)/2, m23y=(p2y+p3y)/2
    const m012x=(m01x+m12x)/2, m012y=(m01y+m12y)/2, m123x=(m12x+m23x)/2, m123y=(m12y+m23y)/2, mx=(m012x+m123x)/2, my=(m012y+m123y)/2
    return [...this.subdivideCubic(p0x,p0y,m01x,m01y,m012x,m012y,mx,my,depth+1), ...this.subdivideCubic(mx,my,m123x,m123y,m23x,m23y,p3x,p3y,depth+1)]
  }

  private subdivideQuad(p0x:number,p0y:number, p1x:number,p1y:number, p2x:number,p2y:number, depth=0): [number,number][] {
    if (depth>=BEZIER_DEPTH || this.flatnessQuad(p0x,p0y,p1x,p1y,p2x,p2y) <= BEZIER_TOL) return [[p2x,p2y]]
    const m01x=(p0x+p1x)/2, m01y=(p0y+p1y)/2, m12x=(p1x+p2x)/2, m12y=(p1y+p2y)/2, mx=(m01x+m12x)/2, my=(m01y+m12y)/2
    return [...this.subdivideQuad(p0x,p0y,m01x,m01y,mx,my,depth+1), ...this.subdivideQuad(mx,my,m12x,m12y,p2x,p2y,depth+1)]
  }

  private flatnessCubic(p0x:number,p0y:number, p1x:number,p1y:number, p2x:number,p2y:number, p3x:number,p3y:number): number {
    const dx=p3x-p0x, dy=p3y-p0y, len=Math.sqrt(dx*dx+dy*dy)
    if(len<1e-10) return Math.sqrt(d2(p0x,p0y,p1x,p1y))+Math.sqrt(d2(p0x,p0y,p2x,p2y))
    const nx=dy/len, ny=-dx/len
    return Math.max(Math.abs((p1x-p0x)*nx+(p1y-p0y)*ny), Math.abs((p2x-p0x)*nx+(p2y-p0y)*ny))
  }

  private flatnessQuad(p0x:number,p0y:number, p1x:number,p1y:number, p2x:number,p2y:number): number {
    const dx=p2x-p0x, dy=p2y-p0y, len=Math.sqrt(dx*dx+dy*dy)
    if(len<1e-10) return Math.sqrt(d2(p0x,p0y,p1x,p1y))
    const nx=dy/len, ny=-dx/len
    return Math.abs((p1x-p0x)*nx+(p1y-p0y)*ny)
  }
}

function d2(x1:number,y1:number,x2:number,y2:number): number { return (x2-x1)**2+(y2-y1)**2 }
function getN(el:Element, attr:string, def=0): number { const v=parseFloat(el.getAttribute(attr)??''); return isNaN(v)?def:v }
function mulMat(A:Mat, B:Mat): Mat { return [A[0]*B[0]+A[2]*B[1], A[1]*B[0]+A[3]*B[1], A[0]*B[2]+A[2]*B[3], A[1]*B[2]+A[3]*B[3], A[0]*B[4]+A[2]*B[5]+A[4], A[1]*B[4]+A[3]*B[5]+A[5]] }
function applyMat(M:Mat, x:number, y:number): [number,number] { return [M[0]*x+M[2]*y+M[4], M[1]*x+M[3]*y+M[5]] }
function parseTrsf(t:string): Mat {
  let R:Mat=[1,0,0,1,0,0]; const re=/(translate|rotate|scale|matrix|skewX|skewY)\s*\(([^)]*)\)/g; let m
  while((m=re.exec(t))!==null) {
    const ns=m[2].trim().split(/[\s,]+/).map(Number); let L:Mat=[1,0,0,1,0,0]
    switch(m[1]) {
      case 'translate': L=[1,0,0,1,ns[0]??0,ns[1]??0]; break
      case 'scale': {const s=ns[0]??1,sy=ns[1]??s; L=[s,0,0,sy,0,0]; break}
      case 'rotate': { const a=(ns[0]??0)*Math.PI/180, c=Math.cos(a), s=Math.sin(a); const px=ns[1]??0, py=ns[2]??0; L=[c,-s,s,c, px-c*px-s*py, py+s*px-c*py]; break }
      case 'matrix': L=ns as Mat; break
      case 'skewX': L=[1,0,Math.tan((ns[0]??0)*Math.PI/180),1,0,0]; break
      case 'skewY': L=[1,Math.tan((ns[0]??0)*Math.PI/180),0,1,0,0]; break
    }
    R=mulMat(R,L)
  }
  return R
}
