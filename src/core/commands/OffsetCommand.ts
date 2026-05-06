import { Command, CommandResponse } from "./types"

export class OffsetCommand implements Command {
  step = 0
  distance = 1.0
  targetId: string | null = null

  onInput(text: string, id: string): CommandResponse | undefined {
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

  onPoint(x: number, y: number, id: string): CommandResponse {
    if (this.step === 0) {
        // Offset distance can also be specified by two points
        if (!(this as any).p1) {
            (this as any).p1 = { x, y };
            return "Second point:";
        } else {
            const p1 = (this as any).p1;
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
      // Maintain step 1 for repeated offsets if desired, 
      // but for now let's finish or loop.
      // AutoCAD keeps the command active.
      return { action: "offset", id: targetId, distance, sidePt } as const;
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
