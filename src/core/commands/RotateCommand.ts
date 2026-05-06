import { Command, CommandResponse, PreviewObject } from "./types"
import { Point } from "../engine/MathUtils"

export class RotateCommand implements Command {
  step = 0
  basePoint: Point = { x: 0, y: 0 }
  targetIds: string[] = []
  angle = 0

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.targetIds = ids;
      this.step = 1;
    }
  }

  onInput(text: string, _id: string): CommandResponse | undefined {
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
          const angle = n * (Math.PI / 180);
          const baseX = this.basePoint.x;
          const baseY = this.basePoint.y;
          this.step = 0;
          this.targetIds = [];
          return { action: "rotate", ids, angle, baseX, baseY } as CommandResponse;
      }
    }
  }

  onPoint(x: number, y: number, _id: string): CommandResponse {
    if (this.step === 1) {
      this.basePoint = { x, y }
      this.step = 2
      return "Rotation angle:"
    } else if (this.step === 2) {
      const angle = Math.atan2(y - this.basePoint.y, x - this.basePoint.x)
      const ids = [...this.targetIds];
      const baseX = this.basePoint.x;
      const baseY = this.basePoint.y;
      this.step = 0;
      this.targetIds = [];
      return { action: "rotate", ids, angle, baseX, baseY } as CommandResponse;
    }
    return this.getPrompt();
  }

  getPreview(x: number, y: number): PreviewObject | null {
    if (this.step === 2) {
      const angle = Math.atan2(y - this.basePoint.y, x - this.basePoint.x);
      return { type: 'rotation_preview', angle, baseX: this.basePoint.x, baseY: this.basePoint.y };
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
    return "Rotation angle:";
  }
}
