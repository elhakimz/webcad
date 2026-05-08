import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class ZoomCommand implements Command {
  step = 0
  p1 = { x: 0, y: 0 }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "A" || val === "ALL") {
      return { action: "zoom", zoomType: "all" } as CommandResponse;
    }
    if (val === "E" || val === "EXTENTS") {
        return { action: "zoom", zoomType: "extents" } as CommandResponse;
    }
    if (val === "W" || val === "WINDOW") {
        this.step = 0;
        return "First corner:";
    }
    
    const factor = parseFloat(val);
    if (!isNaN(factor) && factor > 0) {
        return { action: "zoom", zoomType: "scale", factor } as CommandResponse;
    }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 0) {
      this.p1 = { x, y }
      this.step = 1
      return "Second point:"
    } else {
      const p1 = this.p1
      const p2 = { x, y }
      this.step = 0
      return { action: "zoom", zoomType: "window", p1, p2 } as CommandResponse
    }
  }

  getPreview(x: number, y: number, _units: UnitsConfig): import('./types').PreviewObject | null {
    if (this.step === 1) {
      return { type: 'zoomwindow', id: "ZOOM_PREVIEW", x1: this.p1.x, y1: this.p1.y, x2: x, y2: y };
    }
    return null
  }

  getPrompt() {
    if (this.step === 0) return "All/Center/Dynamic/Extents/Left/Previous/Vmax/Window/<Scale(X/XP)>:";
    return "Second point:";
  }
}
