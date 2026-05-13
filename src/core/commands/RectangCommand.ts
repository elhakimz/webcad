import { Polyline } from "../model/Polyline"
import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { FormatUtils } from "../engine/FormatUtils"

export class RectangCommand implements Command {
  step = 0
  firstCorner = { x: 0, y: 0 }

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument): CommandResponse {
    if (this.step === 0) {
      this.firstCorner = { x, y }
      this.step = 1
      return FormatUtils.formatPoint(x, y, units, "P1", doc?.currentElevation || 0)
    } else {
      const x2 = x
      const y2 = y
      const x1 = this.firstCorner.x
      const y1 = this.firstCorner.y

      const vertices = [
        { x: x1, y: y1, bulge: 0 },
        { x: x2, y: y1, bulge: 0 },
        { x: x2, y: y2, bulge: 0 },
        { x: x1, y: y2, bulge: 0 }
      ]

      const poly = new Polyline(id, vertices, true, doc?.currentElevation || 0, doc?.currentThickness || 0)
      this.step = 0
      return poly
    }
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    if (text.trim().toUpperCase() === "EXIT") {
      this.step = 0
      return "Command canceled."
    }
  }

  getPreview(x: number, y: number, _units: UnitsConfig): import('./types').PreviewObject | null {
    if (this.step === 1) {
      const x2 = x
      const y2 = y
      const x1 = this.firstCorner.x
      const y1 = this.firstCorner.y

      const vertices = [
        { x: x1, y: y1, bulge: 0 },
        { x: x2, y: y1, bulge: 0 },
        { x: x2, y: y2, bulge: 0 },
        { x: x1, y: y2, bulge: 0 }
      ]

      return { type: 'polyline_preview', vertices, closed: true };
    }
    return null
  }

  getReferencePoints() {
    if (this.step === 1) return [this.firstCorner]
    return []
  }

  getPrompt() {
    if (this.step === 0) return "RECTANG first corner:";
    return "Other corner:";
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    if (this.step === 0) {
      return ["First corner:"];
    } else {
      const dx = x - this.firstCorner.x;
      const dy = y - this.firstCorner.y;
      const distStr = FormatUtils.formatDistance(Math.sqrt(dx*dx + dy*dy), units);
      const angleStr = FormatUtils.formatAngle(Math.atan2(dy, dx), units.precision);
      return [`D:${distStr}`, `A:${angleStr}`];
    }
  }

  getOptions(_units: UnitsConfig): string[] {
    return [];
  }
}
