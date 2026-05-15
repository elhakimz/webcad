import { Ellipse } from "../model/Ellipse"
import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"
import { Point } from "../engine/MathUtils"
import { FormatUtils } from "../engine/FormatUtils"

export class EllipseCommand implements Command {
  step = 0
  p1: Point = { x: 0, y: 0 }
  p2: Point = { x: 0, y: 0 }
  center: Point = { x: 0, y: 0 }
  majorRadius = 0
  majorX = 0
  majorY = 0
  elevation = 0

  onPoint(x: number, y: number, id: string, _units: UnitsConfig, doc?: import('../model/Document').IDocument): CommandResponse {
    if (this.step === 0) {
      this.p1 = { x, y }
      this.elevation = doc?.currentElevation || 0
      this.step = 1
      return "Axis endpoint 2:"
    } else if (this.step === 1) {
      this.p2 = { x, y }
      this.center = { x: (this.p1.x + x) / 2, y: (this.p1.y + y) / 2 }
      const dx = x - this.center.x
      const dy = y - this.center.y
      this.majorRadius = Math.sqrt(dx * dx + dy * dy)
      this.majorX = dx
      this.majorY = dy
      this.step = 2
      return "Distance to other axis:"
    } else {
      // Calculate minor radius (distance from center to point projected on perpendicular)
      const dx = x - this.center.x
      const dy = y - this.center.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      const ratio = dist / this.majorRadius
      const entity = new Ellipse(id, this.center.x, this.center.y, this.majorX, this.majorY, Math.min(1.0, ratio), 0, Math.PI * 2, true)
      entity.elevation = this.elevation
      entity.thickness = doc?.currentThickness || 0
      this.step = 0
      return entity
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
      return { type: 'xmarker', x: this.p1.x, y: this.p1.y, size: 5 };
    }
    if (this.step === 2) {
      const dx = x - this.center.x
      const dy = y - this.center.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const ratio = dist / this.majorRadius
      const preview = new Ellipse("PREVIEW", this.center.x, this.center.y, this.majorX, this.majorY, Math.min(1.0, ratio), 0, Math.PI * 2, true);
      preview.elevation = this.elevation;
      return preview;
    }
    return null
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    if (this.step === 1) {
      const dx = x - this.p1.x;
      const dy = y - this.p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle < 0) angle += 360;

      const distStr = FormatUtils.formatValue(dist, units);
      const angleStr = angle.toFixed(1);

      return [distStr, angleStr];
    } else if (this.step === 2) {
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle < 0) angle += 360;

      const distStr = FormatUtils.formatValue(dist, units);
      const angleStr = angle.toFixed(1);

      return [distStr, angleStr];
    }
    return null;
  }

  getReferencePoints() {
    if (this.step === 1) return [this.p1]
    if (this.step === 2) return [this.center]
    return []
  }

  getPrompt() {
    if (this.step === 0) return "Axis endpoint 1:";
    if (this.step === 1) return "Axis endpoint 2:";
    return "Distance to other axis:";
  }
}
