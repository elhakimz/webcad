import { Polyline } from "../model/Polyline"
import { Command, CommandResponse, PreviewObject } from "./types"
import { UnitsConfig } from "../model/Document"
import { FormatUtils } from "../engine/FormatUtils"
import { calculatePolygonVerticesByCenter, calculatePolygonVerticesByEdge, Point } from "../engine/MathUtils"

enum PolygonState {
  SIDES = 0,
  CENTER_OR_EDGE = 1,
  INSCRIBED = 2,
  RADIUS = 3,
  EDGE_P1 = 10,
  EDGE_P2 = 11
}

export class PolygonCommand implements Command {
  step = PolygonState.SIDES
  numSides = 4
  center: Point | null = null
  inscribed = true
  edgeP1: Point | null = null

  onInput(text: string, id: string, units: UnitsConfig, pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    if (this.step === PolygonState.SIDES) {
      const n = parseInt(val)
      if (!isNaN(n) && n >= 3) {
        this.numSides = n
        this.step = PolygonState.CENTER_OR_EDGE
        return "Edge/<Center of polygon>:";
      }
      if (val === "") {
        this.numSides = 4
        this.step = PolygonState.CENTER_OR_EDGE
        return "Edge/<Center of polygon>:";
      }
      return "Number of sides <4>:";
    }

    if (this.step === PolygonState.CENTER_OR_EDGE) {
      if (val === "E" || val === "EDGE") {
        this.step = PolygonState.EDGE_P1 // Start Edge flow
        return "First endpoint of edge:"
      }
    }



    if (this.step === PolygonState.RADIUS) {
      const radius = parseFloat(val);
      if (!isNaN(radius) && radius > 0) {
        if (pickPt) {
          // Calculate point at cursor angle with specified radius
          const dx = pickPt.x - this.center!.x;
          const dy = pickPt.y - this.center!.y;
          const angle = Math.atan2(dy, dx);
          const x = this.center!.x + radius * Math.cos(angle);
          const y = this.center!.y + radius * Math.sin(angle);
          
          return this.onPoint(x, y, id, units, doc);
        } else {
          // Default angle 0 if no pickPt
          const x = this.center!.x + radius;
          const y = this.center!.y;
          return this.onPoint(x, y, id, units, doc);
        }
      }
      return "Invalid radius. Radius of polygon:";
    }
  }

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument): CommandResponse {
    if (this.step === PolygonState.CENTER_OR_EDGE) {
      this.center = { x, y }
      this.step = PolygonState.RADIUS
      this.inscribed = true // Default to inscribed
      return "Radius of polygon:"
    }

    if (this.step === PolygonState.RADIUS) {
      const vertices = calculatePolygonVerticesByCenter(this.center!, this.numSides, { x, y }, this.inscribed)
      const poly = new Polyline(id, vertices.map(v => ({ ...v, bulge: 0 })), true, doc?.currentElevation || 0, doc?.currentThickness || 0)
      
      const dist = Math.sqrt((x - this.center!.x) ** 2 + (y - this.center!.y) ** 2)
      const angle = Math.atan2(y - this.center!.y, x - this.center!.x) * (180 / Math.PI)
      const echo = `Polygon created. Radius: ${FormatUtils.formatDistance(dist, units)} Angle: ${angle.toFixed(2)}°`
      ;(poly as unknown as { _echo: string })._echo = echo
      
      this.step = PolygonState.SIDES
      return poly
    }

    // Edge Flow
    if (this.step === PolygonState.EDGE_P1) {
        this.edgeP1 = { x, y }
        this.step = PolygonState.EDGE_P2
        return "Second endpoint of edge:"
    }

    if (this.step === PolygonState.EDGE_P2) {
        const vertices = calculatePolygonVerticesByEdge(this.edgeP1!, { x, y }, this.numSides)
        const poly = new Polyline(id, vertices.map(v => ({ ...v, bulge: 0 })), true, doc?.currentElevation || 0, doc?.currentThickness || 0)
        this.step = PolygonState.SIDES
        return poly
    }

    return this.getPrompt()
  }

  getPreview(x: number, y: number, _units: UnitsConfig): PreviewObject | null {
    if (this.step === PolygonState.RADIUS) {
      const vertices = calculatePolygonVerticesByCenter(this.center!, this.numSides, { x, y }, this.inscribed)
      return { type: 'polyline_preview', vertices: vertices.map(v => ({ ...v, bulge: 0 })), closed: true };
    }
    if (this.step === PolygonState.EDGE_P2) {
      const vertices = calculatePolygonVerticesByEdge(this.edgeP1!, { x, y }, this.numSides)
      return { type: 'polyline_preview', vertices: vertices.map(v => ({ ...v, bulge: 0 })), closed: true };
    }
    return null
  }

  getReferencePoints() {
    if (this.step === PolygonState.RADIUS) return [this.center!]
    if (this.step === PolygonState.EDGE_P2) return [this.edgeP1!]
    return []
  }

  getBasePoint() {
      if (this.step === PolygonState.RADIUS) return this.center;
      if (this.step === PolygonState.EDGE_P2) return this.edgeP1;
      return null;
  }

  getPrompt() {
    if (this.step === PolygonState.SIDES) return "Number of sides <4>:";
    if (this.step === PolygonState.CENTER_OR_EDGE) return "Edge/<Center of polygon>:";
    if (this.step === PolygonState.RADIUS) return "Radius of polygon:";
    if (this.step === PolygonState.EDGE_P1) return "First endpoint of edge:";
    if (this.step === PolygonState.EDGE_P2) return "Second endpoint of edge:";
    return "";
  }

  getOptions(_units: UnitsConfig): string[] {
    if (this.step === PolygonState.CENTER_OR_EDGE) return ["Edge"];
    return [];
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    if (this.step === PolygonState.SIDES) return ["Number of sides <4>:"];
    if (this.step === PolygonState.CENTER_OR_EDGE) return ["Edge/<Center of polygon>:"];
    
    if (this.step === PolygonState.RADIUS) {
      const dist = Math.sqrt((x - this.center!.x) ** 2 + (y - this.center!.y) ** 2);
      return [`Radius of polygon:`, `D:${FormatUtils.formatDistance(dist, units)}`];
    }
    
    if (this.step === PolygonState.EDGE_P1) return ["First endpoint of edge:"];
    
    if (this.step === PolygonState.EDGE_P2) {
      const dist = Math.sqrt((x - this.edgeP1!.x) ** 2 + (y - this.edgeP1!.y) ** 2);
      return [`Second endpoint of edge:`, `D:${FormatUtils.formatDistance(dist, units)}`];
    }
    
    return null;
  }
}
