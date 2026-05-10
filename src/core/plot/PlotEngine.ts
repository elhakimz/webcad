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
    let r = (hex >> 16) & 0xFF;
    let g = (hex >> 8)  & 0xFF;
    let b =  hex        & 0xFF;

    // Convert white to black for plotting on white paper
    if (r === 255 && g === 255 && b === 255) {
      r = 0;
      g = 0;
      b = 0;
    }

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
    // Entity-level lineweight (future), then layer override, then layer property, then default
    const override = layerOverrides[entity.layer];
    if (override?.lineweight !== undefined) return override.lineweight;

    // Check layer property if it's set (not -1)
    if (layer.lineWeight !== undefined && layer.lineWeight > 0) {
      return layer.lineWeight;
    }

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
