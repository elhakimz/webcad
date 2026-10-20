# Agent Task: Implement PLOT Command for WebCAD
# Model: Gemini | Framework: Antigravity
# Scope: Full implementation — command, engine, SVG renderer, handler, UI dialog

---

## CONTEXT

You are implementing the PLOT command in a TypeScript WebCAD application.
The app uses a strict layered architecture:

```
core/commands/       ← Command classes (implement Command interface)
core/engine/         ← Engines, CommandManager, handlers
core/engine/handlers/← ActionHandler classes (implement ActionHandler interface)
render/Viewer.ts     ← Three.js renderer (do NOT modify for this task)
app.ts               ← Main app, registers handlers, owns selectedEntityIds
```

Key patterns you MUST follow:
- Commands return `CommandResponse = string | Entity | CommandAction`
- `CommandAction.action` is a string literal union in `core/commands/types.ts`
- Handlers implement `canHandle(action)` + `handle(action, context)`
- Commands register in `commandRegistry` Map in `core/engine/CommandManager.ts`
- Handlers register via `this.dispatcher.registerHandler(new X())` in `app.ts`

Read these files BEFORE writing any code:
- `core/commands/types.ts`          ← Command, CommandAction, PreviewObject types
- `core/commands/IOCommands.ts`     ← Pattern for IO-style commands
- `core/engine/handlers/types.ts`  ← AppContext, ActionHandler interfaces
- `core/engine/handlers/IOHandler.ts` ← Pattern for async handlers
- `core/model/Layer.ts`             ← Layer fields: isVisible, isFrozen, isLocked
- `core/model/Entity.ts`            ← Entity base: getBoundingBox(), layer field
- `core/engine/MathUtils.ts`        ← aciToRgb(), tessellateSpline(), bulgeToArc()

---

## STEP 1 — Extend CommandAction type

**File:** `core/commands/types.ts`

Add `'plot'` and `'plot_window'` to the `action` string union in `CommandAction`.

Add these optional fields to the `CommandAction` interface:

```typescript
// Plot action fields
plotSettings?: PlotSettings;
plotAreaWindow?: { x1: number; y1: number; x2: number; y2: number };
```

Add these type exports AFTER the existing type exports:

```typescript
// ── Plot types ────────────────────────────────────────────────

export type PlotAreaType = 'EXTENTS' | 'DISPLAY' | 'WINDOW';

export type PlotColorMode = 'as_displayed' | 'monochrome' | 'grayscale';

export type PlotOutputFormat = 'svg' | 'pdf' | 'png' | 'print';

export interface PaperSize {
  label: string;
  width: number;   // mm
  height: number;  // mm
}

export const PAPER_SIZES: Record<string, PaperSize> = {
  A4:   { label: 'A4',      width: 297,  height: 210  },
  A3:   { label: 'A3',      width: 420,  height: 297  },
  A2:   { label: 'A2',      width: 594,  height: 420  },
  A1:   { label: 'A1',      width: 841,  height: 594  },
  A0:   { label: 'A0',      width: 1189, height: 841  },
  LTR:  { label: 'Letter',  width: 279,  height: 216  },
  TBLD: { label: 'Tabloid', width: 432,  height: 279  },
};

export interface PlotScale {
  label: string;
  drawUnit: number;   // drawing units per paperMM
  paperMM: number;    // paper mm
  isFit: boolean;
}

export const PLOT_SCALES: PlotScale[] = [
  { label: 'Fit',    drawUnit: 1,    paperMM: 1, isFit: true  },
  { label: '1:1',    drawUnit: 1,    paperMM: 1, isFit: false },
  { label: '1:2',    drawUnit: 2,    paperMM: 1, isFit: false },
  { label: '1:5',    drawUnit: 5,    paperMM: 1, isFit: false },
  { label: '1:10',   drawUnit: 10,   paperMM: 1, isFit: false },
  { label: '1:20',   drawUnit: 20,   paperMM: 1, isFit: false },
  { label: '1:50',   drawUnit: 50,   paperMM: 1, isFit: false },
  { label: '1:100',  drawUnit: 100,  paperMM: 1, isFit: false },
  { label: '1:200',  drawUnit: 200,  paperMM: 1, isFit: false },
  { label: '1:500',  drawUnit: 500,  paperMM: 1, isFit: false },
  { label: '1:1000', drawUnit: 1000, paperMM: 1, isFit: false },
];

export interface PlotLayerOverride {
  visible: boolean;
  color?: number;         // ACI color override, undefined = use layer color
  lineweight?: number;    // mm override, undefined = use default
}

export interface PlotSettings {
  paperSizeKey: string;               // key into PAPER_SIZES
  orientation: 'landscape' | 'portrait';
  areaType: PlotAreaType;
  areaWindow?: { x1: number; y1: number; x2: number; y2: number };
  scale: PlotScale;
  centered: boolean;
  offsetX: number;        // mm, used only when centered = false
  offsetY: number;        // mm, used only when centered = false
  colorMode: PlotColorMode;
  outputFormat: PlotOutputFormat;
  dpi: number;            // for PNG output
  layerOverrides: Record<string, PlotLayerOverride>;
}

export const DEFAULT_PLOT_SETTINGS: PlotSettings = {
  paperSizeKey: 'A4',
  orientation: 'landscape',
  areaType: 'EXTENTS',
  scale: PLOT_SCALES[0],  // Fit
  centered: true,
  offsetX: 10,
  offsetY: 10,
  colorMode: 'as_displayed',
  outputFormat: 'svg',
  dpi: 300,
  layerOverrides: {},
};
```

---

## STEP 2 — Create PlotCommand

**File to create:** `core/commands/PlotCommand.ts`

```typescript
import { Command, CommandResponse, CommandAction,
         PlotSettings, DEFAULT_PLOT_SETTINGS, SelectionBoxPreview } from './types';
import { UnitsConfig, IDocument } from '../model/Document';

export class PlotCommand implements Command {
  step = 0;
  private windowP1: { x: number; y: number } | null = null;
  private pendingSettings: PlotSettings | null = null;

  getPrompt(): string {
    if (this.step === 0) return 'PLOT [Enter=dialog / WINDOW / EXTENTS / DISPLAY]:';
    if (this.step === 1) return 'First corner of plot window:';
    if (this.step === 2) return 'Other corner:';
    return '';
  }

  // Enter key or keyword
  onInput(text: string, _id: string, _units: UnitsConfig): CommandResponse | undefined {
    if (this.step !== 0) return undefined;
    const val = text.trim().toUpperCase();

    if (val === '' || val === 'DIALOG') {
      return { action: 'plot', plotSettings: DEFAULT_PLOT_SETTINGS } as CommandAction;
    }
    if (val === 'WINDOW') {
      this.step = 1;
      return 'First corner of plot window:';
    }
    if (val === 'EXTENTS') {
      return { action: 'plot', plotSettings: { ...DEFAULT_PLOT_SETTINGS, areaType: 'EXTENTS' } } as CommandAction;
    }
    if (val === 'DISPLAY') {
      return { action: 'plot', plotSettings: { ...DEFAULT_PLOT_SETTINGS, areaType: 'DISPLAY' } } as CommandAction;
    }
    return 'Unknown option. Enter to open dialog, or WINDOW / EXTENTS / DISPLAY:';
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 0) {
      // First click → open dialog
      return { action: 'plot', plotSettings: DEFAULT_PLOT_SETTINGS } as CommandAction;
    }
    if (this.step === 1) {
      this.windowP1 = { x, y };
      this.step = 2;
      return 'Other corner:';
    }
    if (this.step === 2 && this.windowP1) {
      const x1 = Math.min(this.windowP1.x, x);
      const y1 = Math.min(this.windowP1.y, y);
      const x2 = Math.max(this.windowP1.x, x);
      const y2 = Math.max(this.windowP1.y, y);
      if (x2 - x1 < 1e-6 || y2 - y1 < 1e-6) {
        this.windowP1 = null;
        this.step = 1;
        return 'Window too small. First corner:';
      }
      const settings: PlotSettings = {
        ...DEFAULT_PLOT_SETTINGS,
        areaType: 'WINDOW',
        areaWindow: { x1, y1, x2, y2 },
      };
      return { action: 'plot', plotSettings: settings } as CommandAction;
    }
    return '';
  }

  getPreview(x: number, y: number): SelectionBoxPreview | null {
    if (this.step === 2 && this.windowP1) {
      return {
        type: 'selection_box',
        x1: this.windowP1.x, y1: this.windowP1.y,
        x2: x, y2: y,
        isCrossing: false,
      };
    }
    return null;
  }
}
```

---

## STEP 3 — Create PlotEngine

**File to create:** `core/io/PlotEngine.ts`

```typescript
import { Entity } from '../model/Entity';
import { IDocument } from '../model/Document';
import { Layer } from '../model/Layer';
import { aciToRgb } from '../engine/MathUtils';
import { PlotSettings, PlotColorMode, PAPER_SIZES } from '../commands/types';
import * as THREE from 'three';

export interface BoundingBox {
  minX: number; minY: number; maxX: number; maxY: number;
}

export interface ResolvedColor { r: number; g: number; b: number; }

export class PlotEngine {

  // ── Viewport (drawing-space region to plot) ───────────────────

  computePlotViewport(
    settings: PlotSettings,
    doc: IDocument,
    camera: THREE.OrthographicCamera,
    canvasWidth: number,
    canvasHeight: number,
  ): BoundingBox {

    if (settings.areaType === 'WINDOW' && settings.areaWindow) {
      return {
        minX: settings.areaWindow.x1, minY: settings.areaWindow.y1,
        maxX: settings.areaWindow.x2, maxY: settings.areaWindow.y2,
      };
    }

    if (settings.areaType === 'DISPLAY') {
      // Derive from orthographic camera frustum
      const zoom = camera.zoom;
      const halfW = (canvasWidth  / 2) / zoom;
      const halfH = (canvasHeight / 2) / zoom;
      const cx = camera.position.x;
      const cy = camera.position.y;
      return { minX: cx - halfW, minY: cy - halfH,
               maxX: cx + halfW, maxY: cy + halfH };
    }

    // EXTENTS — union of all plottable entity bounding boxes
    const entities = this.getPlottableEntities(settings, doc);
    if (entities.length === 0) {
      throw new Error('No visible entities to plot. Check layer visibility.');
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of entities) {
      const bb = e.getBoundingBox();
      if (bb.minX < minX) minX = bb.minX;
      if (bb.minY < minY) minY = bb.minY;
      if (bb.maxX > maxX) maxX = bb.maxX;
      if (bb.maxY > maxY) maxY = bb.maxY;
    }
    // 2% margin
    const margin = Math.max(maxX - minX, maxY - minY) * 0.02;
    return { minX: minX - margin, minY: minY - margin,
             maxX: maxX + margin, maxY: maxY + margin };
  }

  // ── Scale (mm of paper per drawing unit) ─────────────────────

  computeScaleFactor(settings: PlotSettings, viewport: BoundingBox): number {
    const paper = PAPER_SIZES[settings.paperSizeKey];
    const pw = settings.orientation === 'landscape' ? paper.width : paper.height;
    const ph = settings.orientation === 'landscape' ? paper.height : paper.width;
    const margin = 10; // mm each side
    const usableW = pw - margin * 2;
    const usableH = ph - margin * 2;

    const drawW = viewport.maxX - viewport.minX;
    const drawH = viewport.maxY - viewport.minY;
    if (drawW <= 0 || drawH <= 0) throw new Error('Plot viewport has zero size.');

    if (settings.scale.isFit) {
      return Math.min(usableW / drawW, usableH / drawH);
    }
    return settings.scale.paperMM / settings.scale.drawUnit;
  }

  computeOffset(
    settings: PlotSettings,
    viewport: BoundingBox,
    scaleFactor: number,
  ): { ox: number; oy: number } {
    const paper = PAPER_SIZES[settings.paperSizeKey];
    const pw = settings.orientation === 'landscape' ? paper.width : paper.height;
    const ph = settings.orientation === 'landscape' ? paper.height : paper.width;

    const plotW = (viewport.maxX - viewport.minX) * scaleFactor;
    const plotH = (viewport.maxY - viewport.minY) * scaleFactor;

    if (settings.centered) {
      return { ox: (pw - plotW) / 2, oy: (ph - plotH) / 2 };
    }
    return { ox: settings.offsetX, oy: settings.offsetY };
  }

  // ── Entity filtering (layer-aware) ───────────────────────────

  getPlottableEntities(settings: PlotSettings, doc: IDocument): Entity[] {
    return doc.getAllEntities().filter(entity => {
      const layer = doc.layers.getLayer(entity.layer);
      if (!layer) return true;               // unknown layer → include
      if (layer.isFrozen)   return false;    // frozen → exclude
      if (!layer.isVisible) return false;    // hidden → exclude

      // Per-plot layer override
      const override = settings.layerOverrides[entity.layer];
      if (override && override.visible === false) return false;

      return true;
    });
  }

  // Editable subset (for future grip editing in paperspace)
  getEditableEntities(settings: PlotSettings, doc: IDocument): Entity[] {
    return this.getPlottableEntities(settings, doc).filter(entity => {
      const layer = doc.layers.getLayer(entity.layer);
      return !layer?.isLocked;
    });
  }

  // ── Color resolution ──────────────────────────────────────────

  resolveEntityColor(
    entity: Entity,
    layer: Layer,
    colorMode: PlotColorMode,
    layerOverrides: Record<string, { color?: number }>,
  ): ResolvedColor {
    // Color priority: entity color → layer override → layer color
    let aciColor = (entity as any).color as number | undefined;

    // 256 = BYLAYER
    if (!aciColor || aciColor === 256) {
      const override = layerOverrides[entity.layer];
      aciColor = override?.color ?? layer.color;
    }
    // 0 = BYBLOCK → default to 7 (white/black)
    if (aciColor === 0) aciColor = 7;

    const raw = aciToRgb(aciColor);  // returns number (hex) or {r,g,b}
    // aciToRgb returns a hex number — convert to {r,g,b}
    const hex = typeof raw === 'number' ? raw : 0x000000;
    const r = (hex >> 16) & 0xFF;
    const g = (hex >> 8)  & 0xFF;
    const b =  hex        & 0xFF;

    switch (colorMode) {
      case 'monochrome': return { r: 0, g: 0, b: 0 };
      case 'grayscale': {
        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        return { r: lum, g: lum, b: lum };
      }
      default: return { r, g, b };
    }
  }

  resolveLineweight(
    entity: Entity,
    layer: Layer,
    layerOverrides: Record<string, { lineweight?: number }>,
  ): number {
    // Entity-level lineweight (future), then layer override, then default
    const override = layerOverrides[entity.layer];
    if (override?.lineweight !== undefined) return override.lineweight;

    // CTB-style default: ACI color → lineweight
    const aciColor = (entity as any).color ?? layer.color ?? 7;
    const ctbDefaults: Record<number, number> = {
      1: 0.35,   // red
      2: 0.25,   // yellow
      3: 0.35,   // green
      4: 0.25,   // cyan
      5: 0.50,   // blue
      6: 0.25,   // magenta
      7: 0.18,   // white/black
    };
    return ctbDefaults[aciColor] ?? 0.18;
  }

  // ── Sort entities for correct paint order ─────────────────────

  sortByDrawOrder(entities: Entity[], doc: IDocument): Entity[] {
    const layerNames = doc.layers.listLayers().map(l => l.name);
    const layerOrder = new Map(layerNames.map((n, i) => [n, i]));

    const typeOrder: Record<string, number> = {
      Hatch: 0, Solid: 1, Trace: 1, Donut: 2,
      Line: 3, Circle: 3, Arc: 3, Polyline: 3, Spline: 3, Ellipse: 3,
      Insert: 4, Dimension: 5, Text: 6, MText: 6, Note: 7,
    };

    return [...entities].sort((a, b) => {
      const lDiff = (layerOrder.get(a.layer) ?? 999) -
                    (layerOrder.get(b.layer) ?? 999);
      if (lDiff !== 0) return lDiff;
      const aType = a.constructor.name;
      const bType = b.constructor.name;
      return (typeOrder[aType] ?? 5) - (typeOrder[bType] ?? 5);
    });
  }
}
```

---

## STEP 4 — Create PlotSVGRenderer

**File to create:** `core/io/PlotSVGRenderer.ts`

Rules while implementing:
- SVG origin is top-left, Y-axis points DOWN.
- Drawing origin is bottom-left, Y-axis points UP.
- Transform: `svgX = (drawX - viewport.minX) * scale + ox`
- Transform: `svgY = paperH - ((drawY - viewport.minY) * scale + oy)`
- All coordinates produced by `toSVG()` are in mm.
- Rotation angles must be negated when converting (SVG Y-flip reverses angle direction).
- Arc CCW in drawing = sweep-flag 0 in SVG (after Y-flip).

```typescript
import { Entity } from '../model/Entity';
import { IDocument } from '../model/Document';
import { Layer } from '../model/Layer';
import { Line } from '../model/Line';
import { Arc } from '../model/Arc';
import { Circle } from '../model/Circle';
import { Polyline } from '../model/Polyline';
import { Ellipse } from '../model/Ellipse';
import { Spline } from '../model/Spline';
import { Hatch } from '../model/Hatch';
import { Text } from '../model/Text';
import { MText } from '../model/MText';
import { Dimension } from '../model/Dimension';
import { Insert } from '../model/Insert';
import { Point } from '../model/Point';
import { Donut } from '../model/Donut';
import { Solid } from '../model/Solid';
import { Trace } from '../model/Trace';
import { Note } from '../model/Note';
import { tessellateSpline, bulgeToArc } from '../engine/MathUtils';
import { PlotEngine, BoundingBox, ResolvedColor } from './PlotEngine';
import { PlotSettings, PAPER_SIZES } from '../commands/types';
import * as THREE from 'three';

export interface PlotSVGResult {
  success: boolean;
  svgString?: string;
  error?: string;
  warnings: string[];
}

export class PlotSVGRenderer {

  render(
    doc: IDocument,
    settings: PlotSettings,
    engine: PlotEngine,
    camera: THREE.OrthographicCamera,
    canvasWidth: number,
    canvasHeight: number,
  ): PlotSVGResult {
    const warnings: string[] = [];

    let viewport: BoundingBox;
    try {
      viewport = engine.computePlotViewport(settings, doc, camera, canvasWidth, canvasHeight);
    } catch (e: any) {
      return { success: false, error: e.message, warnings };
    }

    let scaleFactor: number;
    try {
      scaleFactor = engine.computeScaleFactor(settings, viewport);
    } catch (e: any) {
      return { success: false, error: e.message, warnings };
    }

    const paper = PAPER_SIZES[settings.paperSizeKey];
    const paperW = settings.orientation === 'landscape' ? paper.width : paper.height;
    const paperH = settings.orientation === 'landscape' ? paper.height : paper.width;

    const { ox, oy } = engine.computeOffset(settings, viewport, scaleFactor);

    const entities = engine.getPlottableEntities(settings, doc);
    const sorted   = engine.sortByDrawOrder(entities, doc);

    // ── Coordinate transform helpers ────────────────────────────
    const toSVG = (drawX: number, drawY: number) => ({
      x: (drawX - viewport.minX) * scaleFactor + ox,
      y: paperH - ((drawY - viewport.minY) * scaleFactor + oy),
    });
    const toLen = (drawLen: number) => drawLen * scaleFactor;

    // ── Build SVG ───────────────────────────────────────────────
    const lines: string[] = [];
    lines.push(this.svgHeader(paperW, paperH));
    lines.push(`<rect width="${paperW}" height="${paperH}" fill="white"/>`);

    // Group entities by layer for correct SVG layering
    const layerNames = doc.layers.listLayers().map(l => l.name);
    for (const layerName of layerNames) {
      const layerEntities = sorted.filter(e => e.layer === layerName);
      if (layerEntities.length === 0) continue;

      const layer = doc.layers.getLayer(layerName)!;
      lines.push(`<g id="layer-${this.escapeXML(layerName)}">`);

      for (const entity of layerEntities) {
        const rgb    = engine.resolveEntityColor(entity, layer, settings.colorMode, settings.layerOverrides);
        const lw     = engine.resolveLineweight(entity, layer, settings.layerOverrides);
        const color  = this.rgbToHex(rgb);
        const stroke = `stroke="${color}" stroke-width="${lw}mm" fill="none"`;
        const dash   = this.resolveLinetypeDash((entity as any).linetype ?? layer.linetype, scaleFactor);

        try {
          const svg = this.renderEntity(entity, doc, toSVG, toLen, stroke, dash, color, settings, engine, camera, canvasWidth, canvasHeight, warnings);
          if (svg) lines.push(svg);
        } catch (e: any) {
          warnings.push(`Skipped entity ${entity.id} (${entity.constructor.name}): ${e.message}`);
        }
      }

      lines.push('</g>');
    }

    lines.push('</svg>');
    return { success: true, svgString: lines.join('\n'), warnings };
  }

  // ── Per-entity SVG generation ────────────────────────────────

  private renderEntity(
    entity: Entity,
    doc: IDocument,
    toSVG: (x: number, y: number) => { x: number; y: number },
    toLen: (len: number) => number,
    stroke: string,
    dash: string,
    color: string,
    settings: PlotSettings,
    engine: PlotEngine,
    camera: THREE.OrthographicCamera,
    cw: number, ch: number,
    warnings: string[],
  ): string {

    if (entity instanceof Line) {
      const p1 = toSVG(entity.x1, entity.y1);
      const p2 = toSVG(entity.x2, entity.y2);
      return `<line x1="${p1.x.toFixed(4)}" y1="${p1.y.toFixed(4)}"
                    x2="${p2.x.toFixed(4)}" y2="${p2.y.toFixed(4)}"
                    ${stroke} ${dash}/>`;
    }

    if (entity instanceof Circle) {
      const c = toSVG(entity.cx, entity.cy);
      const r = toLen(entity.r);
      return `<circle cx="${c.x.toFixed(4)}" cy="${c.y.toFixed(4)}"
                      r="${r.toFixed(4)}" ${stroke} ${dash}/>`;
    }

    if (entity instanceof Arc) {
      const d = this.arcPath(entity.cx, entity.cy, entity.r,
                             entity.startAngle, entity.endAngle,
                             entity.ccw ?? true, toSVG, toLen);
      return `<path d="${d}" ${stroke} ${dash}/>`;
    }

    if (entity instanceof Polyline) {
      return this.renderPolyline(entity, toSVG, toLen, stroke, dash);
    }

    if (entity instanceof Ellipse) {
      const c  = toSVG(entity.cx, entity.cy);
      const rx = toLen(Math.sqrt(entity.majorX ** 2 + entity.majorY ** 2));
      const ry = rx * entity.ratio;
      const angleDeg = -Math.atan2(entity.majorY, entity.majorX) * (180 / Math.PI);
      return `<ellipse cx="${c.x.toFixed(4)}" cy="${c.y.toFixed(4)}"
                       rx="${rx.toFixed(4)}" ry="${ry.toFixed(4)}"
                       transform="rotate(${angleDeg.toFixed(4)},${c.x.toFixed(4)},${c.y.toFixed(4)})"
                       ${stroke} ${dash}/>`;
    }

    if (entity instanceof Spline) {
      const pts = tessellateSpline(entity, 64);
      if (pts.length < 2) return '';
      const svgPts = pts.map(p => toSVG(p.x, p.y));
      const d = 'M ' + svgPts.map(p => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' L ');
      return `<path d="${d}" ${stroke} ${dash}/>`;
    }

    if (entity instanceof Hatch) {
      return this.renderHatch(entity, toSVG, stroke);
    }

    if (entity instanceof Text) {
      const p = toSVG(entity.x, entity.y);
      const h = toLen(entity.height || 2.5);
      const angleDeg = -(entity.rotation || 0) * (180 / Math.PI);
      return `<text x="${p.x.toFixed(4)}" y="${p.y.toFixed(4)}"
                    font-size="${h.toFixed(4)}mm"
                    font-family="${entity.font ?? 'Arial'}"
                    fill="${color}"
                    transform="rotate(${angleDeg.toFixed(4)},${p.x.toFixed(4)},${p.y.toFixed(4)})"
                    >${this.escapeXML(entity.text ?? '')}</text>`;
    }

    if (entity instanceof MText) {
      return this.renderMText(entity, toSVG, toLen, color);
    }

    if (entity instanceof Dimension) {
      // Decompose dimension into constituent lines + text
      const parts = this.decomposeDimension(entity);
      return parts.map(p => this.renderEntity(p, doc, toSVG, toLen, stroke, dash, color, settings, engine, camera, cw, ch, warnings)).join('\n');
    }

    if (entity instanceof Insert) {
      return this.renderInsert(entity, doc, toSVG, toLen, stroke, dash, color, settings, engine, camera, cw, ch, warnings);
    }

    if (entity instanceof Point) {
      const p = toSVG(entity.x, entity.y);
      const s = 1.0; // fixed 1mm cross
      return `<g>
        <line x1="${(p.x-s).toFixed(4)}" y1="${p.y.toFixed(4)}" x2="${(p.x+s).toFixed(4)}" y2="${p.y.toFixed(4)}" ${stroke}/>
        <line x1="${p.x.toFixed(4)}" y1="${(p.y-s).toFixed(4)}" x2="${p.x.toFixed(4)}" y2="${(p.y+s).toFixed(4)}" ${stroke}/>
      </g>`;
    }

    if (entity instanceof Donut) {
      return this.renderDonut(entity, toSVG, toLen, color);
    }

    if (entity instanceof Solid || entity instanceof Trace) {
      return this.renderSolidTrace(entity as any, toSVG, color);
    }

    if (entity instanceof Note) {
      const p = toSVG((entity as any).textX ?? 0, (entity as any).textY ?? 0);
      const h = toLen((entity as any).height ?? 2.5);
      const text = `<text x="${p.x.toFixed(4)}" y="${p.y.toFixed(4)}"
                          font-size="${h.toFixed(4)}mm" font-family="Arial"
                          fill="${color}">${this.escapeXML((entity as any).text ?? '')}</text>`;
      // Leader line if present
      if ((entity as any).leaderX !== undefined) {
        const ls = toSVG((entity as any).leaderX, (entity as any).leaderY);
        const le = toSVG((entity as any).textX, (entity as any).textY);
        const leader = `<line x1="${ls.x.toFixed(4)}" y1="${ls.y.toFixed(4)}"
                              x2="${le.x.toFixed(4)}" y2="${le.y.toFixed(4)}"
                              ${stroke}/>`;
        return leader + '\n' + text;
      }
      return text;
    }

    warnings.push(`No SVG renderer for entity type: ${entity.constructor.name}`);
    return '';
  }

  // ── Polyline with bulge arcs ──────────────────────────────────

  private renderPolyline(
    entity: Polyline,
    toSVG: (x: number, y: number) => { x: number; y: number },
    toLen: (l: number) => number,
    stroke: string,
    dash: string,
  ): string {
    const verts = entity.vertices;
    if (!verts || verts.length < 2) return '';

    const parts: string[] = [];
    for (let i = 0; i < verts.length - 1; i++) {
      const v0 = verts[i];
      const v1 = verts[i + 1];
      const bulge = v0.bulge ?? 0;
      if (Math.abs(bulge) < 1e-10) {
        // Straight segment
        const p0 = toSVG(v0.x, v0.y);
        const p1 = toSVG(v1.x, v1.y);
        parts.push(`M ${p0.x.toFixed(4)},${p0.y.toFixed(4)} L ${p1.x.toFixed(4)},${p1.y.toFixed(4)}`);
      } else {
        // Bulge → arc
        const arc = bulgeToArc(v0.x, v0.y, v1.x, v1.y, bulge);
        const d = this.arcPath(arc.cx, arc.cy, arc.r,
                               arc.startAngle, arc.endAngle,
                               bulge > 0, toSVG, toLen);
        parts.push(d);
      }
    }

    // Closing segment if closed
    if (entity.closed && verts.length > 2) {
      const last = verts[verts.length - 1];
      const first = verts[0];
      const bulge = last.bulge ?? 0;
      if (Math.abs(bulge) < 1e-10) {
        const p0 = toSVG(last.x, last.y);
        const p1 = toSVG(first.x, first.y);
        parts.push(`M ${p0.x.toFixed(4)},${p0.y.toFixed(4)} L ${p1.x.toFixed(4)},${p1.y.toFixed(4)}`);
      } else {
        const arc = bulgeToArc(last.x, last.y, first.x, first.y, bulge);
        parts.push(this.arcPath(arc.cx, arc.cy, arc.r, arc.startAngle, arc.endAngle, bulge > 0, toSVG, toLen));
      }
    }

    return `<path d="${parts.join(' ')}" ${stroke} ${dash}/>`;
  }

  // ── Arc path (handles full circles and Y-flip) ───────────────

  private arcPath(
    cx: number, cy: number, r: number,
    startAngle: number, endAngle: number,
    ccw: boolean,
    toSVG: (x: number, y: number) => { x: number; y: number },
    toLen: (l: number) => number,
  ): string {
    const TAU = Math.PI * 2;
    // Compute span in drawing space (CCW positive)
    let span = ccw
      ? ((endAngle - startAngle) + TAU) % TAU
      : ((startAngle - endAngle) + TAU) % TAU;
    if (span < 1e-10) span = TAU; // treat 0 as full circle

    const rSVG = toLen(r);

    if (span >= TAU - 1e-10) {
      // Full circle: two 180° arcs
      const p1 = toSVG(cx + r, cy);
      const p2 = toSVG(cx - r, cy);
      return `M ${p1.x.toFixed(4)},${p1.y.toFixed(4)}
              A ${rSVG.toFixed(4)},${rSVG.toFixed(4)} 0 0 0 ${p2.x.toFixed(4)},${p2.y.toFixed(4)}
              A ${rSVG.toFixed(4)},${rSVG.toFixed(4)} 0 0 0 ${p1.x.toFixed(4)},${p1.y.toFixed(4)}`;
    }

    const sx = cx + r * Math.cos(startAngle);
    const sy = cy + r * Math.sin(startAngle);
    const ex = cx + r * Math.cos(endAngle);
    const ey = cy + r * Math.sin(endAngle);

    const ps = toSVG(sx, sy);
    const pe = toSVG(ex, ey);

    // After Y-flip: CCW in drawing = 0 sweep in SVG, CW = 1
    const sweepFlag = ccw ? 0 : 1;
    const largeArc  = span > Math.PI ? 1 : 0;

    return `M ${ps.x.toFixed(4)},${ps.y.toFixed(4)}
            A ${rSVG.toFixed(4)},${rSVG.toFixed(4)} 0 ${largeArc} ${sweepFlag}
              ${pe.x.toFixed(4)},${pe.y.toFixed(4)}`;
  }

  // ── Hatch ────────────────────────────────────────────────────

  private renderHatch(
    entity: Hatch,
    toSVG: (x: number, y: number) => { x: number; y: number },
    stroke: string,
  ): string {
    const parts: string[] = [];
    // Hatch lines
    if (entity.lines) {
      for (const seg of entity.lines) {
        const p1 = toSVG(seg.x1, seg.y1);
        const p2 = toSVG(seg.x2, seg.y2);
        parts.push(`<line x1="${p1.x.toFixed(4)}" y1="${p1.y.toFixed(4)}"
                          x2="${p2.x.toFixed(4)}" y2="${p2.y.toFixed(4)}"
                          ${stroke}/>`);
      }
    }
    return parts.join('\n');
  }

  // ── MText (multi-line) ───────────────────────────────────────

  private renderMText(
    entity: MText,
    toSVG: (x: number, y: number) => { x: number; y: number },
    toLen: (l: number) => number,
    color: string,
  ): string {
    const p = toSVG(entity.x, entity.y);
    const h = toLen(entity.height || 2.5);
    const lineSpacing = h * 1.667;
    // Split on \P (MText paragraph) or newline
    const raw = entity.text ?? '';
    const paragraphs = raw.split(/\\P|\n/);
    const tspans = paragraphs.map((line, i) =>
      `<tspan x="${p.x.toFixed(4)}" dy="${i === 0 ? 0 : lineSpacing.toFixed(4)}mm">${this.escapeXML(line)}</tspan>`
    ).join('');
    return `<text x="${p.x.toFixed(4)}" y="${p.y.toFixed(4)}"
                  font-size="${h.toFixed(4)}mm" font-family="Arial"
                  fill="${color}">${tspans}</text>`;
  }

  // ── Donut ────────────────────────────────────────────────────

  private renderDonut(
    entity: Donut,
    toSVG: (x: number, y: number) => { x: number; y: number },
    toLen: (l: number) => number,
    color: string,
  ): string {
    const c  = toSVG(entity.cx, entity.cy);
    const OR = toLen(entity.outerRadius);
    const IR = toLen(entity.innerRadius);

    if (IR < 0.001) {
      // Filled disk
      return `<circle cx="${c.x.toFixed(4)}" cy="${c.y.toFixed(4)}"
                      r="${OR.toFixed(4)}" fill="${color}" stroke="none"/>`;
    }
    // Ring via even-odd path
    const d = `M ${(c.x + OR).toFixed(4)},${c.y.toFixed(4)}
               A ${OR.toFixed(4)},${OR.toFixed(4)} 0 1 0 ${(c.x - OR).toFixed(4)},${c.y.toFixed(4)}
               A ${OR.toFixed(4)},${OR.toFixed(4)} 0 1 0 ${(c.x + OR).toFixed(4)},${c.y.toFixed(4)}
               M ${(c.x + IR).toFixed(4)},${c.y.toFixed(4)}
               A ${IR.toFixed(4)},${IR.toFixed(4)} 0 1 1 ${(c.x - IR).toFixed(4)},${c.y.toFixed(4)}
               A ${IR.toFixed(4)},${IR.toFixed(4)} 0 1 1 ${(c.x + IR).toFixed(4)},${c.y.toFixed(4)}`;
    return `<path d="${d}" fill="${color}" fill-rule="evenodd" stroke="none"/>`;
  }

  // ── Solid / Trace (filled quad) ──────────────────────────────

  private renderSolidTrace(
    entity: { points: { x: number; y: number }[] },
    toSVG: (x: number, y: number) => { x: number; y: number },
    color: string,
  ): string {
    const pts = entity.points.map(p => toSVG(p.x, p.y));
    if (pts.length < 3) return '';
    const d = `M ${pts.map(p => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' L ')} Z`;
    return `<path d="${d}" fill="${color}" stroke="none"/>`;
  }

  // ── Insert (block reference) ──────────────────────────────────

  private renderInsert(
    entity: Insert,
    doc: IDocument,
    toSVG: (x: number, y: number) => { x: number; y: number },
    toLen: (l: number) => number,
    stroke: string,
    dash: string,
    color: string,
    settings: PlotSettings,
    engine: PlotEngine,
    camera: THREE.OrthographicCamera,
    cw: number, ch: number,
    warnings: string[],
  ): string {
    const block = doc.blocks.getBlock(entity.blockName);
    if (!block) {
      warnings.push(`Block '${entity.blockName}' not found — skipped.`);
      return '';
    }

    // We render block entities through the same toSVG pipeline.
    // Block entities use their own local coordinates — we need to apply
    // the insert transform: translate, rotate, scale.
    // Strategy: create a transformed toSVG for the block content.

    const ox = entity.x;
    const oy = entity.y;
    const sx = entity.scaleX ?? 1;
    const sy = entity.scaleY ?? 1;
    const rot = entity.rotation ?? 0; // radians
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    const toSVGInsert = (lx: number, ly: number) => {
      // Apply block transform: scale → rotate → translate
      const wx = ox + (lx * sx * cosR - ly * sy * sinR);
      const wy = oy + (lx * sx * sinR + ly * sy * cosR);
      return toSVG(wx, wy);
    };

    const parts: string[] = [];
    for (const e of block.entities) {
      try {
        const layer = doc.layers.getLayer(e.layer) ?? doc.layers.getLayer('0')!;
        const rgb = engine.resolveEntityColor(e, layer, settings.colorMode, settings.layerOverrides);
        const lw  = engine.resolveLineweight(e, layer, settings.layerOverrides);
        const c   = this.rgbToHex(rgb);
        const s   = `stroke="${c}" stroke-width="${lw}mm" fill="none"`;
        const d   = this.resolveLinetypeDash((e as any).linetype ?? layer.linetype, toLen(1));
        const svg = this.renderEntity(e, doc, toSVGInsert, toLen, s, d, c, settings, engine, camera, cw, ch, warnings);
        if (svg) parts.push(svg);
      } catch (e2: any) {
        warnings.push(`Block '${entity.blockName}' entity error: ${e2.message}`);
      }
    }
    return parts.join('\n');
  }

  // ── Dimension decomposition ───────────────────────────────────

  private decomposeDimension(entity: Dimension): Entity[] {
    // Reuse the entity's existing line/text segments if exposed.
    // Dimension stores its geometry in .lines and .texts arrays
    // (added by DimLinearCommand, DimAlignedCommand, etc.).
    const result: Entity[] = [];
    if ((entity as any).lines)  result.push(...(entity as any).lines);
    if ((entity as any).texts)  result.push(...(entity as any).texts);
    if ((entity as any).arcs)   result.push(...(entity as any).arcs);
    return result;
  }

  // ── Linetype dash mapping ────────────────────────────────────

  private resolveLinetypeDash(linetypeName: string, scaleFactor: number): string {
    const s = scaleFactor;
    switch ((linetypeName ?? 'CONTINUOUS').toUpperCase()) {
      case 'CONTINUOUS':     return '';
      case 'DASHED':         return `stroke-dasharray="${(3*s).toFixed(3)} ${(1.5*s).toFixed(3)}"`;
      case 'DASHED2':        return `stroke-dasharray="${(1.5*s).toFixed(3)} ${(0.75*s).toFixed(3)}"`;
      case 'DASHEDX2':       return `stroke-dasharray="${(6*s).toFixed(3)} ${(3*s).toFixed(3)}"`;
      case 'DOTTED':         return `stroke-dasharray="0.1 ${(2*s).toFixed(3)}"`;
      case 'CENTER':         return `stroke-dasharray="${(6*s).toFixed(3)} ${(2*s).toFixed(3)} 1 ${(2*s).toFixed(3)}"`;
      case 'HIDDEN':         return `stroke-dasharray="${(2*s).toFixed(3)} ${(1*s).toFixed(3)}"`;
      case 'PHANTOM':        return `stroke-dasharray="${(6*s).toFixed(3)} ${s.toFixed(3)} 1 ${s.toFixed(3)} 1 ${s.toFixed(3)}"`;
      default:               return '';
    }
  }

  // ── Utilities ────────────────────────────────────────────────

  private svgHeader(paperW: number, paperH: number): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${paperW}mm" height="${paperH}mm"
     viewBox="0 0 ${paperW} ${paperH}">`;
  }

  private rgbToHex({ r, g, b }: ResolvedColor): string {
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }

  private escapeXML(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
```

---

## STEP 5 — Create PlotHandler

**File to create:** `core/engine/handlers/PlotHandler.ts`

```typescript
import { ActionHandler, AppContext } from './types';
import { CommandAction, CommandResponse, PlotSettings } from '../../commands/types';
import { PlotEngine } from '../../io/PlotEngine';
import { PlotSVGRenderer } from '../../io/PlotSVGRenderer';

export class PlotHandler implements ActionHandler {

  canHandle(action: CommandAction): boolean {
    return action.action === 'plot';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer } = context;

    const settings: PlotSettings = action.plotSettings!;
    const engine   = new PlotEngine();
    const renderer = new PlotSVGRenderer();

    // Get canvas dimensions from the viewer's renderer
    const canvas  = viewer.renderer.domElement;
    const canvasW = canvas.clientWidth  || canvas.width;
    const canvasH = canvas.clientHeight || canvas.height;

    let result;
    try {
      result = renderer.render(doc, settings, engine, viewer.camera, canvasW, canvasH);
    } catch (e: any) {
      return `PLOT error: ${e.message}`;
    }

    if (!result.success) {
      return `PLOT failed: ${result.error}`;
    }

    // Show non-fatal warnings in command line
    if (result.warnings.length > 0) {
      result.warnings.forEach(w => console.warn('[PLOT]', w));
    }

    // Execute the output
    switch (settings.outputFormat) {
      case 'svg':
        this.downloadBlob(
          new Blob([result.svgString!], { type: 'image/svg+xml' }),
          this.getFilename('svg'),
        );
        break;

      case 'pdf':
        // Requires jsPDF + svg2pdf — load dynamically to avoid bundle bloat
        try {
          const pdfBlob = await this.svgToPDF(result.svgString!, settings);
          this.downloadBlob(pdfBlob, this.getFilename('pdf'));
        } catch {
          // Fallback: download SVG with pdf extension note
          this.downloadBlob(
            new Blob([result.svgString!], { type: 'image/svg+xml' }),
            this.getFilename('svg'),
          );
          return 'PDF library unavailable — saved as SVG instead.';
        }
        break;

      case 'png':
        const pngBlob = await this.svgToPNG(result.svgString!, settings);
        this.downloadBlob(pngBlob, this.getFilename('png'));
        break;

      case 'print':
        this.printSVG(result.svgString!, settings);
        break;
    }

    const warnMsg = result.warnings.length > 0
      ? ` (${result.warnings.length} warning(s) — see console)`
      : '';
    return `Plot complete.${warnMsg}`;
  }

  // ── Output methods ────────────────────────────────────────────

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  private async svgToPDF(svgString: string, settings: PlotSettings): Promise<Blob> {
    // Dynamic import — jsPDF must be in package.json
    const { default: jsPDF } = await import('jspdf');
    const { default: svg2pdf } = await import('svg2pdf.js');

    const { PAPER_SIZES } = await import('../../commands/types');
    const paper = PAPER_SIZES[settings.paperSizeKey];
    const pw = settings.orientation === 'landscape' ? paper.width : paper.height;
    const ph = settings.orientation === 'landscape' ? paper.height : paper.width;

    const pdf = new jsPDF({
      orientation: settings.orientation,
      unit: 'mm',
      format: [pw, ph],
    });

    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    await svg2pdf(svgDoc.documentElement, pdf, { x: 0, y: 0, width: pw, height: ph });
    return pdf.output('blob');
  }

  private async svgToPNG(svgString: string, settings: PlotSettings): Promise<Blob> {
    const { PAPER_SIZES } = await import('../../commands/types');
    const paper = PAPER_SIZES[settings.paperSizeKey];
    const pw = settings.orientation === 'landscape' ? paper.width : paper.height;
    const ph = settings.orientation === 'landscape' ? paper.height : paper.width;

    const scale  = settings.dpi / 25.4;     // pixels per mm
    const pxW    = Math.round(pw * scale);
    const pxH    = Math.round(ph * scale);

    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.src    = url;
    await new Promise<void>((resolve, reject) => {
      img.onload  = () => resolve();
      img.onerror = () => reject(new Error('SVG image load failed'));
    });

    const canvas = document.createElement('canvas');
    canvas.width  = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, pxW, pxH);
    ctx.drawImage(img, 0, 0, pxW, pxH);
    URL.revokeObjectURL(url);

    return new Promise<Blob>((res, rej) =>
      canvas.toBlob(b => b ? res(b) : rej(new Error('Canvas toBlob failed')), 'image/png')
    );
  }

  private printSVG(svgString: string, settings: PlotSettings): void {
    const { PAPER_SIZES } = require('../../commands/types');
    const paper = PAPER_SIZES[settings.paperSizeKey];
    const pw = settings.orientation === 'landscape' ? paper.width : paper.height;
    const ph = settings.orientation === 'landscape' ? paper.height : paper.width;

    const html = `<!DOCTYPE html><html><head>
      <style>
        @page { size: ${pw}mm ${ph}mm; margin: 0; }
        body  { margin: 0; padding: 0; }
        svg   { display: block; width: 100%; height: 100%; }
      </style>
    </head><body>${svgString}</body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.opacity  = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);
    iframe.contentDocument!.open();
    iframe.contentDocument!.write(html);
    iframe.contentDocument!.close();
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    iframe.contentWindow!.onafterprint = () => iframe.remove();
  }

  private getFilename(ext: string): string {
    const ts = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    return `drawing-${ts}.${ext}`;
  }
}
```

---

## STEP 6 — Register in CommandManager

**File to modify:** `core/engine/CommandManager.ts`

Add to the `commandRegistry` Map (find the block of `["SAVE", ...]` entries):

```typescript
['PLOT',    () => new PlotCommand()],
['PRINT',   () => new PlotCommand()],   // alias
['EXPORT',  () => new PlotCommand()],   // alias
```

Add the import at the top of the file:

```typescript
import { PlotCommand } from '../commands/PlotCommand';
```

---

## STEP 7 — Register handler in app.ts

**File to modify:** `app.ts`

Add the import (near the other handler imports):

```typescript
import { PlotHandler } from './core/engine/handlers/PlotHandler';
```

Add the registration (near `this.dispatcher.registerHandler(new IOHandler())`):

```typescript
this.dispatcher.registerHandler(new PlotHandler());
```

---

## STEP 8 — Expose camera and renderer on Viewer

**File to modify:** `render/Viewer.ts`

Verify these are `public` (not `private`). If private, change to public:

```typescript
public camera: THREE.OrthographicCamera;
public renderer: THREE.WebGLRenderer;
```

The `PlotHandler` accesses `viewer.camera` and `viewer.renderer.domElement`.
Do NOT add any new methods to Viewer — only change access modifiers if needed.

---

## STEP 9 — Write tests

**File to create:** `core/io/PlotEngine.test.ts`

```typescript
import { PlotEngine } from './PlotEngine';
import { DEFAULT_PLOT_SETTINGS, PAPER_SIZES } from '../commands/types';

describe('PlotEngine', () => {

  const makeDoc = (entities: any[], layers: any[]) => ({
    getAllEntities: () => entities,
    layers: {
      getLayer: (name: string) => layers.find(l => l.name === name) ?? null,
      listLayers: () => layers,
    },
    blocks: { getBlock: () => null },
  }) as any;

  describe('getPlottableEntities', () => {
    const engine = new PlotEngine();
    const settings = { ...DEFAULT_PLOT_SETTINGS, layerOverrides: {} };

    it('includes entity on visible unlocked layer', () => {
      const layer  = { name: '0', isVisible: true, isFrozen: false, isLocked: false, color: 7 };
      const entity = { id: '1', layer: '0', getBoundingBox: () => ({}) };
      const doc    = makeDoc([entity], [layer]);
      expect(engine.getPlottableEntities(settings, doc)).toContain(entity);
    });

    it('excludes entity on frozen layer', () => {
      const layer  = { name: 'frozen', isVisible: true, isFrozen: true, isLocked: false, color: 7 };
      const entity = { id: '2', layer: 'frozen', getBoundingBox: () => ({}) };
      const doc    = makeDoc([entity], [layer]);
      expect(engine.getPlottableEntities(settings, doc)).not.toContain(entity);
    });

    it('excludes entity on hidden layer', () => {
      const layer  = { name: 'hidden', isVisible: false, isFrozen: false, isLocked: false, color: 7 };
      const entity = { id: '3', layer: 'hidden', getBoundingBox: () => ({}) };
      const doc    = makeDoc([entity], [layer]);
      expect(engine.getPlottableEntities(settings, doc)).not.toContain(entity);
    });

    it('excludes entity with layerOverride visible=false', () => {
      const layer  = { name: '0', isVisible: true, isFrozen: false, isLocked: false, color: 7 };
      const entity = { id: '4', layer: '0', getBoundingBox: () => ({}) };
      const doc    = makeDoc([entity], [layer]);
      const s = { ...settings, layerOverrides: { '0': { visible: false } } };
      expect(engine.getPlottableEntities(s, doc)).not.toContain(entity);
    });

    it('includes entity on locked layer (locked = selectable, plottable)', () => {
      const layer  = { name: 'locked', isVisible: true, isFrozen: false, isLocked: true, color: 7 };
      const entity = { id: '5', layer: 'locked', getBoundingBox: () => ({}) };
      const doc    = makeDoc([entity], [layer]);
      expect(engine.getPlottableEntities(settings, doc)).toContain(entity);
    });
  });

  describe('computeScaleFactor', () => {
    const engine = new PlotEngine();

    it('fit scale fills paper without exceeding', () => {
      const s = { ...DEFAULT_PLOT_SETTINGS, paperSizeKey: 'A4', orientation: 'landscape' as const,
                  scale: { isFit: true, drawUnit: 1, paperMM: 1, label: 'Fit' } };
      const vp = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };
      const factor = engine.computeScaleFactor(s, vp);
      const paperW = PAPER_SIZES.A4.width - 20;   // minus margins
      const paperH = PAPER_SIZES.A4.height - 20;
      expect(factor * 1000).toBeLessThanOrEqual(paperW + 0.001);
      expect(factor * 500).toBeLessThanOrEqual(paperH + 0.001);
    });

    it('1:100 scale returns 0.01 mm per drawing unit', () => {
      const s = { ...DEFAULT_PLOT_SETTINGS,
                  scale: { isFit: false, drawUnit: 100, paperMM: 1, label: '1:100' } };
      const vp = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
      expect(engine.computeScaleFactor(s, vp)).toBeCloseTo(0.01);
    });
  });

  describe('resolveEntityColor', () => {
    const engine = new PlotEngine();
    const layer: any = { color: 7, name: '0' };

    it('monochrome returns black', () => {
      const entity: any = { color: 1, layer: '0' };
      const result = engine.resolveEntityColor(entity, layer, 'monochrome', {});
      expect(result).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('BYLAYER uses layer color', () => {
      const entity: any = { color: 256, layer: '0' };  // 256 = BYLAYER
      const result = engine.resolveEntityColor(entity, layer, 'as_displayed', {});
      // layer.color=7 → aciToRgb(7) — just verify it doesn't crash
      expect(result).toBeDefined();
      expect(typeof result.r).toBe('number');
    });
  });
});
```

---

## STEP 10 — Acceptance Criteria

After implementation, verify all of the following manually:

**Command entry:**
- [ ] Typing `PLOT` + Enter in command line → opens plot dialog (future: for now logs settings + downloads SVG)
- [ ] `PLOT` + `WINDOW` keyword → prompts for two corner picks → downloads SVG of windowed area
- [ ] `PLOT` + `EXTENTS` keyword → downloads SVG of all visible entities
- [ ] `PRINT` and `EXPORT` aliases both work

**Layer respect:**
- [ ] Entities on frozen layer → NOT in SVG output
- [ ] Entities on hidden layer → NOT in SVG output
- [ ] Entities on locked layer → IN SVG output (locked ≠ hidden)
- [ ] Entities on non-current visible layers → IN SVG output

**SVG correctness:**
- [ ] Lines appear as `<line>` elements
- [ ] Circles appear as `<circle>` elements
- [ ] Full-circle arcs render (no gap at seam)
- [ ] Polylines with bulge arcs render as arc paths (not straight lines)
- [ ] Colors match display colors in `as_displayed` mode
- [ ] All entities black in `monochrome` mode
- [ ] SVG opens correctly in browser and Inkscape

**No regressions:**
- [ ] `SAVE` / `LOAD` still work (IOHandler not modified)
- [ ] All existing command tests pass
- [ ] No TypeScript errors (`tsc --noEmit`)

---

## CONSTRAINTS — MUST NOT DO

- Do NOT modify `render/Viewer.ts` except to change access modifiers on `camera` and `renderer`.
- Do NOT modify `core/engine/CommandManager.ts` except to add the three registry entries and the import.
- Do NOT modify `app.ts` except to add the import and the `registerHandler` call.
- Do NOT change `CommandResponse` type definition.
- Do NOT add new methods to `AppContext` interface.
- Do NOT install new npm packages except `jspdf` and `svg2pdf.js` (optional, for PDF output).
- Do NOT break any existing passing tests.
