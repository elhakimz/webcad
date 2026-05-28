import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { FormatUtils } from "../engine/FormatUtils"

export class PlaneCommand implements Command {
  step = 0
  firstCorner = { x: 0, y: 0 }
  width = 0
  height = 0
  imageUrl = ""
  displayMode: 'STRETCH' | 'FIT' | 'ZOOM' = 'FIT'
  zoomFactor = 1.0
  opacity = 0.75

  onPoint(x: number, y: number, _id: string, units: UnitsConfig, doc?: IDocument): CommandResponse {
    if (this.step === 0) {
      this.firstCorner = { x, y }
      this.step = 1
      return FormatUtils.formatPoint(x, y, units, "P1", doc?.currentElevation || 0)
    } else if (this.step === 1) {
      this.width = Math.abs(x - this.firstCorner.x)
      this.height = Math.abs(y - this.firstCorner.y)
      if (this.width < 1e-6 || this.height < 1e-6) return "Invalid dimensions."
      
      const cx = (x + this.firstCorner.x) / 2
      const cy = (y + this.firstCorner.y) / 2
      this.firstCorner = { x: cx, y: cy } // Reuse firstCorner for center
      this.step = 2
      return "Enter Image URL (or press Enter for none):"
    }
    return undefined as any
  }

  async onInput(text: string, _id: string, _units: UnitsConfig): Promise<CommandResponse | undefined> {
    const input = text.trim()
    if (input.toUpperCase() === "EXIT") {
      this.step = 0
      return "Command canceled."
    }

    if (this.step === 2) {
      this.imageUrl = input
      this.step = 3
      return "Enter Display Mode [STRETCH/FIT/ZOOM] <FIT>:"
    } else if (this.step === 3) {
      const mode = input.toUpperCase() || 'FIT'
      if (['STRETCH', 'FIT', 'ZOOM'].includes(mode)) {
        this.displayMode = mode as any
        if (mode === 'ZOOM') {
          this.step = 4
          return "Enter Zoom factor (1.0 = 100%) <1.0>:"
        } else {
          this.step = 5
          return "Enter Opacity (0-100) <75>:"
        }
      } else {
        return "Invalid mode. Enter [STRETCH/FIT/ZOOM]:"
      }
    } else if (this.step === 4) {
      const factor = parseFloat(input)
      this.zoomFactor = isNaN(factor) ? 1.0 : factor
      this.step = 5
      return "Enter Opacity (0-100) <75>:"
    } else if (this.step === 5) {
      const opVal = parseFloat(input)
      this.opacity = isNaN(opVal) ? 0.75 : opVal / 100
      
      this.step = 0
      return {
        action: 'image_plane',
        basePoint: this.firstCorner, // center
        width: this.width,
        height: this.height,
        imageUrl: this.imageUrl,
        displayMode: this.displayMode,
        zoomFactor: this.zoomFactor,
        opacity: this.opacity
      }
    }
    return undefined
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
    if (this.step === 0) return "PLANE specify first corner:";
    if (this.step === 1) return "Specify other corner:";
    if (this.step === 2) return "Image URL:";
    if (this.step === 3) return "Display Mode [STRETCH/FIT/ZOOM]:";
    if (this.step === 4) return "Zoom factor:";
    return "Opacity (0-100):";
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    if (this.step === 0) return ["First corner:"]
    if (this.step === 1) {
      const dx = x - this.firstCorner.x;
      const dy = y - this.firstCorner.y;
      return [`W:${FormatUtils.formatDistance(Math.abs(dx), units)}`, `H:${FormatUtils.formatDistance(Math.abs(dy), units)}`];
    }
    return null
  }

  getOptions(_units: UnitsConfig): string[] {
    if (this.step === 3) return ['STRETCH', 'FIT', 'ZOOM']
    return []
  }
}
