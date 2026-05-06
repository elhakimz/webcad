import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class OffsetCommand implements Command {
  step = 0
  distance = 1.0
  targetId: string | null = null
  private p1: { x: number, y: number } | null = null

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim();

    if (this.step === 0) {
      const n = parseFloat(val);
      if (!isNaN(n) && n > 0) {
        this.distance = n;
        this.step = 1;
        return "Select object to offset:";
      }
      if (val === "") {
        this.step = 1;
        return "Select object to offset:";
      }
    }

    if (this.step === 1 && val !== "") {
      this.targetId = val;
      this.step = 2;
      return "Specify point on side to offset:";
    }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 0) {
        // Offset distance can also be specified by two points
        if (!this.p1) {
            this.p1 = { x, y };
            return "Second point:";
        } else {
            const p1 = this.p1;
            this.distance = Math.sqrt((x - p1.x) ** 2 + (y - p1.y) ** 2);
            this.step = 1;
            return "Select object to offset:";
        }
    }
    if (this.step === 1) return "Select object to offset:";
    if (this.step === 2) {
      const targetId = this.targetId!;
      const distance = this.distance;
      const sidePt = { x, y };
      return { action: "offset", id: targetId, distance, sidePt } as CommandResponse;
    }
    return this.getPrompt();
  }

  getPrompt() {
    if (this.step === 0) return `Offset distance <${this.distance.toFixed(2)}>:`;
    if (this.step === 1) return "Select object to offset:";
    if (this.step === 2) return "Specify point on side to offset:";
    return "";
  }
}
