import { Solid } from "../model/Solid"
import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"
import { FormatUtils } from "../engine/FormatUtils"

export class SolidCommand implements Command {
  step = 0
  vertices: { x: number, y: number }[] = []
  private entityId: string | null = null;

  onPoint(x: number, y: number, id: string, units: UnitsConfig): CommandResponse {
    if (this.step === 0) {
      this.entityId = id;
      this.vertices = [{ x, y }]
      this.step = 1
      return FormatUtils.formatPoint(x, y, units, "P1")
    } else if (this.step === 1) {
      this.vertices.push({ x, y })
      this.step = 2
      return FormatUtils.formatPoint(x, y, units, "P2")
    } else if (this.step === 2) {
      this.vertices.push({ x, y })
      this.step = 3
      return FormatUtils.formatPoint(x, y, units, "P3")
    } else {
      this.vertices.push({ x, y })
      const solid = new Solid(this.entityId || id, [...this.vertices])
      this.step = 0
      this.vertices = []
      this.entityId = null;
      return solid
    }
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    if (text.trim().toUpperCase() === "EXIT") {
      this.step = 0
      this.vertices = []
      return "Command canceled."
    }
  }

  getPreview(x: number, y: number, _units: UnitsConfig): import('./types').PreviewObject | null {
    if (this.step > 0) {
      const temp = [...this.vertices, { x, y }]
      return { type: 'solidpoints', points: temp };
    }
    return null
  }

  getReferencePoints() {
    return this.vertices
  }

  getPrompt() {
    if (this.step === 0) return "SOLID first point:";
    if (this.step === 1) return "Second point:";
    if (this.step === 2) return "Third point:";
    return "Fourth point:";
  }
}
