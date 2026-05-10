import { Polyline, PolylineVertex } from "../model/Polyline"
import { Command, CommandResponse, PreviewObject } from "./types"
import { UnitsConfig } from "../model/Document"
import { FormatUtils } from "../engine/FormatUtils"
import { Point } from "../engine/MathUtils"

export class PolylineCommand implements Command {
  step = 0
  vertices: PolylineVertex[] = []
  closed = false
  isArcMode = false
  private entityId: string | null = null;
  private currentDirection: { x: number, y: number } | null = null;

  onPoint(x: number, y: number, id: string, units: UnitsConfig): CommandResponse {
    if (this.step === 0) {
      this.entityId = id;
      this.vertices = [{ x, y, bulge: 0 }]
      this.step = 1
      return FormatUtils.formatPoint(x, y, units, "P1")
    } else {
      const prev = this.vertices[this.vertices.length - 1];
      const v: PolylineVertex = { x, y, bulge: 0 }
      
      if (this.isArcMode) {
          if (this.currentDirection) {
              const bulgeResult = this.calculateTangentArcBulge(prev, v, this.currentDirection);
              prev.bulge = bulgeResult.bulge;
              this.currentDirection = bulgeResult.endDirection;
          } else {
              prev.bulge = 0.5; // Default semi-circle fallback
              this.currentDirection = { x: 1, y: 0 };
          }
      } else {
          // Line mode - update direction
          const dx = x - prev.x;
          const dy = y - prev.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 1e-6) {
              this.currentDirection = { x: dx / len, y: dy / len };
          }
      }

      this.vertices.push(v)
      const poly = new Polyline(this.entityId || id, [...this.vertices], this.closed)
      return poly
    }
  }

  onInput(text: string, id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    const currentId = this.entityId || id;
    if (val === "C" || val === "CLOSE") {
      this.closed = true
      const poly = new Polyline(currentId, [...this.vertices], true)
      return { action: "close", entity: poly } as CommandResponse;
    }
    if (val === "U" || val === "UNDO") {
      if (this.vertices.length > 1) {
        this.vertices.pop()
        return new Polyline(currentId, [...this.vertices], false)
      }
      return "Nothing to undo. PLINE specify start point:";
    }
    if (val === "A" || val === "ARC") {
        this.isArcMode = true;
        return "Arc mode enabled. Specify endpoint of arc:";
    }
    if (val === "L" || val === "LINE") {
        this.isArcMode = false;
        return "Line mode enabled. Specify next point:";
    }
    if (val === "") {
        if (this.vertices.length > 1) {
            const poly = new Polyline(currentId, [...this.vertices], false)
            return { action: "close", entity: poly } as CommandResponse;
        }
        return { action: "close" } as CommandResponse;
    }
  }

  getPreview(x: number, y: number, _units: UnitsConfig): PreviewObject | null {
    if (this.step === 1 && this.vertices.length > 0) {
      const prev = this.vertices[this.vertices.length - 1];
      let bulge = 0;
      if (this.isArcMode && this.currentDirection) {
        const bulgeResult = this.calculateTangentArcBulge(prev, { x, y }, this.currentDirection);
        bulge = bulgeResult.bulge;
      }
      
      const tempVertices = [...this.vertices];
      if (tempVertices.length > 0) {
          tempVertices[tempVertices.length - 1] = { ...prev, bulge };
      }
      tempVertices.push({ x, y, bulge: 0 });
      
      return { type: 'polyline_preview', vertices: tempVertices, closed: this.closed };
    }
    return null
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    if (this.step === 1 && this.vertices.length > 0) {
      const prev = this.vertices[this.vertices.length - 1];
      const dx = x - prev.x;
      const dy = y - prev.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle < 0) angle += 360;

      const modeStr = this.isArcMode ? "A" : "L";
      const distStr = `D:${FormatUtils.formatValue(dist, units)}`;
      const angleStr = `A:${angle.toFixed(1)}`;

      return [modeStr, distStr, angleStr];
    }
    return null;
  }

  getReferencePoints(): Point[] {
    if (this.vertices.length > 0) {
        return this.vertices.map(v => ({ x: v.x, y: v.y }));
    }
    return []
  }

  getBasePoint() {
      if (this.vertices.length > 0) {
          const last = this.vertices[this.vertices.length - 1];
          return { x: last.x, y: last.y };
      }
      return null;
  }

  getPrompt() {
    if (this.step === 0) return "PLINE specify start point:";
    const mode = this.isArcMode ? "Arc" : "Line";
    return `Arc/Close/Halfwidth/Length/Undo/Width/<Endpoint of ${mode}>:`;
  }

  getOptions(_units: UnitsConfig): string[] {
    if (this.step === 1) {
      const options = ["Close", "Undo"];
      if (this.isArcMode) {
        options.push("Line");
      } else {
        options.push("Arc");
      }
      return options;
    }
    return [];
  }

  private calculateTangentArcBulge(p1: {x: number, y: number}, p2: {x: number, y: number}, vTangent: {x: number, y: number}): { bulge: number, endDirection: {x: number, y: number} } {
    const x = p2.x - p1.x;
    const y = p2.y - p1.y;
    const tx = vTangent.x;
    const ty = vTangent.y;

    const denom = 2 * (y * tx - x * ty);
    if (Math.abs(denom) < 1e-6) {
      // Points are collinear with tangent! Render as line.
      return { bulge: 0, endDirection: vTangent };
    }

    const R = (x * x + y * y) / denom;
    
    // Center of arc
    const cx = p1.x - R * ty;
    const cy = p1.y + R * tx;

    // Chord midpoint
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;

    // Distance from center to chord midpoint
    const d = Math.sqrt((cx - mx) * (cx - mx) + (cy - my) * (cy - my));
    
    // Sagitta h
    const h = Math.abs(R) - d;

    // Chord length L
    const L = Math.sqrt(x * x + y * y);

    // Bulge = h / (L / 2)
    let bulge = h / (L / 2);
    
    // Sign of bulge matches sign of R
    if (R < 0) bulge = -bulge;

    // Tangent at end point (P2)
    const r2x = p2.x - cx;
    const r2y = p2.y - cy;
    const r2len = Math.sqrt(r2x * r2x + r2y * r2y);
    
    let endDirection = { x: 1, y: 0 };
    if (r2len > 1e-6) {
      if (R > 0) {
        endDirection = { x: -r2y / r2len, y: r2x / r2len };
      } else {
        endDirection = { x: r2y / r2len, y: -r2x / r2len };
      }
    }

    return { bulge, endDirection };
  }
}
