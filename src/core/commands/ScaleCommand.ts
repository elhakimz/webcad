import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"
import { Point } from "../engine/MathUtils"

export class ScaleCommand implements Command {
  step = 0
  basePoint: Point = { x: 0, y: 0 }
  targetIds: string[] = []
  factor = 1.0

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.targetIds = ids;
      this.step = 1;
    }
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (this.step === 0 && val !== "") {
      this.targetIds = [val];
      this.step = 1;
      return "Base point:";
    }

    if (this.step === 2) {
      const n = parseFloat(val);
      if (!isNaN(n)) {
          const ids = [...this.targetIds];
          const factor = n;
          const baseX = this.basePoint.x;
          const baseY = this.basePoint.y;
          this.step = 0;
          this.targetIds = [];
          return { action: "scale", ids, factor, baseX, baseY } as CommandResponse;
      }
    }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 1) {
      this.basePoint = { x, y }
      this.step = 2
      return "Scale factor:"
    } else if (this.step === 2) {
      const dist = Math.sqrt((x - this.basePoint.x) ** 2 + (y - this.basePoint.y) ** 2)
      // Reference scale of 1.0 at distance 10
      const factor = dist / 10.0
      const ids = [...this.targetIds];
      const baseX = this.basePoint.x;
      const baseY = this.basePoint.y;
      this.step = 0;
      this.targetIds = [];
      return { action: "scale", ids, factor, baseX, baseY } as CommandResponse;
    }
    return this.getPrompt();
  }

  getPreview(x: number, y: number, _units: UnitsConfig): import('./types').PreviewObject | null {
    if (this.step === 2) {
      const dist = Math.sqrt((x - this.basePoint.x) ** 2 + (y - this.basePoint.y) ** 2);
      return { type: 'scale_preview', factor: dist / 10.0, baseX: this.basePoint.x, baseY: this.basePoint.y };
    }
    return null
  }

  getReferencePoints() {
    if (this.step === 2) return [this.basePoint]
    return []
  }

  getBasePoint() {
      return this.step === 2 ? this.basePoint : null;
  }

  getPrompt() {
    if (this.step === 0) return "Select objects:";
    if (this.step === 1) return "Base point:";
    return "Scale factor:";
  }
}
