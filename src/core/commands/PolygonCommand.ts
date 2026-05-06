import { Polyline } from "../model/Polyline"
import { Command, CommandResponse, PreviewObject } from "./types"
import { FormatUtils } from "../engine/FormatUtils"
import { calculatePolygonVerticesByCenter, calculatePolygonVerticesByEdge, Point } from "../engine/MathUtils"

export class PolygonCommand implements Command {
  step = 0
  numSides = 4
  center: Point | null = null
  inscribed = true
  edgeP1: Point | null = null

  onInput(text: string, _id: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    if (this.step === 0) {
      const n = parseInt(val)
      if (!isNaN(n) && n >= 3) {
        this.numSides = n
        this.step = 1
        return "Edge/<Center of polygon>:"
      }
      return "Number of sides <4>:"
    }

    if (this.step === 1) {
      if (val === "E" || val === "EDGE") {
        this.step = 10 // Start Edge flow
        return "First endpoint of edge:"
      }
    }

    if (this.step === 2) {
      this.inscribed = (val !== "C");
      this.step = 3
      return "Radius of polygon:"
    }
  }

  onPoint(x: number, y: number, id: string): CommandResponse {
    if (this.step === 1) {
      this.center = { x, y }
      this.step = 2
      return "Inscribed in circle/Circumscribed about circle (I/C) <I>:"
    }

    if (this.step === 3) {
      const vertices = calculatePolygonVerticesByCenter(this.center!, this.numSides, { x, y }, this.inscribed)
      const poly = new Polyline(id, vertices.map(v => ({ ...v, bulge: 0 })), true)
      
      const dist = Math.sqrt((x - this.center!.x) ** 2 + (y - this.center!.y) ** 2)
      const angle = Math.atan2(y - this.center!.y, x - this.center!.x) * (180 / Math.PI)
      const echo = `Polygon created. Radius: ${FormatUtils.formatDistance(dist)} Angle: ${angle.toFixed(2)}°`
      ;(poly as unknown as { _echo: string })._echo = echo
      
      this.step = 0
      return poly
    }

    // Edge Flow
    if (this.step === 10) {
        this.edgeP1 = { x, y }
        this.step = 11
        return "Second endpoint of edge:"
    }

    if (this.step === 11) {
        const vertices = calculatePolygonVerticesByEdge(this.edgeP1!, { x, y }, this.numSides)
        const poly = new Polyline(id, vertices.map(v => ({ ...v, bulge: 0 })), true)
        this.step = 0
        return poly
    }

    return this.getPrompt()
  }

  getPreview(x: number, y: number): PreviewObject | null {
    if (this.step === 3) {
      const vertices = calculatePolygonVerticesByCenter(this.center!, this.numSides, { x, y }, this.inscribed)
      return { type: 'polyline_preview', vertices: vertices.map(v => ({ ...v, bulge: 0 })), closed: true };
    }
    if (this.step === 11) {
      const vertices = calculatePolygonVerticesByEdge(this.edgeP1!, { x, y }, this.numSides)
      return { type: 'polyline_preview', vertices: vertices.map(v => ({ ...v, bulge: 0 })), closed: true };
    }
    return null
  }

  getReferencePoints() {
    if (this.step === 3) return [this.center!]
    if (this.step === 11) return [this.edgeP1!]
    return []
  }

  getBasePoint() {
      if (this.step === 3) return this.center;
      if (this.step === 11) return this.edgeP1;
      return null;
  }

  getPrompt() {
    if (this.step === 0) return "Number of sides <4>:";
    if (this.step === 1) return "Edge/<Center of polygon>:";
    if (this.step === 2) return "Inscribed in circle/Circumscribed about circle (I/C) <I>:";
    if (this.step === 3) return "Radius of polygon:";
    if (this.step === 10) return "First endpoint of edge:";
    if (this.step === 11) return "Second endpoint of edge:";
    return "";
  }
}
