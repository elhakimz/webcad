import { Polyline } from "../model/Polyline"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"
import { calculatePolygonVerticesByCenter, calculatePolygonVerticesByEdge, Point } from "../engine/MathUtils"

let idCounter = 0

export class PolygonCommand implements Command {
  step = 0
  sides = 4
  method: 'center' | 'edge' = 'center'
  center: Point | null = null
  inscribed = true
  p1: Point | null = null

  onPoint(x: number, y: number): CommandResponse {
    if (this.step === 0) {
      // This shouldn't happen if we follow prompt order, 
      // but if a point is clicked instead of number, we might default.
      this.center = { x, y }
      this.method = 'center'
      this.step = 2
      return "Inscribed in circle/Circumscribed about circle (I/C) <I>:"
    }

    if (this.step === 1) {
      this.center = { x, y }
      this.method = 'center'
      this.step = 2
      const echo = FormatUtils.formatPoint(x, y, "Center")
      return `${echo}\nInscribed in circle/Circumscribed about circle (I/C) <I>:`
    }

    if (this.step === 2) {
      if (this.method === 'edge') {
        this.p1 = { x, y }
        this.step = 3
        const echo = FormatUtils.formatPoint(x, y, "P1")
        return `${echo}\nSecond endpoint of edge:`
      } else {
        // If in center mode and we click a point instead of I/C, 
        // we might just treat it as I and use this point as radius?
        // Classic WebCAD requires I/C input. 
        // But for better UX, maybe we default to I.
        return "Please enter I or C to choose method."
      }
    }

    if (this.step === 3) {
      if (this.method === 'edge') {
        const vertices = calculatePolygonVerticesByEdge(this.p1!, { x, y }, this.sides)
        const polyline = this.createPolyline(vertices)
        this.step = 0
        return polyline
      } else {
        const vertices = calculatePolygonVerticesByCenter(this.center!, this.sides, { x, y }, this.inscribed)
        const polyline = this.createPolyline(vertices)
        this.step = 0
        return polyline
      }
    }

    return "Unknown state"
  }

  onInput(text: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase()

    if (val === "E" || val === "EXIT" || val === "QUIT") {
      if (this.step === 1 && val === "E") {
        this.method = 'edge'
        this.step = 2
        return "First endpoint of edge:"
      }
      return { action: "finish" }
    }

    if (this.step === 0) {
      const n = parseInt(val)
      if (!isNaN(n) && n >= 3 && n <= 1024) {
        this.sides = n
        this.step = 1
        return "Edge/<Center of polygon>:"
      }
      // If empty, default to 4
      if (val === "") {
        this.sides = 4
        this.step = 1
        return "Edge/<Center of polygon>:"
      }
      return "Requires an integer between 3 and 1024. Number of sides <4>:"
    }

    if (this.step === 2 && this.method === 'center') {
      if (val === "I" || val === "") {
        this.inscribed = true
        this.step = 3
        return "Radius of circle:"
      }
      if (val === "C") {
        this.inscribed = false
        this.step = 3
        return "Radius of circle:"
      }
      return "Inscribed in circle/Circumscribed about circle (I/C) <I>:"
    }
  }

  getPreview(x: number, y: number) {
    if (this.step === 3) {
      let vertices: Point[] = []
      if (this.method === 'edge') {
        vertices = calculatePolygonVerticesByEdge(this.p1!, { x, y }, this.sides)
      } else {
        vertices = calculatePolygonVerticesByCenter(this.center!, this.sides, { x, y }, this.inscribed)
      }
      return new Polyline("PREVIEW", vertices.map(v => ({ ...v, bulge: 0 })), true)
    }
    return null
  }

  private createPolyline(vertices: Point[]): Polyline {
    const polyline = new Polyline(
      "PL" + (++idCounter),
      vertices.map(v => ({ x: v.x, y: v.y, bulge: 0 })),
      true
    )
    const methodStr = this.method === 'edge' ? "Edge" : (this.inscribed ? "Inscribed" : "Circumscribed")
    const echo = `Polygon created (${this.sides} sides, ${methodStr}).`
    ;(polyline as unknown as { _echo: string })._echo = echo
    return polyline
  }

  getReferencePoints() {
    if (this.step === 3) {
      if (this.method === 'edge') return [this.p1!]
      return [this.center!]
    }
    return []
  }

  getPrompt() {
    if (this.step === 0) return "POLYGON Number of sides <4>:";
    if (this.step === 1) return "Edge/<Center of polygon>:";
    if (this.step === 2) {
      if (this.method === 'edge') return "First endpoint of edge:";
      return "Inscribed in circle/Circumscribed about circle (I/C) <I>:";
    }
    if (this.step === 3) {
      if (this.method === 'edge') return "Second endpoint of edge:";
      return "Radius of circle:";
    }
    return "";
  }
}
