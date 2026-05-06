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

  onPoint(x: number, y: number, id: string, units: UnitsConfig): CommandResponse {
    if (this.step === 0) {
      this.entityId = id;
      this.vertices = [{ x, y, bulge: 0 }]
      this.step = 1
      return FormatUtils.formatPoint(x, y, units, "P1")
    } else {
      const v: PolylineVertex = { x, y, bulge: 0 }
      
      // If we were in ARC mode, the previous vertex should have a bulge
      if (this.isArcMode) {
          const prev = this.vertices[this.vertices.length - 1];
          // Simple bulge for semi-circle for now if in arc mode
          prev.bulge = 0.5; 
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
    if (val === "" && this.vertices.length > 1) {
        const poly = new Polyline(currentId, [...this.vertices], false)
        return { action: "close", entity: poly } as CommandResponse;
    }
  }

  getPreview(x: number, y: number, _units: UnitsConfig): PreviewObject | null {
    if (this.step === 1 && this.vertices.length > 0) {
      const tempVertices = [...this.vertices, { x, y, bulge: this.isArcMode ? 0.5 : 0 }]
      return { type: 'polyline_preview', vertices: tempVertices, closed: this.closed };
    }
    return null
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
}
