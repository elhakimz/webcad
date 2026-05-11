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
import { tessellateSpline, bulgeToArc, generateHatchLines, clipLineWithPolygon } from '../engine/MathUtils';

const DEFAULT_HATCH_PLOT_WIDTH = 0.13;
const DEFAULT_DIMENSION_PLOT_WIDTH = 0.13;
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
      const pts = entity.sampledPoints || [];
      if (pts.length < 2) return '';
      const svgPts = pts.map(p => toSVG(p.x, p.y));
      const d = 'M ' + svgPts.map(p => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' L ');
      return `<path d="${d}" ${stroke} ${dash}/>`;
    }

    if (entity instanceof Hatch) {
      const hatchStroke = `stroke="${color}" stroke-width="${DEFAULT_HATCH_PLOT_WIDTH}mm" fill="none"`;
      return this.renderHatch(entity, toSVG, toLen, hatchStroke);
    }

    if (entity instanceof Text) {
      const p = toSVG(entity.x, entity.y);
      const h = toLen(entity.height || 2.5);
      const angleDeg = -(entity.rotation || 0); // Text rotation is in degrees
      return `<text x="${p.x.toFixed(4)}" y="${p.y.toFixed(4)}"
                    font-size="${h.toFixed(4)}mm"
                    font-family="Arial"
                    fill="black"
                    transform="rotate(${angleDeg.toFixed(4)},${p.x.toFixed(4)},${p.y.toFixed(4)})"
                    >${this.escapeXML(entity.text ?? '')}</text>`;
    }

    if (entity instanceof MText) {
      return this.renderMText(entity, toSVG, toLen, color);
    }

    if (entity instanceof Dimension) {
      const p1 = toSVG(entity.x1, entity.y1);
      const p2 = toSVG(entity.x2, entity.y2);
      const val = entity.computeValue();
      const text = val.toFixed(entity.style.precision || 2);
      const h = toLen(entity.style.textHeight || 2.5);
      
      let linesSVG = '';
      let textSVG = '';
      
      const createArrowSVG = (tip: {x:number, y:number}, dirX: number, dirY: number) => {
        const s = toLen(entity.style.arrowSize || 2.5); // Restore full size for arrows
        const bx = tip.x - dirX * s;
        const by = tip.y - dirY * s;
        const px = -dirY;
        const py = dirX;
        const lx = bx + px * s * 0.4;
        const ly = by + py * s * 0.4;
        const rx = bx - px * s * 0.4;
        const ry = by - py * s * 0.4;
        return `<path d="M ${tip.x.toFixed(4)} ${tip.y.toFixed(4)} L ${lx.toFixed(4)} ${ly.toFixed(4)} L ${rx.toFixed(4)} ${ry.toFixed(4)} Z" fill="${color}"/>`;
      };
      
      const isHorizontal = Math.abs(entity.x2 - entity.x1) > Math.abs(entity.y2 - entity.y1);
      const dimStroke = `stroke="${color}" stroke-width="${DEFAULT_DIMENSION_PLOT_WIDTH}mm" fill="none"`;
      
      if (entity.type === 'LINEAR' || entity.type === 'ALIGNED') {
        if (isHorizontal) {
          const dimY = entity.dimLineLocation ? entity.dimLineLocation.y : Math.min(entity.y1, entity.y2) - 10;
          const pDim1 = toSVG(entity.x1, dimY);
          const pDim2 = toSVG(entity.x2, dimY);
          
          linesSVG += `<line x1="${pDim1.x.toFixed(4)}" y1="${pDim1.y.toFixed(4)}" x2="${pDim2.x.toFixed(4)}" y2="${pDim2.y.toFixed(4)}" ${dimStroke}/>`;
          linesSVG += `\n<line x1="${p1.x.toFixed(4)}" y1="${p1.y.toFixed(4)}" x2="${pDim1.x.toFixed(4)}" y2="${pDim1.y.toFixed(4)}" ${dimStroke}/>`;
          linesSVG += `\n<line x1="${p2.x.toFixed(4)}" y1="${p2.y.toFixed(4)}" x2="${pDim2.x.toFixed(4)}" y2="${pDim2.y.toFixed(4)}" ${dimStroke}/>`;
          
          const dx = pDim2.x - pDim1.x;
          const dy = pDim2.y - pDim1.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const ux = len > 1e-6 ? dx / len : 1;
          const uy = len > 1e-6 ? dy / len : 0;
          
          linesSVG += `\n` + createArrowSVG(pDim1, -ux, -uy);
          linesSVG += `\n` + createArrowSVG(pDim2, ux, uy);
          
          const mx = (pDim1.x + pDim2.x) / 2;
          const my = pDim1.y - h * 0.5; // Offset text based on height
          
          textSVG = `<text x="${mx.toFixed(4)}" y="${my.toFixed(4)}"
                                 font-size="${h.toFixed(4)}mm" font-family="Arial"
                                 fill="black" text-anchor="middle"
                                 >${text}</text>`;
        } else {
          const dimX = entity.dimLineLocation ? entity.dimLineLocation.x : Math.min(entity.x1, entity.x2) - 10;
          const pDim1 = toSVG(dimX, entity.y1);
          const pDim2 = toSVG(dimX, entity.y2);
          
          linesSVG += `<line x1="${pDim1.x.toFixed(4)}" y1="${pDim1.y.toFixed(4)}" x2="${pDim2.x.toFixed(4)}" y2="${pDim2.y.toFixed(4)}" ${dimStroke}/>`;
          linesSVG += `\n<line x1="${p1.x.toFixed(4)}" y1="${p1.y.toFixed(4)}" x2="${pDim1.x.toFixed(4)}" y2="${pDim1.y.toFixed(4)}" ${dimStroke}/>`;
          linesSVG += `\n<line x1="${p2.x.toFixed(4)}" y1="${p2.y.toFixed(4)}" x2="${pDim2.x.toFixed(4)}" y2="${pDim2.y.toFixed(4)}" ${dimStroke}/>`;
          
          const dx = pDim2.x - pDim1.x;
          const dy = pDim2.y - pDim1.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const ux = len > 1e-6 ? dx / len : 1;
          const uy = len > 1e-6 ? dy / len : 0;
          
          linesSVG += `\n` + createArrowSVG(pDim1, -ux, -uy);
          linesSVG += `\n` + createArrowSVG(pDim2, ux, uy);
          
          const mx = pDim1.x - h * 0.5; // Offset text based on height
          const my = (pDim1.y + pDim2.y) / 2;
          
          textSVG = `<text x="${mx.toFixed(4)}" y="${my.toFixed(4)}"
                                 font-size="${h.toFixed(4)}mm" font-family="Arial"
                                 fill="black" text-anchor="end" dy="0.35em"
                                 >${text}</text>`;
        }
      } else if (entity.type === 'RADIUS') {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = len > 1e-6 ? dx / len : 1;
        const uy = len > 1e-6 ? dy / len : 0;
        
        linesSVG = `<line x1="${p1.x.toFixed(4)}" y1="${p1.y.toFixed(4)}"
                           x2="${p2.x.toFixed(4)}" y2="${p2.y.toFixed(4)}"
                           ${dimStroke}/>`;
                           
        linesSVG += `\n` + createArrowSVG(p2, ux, uy); // Arrow at p2 pointing outwards
        
        // Place text slightly offset from p2
        const mx = p2.x + ux * 2;
        const my = p2.y + uy * 2;
        
        textSVG = `<text x="${mx.toFixed(4)}" y="${my.toFixed(4)}"
                               font-size="${h.toFixed(4)}mm" font-family="Arial"
                               fill="black" text-anchor="${ux > 0 ? 'start' : 'end'}" dy="0.35em"
                               >${text}</text>`;
      } else {
        // Fallback for DIAMETER, ANGULAR
        linesSVG = `<line x1="${p1.x.toFixed(4)}" y1="${p1.y.toFixed(4)}"
                           x2="${p2.x.toFixed(4)}" y2="${p2.y.toFixed(4)}"
                           ${dimStroke}/>`;
                           
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        
        textSVG = `<text x="${mx.toFixed(4)}" y="${my.toFixed(4)}"
                               font-size="${h.toFixed(4)}mm" font-family="Arial"
                               fill="black" text-anchor="middle" dy="0.35em"
                               >${text}</text>`;
      }
      
      return `${linesSVG}\n${textSVG}`;
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
                          fill="black">${this.escapeXML((entity as any).text ?? '')}</text>`;
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
        const arc = bulgeToArc(v0, v1, bulge);
        if (arc) {
          const d = this.arcPath(arc.cx, arc.cy, arc.r,
                                 arc.startAngle, arc.endAngle,
                                 bulge > 0, toSVG, toLen);
          parts.push(d);
        }
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
        const arc = bulgeToArc(last, first, bulge);
        if (arc) {
          parts.push(this.arcPath(arc.cx, arc.cy, arc.r, arc.startAngle, arc.endAngle, bulge > 0, toSVG, toLen));
        }
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
    toLen: (len: number) => number,
    stroke: string,
  ): string {
    if (entity.boundaryVertices.length < 3) return '';

    const patternData = entity.getPatternData();
    const vertices = entity.boundaryVertices;
    const parts: string[] = [];

    if (patternData && patternData.lines.length > 0) {
      for (const lineDef of patternData.lines) {
        const effectiveAngle = lineDef.angle + entity.angle;
        const spacing = lineDef.spacing * entity.patternScale;
        const offsetX = lineDef.offset[0];
        const offsetY = lineDef.offset[1];
        const lines = generateHatchLines(vertices, spacing, effectiveAngle, offsetX, offsetY);

        let localStroke = stroke;
        if (lineDef.dashPattern && lineDef.dashPattern.length > 0) {
          const dashArray = lineDef.dashPattern.map(d => Math.abs(toLen(d))).join(' ');
          localStroke = `${stroke} stroke-dasharray="${dashArray}"`;
        }

        for (const line of lines) {
          const segments = clipLineWithPolygon(line, entity.boundaryVertices);
          for (const seg of segments) {
            const p1 = toSVG(seg.p1.x, seg.p1.y);
            const p2 = toSVG(seg.p2.x, seg.p2.y);
            parts.push(`<line x1="${p1.x.toFixed(4)}" y1="${p1.y.toFixed(4)}"
                              x2="${p2.x.toFixed(4)}" y2="${p2.y.toFixed(4)}"
                              ${localStroke}/>`);
          }
        }
      }
    } else {
      const spacing = 8 * entity.patternScale;
      const angle = entity.angle;
      const lines = generateHatchLines(vertices, spacing, angle);

      for (const line of lines) {
        const segments = clipLineWithPolygon(line, entity.boundaryVertices);
        for (const seg of segments) {
          const p1 = toSVG(seg.p1.x, seg.p1.y);
          const p2 = toSVG(seg.p2.x, seg.p2.y);
          parts.push(`<line x1="${p1.x.toFixed(4)}" y1="${p1.y.toFixed(4)}"
                            x2="${p2.x.toFixed(4)}" y2="${p2.y.toFixed(4)}"
                            ${stroke}/>`);
        }
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
    const parts: string[] = [];
    const h = toLen(entity.textHeight || 2.5);

    const cx = entity.bounds.x + entity.width / 2;
    const cy = entity.bounds.y + entity.height / 2;
    const centerSVG = toSVG(cx, cy);
    const angleDeg = -entity.rotation * (180 / Math.PI);

    parts.push(`<g transform="rotate(${angleDeg.toFixed(4)}, ${centerSVG.x.toFixed(4)}, ${centerSVG.y.toFixed(4)})">`);

    for (const line of entity.layoutLines) {
      const p = toSVG(line.x, line.y);
      parts.push(`<text x="${p.x.toFixed(4)}" y="${p.y.toFixed(4)}"
                        font-size="${h.toFixed(4)}mm" font-family="Arial"
                        fill="black">${this.escapeXML(line.text)}</text>`);
    }

    parts.push('</g>');
    return parts.join('\n');
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
