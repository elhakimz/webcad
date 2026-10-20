# PLOT Command — Pseudocode
# Integrates with: IDocument, LayerManager, Entity.getBoundingBox(),
#                  aciToRgb(), FormatUtils, CommandRegistry

═══════════════════════════════════════════════════════════════
## 1. DATA MODELS
═══════════════════════════════════════════════════════════════

─── PaperSize ──────────────────────────────────────────────────
ENUM PaperSize:
  A4   = { width: 297,  height: 210,  label: "A4"   }   // mm landscape
  A3   = { width: 420,  height: 297,  label: "A3"   }
  A2   = { width: 594,  height: 420,  label: "A2"   }
  A1   = { width: 841,  height: 594,  label: "A1"   }
  A0   = { width: 1189, height: 841,  label: "A0"   }
  LTR  = { width: 279,  height: 216,  label: "Letter" }  // mm
  TBLD = { width: 432,  height: 279,  label: "Tabloid"}
  CUST = { width: 0,    height: 0,    label: "Custom"}

─── PlotArea ───────────────────────────────────────────────────
ENUM PlotAreaType:
  DISPLAY    // current viewport frustum — what user sees now
  EXTENTS    // BBox of all visible, non-frozen entities
  WINDOW     // user picks two corners interactively
  LIMITS     // defined drawing limits (future: $LIMMIN/$LIMMAX)

STRUCT PlotArea:
  type: PlotAreaType
  window?: { x1, y1, x2, y2 }    // only for WINDOW type

─── PlotScale ──────────────────────────────────────────────────
STRUCT PlotScale:
  label:    string      // "1:100", "1/4\"=1'", "Fit"
  drawUnit: number      // drawing units per...
  paperMM:  number      // ...paper mm
  isFit:    boolean     // auto-calculate to fill paper

PREDEFINED_SCALES = [
  { label: "Fit",       isFit: true  },
  { label: "1:1",       drawUnit: 1,    paperMM: 1    },
  { label: "1:2",       drawUnit: 2,    paperMM: 1    },
  { label: "1:5",       drawUnit: 5,    paperMM: 1    },
  { label: "1:10",      drawUnit: 10,   paperMM: 1    },
  { label: "1:20",      drawUnit: 20,   paperMM: 1    },
  { label: "1:50",      drawUnit: 50,   paperMM: 1    },
  { label: "1:100",     drawUnit: 100,  paperMM: 1    },
  { label: "1:200",     drawUnit: 200,  paperMM: 1    },
  { label: "1:500",     drawUnit: 500,  paperMM: 1    },
  { label: "1:1000",    drawUnit: 1000, paperMM: 1    },
  // Architectural (when units = architectural)
  { label: "1/4\"=1'",  drawUnit: 48,   paperMM: 1    },
  { label: "1/8\"=1'",  drawUnit: 96,   paperMM: 1    },
  { label: "1\"=10'",   drawUnit: 120,  paperMM: 1    },
]

─── PlotStyle ──────────────────────────────────────────────────
ENUM PlotColorMode:
  AS_DISPLAYED   // use entity/layer ACI color → RGB
  MONOCHROME     // all entities plot black
  GRAYSCALE      // ACI color → grayscale equivalent

STRUCT LineweightTable:
  // Maps ACI color index to plot lineweight in mm
  // Default CTB-style mapping (AutoCAD default)
  default: 0.18mm
  overrides: Map<aciColor, mm>
  // Common: color 1 (red)=0.35, color 2 (yellow)=0.25,
  //         color 5 (blue)=0.50, color 7 (white/black)=0.18

STRUCT PlotStyle:
  colorMode:       PlotColorMode
  lineweightTable: LineweightTable
  plotHiddenLines: boolean     // future: for 3D hidden-line
  paperBackground: boolean     // white background on paper

─── PlotOffset ─────────────────────────────────────────────────
STRUCT PlotOffset:
  x: number        // mm from paper left edge
  y: number        // mm from paper bottom edge
  centered: boolean  // if true, compute offset automatically

─── PlotSettings (main settings object) ────────────────────────
STRUCT PlotSettings:
  paperSize:    PaperSize
  orientation:  'portrait' | 'landscape'
  area:         PlotArea
  scale:        PlotScale
  offset:       PlotOffset
  style:        PlotStyle
  outputFormat: 'svg' | 'pdf' | 'png' | 'print'
  dpi:          number        // for raster output (default 300)
  layerOverrides: Map<layerName, { visible, color, lineweight }>
  plotLayers:   'all_visible' | 'all' | string[]  // which layers to plot

─── PlotResult ─────────────────────────────────────────────────
STRUCT PlotResult:
  success:     boolean
  error?:      string
  svgString?:  string
  pdfBlob?:    Blob
  pngBlob?:    Blob
  warnings:    string[]   // e.g. "Layer 'HATCH' is frozen and was skipped"

═══════════════════════════════════════════════════════════════
## 2. PLOT COMMAND (Command interface — follows existing pattern)
═══════════════════════════════════════════════════════════════

CLASS PlotCommand IMPLEMENTS Command:
  step = 0
  // Stores partial settings during interactive window pick
  private windowP1: Point | null = null
  private pendingSettings: PlotSettings | null = null

  getPrompt():
    IF step === 0: RETURN "PLOT - Press Enter to open plot dialog, or pick first corner for window plot:"
    IF step === 1: RETURN "Other corner of plot window:"

  // Entry: Enter → open dialog immediately
  onInput(text, id, units, doc):
    IF step === 0 AND text === "":
      RETURN { action: "plot_dialog" }          // → ResultDispatcher opens PlotDialog

    IF step === 0 AND text === "WINDOW":
      step = 1
      RETURN "Pick first corner of plot window:"

    IF step === 0 AND text.startsWith("?"):
      RETURN listPlotSettings()                 // prints current defaults

    RETURN undefined

  // Window pick mode
  onPoint(x, y, id, units, doc):
    IF step === 1:
      windowP1 = { x, y }
      step = 2
      RETURN "Other corner:"

    IF step === 2:
      x1 = min(windowP1.x, x), y1 = min(windowP1.y, y)
      x2 = max(windowP1.x, x), y2 = max(windowP1.y, y)
      IF (x2 - x1 < 0.001 OR y2 - y1 < 0.001):
        RETURN "Window too small, pick again:"
      settings = getDefaultSettings()
      settings.area = { type: WINDOW, window: { x1, y1, x2, y2 } }
      RETURN { action: "plot_execute", settings }

  getPreview(x, y, units):
    IF step === 2 AND windowP1:
      RETURN selection_box_preview(windowP1, { x, y })   // dashed rectangle
    RETURN null

  private getDefaultSettings(): PlotSettings:
    // Pull from app's stored last-used settings (persist in localStorage)
    RETURN lastUsedSettings ?? DEFAULT_PLOT_SETTINGS

═══════════════════════════════════════════════════════════════
## 3. PLOT ENGINE (core computation — no rendering)
═══════════════════════════════════════════════════════════════

CLASS PlotEngine:

  ─── computePlotViewport ────────────────────────────────────
  // Returns the drawing-space bounding box to plot
  computePlotViewport(settings: PlotSettings, doc: IDocument,
                      currentViewCamera: OrthographicCamera): BoundingBox

    SWITCH settings.area.type:

      CASE DISPLAY:
        // Use current camera frustum
        halfW = cameraWidth  / camera.zoom / 2
        halfH = cameraHeight / camera.zoom / 2
        cx = camera.position.x
        cy = camera.position.y
        RETURN { minX: cx-halfW, minY: cy-halfH,
                 maxX: cx+halfW, maxY: cy+halfY }

      CASE EXTENTS:
        // Union of all plottable entity bounding boxes
        plottable = getPlottableEntities(settings, doc)
        IF plottable.isEmpty:
          THROW PlotError("No visible entities to plot")
        RETURN unionBoundingBoxes(plottable.map(e => e.getBoundingBox()))
        // Add 2% margin on each side
        margin = max(width, height) * 0.02
        RETURN expandBoundingBox(union, margin)

      CASE WINDOW:
        RETURN settings.area.window

      CASE LIMITS:
        RETURN { minX: doc.limits.minX, minY: doc.limits.minY,
                 maxX: doc.limits.maxX, maxY: doc.limits.maxY }

  ─── computeScale ───────────────────────────────────────────
  // Returns final pixels-per-drawing-unit for the render
  computeScale(settings: PlotSettings, viewport: BoundingBox): number

    paperW_mm = effectivePaperWidth(settings)   // minus margins
    paperH_mm = effectivePaperHeight(settings)

    drawW = viewport.maxX - viewport.minX        // drawing units
    drawH = viewport.maxY - viewport.minY

    IF settings.scale.isFit:
      scaleX = paperW_mm / drawW    // mm per drawing unit
      scaleY = paperH_mm / drawH
      RETURN min(scaleX, scaleY)    // fit without stretching

    ELSE:
      // e.g. 1:100 → 1 paper mm = 100 drawing units
      RETURN settings.scale.paperMM / settings.scale.drawUnit

  ─── computeOffset ──────────────────────────────────────────
  computeOffset(settings, viewport, scale, paperW, paperH): { ox, oy }

    plotW_mm = (viewport.maxX - viewport.minX) * scale
    plotH_mm = (viewport.maxY - viewport.minY) * scale

    IF settings.offset.centered:
      ox = (paperW - plotW_mm) / 2
      oy = (paperH - plotH_mm) / 2
    ELSE:
      ox = settings.offset.x
      oy = settings.offset.y
    RETURN { ox, oy }

  ─── getPlottableEntities ───────────────────────────────────
  // Respects layer visibility, frozen, plot overrides
  getPlottableEntities(settings: PlotSettings, doc: IDocument): Entity[]

    RETURN doc.getAllEntities().filter(entity =>
      layer = doc.layers.getLayer(entity.layer)

      // Base layer state
      IF NOT layer: RETURN true            // unknown layer → plot it
      IF layer.isFrozen: RETURN false      // frozen → never plotted
      IF NOT layer.isVisible: RETURN false // hidden → never plotted

      // Per-plot layer override
      IF settings.plotLayers === 'all':
        RETURN true
      IF settings.plotLayers === 'all_visible':
        RETURN layer.isVisible AND NOT layer.isFrozen
      IF array settings.plotLayers:
        RETURN entity.layer IN settings.plotLayers

      // Layer-level plot override
      override = settings.layerOverrides.get(entity.layer)
      IF override AND override.visible === false: RETURN false

      RETURN true
    )

  ─── resolveEntityColor ─────────────────────────────────────
  // Returns final RGB for plot output
  resolveEntityColor(entity: Entity, layer: Layer,
                     style: PlotStyle): { r, g, b }

    // Entity color: 0=BYBLOCK, 256=BYLAYER, else ACI index
    aciColor = entity.color ?? 256  // 256 = BYLAYER

    IF aciColor === 256: aciColor = layer.color   // use layer color
    IF aciColor === 0:   aciColor = 7             // BYBLOCK → white/black

    rgb = aciToRgb(aciColor)   // existing MathUtils function

    SWITCH style.colorMode:
      CASE AS_DISPLAYED: RETURN rgb
      CASE MONOCHROME:   RETURN { r:0, g:0, b:0 }
      CASE GRAYSCALE:
        lum = 0.299*rgb.r + 0.587*rgb.g + 0.114*rgb.b
        RETURN { r:lum, g:lum, b:lum }

  ─── resolveLineweight ──────────────────────────────────────
  resolveLineweight(entity: Entity, layer: Layer,
                    table: LineweightTable): number  // mm

    aciColor = entity.color ?? layer.color
    override = table.overrides.get(aciColor)
    RETURN override ?? table.default   // e.g. 0.18mm

═══════════════════════════════════════════════════════════════
## 4. SVG RENDERER (primary output — vector, best quality)
═══════════════════════════════════════════════════════════════

CLASS PlotSVGRenderer:

  ─── render (main entry) ─────────────────────────────────────
  render(doc: IDocument, settings: PlotSettings,
         engine: PlotEngine, camera: Camera): PlotResult

    viewport   = engine.computePlotViewport(settings, doc, camera)
    scale      = engine.computeScale(settings, viewport)
    paperW     = settings.paperSize.width   // mm
    paperH     = settings.paperSize.height
    { ox, oy } = engine.computeOffset(settings, viewport, scale, paperW, paperH)
    entities   = engine.getPlottableEntities(settings, doc)

    // Sort: by layer order, then entity type (hatch first, text last)
    entities = sortByDrawOrder(entities, doc.layers)

    // SVG coordinate transform:
    // SVG origin = top-left, Y-down
    // Drawing origin = bottom-left, Y-up
    // Transform: svgX = (drawX - viewport.minX) * scale + ox
    //            svgY = paperH - ((drawY - viewport.minY) * scale + oy)

    FUNCTION toSVG(drawX, drawY):
      svgX = (drawX - viewport.minX) * scale + ox
      svgY = paperH - ((drawY - viewport.minY) * scale + oy)
      RETURN { svgX, svgY }

    FUNCTION toSVGLength(drawLen):
      RETURN drawLen * scale    // mm

    // Build SVG
    svgLines = []
    svgLines.push(svgHeader(paperW, paperH))   // viewBox in mm

    // White paper background
    IF settings.style.paperBackground:
      svgLines.push(rect(0, 0, paperW, paperH, fill="white"))

    // Group by layer for correct paint order
    FOR layer OF getLayerDrawOrder(doc.layers):
      layerEntities = entities.filter(e => e.layer === layer.name)
      IF layerEntities.isEmpty: CONTINUE

      svgLines.push(`<g id="layer-${layer.name}" data-layer="${layer.name}">`)

      FOR entity OF layerEntities:
        rgb    = engine.resolveEntityColor(entity, layer, settings.style)
        lw_mm  = engine.resolveLineweight(entity, layer, settings.style.lineweightTable)
        color  = rgbToHex(rgb)
        stroke = `stroke="${color}" stroke-width="${lw_mm}mm" fill="none"`
        dash   = resolveLinetypeDash(entity.linetype ?? layer.linetype, scale)

        svgLines.push(renderEntityToSVG(entity, toSVG, toSVGLength, stroke, dash, settings))

      svgLines.push(`</g>`)

    svgLines.push(`</svg>`)
    RETURN { success: true, svgString: svgLines.join("\n") }

  ─── renderEntityToSVG ──────────────────────────────────────
  renderEntityToSVG(entity, toSVG, toLen, stroke, dash, settings):

    SWITCH entity.type:

      CASE Line:
        p1 = toSVG(entity.x1, entity.y1)
        p2 = toSVG(entity.x2, entity.y2)
        RETURN `<line x1="${p1.x}" y1="${p1.y}"
                      x2="${p2.x}" y2="${p2.y}"
                      ${stroke} ${dash}/>`

      CASE Circle:
        c = toSVG(entity.cx, entity.cy)
        r = toLen(entity.r)
        RETURN `<circle cx="${c.x}" cy="${c.y}" r="${r}" ${stroke} ${dash}/>`

      CASE Arc:
        // Compute start/end points and SVG arc path
        { d } = arcToSVGPath(entity.cx, entity.cy, entity.r,
                              entity.startAngle, entity.endAngle,
                              entity.ccw, toSVG, toLen)
        RETURN `<path d="${d}" ${stroke} ${dash}/>`

      CASE Polyline:
        // Each segment, respecting bulge arcs
        segments = polylineToSegments(entity)   // → Line | ArcSegment[]
        paths = segments.map(seg =>
          IF seg is Line:    lineToSVGPath(seg, toSVG)
          IF seg is Arc:     arcToSVGPath(seg, toSVG, toLen)
        )
        d = paths.join(" ")
        closePath = entity.closed ? "Z" : ""
        RETURN `<path d="${d}${closePath}" ${stroke} ${dash}/>`

      CASE Ellipse:
        // SVG <ellipse> with transform for rotation
        c = toSVG(entity.cx, entity.cy)
        rx = toLen(sqrt(entity.majorX^2 + entity.majorY^2))
        ry = rx * entity.ratio
        angle = atan2(entity.majorY, entity.majorX) * RAD_TO_DEG
        RETURN `<ellipse cx="${c.x}" cy="${c.y}"
                         rx="${rx}" ry="${ry}"
                         transform="rotate(${-angle}, ${c.x}, ${c.y})"
                         ${stroke} ${dash}/>`

      CASE Spline:
        // Tessellate to polyline (reuse existing tessellateSpline from MathUtils)
        points = tessellateSpline(entity, segmentCount=64)
        d = pointsToSVGPolyline(points, toSVG)
        RETURN `<path d="${d}" ${stroke} ${dash}/>`

      CASE Hatch:
        // Boundary as filled region + hatch lines as strokes
        boundaryPath = hatchBoundaryToSVGPath(entity.boundary, toSVG)
        hatchLines   = entity.lines.map(l => lineToSVGLine(l, toSVG, stroke))
        fillColor    = settings.style.colorMode === MONOCHROME ? "none" : "none"
        RETURN [
          `<path d="${boundaryPath}" fill="${fillColor}" ${stroke}/>`,
          ...hatchLines
        ].join("\n")

      CASE Text:
        pos    = toSVG(entity.x, entity.y)
        height = toLen(entity.height)
        angle  = -entity.rotation    // SVG Y-flip negates rotation
        RETURN `<text x="${pos.x}" y="${pos.y}"
                      font-size="${height}mm"
                      font-family="${entity.font ?? 'Arial'}"
                      fill="${stroke.color}"
                      transform="rotate(${angle}, ${pos.x}, ${pos.y})"
                      >${escapeXML(entity.text)}</text>`

      CASE MText:
        // Multi-line — split on \P (MText paragraph break) and \n
        lines  = parseMTextContent(entity.text)   // returns [{text, style}]
        pos    = toSVG(entity.x, entity.y)
        height = toLen(entity.height)
        lineSpacing = height * 1.5
        svgLines = lines.map((line, i) =>
          `<tspan x="${pos.x}" dy="${i===0 ? 0 : lineSpacing}mm"
                  font-weight="${line.bold ? 'bold' : 'normal'}"
                  font-style="${line.italic ? 'italic' : 'normal'}"
                  >${escapeXML(line.text)}</tspan>`
        )
        RETURN `<text x="${pos.x}" y="${pos.y}"
                      font-size="${height}mm" font-family="Arial"
                      fill="${color}">${svgLines.join("")}</text>`

      CASE Dimension:
        // Decompose into constituent geometry (lines + text)
        parts = decomposeDimension(entity, doc.units)
        RETURN parts.map(p => renderEntityToSVG(p, ...)).join("\n")

      CASE Insert (Block reference):
        block = doc.blocks.getBlock(entity.blockName)
        IF NOT block: RETURN ""
        origin = toSVG(entity.x, entity.y)
        // Transform: translate + rotate + scale
        // Note: SVG transform Y-axis is flipped vs drawing
        tx = origin.x - entity.x * scale
        ty = origin.y + entity.y * scale
        scaleX = entity.scaleX ?? 1
        scaleY = entity.scaleY ?? 1
        rotDeg = -(entity.rotation ?? 0)   // negate for SVG Y-flip
        transform = `translate(${tx}, ${ty})
                     rotate(${rotDeg}, ${origin.x}, ${origin.y})
                     scale(${scaleX}, ${scaleY})`
        innerSVG = block.entities.map(e =>
          renderEntityToSVG(e, toSVG, toLen, stroke, dash, settings)
        ).join("\n")
        RETURN `<g transform="${transform}">${innerSVG}</g>`

      CASE Point:
        p = toSVG(entity.x, entity.y)
        // Point marker: small cross
        s = 1.0   // mm, fixed size
        RETURN `<g>
          <line x1="${p.x-s}" y1="${p.y}" x2="${p.x+s}" y2="${p.y}" ${stroke}/>
          <line x1="${p.x}" y1="${p.y-s}" x2="${p.x}" y2="${p.y+s}" ${stroke}/>
        </g>`

      CASE Donut:
        c     = toSVG(entity.cx, entity.cy)
        outerR = toLen(entity.outerRadius)
        innerR = toLen(entity.innerRadius)
        fillColor = engine.resolveEntityColor(entity, layer, settings.style)
        IF innerR < 0.001:
          // Filled circle (innerR ≈ 0)
          RETURN `<circle cx="${c.x}" cy="${c.y}" r="${outerR}"
                          fill="${fillColor}" stroke="none"/>`
        // Donut: outer circle with inner cutout (even-odd fill rule)
        d = `M ${c.x+outerR} ${c.y}
             A ${outerR} ${outerR} 0 1 0 ${c.x-outerR} ${c.y}
             A ${outerR} ${outerR} 0 1 0 ${c.x+outerR} ${c.y}
             M ${c.x+innerR} ${c.y}
             A ${innerR} ${innerR} 0 1 1 ${c.x-innerR} ${c.y}
             A ${innerR} ${innerR} 0 1 1 ${c.x+innerR} ${c.y}`
        RETURN `<path d="${d}" fill="${fillColor}"
                      fill-rule="evenodd" stroke="none"/>`

      CASE Note:
        // Rendered as a text annotation with leader line
        leader = lineToSVGLine(entity.leaderStart, entity.leaderEnd, toSVG, stroke)
        textPos = toSVG(entity.textX, entity.textY)
        RETURN `${leader}
                <text x="${textPos.x}" y="${textPos.y}"
                      font-size="${toLen(entity.height)}mm"
                      fill="${color}">${escapeXML(entity.text)}</text>`

      CASE Trace | Solid:
        // Filled quadrilateral
        pts = entity.points.map(p => toSVG(p.x, p.y))
        d = `M ${pts[0].x} ${pts[0].y}
             L ${pts[1].x} ${pts[1].y}
             L ${pts[2].x} ${pts[2].y}
             ${pts[3] ? `L ${pts[3].x} ${pts[3].y}` : ""}
             Z`
        RETURN `<path d="${d}" fill="${color}" stroke="none"/>`

      CASE Shape:
        // SHX shape → already tessellated to segments
        segments = entity.segments   // {x1,y1,x2,y2}[]
        RETURN segments.map(s => lineToSVGLine(s, toSVG, stroke)).join("\n")

      DEFAULT:
        RETURN ""   // unknown entity — skip silently, log warning

  ─── resolveLinetypeDash ────────────────────────────────────
  resolveLinetypeDash(linetypeName: string, scale: number): string

    // Map linetype name → SVG stroke-dasharray (in mm)
    // scale converts drawing units to mm
    SWITCH linetypeName.toUpperCase():
      "CONTINUOUS":   RETURN ""
      "DASHED":       RETURN `stroke-dasharray="${3*scale} ${1.5*scale}"`
      "DASHED2":      RETURN `stroke-dasharray="${1.5*scale} ${0.75*scale}"`
      "DASHEDX2":     RETURN `stroke-dasharray="${6*scale} ${3*scale}"`
      "DOTTED":       RETURN `stroke-dasharray="${0.1} ${2*scale}"`
      "CENTER":       RETURN `stroke-dasharray="${6*scale} ${2*scale} ${1} ${2*scale}"`
      "HIDDEN":       RETURN `stroke-dasharray="${2*scale} ${1*scale}"`
      "PHANTOM":      RETURN `stroke-dasharray="${6*scale} ${1*scale} ${1} ${1*scale} ${1} ${1*scale}"`
      DEFAULT:        RETURN ""

  ─── svgHeader ──────────────────────────────────────────────
  svgHeader(paperW_mm, paperH_mm): string
    RETURN `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${paperW_mm}mm" height="${paperH_mm}mm"
         viewBox="0 0 ${paperW_mm} ${paperH_mm}">`

  ─── sortByDrawOrder ────────────────────────────────────────
  sortByDrawOrder(entities: Entity[], layers: LayerManager): Entity[]
    // 1. Sort by layer index (layer creation order)
    // 2. Within layer: Hatch < Solid < Line/Arc/Circle < Text/Dim/Note
    TYPE_ORDER = { Hatch:0, Solid:1, Trace:1, Donut:2, Line:3,
                   Circle:3, Arc:3, Polyline:3, Spline:3, Ellipse:3,
                   Insert:4, Dimension:5, Text:6, MText:6, Note:7 }
    layerOrder = Map(layers.listLayers().map((l,i) => [l.name, i]))
    RETURN entities.sort((a, b) =>
      layerIdx = (layerOrder.get(a.layer) ?? 999) - (layerOrder.get(b.layer) ?? 999)
      IF layerIdx !== 0: RETURN layerIdx
      RETURN (TYPE_ORDER[a.constructor.name] ?? 5) -
             (TYPE_ORDER[b.constructor.name] ?? 5)
    )

═══════════════════════════════════════════════════════════════
## 5. OUTPUT FORMATS
═══════════════════════════════════════════════════════════════

─── PDF Output ─────────────────────────────────────────────────
FUNCTION plotToPDF(svgString: string, settings: PlotSettings): Blob

  // Approach A: Browser native (simplest, no library)
  //   SVG → <img> → canvas → toDataURL → embed in iframe → window.print()
  //   Limited control over paper size in browser print dialog

  // Approach B: svg2pdf.js or jsPDF (recommended for production)
  //   jsPDF supports SVG embedding via jspdf-plugin-svg2pdf
  parser = new DOMParser()
  svgDoc = parser.parseFromString(svgString, "image/svg+xml")
  pdf = new jsPDF({
    orientation: settings.orientation,
    unit: 'mm',
    format: [settings.paperSize.width, settings.paperSize.height]
  })
  AWAIT svg2pdf(svgDoc.documentElement, pdf, { x:0, y:0 })
  RETURN pdf.output('blob')

─── PNG Output ─────────────────────────────────────────────────
FUNCTION plotToPNG(svgString: string, settings: PlotSettings, dpi: number): Blob

  scale = dpi / 25.4   // pixels per mm
  pxW = settings.paperSize.width  * scale
  pxH = settings.paperSize.height * scale

  img = new Image()
  blob = new Blob([svgString], { type: 'image/svg+xml' })
  url = URL.createObjectURL(blob)
  img.src = url

  AWAIT img.decode()

  canvas = document.createElement('canvas')
  canvas.width  = pxW
  canvas.height = pxH
  ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, pxW, pxH)
  ctx.drawImage(img, 0, 0, pxW, pxH)

  URL.revokeObjectURL(url)
  RETURN AWAIT new Promise(res => canvas.toBlob(res, 'image/png'))

─── Browser Print ──────────────────────────────────────────────
FUNCTION plotToPrint(svgString: string, settings: PlotSettings): void

  // Open SVG in hidden iframe → trigger print dialog
  // CSS @media print ensures paper size
  html = `<!DOCTYPE html><html><head>
    <style>
      @page {
        size: ${settings.paperSize.width}mm ${settings.paperSize.height}mm;
        margin: 0;
      }
      body { margin:0; padding:0; }
      svg  { display:block; width:100%; height:100%; }
    </style>
  </head><body>${svgString}</body></html>`

  iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  document.body.appendChild(iframe)
  iframe.contentDocument.write(html)
  iframe.contentDocument.close()
  iframe.contentWindow.focus()
  iframe.contentWindow.print()
  // Remove iframe after print dialog closes
  iframe.contentWindow.onafterprint = () => iframe.remove()

═══════════════════════════════════════════════════════════════
## 6. RESULT DISPATCHER INTEGRATION
═══════════════════════════════════════════════════════════════

// In ResultDispatcher.ts — add to handleAction():

CASE "plot_dialog":
  dialog = new PlotDialog(doc, viewer.camera, lastPlotSettings)
  dialog.onConfirm = async (settings) =>
    lastPlotSettings = settings
    result = await executePlot(settings, doc, viewer.camera)
    IF result.error: commandLine.showError(result.error)
    ELSE:            downloadOrPrint(result, settings)
  dialog.show()

CASE "plot_execute":
  // Window-pick path — settings already complete
  result = await executePlot(action.settings, doc, viewer.camera)
  IF result.error: commandLine.showError(result.error)
  ELSE:            downloadOrPrint(result, settings)

─── executePlot ─────────────────────────────────────────────────
ASYNC FUNCTION executePlot(settings, doc, camera): PlotResult

  engine   = new PlotEngine()
  renderer = new PlotSVGRenderer()

  TRY:
    svgResult = renderer.render(doc, settings, engine, camera)
    IF NOT svgResult.success: RETURN svgResult

    SWITCH settings.outputFormat:
      "svg":   RETURN { ...svgResult, blob: svgToBlob(svgResult.svgString) }
      "pdf":   blob = AWAIT plotToPDF(svgResult.svgString, settings)
               RETURN { ...svgResult, pdfBlob: blob }
      "png":   blob = AWAIT plotToPNG(svgResult.svgString, settings, settings.dpi)
               RETURN { ...svgResult, pngBlob: blob }
      "print": plotToPrint(svgResult.svgString, settings)
               RETURN svgResult

  CATCH e:
    RETURN { success: false, error: e.message, warnings: [] }

─── downloadOrPrint ─────────────────────────────────────────────
FUNCTION downloadOrPrint(result: PlotResult, settings: PlotSettings): void

  IF result.warnings.length > 0:
    commandLine.showWarnings(result.warnings)

  SWITCH settings.outputFormat:
    "svg":
      filename = currentDocumentName + ".svg"
      downloadBlob(result.svgBlob, filename)

    "pdf":
      filename = currentDocumentName + ".pdf"
      downloadBlob(result.pdfBlob, filename)

    "png":
      filename = currentDocumentName + ".png"
      downloadBlob(result.pngBlob, filename)

    "print":
      // Already handled in plotToPrint()
      commandLine.showMessage("Sent to printer.")

═══════════════════════════════════════════════════════════════
## 7. PLOT DIALOG UI
═══════════════════════════════════════════════════════════════

CLASS PlotDialog:
  // Modal overlay — follows existing ToolWindow pattern
  constructor(doc, camera, lastSettings):
    settings = lastSettings ?? DEFAULT_PLOT_SETTINGS

  buildHTML():
    RETURN `
    <div class="plot-dialog modal">
      <h2>Plot</h2>

      <!-- Paper -->
      <section>
        <label>Paper size</label>
        <select id="plot-paper">
          <option value="A4">A4  297×210mm</option>
          <option value="A3">A3  420×297mm</option>
          <option value="A2">A2  594×420mm</option>
          <option value="A1">A1  841×594mm</option>
          <option value="A0">A0  1189×841mm</option>
          <option value="LTR">Letter  279×216mm</option>
        </select>
        <label>Orientation</label>
        <select id="plot-orient">
          <option value="landscape">Landscape</option>
          <option value="portrait">Portrait</option>
        </select>
      </section>

      <!-- Plot area -->
      <section>
        <label>Plot area</label>
        <select id="plot-area">
          <option value="EXTENTS">Extents</option>
          <option value="DISPLAY">Display</option>
          <option value="WINDOW">Window (pick after OK)</option>
        </select>
      </section>

      <!-- Scale -->
      <section>
        <label>Scale</label>
        <select id="plot-scale">
          <option value="fit">Fit to paper</option>
          <option value="1:1">1:1</option>
          <option value="1:50">1:50</option>
          <option value="1:100">1:100</option>
          <option value="1:200">1:200</option>
          <option value="1:500">1:500</option>
          <option value="custom">Custom...</option>
        </select>
        <!-- shown when "custom" selected -->
        <div id="custom-scale" hidden>
          <input id="scale-draw" type="number" placeholder="Drawing units" />
          =
          <input id="scale-paper" type="number" placeholder="Paper mm" />
        </div>
      </section>

      <!-- Offset -->
      <section>
        <label>Offset</label>
        <input type="checkbox" id="plot-center" checked/>
        <label for="plot-center">Center on paper</label>
        <div id="offset-fields" hidden>
          X: <input id="offset-x" type="number" value="10"/>mm
          Y: <input id="offset-y" type="number" value="10"/>mm
        </div>
      </section>

      <!-- Style -->
      <section>
        <label>Color</label>
        <select id="plot-color">
          <option value="as_displayed">As displayed</option>
          <option value="monochrome">Monochrome (black)</option>
          <option value="grayscale">Grayscale</option>
        </select>
      </section>

      <!-- Output -->
      <section>
        <label>Output</label>
        <select id="plot-format">
          <option value="pdf">PDF</option>
          <option value="svg">SVG</option>
          <option value="png">PNG (300 DPI)</option>
          <option value="print">Print</option>
        </select>
      </section>

      <!-- Layer overrides table (collapsible) -->
      <details>
        <summary>Layer plot overrides</summary>
        <table id="layer-plot-table">
          <!-- Layer | Plot | Color override | Lineweight override -->
          ${buildLayerOverrideRows(doc.layers.listLayers())}
        </table>
      </details>

      <!-- Preview thumbnail (SVG preview, small scale) -->
      <div id="plot-preview">
        <canvas id="preview-canvas" width="200" height="141"/>
      </div>

      <footer>
        <button id="preview-btn">Preview</button>
        <button id="cancel-btn">Cancel</button>
        <button id="plot-btn" class="primary">Plot</button>
      </footer>
    </div>`

  onPreviewClick():
    settings = readSettingsFromDialog()
    // Render to small SVG, show in preview canvas
    miniSettings = { ...settings, scale: { isFit: true } }
    result = PlotSVGRenderer.render(doc, miniSettings, engine, camera)
    showSVGInCanvas(result.svgString, previewCanvas)

  onPlotClick():
    settings = readSettingsFromDialog()
    IF settings.area.type === WINDOW:
      // Close dialog, let user pick window
      hide()
      commandLine.showMessage("Pick first corner of plot window:")
      RETURN { action: "plot_window_pick", pendingSettings: settings }
    ELSE:
      RETURN { action: "plot_execute", settings }

═══════════════════════════════════════════════════════════════
## 8. COMMANDREGISTRY ENTRIES
═══════════════════════════════════════════════════════════════

// In CommandManager.ts commandRegistry Map — add:

  ["PLOT",       () => new PlotCommand()],
  ["PRINT",      () => new PlotCommand()],       // alias
  ["EXPORT",     () => new PlotCommand()],       // alias
  ["SAVEAS",     () => new PlotCommand()],       // alias — subset

═══════════════════════════════════════════════════════════════
## 9. ERROR HANDLING
═══════════════════════════════════════════════════════════════

PLOT_ERRORS:
  "No visible entities"       → user forgot to draw, or all layers hidden
  "Window too small"          → picked same point twice
  "Paper too small for scale" → explicit scale + extents > paper size
  "Unknown entity in plot"    → entity type with no SVG renderer (log + skip)
  "Font not available"        → fallback to Arial, add warning
  "OCC shape (future 3D)"     → skip Solid3D, add warning "3D solids skipped"

WARNINGS (non-fatal, shown after plot):
  "Layer 'DEFPOINTS' is frozen and was excluded"
  "3 Text entities used fallback font Arial"
  "Block 'TITLE_BLOCK' has unresolved references"
  "Scale 1:100 produces output 420×890mm on A3 paper — clipped"

═══════════════════════════════════════════════════════════════
## 10. ARCTOSVGPATH HELPER
═══════════════════════════════════════════════════════════════

FUNCTION arcToSVGPath(cx, cy, r, startAngle, endAngle, ccw, toSVG, toLen):
  // Angles in WebCAD are in radians, CCW from positive X
  // SVG arcs: Y is flipped, so CCW in drawing = CW in SVG coords

  // Normalise angles
  IF ccw:
    sweep = 0    // SVG: 0 = counterclockwise (after Y-flip = drawing CCW)
  ELSE:
    sweep = 1

  spanRad = normaliseArcSpan(startAngle, endAngle, ccw)
  largeArc = spanRad > PI ? 1 : 0

  // Note: Y-flip means drawing angles become negative in SVG
  startX = cx + r * cos(startAngle)
  startY = cy + r * sin(startAngle)
  endX   = cx + r * cos(endAngle)
  endY   = cy + r * sin(endAngle)

  ps = toSVG(startX, startY)
  pe = toSVG(endX, endY)
  rr = toLen(r)

  IF spanRad >= 2*PI - 0.0001:
    // Full circle — SVG can't do 360° arc, use two 180° arcs
    midX = cx + r * cos(startAngle + PI)
    midY = cy + r * sin(startAngle + PI)
    pm = toSVG(midX, midY)
    d = `M ${ps.x} ${ps.y}
         A ${rr} ${rr} 0 0 ${sweep} ${pm.x} ${pm.y}
         A ${rr} ${rr} 0 0 ${sweep} ${ps.x} ${ps.y}`
  ELSE:
    d = `M ${ps.x} ${ps.y}
         A ${rr} ${rr} 0 ${largeArc} ${sweep} ${pe.x} ${pe.y}`

  RETURN { d }
